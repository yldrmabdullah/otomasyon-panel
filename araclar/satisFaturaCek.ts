// BİZİM satışımız: bayi × ürün grubu alımları → satis_fatura.
//
// Kaynak: BFF /dis/v1/mutabakat/fatura-satislari (Logo INVOICE+STLINE, canlı, salt-oku).
// Logo tarafı kanıtlı: "Temmuz fatura litresi A3 ile %99,9 birebir" (LogoCanliServisi).
//
// NEDEN BFF üzerinden: panel Vercel'de, Logo VPN arkasında. Bu uç public (reportapi).
// NEDEN ayrı tablo: mutabakat_a3 bir KIYAS tablosu (durum/litre_fark kolonlu, yalnız
// mutabakata giren dönem). "Hangi bayi ne kadar aldı" için düz fact tablosu gerekiyor.
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/satisFaturaCek.ts                    (bu ay)
//   node --env-file=.env --import tsx araclar/satisFaturaCek.ts 2026-07-01 2026-08-01
//   node --env-file=.env --import tsx araclar/satisFaturaCek.ts --aylar 12         (son 12 ay, ay ay)

import { config } from '../core/config.js';
import { satisFaturaKaydet, satisFaturaKosuKaydet, kapat } from '../core/db.js';

interface BffSatir {
  faturaNo: string; tarih: string; iptal: boolean; cariKod: string;
  bayiAd?: string | null; urun?: string | null; urunKod?: string | null;
  litre: number; tutar?: number | null; cikisTesisi?: string | null;
}

/**
 * Logo ürün adı/kodu → kanonik ürün grubu.
 *
 * ⚠️ Ürün adı Logo'da serbest metin ("MOTORİN (EURO DIESEL)"), tek bir kod deseni yok.
 * Sıra ÖNEMLİ: "kalorifer yakıtı" içinde "yakıt" var ama fuel oil değil; motorin
 * kontrolü fuel oil'den ÖNCE olmalı çünkü bazı adlarda ikisi de geçebiliyor.
 * Eşleşmeyen 'diger' olarak kalır ve koşu sonunda SAYISI raporlanır (sessiz kayıp yok).
 */
export function urunGrubu(urun: string | null | undefined, kod: string | null | undefined): string {
  // ⚠️ TÜRKÇE I TUZAĞI (2026-08-26, testte yakalandı): Türkçe küçültmede I → ı
  // olduğu için "FUEL OIL" → "fuel oıl" oluyor ve /fuel\s*oil/ ESLEŞMİYOR;
  // ürün sessizce 'diger' grubuna düşüyordu. Ürün adları Türkçe + İngilizce
  // karışık (OIL, DIESEL) olduğundan İKİ normalize birlikte taranır:
  //   tr → Türkçe karakterler doğru küçülür (İ→i)
  //   en → düz toLowerCase (I→i), İngilizce kelimeler için
  const ham = `${urun ?? ''} ${kod ?? ''}`;
  const tr = ham.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
  const en = ham.toLowerCase();
  const test = (r: RegExp) => r.test(tr) || r.test(en);

  if (test(/motorin|diesel|dizel|eurodiesel/)) return 'motorin';
  if (test(/benzin|kurşunsuz|kursunsuz|k95|oktan/)) return 'benzin';
  if (test(/kalorifer|kalyak/)) return 'kalorifer';
  if (test(/fuel\s*oil|fueloil|\bfo\b|rfo/)) return 'fuel_oil';
  if (test(/gazya[gğ]|gaz\s*ya/)) return 'gazyagi';
  return 'diger';
}

function gun(d: Date): string { return d.toISOString().slice(0, 10); }

/** Bir dönemi (bitis HARİÇ) BFF'ten çek + kaydet. */
export async function donemCek(bas: string, bit: string): Promise<void> {
  if (!config.bff.gecerli) throw new Error('BFF yapılandırılmamış (BFF_URL / BFF_API_KEY) — satış çekimi yapılamaz.');
  const url = `${config.bff.url.replace(/\/$/, '')}/dis/v1/mutabakat/fatura-satislari?baslangic=${bas}&bitis=${bit}`;
  try {
    const r = await fetch(url, { headers: { 'X-Api-Key': config.bff.apiKey } });
    if (!r.ok) throw new Error(`BFF HTTP ${r.status}`);
    const doc = (await r.json()) as { basarili?: boolean; hata?: string; veri?: BffSatir[] };
    if (doc.basarili === false) throw new Error(doc.hata ?? 'BFF basarili=false');

    const ham = doc.veri ?? [];
    const liste = ham.map((x) => ({
      faturaNo: x.faturaNo,
      tarih: x.tarih,
      cariKod: x.cariKod,
      bayiAd: x.bayiAd ?? null,
      urunKod: x.urunKod ?? '(kodsuz)',      // PK parçası — null olamaz
      urun: x.urun ?? null,
      urunGrubu: urunGrubu(x.urun, x.urunKod),
      litre: Number(x.litre ?? 0),
      tutar: x.tutar == null ? null : Number(x.tutar),
      cikisTesisi: x.cikisTesisi ?? null,
      iptal: Boolean(x.iptal),
    }));

    await satisFaturaKaydet(liste);

    // Toplamlar iptal HARİÇ (yönetim rakamı) — iptal satırı DB'de kalır, işaretli.
    const gecerli = liste.filter((x) => !x.iptal);
    const litre = gecerli.reduce((a, b) => a + b.litre, 0);
    const tutar = gecerli.reduce((a, b) => a + (b.tutar ?? 0), 0);
    await satisFaturaKosuKaydet(bas, bit, liste.length, litre, tutar, null);

    // Sessiz kayıp uyarıları: eşleşmeyen ürün grubu + TL gelmemesi (BFF eski sürüm mü).
    const diger = gecerli.filter((x) => x.urunGrubu === 'diger');
    const tutarsiz = gecerli.filter((x) => x.tutar == null).length;
    const adsiz = gecerli.filter((x) => !x.bayiAd).length;
    console.log(
      `✔ ${bas}→${bit}: ${liste.length} satır · ${litre.toLocaleString('tr')} L · ` +
      `${tutar.toLocaleString('tr', { maximumFractionDigits: 0 })} TL` +
      (diger.length ? ` · ⚠️ ${diger.length} satır ürün grubu 'diger' (${[...new Set(diger.map((d) => d.urun))].slice(0, 4).join(', ')})` : '') +
      (tutarsiz ? ` · ⚠️ ${tutarsiz} satırda TUTAR yok (BFF eski sürüm?)` : '') +
      (adsiz ? ` · ⚠️ ${adsiz} satırda BAYİ ADI yok` : ''),
    );
  } catch (e: any) {
    const mesaj = e?.message ?? String(e);
    console.error(`✖ ${bas}→${bit}: ${mesaj}`);
    await satisFaturaKosuKaydet(bas, bit, 0, 0, 0, mesaj);
  }
}

async function main() {
  const arg = process.argv.slice(2);

  if (arg[0] === '--aylar') {
    // Son N ay, ay ay (tek istekte çok büyük dönem çekmek yerine parçalı).
    const n = Number(arg[1] ?? 12);
    const bugun = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const bas = new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth() - i, 1));
      const bit = new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth() - i + 1, 1));
      await donemCek(gun(bas), gun(bit));
    }
  } else if (arg[0] && arg[1]) {
    await donemCek(arg[0], arg[1]);
  } else {
    // Varsayılan: içinde bulunulan ay.
    const b = new Date();
    const bas = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1));
    const bit = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1));
    await donemCek(gun(bas), gun(bit));
  }
  await kapat();
}

if (process.argv[1]?.includes('satisFaturaCek')) {
  main().catch(async (e) => {
    console.error('Satış çekim hatası:', e);
    await kapat();
    process.exit(1);
  });
}
