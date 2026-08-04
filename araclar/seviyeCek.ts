// Tank seviye günlük snapshot — ASIS `GetTankLastLevel` → `tank_seviye_gun`.
//
// Mutabakatın **A ve D** kalemi:
//   Fark = (Dönem başı stok + Dolum − Satış) − Dönem sonu stok
//            ↑ acilis_lt                         ↑ kapanis_lt
//
// ⚠️⚠️ NEDEN `GetTankLevelList` DEĞİL (2026-08-01, ölçüldü):
// O metot 30 dakikalık GEÇMİŞ grid veriyor ve teoride ideal görünüyordu. Ama
// kapsamı **TÜM FİLOYU KAPSAMIYOR**: cursor nereden başlatılırsa başlatılsın
// 269 istasyondan yalnız **16-19'una** ulaşılıyor (10.000'lik sayfa tek istasyonun
// aylarını geziyor, sonraki sayfa 29-55 kayıtla "arşiv sonu" veriyor).
// Bir gün için 669 tank beklenirken 83 tank geliyordu.
//   → Artımlı çekim için KULLANILAMAZ. ASIS'e sorulacak (yetki mi, parametre mi).
//
// ÇÖZÜM: `GetTankLastLevel` **670 tankın TAMAMINI** veriyor (805 ms, tek çağrı) ama
// ANLIK. Her gece çekilip biriktirilirse gerçek gün serisi oluşur.
//   kapanis_lt = o geceki ölçüm
//   acilis_lt  = bir önceki günün kapanışı (DB'den okunur)
//
// ⚠️ SINIR: geçmiş için veri YOK. Seri bu aracın ilk koşusundan itibaren başlar.
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/seviyeCek.ts        (bugün)
//   node --env-file=.env --import tsx araclar/seviyeCek.ts 2026-08-01

import { config } from '../core/config.js';
import { seviyeGunKaydet, oncekiGunKapanis, acilisZinciriOnar, kapat } from '../core/db.js';

const K = config.asis;

function xmlKacir(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function main() {
  // Hedef gün: verilmezse TÜRKİYE saatine göre bugün.
  //
  // ⚠️ NEDEN UTC DEĞİL (2026-08-04): cron 21:00 UTC'ye kurulu (= 00:00 TR) ve GH
  // Actions schedule'ı ücretsiz planda ortalama 95 dk, en kötü 202 dk geciktiriyor
  // (izleme job'unda ölçüldü). 202 dk gecikme = 00:22 UTC → UTC günü DEĞİŞMİŞ olur
  // ve `new Date().toISOString()` snapshot'ı YANLIŞ GÜNE yazar. Sonuç: bir gün iki
  // kez yazılır, ertesi gün hiç yazılmaz → açılış zinciri yine kopar.
  //
  // TR saati (UTC+3) kullanmak bunu çözüyor: 21:00 UTC + 202 dk = TR 03:22, hâlâ
  // aynı TR günü. Tank verisi de TR yerel saatiyle geliyor (ASIS TZ taşımıyor).
  const arg = process.argv[2];
  const trSimdi = new Date(Date.now() + 3 * 3_600_000);
  const gun = arg ?? trSimdi.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gun)) {
    console.error('Geçersiz tarih. Kullanım: seviyeCek.ts [YYYY-AA-GG]');
    process.exit(1);
  }

  console.log(`Tank seviye snapshot: ${gun}`);

  // ⚠️ PARAMETRE SIRASI ÖNEMLİ (ASMX pozisyonel): guidKey, dagiticiKod, IstasyonKod.
  // Ters sıra "Code=0 başarılı" ama BOŞ liste döndürür.
  const govde =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
    `<GetTankLastLevel xmlns="${K.namespace}">` +
    `<guidKey>${xmlKacir(K.guidKey)}</guidKey>` +
    `<dagiticiKod>${K.dagiticiKod}</dagiticiKod>` +
    `<IstasyonKod xsi:nil="true" />` +
    `</GetTankLastLevel></soap:Body></soap:Envelope>`;

  const t0 = Date.now();
  const r = await fetch(K.gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: K.namespace + 'GetTankLastLevel' },
    body: govde,
  });
  if (!r.ok) throw new Error(`GetTankLastLevel HTTP ${r.status}`);
  const x = await r.text();
  console.log(`  ASIS: ${Date.now() - t0} ms · ${(x.length / 1024).toFixed(0)} KB`);

  // Hedef günden ÖNCEKİ en son kapanış → bugünün açılışı.
  // ⚠️ "bir gün önce" DEĞİL: cron bir gün atlarsa zincir kopuyordu (2026-08-04'te
  // canlıda yaşandı — 2 Ağustos eksik olduğu için 3 Ağustos'un 669 tankında
  // açılış 0 kalmıştı). Artık her tank kendi en son kapanışını alıyor.
  const onceki = await oncekiGunKapanis(gun);

  const liste: {
    gun: string; istasyonKod: string; tankNo: string; urun: string;
    acilisLt: number | null; kapanisLt: number | null;
    acilisZaman: string | null; kapanisZaman: string | null; olcumSayisi: number;
  }[] = [];
  let bayat = 0;

  for (const m of x.matchAll(/<TankLastLevel>([\s\S]*?)<\/TankLastLevel>/g)) {
    const al = (t: string) => m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '';
    const istKod = al('IstasyonKod');
    const tankNo = al('TankNo');
    if (!istKod || !tankNo) continue;

    // NET litre tercih (sıcaklık düzeltilmiş); yoksa brüt
    const net = parseFloat(al('YakitSeviyeLTNet'));
    const brut = parseFloat(al('YakitLT') || al('YakitSeviyeLT'));
    const lt = Number.isFinite(net) && net > 0 ? net : Number.isFinite(brut) ? brut : null;
    if (lt === null) continue;

    const olcumZaman = al('DurumTarihi') || null;
    // Ölçüm hedef günden eskiyse tank veri göndermiyor demektir — sayılır, raporlanır
    if (olcumZaman && olcumZaman.slice(0, 10) < gun) bayat++;

    liste.push({
      gun,
      istasyonKod: istKod,
      tankNo,
      urun: al('UrunAdi') || al('Urun'),
      acilisLt: onceki.get(`${istKod}|${tankNo}`)?.lt ?? null,
      kapanisLt: lt,
      acilisZaman: null,
      kapanisZaman: olcumZaman,
      // Snapshot yöntemi tek ölçüm alır — 1 yazılır ki "48 ölçüm bekleniyor"
      // mantığıyla karışmasın. Bkz. schema.sql olcum_sayisi yorumu.
      olcumSayisi: 1,
    });
  }

  if (liste.length === 0) throw new Error('ASIS boş liste döndü — parametre sırası doğru mu?');

  await seviyeGunKaydet(liste);
  const acilisVar = liste.filter((v) => v.acilisLt !== null).length;
  // Açılış kaç gün öncesinden geldi — kesintili aralık uyarısı için
  const kaynaklar = new Map<string, number>();
  for (const [, v] of onceki) kaynaklar.set(v.kaynakGun, (kaynaklar.get(v.kaynakGun) ?? 0) + 1);
  console.log(`  ✔ ${liste.length} tank yazıldı`);
  console.log(`     açılış değeri olan: ${acilisVar}`);
  for (const [g, n] of [...kaynaklar].sort()) {
    const fark = Math.round(
      (Date.parse(gun) - Date.parse(g)) / 86_400_000,
    );
    console.log(`       ${n} tank ← ${g}${fark > 1 ? `  ⚠ ${fark} gün önce (aralık kesintili)` : ''}`);
  }
  if (acilisVar === 0) console.log('     ℹ️ İLK KOŞU — açılış yarından itibaren dolacak');
  if (bayat) console.log(`     ⚠ ${bayat} tankın ölçümü ${gun} tarihinden eski (veri göndermiyor)`);

  // ZİNCİR ONARIMI — geçmişte açılışı boş kalmış günleri doldur.
  //
  // ⚠️ Snapshot geriye dönük ÇEKİLEMEZ (anlık veri) ama açılış değeri DB'den
  // türetilebilir: o günden önceki en son kapanış. Cron bir gün atlayıp zincir
  // koptuğunda (2026-08-04'te yaşandı) bu adım sessizce onarır.
  // Serinin ilk günü hariç — onun öncesi yok, açılışı boş kalması NORMAL.
  const onarildi = await acilisZinciriOnar();
  if (onarildi > 0) console.log(`  ✔ zincir onarımı: ${onarildi} tank-gün açılışı dolduruldu`);

  await kapat();
}

main().catch(async (e) => {
  console.error('Çekim hatası:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
