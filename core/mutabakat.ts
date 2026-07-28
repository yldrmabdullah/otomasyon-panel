// Mutabakat hesaplama — POL Tank Uzlaştırma formülü:
//   Fark = (Dönem Başı Stok + Dolum − Satış) − Dönem Sonu Stok
//   Oran % = (Fark / Satış) × 100
// İstek üzerine (ay seçilince) çalışır — tüm arşivi tutmaz. GetXxxRecord ile hedef aya atlar.
// Bkz docs/bilgi/epdk-mutabakat.md (formül + 288 lt / %3 EPDK limiti).

import { asis } from './asisClient.js';
import { pool } from './db.js';

export interface TankMutabakat {
  istasyonKod: string;
  istasyonAd: string;
  tankNo: string;
  urun: string;
  donemBasiStok: number; // A
  dolum: number; // B
  satis: number; // C
  donemSonuStok: number; // D
  fark: number; // E = (A+B-C)-D
  oran: number; // F = E/C*100
  limitAsimi: boolean; // |fark|>288 veya |oran|>3
}

const EPDK_LT_LIMIT = 288;
const EPDK_ORAN_LIMIT = 3;

/** Ay aralığı. bas/bit = filtreleme için [başı, sonrakiAyBaşı). recordBit = ayın son saniyesi
 *  (ASIS GetXxxRecord bitişi ayın İÇİNDE ister; sonraki ay 00:00 verince 0 dönüyor — canlı doğrulandı). */
function ayAraligi(yil: number, ay: number): { bas: Date; bit: Date; recordBit: Date } {
  const bas = new Date(Date.UTC(yil, ay - 1, 1, -3, 0, 0)); // ay başı 00:00 TR
  const bit = new Date(Date.UTC(yil, ay, 1, -3, 0, 0)); // sonraki ay başı (filtre üst sınır, hariç)
  const recordBit = new Date(bit.getTime() - 1000); // ayın son saniyesi (Record için)
  return { bas, bit, recordBit };
}

/**
 * Bir dönem (ay) için TÜM dağıtıcının tank mutabakatını hesaplar.
 * Satış + seviye ASIS'ten (Record ile hedef aya atlayıp o ayı çekerek), dolum DB'den (tank_dolum).
 * Ağır olabilir (bir ay ~yüz binlerce satış) — MaksTur ile sınırlı; panel bunu arka planda çağırır.
 */
export async function ayMutabakati(yil: number, ay: number): Promise<TankMutabakat[]> {
  const { bas, bit, recordBit } = ayAraligi(yil, ay);

  // TIstasyonID → IstasyonKod köprüsü (satış TIstasyonID ile gelir, seviye/dolum IstasyonKod ile).
  // GetStationList ikisini de verir. Bu olmadan satış (C) eşleşmez, mutabakat yanlış olur.
  const tIstToKod = new Map<string, string>();
  {
    const istasyonlar = await asis.istasyonlar();
    for (const i of istasyonlar) if (i.tIstasyonId) tIstToKod.set(i.tIstasyonId, i.kod);
  }

  // --- 1) SATIŞ: hedef aya atla (Record), o aydan itibaren çek, IstasyonKod|tankNo bazında litre topla ---
  const satisToplam = new Map<string, number>(); // key: IstasyonKod|tankNo → litre
  {
    let cursor = Math.max(0, (await asis.satisRecordId(bas, recordBit)) - 1);
    for (let tur = 0; tur < 400; tur++) {
      const parti = await asis.pompaSatislari(cursor);
      if (parti.length === 0) break;
      let enY = cursor;
      let ayGecti = false;
      for (const s of parti) {
        enY = Math.max(enY, s.satisId);
        if (s.tarih < bas) continue;
        if (s.tarih >= bit) { ayGecti = true; continue; }
        const istKod = tIstToKod.get(s.tIstasyonId);
        if (!istKod) continue; // eşleşmeyen istasyon
        const k = `${istKod}|${s.tankNo}`;
        satisToplam.set(k, (satisToplam.get(k) ?? 0) + s.litre);
      }
      if (enY <= cursor) break;
      cursor = enY;
      if (ayGecti) break; // ay bitti, sonraki partiler hep sonraki ay
    }
  }

  // --- 2) SEVİYE: hedef aya atla, o ay boyunca her tankın İLK ve SON kaydını tut ---
  const ilkSeviye = new Map<string, { z: Date; lt: number; kap: number; urun: string; istKod: string }>();
  const sonSeviye = new Map<string, { z: Date; lt: number }>();
  {
    let cursor = Math.max(0, (await asis.seviyeRecordId(bas, recordBit)) - 1);
    for (let tur = 0; tur < 400; tur++) {
      const parti = await asis.tankSeviyeleri(cursor);
      if (parti.length === 0) break;
      let enY = cursor;
      let ayGecti = false;
      for (const s of parti) {
        enY = Math.max(enY, s.durumId);
        if (s.durumZamani < bas) continue;
        if (s.durumZamani >= bit) { ayGecti = true; continue; }
        const k = `${s.istasyonKod}|${s.tankNo}`;
        const ilk = ilkSeviye.get(k);
        if (!ilk || s.durumZamani < ilk.z)
          ilkSeviye.set(k, { z: s.durumZamani, lt: s.yakitLt, kap: s.kapasiteLt, urun: s.urunAdi, istKod: s.istasyonKod });
        const son = sonSeviye.get(k);
        if (!son || s.durumZamani > son.z) sonSeviye.set(k, { z: s.durumZamani, lt: s.yakitLt });
      }
      if (enY <= cursor) break;
      cursor = enY;
      if (ayGecti) break;
    }
  }

  // --- 3) DOLUM: DB'den (tank_dolum), bu ay, istasyon+tank bazında topla ---
  const dolumToplam = new Map<string, number>(); // key: istasyonKod|tankNo → dolum lt
  {
    const r = await pool().query<{ istasyon_kod: string; tank_no: string; toplam: string }>(
      `SELECT istasyon_kod, tank_no, SUM(dolum_miktari) toplam
       FROM tank_dolum WHERE dolum_baslama >= $1 AND dolum_baslama < $2
       GROUP BY istasyon_kod, tank_no`,
      [bas, bit],
    );
    for (const x of r.rows) dolumToplam.set(`${x.istasyon_kod}|${x.tank_no}`, Number(x.toplam));
  }

  // İstasyon adı için kütük (istasyonlar tablosu)
  const adHarita = new Map<string, string>();
  {
    const r = await pool().query<{ istasyon_kod: string; ad: string }>('SELECT istasyon_kod, ad FROM istasyonlar');
    for (const x of r.rows) adHarita.set(x.istasyon_kod, x.ad);
  }

  // --- 4) BİRLEŞTİR: seviye kaydı olan her tank için mutabakat. Tüm anahtarlar IstasyonKod|tankNo. ---
  const sonuc: TankMutabakat[] = [];
  for (const [key, ilk] of ilkSeviye) {
    const son = sonSeviye.get(key);
    if (!son) continue;
    const [istKod, tankNo] = key.split('|');
    const A = ilk.lt;
    const D = son.lt;
    const B = dolumToplam.get(key) ?? 0;
    const C = satisToplam.get(key) ?? 0;
    const fark = A + B - C - D;
    const oran = C > 0 ? (fark / C) * 100 : 0;
    sonuc.push({
      istasyonKod: istKod,
      istasyonAd: adHarita.get(istKod) ?? istKod,
      tankNo,
      urun: ilk.urun,
      donemBasiStok: A,
      dolum: B,
      satis: C,
      donemSonuStok: D,
      fark: Math.round(fark * 100) / 100,
      oran: Math.round(oran * 100) / 100,
      limitAsimi: Math.abs(fark) > EPDK_LT_LIMIT || Math.abs(oran) > EPDK_ORAN_LIMIT,
    });
  }
  return sonuc.sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark));
}
