// Vercel serverless: A3 (ASIS POL) ↔ Logo mutabakatı. Salt-okuma.
// Sorgu core/panelSorgu.ts'te (tek kaynak kuralı). ?donem=YYYY-MM ile dönem seçilir;
// verilmezse en güncel dönem döner.
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { a3LogoVerisi } from '../core/panelSorgu.js';


export default korumali(async (req: any, res: any) => {
  try {
    const donem = req?.query?.donem as string | undefined;
    const veri = await a3LogoVerisi(db(), donem);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'mevzuat' });
