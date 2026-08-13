// Vercel serverless: Bayi fiyat takibi (rekabet kontrolü). Salt-okuma.
// Sorgu core/panelSorgu.ts'te (tek kaynak kuralı). ?gun=YYYY-MM-DD; verilmezse en güncel gün.
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { fiyatVerisi } from '../core/panelSorgu.js';


export default korumali(async (req: any, res: any) => {
  try {
    const veri = await fiyatVerisi(db(), req?.query?.gun);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'mevzuat' });
