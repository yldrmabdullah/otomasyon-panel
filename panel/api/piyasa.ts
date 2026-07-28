// Vercel serverless: Piyasa modülü verisi (EPDK dağıtıcı + bayi özetleri + transferler + analizler).
// Salt-okuma. Sorgu core/panelSorgu.ts'te — local snapshot aracı AYNI modülü kullanır.
// (Eskiden burada ayrı bir sorgu vardı: sozlesmeBitecek/bolgesel/beyazAlan/kaybedilen
//  hiç dönmüyordu, ozet alan adı uyuşmuyordu (NaN) ve ONAYLANDI filtresi yoktu →
//  aynı panel local'de 12.624, prod'da 30.303 aktif bayi gösteriyordu.)
import { db, hataYanit } from './_db.js';
import { piyasaVerisi } from '../../core/panelSorgu.js';

export default async function handler(_req: unknown, res: any) {
  try {
    const veri = await piyasaVerisi(db());
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}
