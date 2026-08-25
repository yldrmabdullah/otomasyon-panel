// A1b stok-satış anomali — Mevzuat ekranı verisi + eşik ayarları.
//
// İKİ İŞ TEK DOSYADA (2026-08-25): Vercel Hobby planı bir deployment'ta en fazla
// 12 serverless fonksiyona izin veriyor; api/ altında 13 uç olunca build "No more
// than 12 Serverless Functions" ile düşüyordu. a1b ve a1b-esik zaten AYNI özelliğin
// parçası (eşik, a1b analizinin girdisi) — ayrı dosya olmaları teknik zorunluluk
// değildi, birleştirildi. Diğer uçlar farklı modüllere ait, onları birleştirmek
// sorumlulukları karıştırırdı.
//
// ⚠️ YETKİLER FARKLI, KORUNDU:
//   ?kapsam yok  → a1b verisi   → 'mevzuat' EKRAN yetkisi
//   ?kapsam=esik → eşik oku/yaz → yalnız ADMIN (eşik değişikliği TÜM geçmiş
//                                 alarmları yeniden sınıflandırır)
// Bu yüzden sarmalayıcıya ekran yetkisi verilir; admin kontrolü İÇERİDE, yalnız
// eşik dalında yapılır. Aksi halde eşik ucu ekran yetkisiyle açılırdı (yetki
// zayıflaması) ya da a1b verisi admin'e kilitlenirdi (işlev kaybı).
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { a1bVerisi, a1bEsikOku, a1bEsikKaydet } from '../core/panelSorgu.js';
import { ESIK_SURUM } from '../core/a1bKural.js';

export default korumali(async (req: any, res: any, kullanici: any) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store');

    // ── EŞİK AYARLARI (yalnız admin) ───────────────────────────────────────────
    if (req?.query?.kapsam === 'esik') {
      if (kullanici?.rol !== 'admin') {
        res.status(403).json({ hata: 'Bu işlem için yönetici yetkisi gerekli.' });
        return;
      }
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
      return;
    }

    // ── A1B VERİSİ (mevzuat ekranı) ────────────────────────────────────────────
    res.status(200).json(await a1bVerisi(db(), req?.query?.gun));
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'mevzuat' });
