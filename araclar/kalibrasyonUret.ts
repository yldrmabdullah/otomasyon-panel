// Kalibrasyon cetveli üretimi (elle) — mantık core/kalibrasyonIs.ts'te; izleme işi de
// aynısını saatte bir otomatik çağırır. Bu araç elle tazeleme için.
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/kalibrasyonUret.ts

import { kalibrasyonUretimiYap } from '../core/kalibrasyonIs.js';
import { kapat } from '../core/db.js';

async function main() {
  const o = await kalibrasyonUretimiYap();
  console.log(`  ✔ ${o.uretildi} tank için cetvel üretildi (${o.degisen} değişti), ${o.atlandi} atlandı (veri yetersiz)`);
  console.log(`     güven: A=${o.guven.A} B=${o.guven.B} C=${o.guven.C} D=${o.guven.D} · ${o.sureMs} ms`);
  await kapat();
}

main().catch(async (e) => {
  console.error('Kalibrasyon üretim hatası:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
