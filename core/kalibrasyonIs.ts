// Kalibrasyon İŞ AKIŞI — DB okur, saf motoru (core/kalibrasyon.ts) çağırır, cetvel yazar.
// Hem elle çalıştırılan araç (araclar/kalibrasyonUret.ts) hem izleme işi (job/index.ts,
// saatte bir) bunu çağırır — üretim mantığı tek yerde.
//
// core/kalibrasyon.ts SAF kalır (I/O yok); I/O bu dosyada.

import { cetvelUret } from './kalibrasyon.js';
import { kalibrasyonTanklar, kalibrasyonSeri, kalibrasyonCetvelYaz } from './db.js';

export interface UretimOzeti {
  uretildi: number;
  atlandi: number;
  guven: Record<'A' | 'B' | 'C' | 'D', number>;
  sureMs: number;
}

/** Yeterli verisi olan (3+ mm noktası) tüm tankların cetvelini yeniden üretir. */
export async function kalibrasyonUretimiYap(): Promise<UretimOzeti> {
  const t0 = Date.now();
  const tanklar = await kalibrasyonTanklar();
  const versiyonId = Date.now(); // tek tur = tek versiyon_id
  const ozet: UretimOzeti = { uretildi: 0, atlandi: 0, guven: { A: 0, B: 0, C: 0, D: 0 }, sureMs: 0 };

  for (const t of tanklar) {
    if (t.noktaSayisi < 3) { ozet.atlandi++; continue; }
    const { ham, polKapasite } = await kalibrasyonSeri(t.istasyonKod, t.tankNo);
    const sonuc = cetvelUret(ham, polKapasite);
    if (!sonuc) { ozet.atlandi++; continue; }
    await kalibrasyonCetvelYaz(versiyonId, t.istasyonKod, t.tankNo, t.urun, sonuc.cetvel, {
      noktaSayisi: sonuc.noktaSayisi, kapsamYuzde: sonuc.kapsamYuzde,
      turetilmisCapMm: sonuc.turetilmisCapMm, polKapasite,
      capKapasiteUyum: sonuc.capKapasiteUyum, fitHatasi: sonuc.fitHatasi, guven: sonuc.guven,
    });
    ozet.uretildi++;
    ozet.guven[sonuc.guven]++;
  }
  ozet.sureMs = Date.now() - t0;
  return ozet;
}
