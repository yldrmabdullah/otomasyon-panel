// POL "Tesis Dolum" Excel → mutabakat_irsaliye tablosu.
//
// NEDEN POL'ÜN ÇIKTISI ALINIYOR (tersine mühendislik DEĞİL):
// Mutabakat hesabını ASIS verisinden yeniden kurmayı denedim; en iyi kural %65
// isabet verdi (bkz docs/bilgi/epdk-mutabakat.md §4d). POL bu hesabı zaten doğru
// yapıyor ve "Kalan Miktar" kolonunda gösteriyor — %65 isabetle taklit etmek
// yerine POL'ün kendi sonucu alınır.
//
// FORMÜL (POL, ekran+Excel ile birebir doğrulandı — §4f):
//   Fark  = Dağıtıcıdan Alınan (Σ Fatura Satış Miktarı) − Kullanılan (Σ İstasyon Dolum)
//   Fark% = Fark / Dağıtıcıdan Alınan × 100
//   EPDK limiti: |Fark%| ≤ 3
// RAHA Temmuz 2026: 136.886 − 138.619,29 = −1.733,29 (%−1,27) ✓ ekranla aynı
//
// Çalıştır: node --env-file=.env --import tsx araclar/polMutabakatImport.ts <excel...>
//   Birden çok dosya verilebilir. Aynı irsaliye+tarih+ürün tekrar gelirse güncellenir.

import { pool, kapat } from '../core/db.js';
import { xlsxOku, excelTarih, sayi, baslikSatiri } from '../core/xlsx.js';
import { basename } from 'node:path';

/** POL Tesis Dolum kolon sırası (başlık satırından doğrulanıyor). */
const KOLON = {
  irsaliyeTarihi: 0, urun: 1, irsaliyeNo: 2, faturaNo: 3, birimFiyat: 4,
  faturaMiktar: 5, kalanMiktar: 6, istasyonDolum: 7, koyPompasi: 8, tanker: 9,
  disSatis: 10, dagiticiyaIade: 11, evrakDurum: 12, plakaDorse: 13, plakaCekici: 14,
  satisTip: 15, farkYuzde: 16, lisansNo: 17, istasyonAd: 18, bolge: 19, mintika: 20,
} as const;

/** BAY/939-82/47501 → 47501 */
function epdkNo(lisans: string | undefined): string | null {
  const son = (lisans ?? '').trim().replace(/\/$/, '').split('/').pop();
  return son && /^\d+$/.test(son) ? son : null;
}

async function dosyaIsle(yol: string): Promise<{ eklenen: number; atlanan: number }> {
  const satirlar = await xlsxOku(yol);
  const bas = baslikSatiri(satirlar, 'İrsaliye Tarihi');
  if (bas < 0) throw new Error(`Başlık satırı ('İrsaliye Tarihi') bulunamadı: ${basename(yol)}`);

  // Kolon sırası beklendiği gibi mi? POL export'u değişirse SESSİZCE yanlış veri
  // yazmak yerine hemen dur.
  const b = satirlar[bas];
  const bekle = (ix: number, metin: string) => {
    const gercek = (b[ix] ?? '').trim();
    if (!gercek.startsWith(metin))
      throw new Error(
        `Kolon sırası beklenenden farklı: [${ix}] '${gercek}' ≠ '${metin}...'. ` +
          `POL export biçimi değişmiş olabilir — KOLON haritası güncellenmeli.`,
      );
  };
  bekle(KOLON.irsaliyeNo, 'Dagitici Sevk İrsaliye');
  bekle(KOLON.faturaMiktar, 'Fatura Satış Miktar');
  bekle(KOLON.kalanMiktar, 'Kalan Miktar');
  bekle(KOLON.istasyonDolum, 'İstasyon Dolum');

  const p = pool();
  const kaynak = basename(yol);
  let eklenen = 0, atlanan = 0;

  for (let i = bas + 1; i < satirlar.length; i++) {
    const r = satirlar[i];
    const irsNo = (r?.[KOLON.irsaliyeNo] ?? '').trim();
    const tarih = excelTarih(r?.[KOLON.irsaliyeTarihi]);
    if (!irsNo || !tarih) { atlanan++; continue; }

    await p.query(
      `INSERT INTO mutabakat_irsaliye (
         irsaliye_no, irsaliye_tarihi, epdk_no, istasyon_ad, urun, fatura_no, birim_fiyat,
         fatura_miktar, istasyon_dolum, kalan_miktar, koy_pompasi, tanker, dis_satis,
         dagiticiya_iade, fark_yuzde, evrak_durum, bolge, mintika, plaka_dorse, plaka_cekici,
         kaynak_dosya, guncelleme)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
       ON CONFLICT (irsaliye_no, irsaliye_tarihi, urun) DO UPDATE SET
         epdk_no=EXCLUDED.epdk_no, istasyon_ad=EXCLUDED.istasyon_ad,
         fatura_no=EXCLUDED.fatura_no, birim_fiyat=EXCLUDED.birim_fiyat,
         fatura_miktar=EXCLUDED.fatura_miktar, istasyon_dolum=EXCLUDED.istasyon_dolum,
         kalan_miktar=EXCLUDED.kalan_miktar, koy_pompasi=EXCLUDED.koy_pompasi,
         tanker=EXCLUDED.tanker, dis_satis=EXCLUDED.dis_satis,
         dagiticiya_iade=EXCLUDED.dagiticiya_iade, fark_yuzde=EXCLUDED.fark_yuzde,
         evrak_durum=EXCLUDED.evrak_durum, bolge=EXCLUDED.bolge, mintika=EXCLUDED.mintika,
         plaka_dorse=EXCLUDED.plaka_dorse, plaka_cekici=EXCLUDED.plaka_cekici,
         kaynak_dosya=EXCLUDED.kaynak_dosya, guncelleme=now()`,
      [
        irsNo, tarih, epdkNo(r[KOLON.lisansNo]), r[KOLON.istasyonAd] ?? null,
        (r[KOLON.urun] ?? '').trim() || 'BİLİNMİYOR', r[KOLON.faturaNo] ?? null,
        sayi(r[KOLON.birimFiyat]), sayi(r[KOLON.faturaMiktar]), sayi(r[KOLON.istasyonDolum]),
        sayi(r[KOLON.kalanMiktar]), sayi(r[KOLON.koyPompasi]), sayi(r[KOLON.tanker]),
        sayi(r[KOLON.disSatis]), sayi(r[KOLON.dagiticiyaIade]), sayi(r[KOLON.farkYuzde]),
        r[KOLON.evrakDurum] ?? null, r[KOLON.bolge] ?? null, r[KOLON.mintika] ?? null,
        (r[KOLON.plakaDorse] ?? '').trim() || null, (r[KOLON.plakaCekici] ?? '').trim() || null,
        kaynak,
      ],
    );
    eklenen++;
  }
  return { eklenen, atlanan };
}

async function main() {
  const dosyalar = process.argv.slice(2);
  if (dosyalar.length === 0) {
    console.log('Kullanım: node --env-file=.env --import tsx araclar/polMutabakatImport.ts <excel...>');
    console.log('  POL → Raporlar → İstasyon Dönemleri → Tesis Dolum → Excel export');
    process.exit(1);
  }

  let toplam = 0;
  for (const d of dosyalar) {
    try {
      const { eklenen, atlanan } = await dosyaIsle(d);
      toplam += eklenen;
      console.log(`✔ ${basename(d)} → ${eklenen} kayıt${atlanan ? ` (${atlanan} satır atlandı)` : ''}`);
    } catch (e) {
      console.error(`✗ ${basename(d)}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Özet: dönem bazında mutabakat durumu
  const p = pool();
  const o = await p.query(
    `SELECT to_char(irsaliye_tarihi,'YYYY-MM') donem,
            count(DISTINCT epdk_no) bayi,
            count(*) irsaliye,
            round(sum(fatura_miktar)) alinan,
            round(sum(istasyon_dolum)) kullanilan,
            round(sum(kalan_miktar)) fark,
            round(100.0*sum(kalan_miktar)/NULLIF(sum(fatura_miktar),0), 2) fark_yuzde
     FROM mutabakat_irsaliye GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
  );
  console.log(`\n${toplam} kayıt işlendi. Dönem özeti:`);
  console.log('  DÖNEM     BAYİ  İRSALİYE      ALINAN   KULLANILAN       FARK    FARK%');
  for (const r of o.rows) {
    const u = Number(r.fark_yuzde);
    const bayrak = Math.abs(u) > 3 ? ' ⚠ LİMİT AŞIMI' : '';
    console.log(
      `  ${r.donem}  ${String(r.bayi).padStart(4)}  ${String(r.irsaliye).padStart(8)}  ` +
        `${Number(r.alinan).toLocaleString('tr').padStart(10)}  ` +
        `${Number(r.kullanilan).toLocaleString('tr').padStart(11)}  ` +
        `${Number(r.fark).toLocaleString('tr').padStart(9)}  ${String(u).padStart(7)}${bayrak}`,
    );
  }
  await kapat();
}

main().catch(async (e) => {
  console.error('Import hatası:', e);
  await kapat().catch(() => {});
  process.exit(1);
});
