// Vercel serverless: İzleme modülü verisi. Salt-okuma. DATABASE_URL env'den.
// Sorgu core/panelSorgu.ts'te — local snapshot aracı AYNI modülü kullanır.
// (Eskiden burada ayrı bir sorgu vardı ve kategori/rakip/iptal_aciklama alanları
//  eksikti → prod'da İzleme tablosu TypeError ile çöküyordu.)
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { durumVerisi } from '../core/panelSorgu.js';

// korumali(): oturum yoksa 401 → DB'ye sorgu bile gitmez.
// Cache-Control PRIVATE olmalı: bu kullanıcıya özel korumalı veri, Vercel edge'i
// paylaşımlı önbelleğe alıp oturumsuz istemciye servis etmemeli.
export default korumali(async (_req: unknown, res: any) => {
  try {
    const veri = await durumVerisi(db());
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
});
