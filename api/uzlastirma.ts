// Vercel serverless: Tank Uzlaştırma (EPDK stok mutabakatı). Salt-okuma.
// Sorgu core/panelSorgu.ts'te (tek kaynak kuralı).
// ?bas=YYYY-MM-DD&bit=YYYY-MM-DD ile aralık; ?epdk=... ile tek bayi tank detayı.
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { uzlastirmaVerisi } from '../core/panelSorgu.js';

export default korumali(async (req: any, res: any) => {
  try {
    const q = req?.query ?? {};
    const veri = await uzlastirmaVerisi(db(), q.bas, q.bit, q.epdk);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
});
