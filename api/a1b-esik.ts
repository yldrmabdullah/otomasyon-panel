// A1b eşik ayarları — GET oku, POST kaydet (+ geçmişi yeniden hesapla).
// YALNIZ ADMIN: eşik değişikliği tüm geçmiş alarmları yeniden sınıflandırır.
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { a1bEsikOku, a1bEsikKaydet } from '../core/panelSorgu.js';
import { ESIK_SURUM } from '../core/a1bKural.js';

export default korumali(async (req: any, res: any) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method === 'GET') {
      res.status(200).json({ esik: await a1bEsikOku(db()) });
      return;
    }
    if (req.method === 'POST') {
      const g = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
      // Sürüm damgası: hangi ayar setiyle hesaplandığı kayda yazılır (audit).
      const surum = `${ESIK_SURUM}+elle-${new Date().toISOString().slice(0, 10)}`;
      res.status(200).json(await a1bEsikKaydet(db(), g, surum));
      return;
    }
    res.status(405).json({ hata: 'Yöntem desteklenmiyor.' });
  } catch (e) {
    hataYanit(res, e);
  }
}, { rol: 'admin' });
