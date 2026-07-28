// Vercel serverless: İzleme modülü verisi. Salt-okuma. DATABASE_URL env'den.
// Sorgu core/panelSorgu.ts'te — local snapshot aracı AYNI modülü kullanır.
// (Eskiden burada ayrı bir sorgu vardı ve kategori/rakip/iptal_aciklama alanları
//  eksikti → prod'da İzleme tablosu TypeError ile çöküyordu.)
import { db, hataYanit } from './_db.js';
import { durumVerisi } from '../../core/panelSorgu.js';

export default async function handler(_req: unknown, res: any) {
  try {
    const veri = await durumVerisi(db());
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}
