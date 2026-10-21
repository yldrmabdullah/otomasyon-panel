// Kalibrasyon cetveli üretimi — kalibrasyon_mm_seri'den okur, core/kalibrasyon.ts (saf motor)
// ile mm→litre cetveli üretir, kalibrasyon_cetvel + kalibrasyon_versiyon'a yazar.
//
// Her tank için yeni versiyon oluşur, eskisi pasiflenir (tarihçe korunur). Yeterli ölçüm
// (en az 3 mm noktası) olmayan tank atlanır — cetvel üretilmez, güven sahtece yükseltilmez.
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/kalibrasyonUret.ts

import { cetvelUret } from '../core/kalibrasyon.js';
import { kalibrasyonTanklar, kalibrasyonSeri, kalibrasyonCetvelYaz, kapat } from '../core/db.js';

async function main() {
  const t0 = Date.now();
  const tanklar = await kalibrasyonTanklar();
  console.log(`Kalibrasyon üretimi: ${tanklar.length} tank (en az 1 mm ölçümü olan)`);

  // Tek üretim turu = tek versiyon_id (artan epoch); tüm tanklar aynı turda üretilir.
  const versiyonId = Date.now();
  let uretildi = 0, atlandi = 0;
  const guvenDagilim: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };

  for (const t of tanklar) {
    // Yeterli nokta yoksa motoru hiç çağırma (DB okumasından da tasarruf).
    // 3 minimum; anlamlı cetvel için daha fazlası iyi ama motor azını da güvenle 'D' işaretler.
    if (t.noktaSayisi < 3) { atlandi++; continue; }
    const { ham, polKapasite } = await kalibrasyonSeri(t.istasyonKod, t.tankNo);
    const sonuc = cetvelUret(ham, polKapasite);
    if (!sonuc) {
      atlandi++;
      continue; // < 3 nokta veya çap türetilemedi — cetvel yok
    }
    await kalibrasyonCetvelYaz(
      versiyonId, t.istasyonKod, t.tankNo, t.urun, sonuc.cetvel,
      {
        noktaSayisi: sonuc.noktaSayisi, kapsamYuzde: sonuc.kapsamYuzde,
        turetilmisCapMm: sonuc.turetilmisCapMm, polKapasite,
        capKapasiteUyum: sonuc.capKapasiteUyum, fitHatasi: sonuc.fitHatasi, guven: sonuc.guven,
      },
    );
    uretildi++;
    guvenDagilim[sonuc.guven] = (guvenDagilim[sonuc.guven] ?? 0) + 1;
  }

  console.log(`  ✔ ${uretildi} tank için cetvel üretildi, ${atlandi} atlandı (veri yetersiz)`);
  console.log(`     güven: A=${guvenDagilim.A} B=${guvenDagilim.B} C=${guvenDagilim.C} D=${guvenDagilim.D}`);
  console.log(`     ${Date.now() - t0} ms`);

  await kapat();
}

main().catch(async (e) => {
  console.error('Kalibrasyon üretim hatası:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
