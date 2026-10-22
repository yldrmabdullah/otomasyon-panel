// Kalibrasyon İŞ AKIŞI — DB okur, saf motoru (core/kalibrasyon.ts) çağırır, cetvel yazar.
// Hem elle çalıştırılan araç (araclar/kalibrasyonUret.ts) hem izleme işi (job/index.ts,
// saatte bir) bunu çağırır — üretim mantığı tek yerde. İki projede (otomasyon-panel / Otomasyon)
// BİREBİR aynıdır; SQL farkı yalnız core/db.ts'te.
//
// core/kalibrasyon.ts SAF kalır (I/O yok); I/O bu dosyada.
//
// ⚠️ HIZ (2026-10-22): ilk sürüm tank başına 5 ayrı sorgu atıyordu (650 tank × 5 = ~3.250 gidiş-
// dönüş) → saatlik üretim 265 sn sürüp izleme işini uzatıyordu. Şimdi: 2 okuma (tüm seriler +
// aktif cetvel imzaları) + TEK transaction'da toplu yazma. Ayrıca yalnız cetveli GERÇEKTEN değişen
// tank yeni versiyon alır; değişmeyenin yalnız özet bilgisi (nokta sayısı, güven…) güncellenir —
// her saat 175 bin cetvel satırını silip yeniden yazmak tabloyu şişiriyordu.

import { cetvelUret, type CetvelNoktasi } from './kalibrasyon.js';
import {
  kalibrasyonTumSeriler, kalibrasyonAktifImzalar, kalibrasyonToplaYaz,
  type KalibrasyonMeta, type KalibrasyonYeni,
} from './db.js';

export interface UretimOzeti {
  uretildi: number; // cetveli olan tank (yeni + değişmeyen)
  degisen: number; // yeni versiyon yazılan
  atlandi: number;
  guven: Record<'A' | 'B' | 'C' | 'D', number>;
  sureMs: number;
}

/**
 * Cetvel imzası — litre TAM SAYIYA yuvarlı (NUMERIC yuvarlama + ölçüm gürültüsü "değişti" saymasın).
 * Biçim db.ts kalibrasyonAktifImzalar() SQL'iyle BİREBİR aynı olmalı: "mm:litre:kaynak,…" (mm sıralı).
 */
function cetvelImzasi(c: CetvelNoktasi[]): string {
  return [...c].sort((x, y) => x.mm - y.mm).map((n) => `${n.mm}:${Math.round(n.litre)}:${n.kaynak}`).join(",");
}

/** Yeterli verisi olan (3+ mm noktası) tüm tankların cetvelini yeniden üretir. */
export async function kalibrasyonUretimiYap(): Promise<UretimOzeti> {
  const t0 = Date.now();
  const [seriler, aktif] = await Promise.all([kalibrasyonTumSeriler(), kalibrasyonAktifImzalar()]);
  const versiyonId = Date.now(); // tek tur = tek versiyon_id
  const ozet: UretimOzeti = { uretildi: 0, degisen: 0, atlandi: 0, guven: { A: 0, B: 0, C: 0, D: 0 }, sureMs: 0 };

  const yeniler: KalibrasyonYeni[] = [];
  const ayniler: { istasyonKod: string; tankNo: string; meta: KalibrasyonMeta }[] = [];

  for (const s of seriler) {
    if (s.ham.length < 3) { ozet.atlandi++; continue; }
    const sonuc = cetvelUret(s.ham, s.polKapasite);
    if (!sonuc) { ozet.atlandi++; continue; }
    const meta: KalibrasyonMeta = {
      noktaSayisi: sonuc.noktaSayisi, kapsamYuzde: sonuc.kapsamYuzde,
      turetilmisCapMm: sonuc.turetilmisCapMm, polKapasite: s.polKapasite,
      capKapasiteUyum: sonuc.capKapasiteUyum, fitHatasi: sonuc.fitHatasi, guven: sonuc.guven,
    };
    if (cetvelImzasi(sonuc.cetvel) === aktif.get(`${s.istasyonKod}|${s.tankNo}`)) {
      ayniler.push({ istasyonKod: s.istasyonKod, tankNo: s.tankNo, meta });
    } else {
      yeniler.push({ istasyonKod: s.istasyonKod, tankNo: s.tankNo, urun: s.urun, cetvel: sonuc.cetvel, meta });
    }
    ozet.uretildi++;
    ozet.guven[sonuc.guven]++;
  }

  await kalibrasyonToplaYaz(versiyonId, yeniler, ayniler);
  ozet.degisen = yeniler.length;
  ozet.sureMs = Date.now() - t0;
  return ozet;
}
