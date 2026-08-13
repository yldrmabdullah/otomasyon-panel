// Vercel serverless: Sorun Tespiti modülü. Salt-okuma.
// Sorgu core/panelSorgu.ts'te (tek kaynak kuralı).
//
// POL/EPDK modülünün yakaladığı anomalileri kendi ham verimizden, POL'den ÖNCE
// çıkarır. Bkz. docs/bilgi/epdk-modulu-a-tablolari.md
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { sorunTespiti } from '../core/panelSorgu.js';


export default korumali(async (_req: unknown, res: any) => {
  try {
    const veri = await sorunTespiti(db());
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'sorun' });
