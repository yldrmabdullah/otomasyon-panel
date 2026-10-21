// Kalibrasyon mm serisi çekimi — ASIS `GetTankLastLevel` → `kalibrasyon_mm_seri`.
//
// AMAÇ: tank mm→litre kalibrasyon cetveli için ham nokta bulutu biriktirmek. Her koşu
// TÜM filonun (677 tank) anlık mm ölçümünü alır ve biriktirir. Ne kadar sık koşarsa
// o kadar yoğun seri → o kadar iyi cetvel.
//
// ⚠️ NEDEN GetTankLevelList DEĞİL: o artımlı metot 269 istasyonun yalnız 16-19'una
// ulaşıyor (seviyeCek.ts'te ölçülüp kanıtlandı). GetTankLastLevel tüm filoyu tek
// çağrıda verir (anlık) — kapsam için bu şart. mm/sıcaklık/su alanlarını da döndürüyor
// (canlı doğrulandı: 677 tank, mm %98 dolu).
//
// ⚠️ SINIR: anlık veri, geçmiş çekilemez. Seri bu aracın İLK koşusundan itibaren dolar.
// Aynı ölçüm zamanı tekrar gelirse ezilir (upsert), farklı zaman yeni nokta.
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/kalibrasyonSeviyeCek.ts

import { asis } from '../core/asisClient.js';
import { kalibrasyonSeriKaydet, kapat } from '../core/db.js';

async function main() {
  const t0 = Date.now();
  // Tüm filo (istasyonKod verilmezse GetTankLastLevel hepsini döndürür).
  const tanklar = await asis.tankSonDurum();
  console.log(`ASIS GetTankLastLevel: ${tanklar.length} tank · ${Date.now() - t0} ms`);

  if (tanklar.length === 0) {
    throw new Error('ASIS boş liste döndü — parametre sırası / guidKey doğru mu?');
  }

  // mm dolu olan tank sayısı (kalite göstergesi — boş mm kalibrasyona girmez)
  const mmDolu = tanklar.filter((t) => t.yakitMm != null && t.yakitMm > 0).length;

  const yazilan = await kalibrasyonSeriKaydet(tanklar);

  console.log(`  ✔ ${yazilan} tank ölçümü biriktirildi (kalibrasyon_mm_seri)`);
  console.log(`     mm dolu: ${mmDolu}/${tanklar.length} (${Math.round((100 * mmDolu) / tanklar.length)}%)`);
  if (mmDolu === 0) {
    console.log('     ⚠ HİÇ mm yok — GetTankLastLevel bu ortamda YakitSeviyeMM döndürmüyor olabilir, kontrol et.');
  }

  await kapat();
}

main().catch(async (e) => {
  console.error('Kalibrasyon seviye çekim hatası:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
