// A1b stok-satış anomali — Mevzuat ekranı verisi.
// Yetki: 'mevzuat' ekranı (mutabakat/uzlaştırma/fiyat ile aynı modül).
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { a1bVerisi } from '../core/panelSorgu.js';

export default korumali(async (req: any, res: any) => {
  try {
    const veri = await a1bVerisi(db(), req?.query?.gun);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'mevzuat' });
