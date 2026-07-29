// Vercel serverless: Piyasa modülü verisi (EPDK dağıtıcı + bayi özetleri + transferler + analizler).
// Salt-okuma. Sorgu core/panelSorgu.ts'te — local snapshot aracı AYNI modülü kullanır.
// (Eskiden burada ayrı bir sorgu vardı: sozlesmeBitecek/bolgesel/beyazAlan/kaybedilen
//  hiç dönmüyordu, ozet alan adı uyuşmuyordu (NaN) ve ONAYLANDI filtresi yoktu →
//  aynı panel local'de 12.624, prod'da 30.303 aktif bayi gösteriyordu.)
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { piyasaVerisi } from '../../core/panelSorgu.js';

// Bu endpoint en hassas veriyi taşıyor: kaybedilen bayiler, rakip hedef listesi,
// pazar payı. korumali() + private cache ZORUNLU (paylaşımlı edge cache'e girmesin).
export default korumali(async (_req: unknown, res: any) => {
  try {
    const veri = await piyasaVerisi(db());
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
});
