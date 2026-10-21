// Vercel serverless: Kalibrasyon modülü verisi. Salt-okuma. DATABASE_URL env'den.
// Sorgu core/panelSorgu.ts'te (tek kaynak kuralı).
//
// İki mod:
//   GET /api/kalibrasyon                        → tank listesi + özet (güven/çap/kapsam)
//   GET /api/kalibrasyon?istasyon=X&tank=Y       → o tankın 1cm cetvel satırları + versiyon
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { kalibrasyonVerisi, kalibrasyonCetvel } from '../core/panelSorgu.js';

export default korumali(async (req: any, res: any) => {
  try {
    const istasyon = typeof req.query?.istasyon === 'string' ? req.query.istasyon : undefined;
    const tank = typeof req.query?.tank === 'string' ? req.query.tank : undefined;
    res.setHeader('Cache-Control', 'private, no-store');
    if (istasyon && tank) {
      res.status(200).json(await kalibrasyonCetvel(db(), istasyon, tank));
    } else {
      res.status(200).json(await kalibrasyonVerisi(db()));
    }
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'kalibrasyon' });
