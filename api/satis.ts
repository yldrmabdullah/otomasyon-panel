// Satış + tank durumu — İşletme ekranı verisi.
// Yetki: 'operasyon' ekranı (stok/satış operasyonel takip).
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { satisTankVerisi } from '../core/panelSorgu.js';

export default korumali(async (req: any, res: any) => {
  try {
    const q = req?.query ?? {};
    const veri = await satisTankVerisi(db(), { bas: q.bas, bit: q.bit, istasyon: q.istasyon });
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'operasyon' });
