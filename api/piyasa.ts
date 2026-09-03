// Vercel serverless: Piyasa + Sorun Tespiti modülleri TEK dosyada (2026-09-03).
//
// İKİ İŞ TEK DOSYADA (a1b.ts'teki desenin devamı): Vercel Hobby planı bir deployment'ta
// en fazla 12 serverless fonksiyona izin veriyor. Dorse Durum Kontrol Sistemi'nin dış
// API'si (dis-v1.ts) eklenince api/ 13 uca çıktı — build "No more than 12 Serverless
// Functions" ile düşüyordu. Piyasa ve Sorun Tespiti AYRI ekranlar/izinler ama ikisi de
// salt-okuma + core/panelSorgu.ts'ten besleniyor; `?tip=` ile dallandırıldı.
//
// GET /api/piyasa            → piyasa modülü (varsayılan, eski davranış — dealer 'tip' YOK).
// GET /api/piyasa?tip=sorun  → Sorun Tespiti modülü.
//
// ⚠️ korumali() wrapper'ı SABİT bir `ekran` alır, `?tip=`e göre DİNAMİK karar veremez —
// bu yüzden burada oturum + izin kontrolü ELLE yapılıyor (korumali()'nin içeriği aynen).
import { db, hataYanit } from './_db.js';
import { oturumKullanici } from './_oturum.js';
import { gorebilir, EKRAN_AD, type Ekran } from '../core/ekranlar.js';
import { piyasaVerisi, sorunTespiti } from '../core/panelSorgu.js';

export default async function handler(req: any, res: any) {
  let kullanici;
  try {
    kullanici = await oturumKullanici(req);
  } catch (e) {
    res.status(500).json({ hata: e instanceof Error ? e.message : String(e) });
    return;
  }
  if (!kullanici) {
    res.status(401).json({ hata: 'Oturum gerekli. Lütfen giriş yapın.' });
    return;
  }

  const tip = req?.query?.tip === 'sorun' ? 'sorun' : 'piyasa';
  const ekran: Ekran = tip === 'sorun' ? 'sorun' : 'piyasa';
  if (!gorebilir(kullanici, ekran)) {
    res.status(403).json({
      hata: `"${EKRAN_AD[ekran]}" ekranı için yetkiniz yok. Yöneticinize başvurun.`,
    });
    return;
  }

  try {
    // Bu modüller en hassas veriyi taşıyabilir (piyasa: kaybedilen bayiler, rakip hedef
    // listesi, pazar payı) — private cache ZORUNLU (paylaşımlı edge cache'e girmesin).
    const veri = tip === 'sorun' ? await sorunTespiti(db()) : await piyasaVerisi(db());
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}
