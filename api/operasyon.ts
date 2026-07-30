// Vercel serverless: Operasyon modülü verisi. Salt-okuma. DATABASE_URL env'den.
// Sorgu core/panelSorgu.ts'te (tek kaynak kuralı — bkz o dosyanın başındaki not).
//
// Otomasyon ekibinin ELLE takip ettiği 3 iş: yakıt kaç gün yeter, alarm geçmişi
// (yanıp sönme / gerçek arıza ayrımıyla), irsaliyesiz dolum.
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { operasyonVerisi } from '../core/panelSorgu.js';

// korumali(): oturum yoksa 401 → DB'ye sorgu bile gitmez.
// Cache PRIVATE: korumalı veri, Vercel edge'i paylaşımlı önbelleğe almamalı.
export default korumali(async (_req: unknown, res: any) => {
  try {
    const veri = await operasyonVerisi(db());
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
});
