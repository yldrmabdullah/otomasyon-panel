// Giriş / çıkış / oturum sorgulama / kendi şifresini değiştirme.
//   POST   /api/giris  {kullanici, sifre}              → çerez kurar
//   GET    /api/giris                                   → {girisli, kullanici, rol, sifreDegistir}
//   DELETE /api/giris                                   → çerezi siler
//   PATCH  /api/giris  {mevcutSifre, yeniSifre}         → kendi şifresini değiştirir
import { db, hataYanit } from './_db.js';
import { jetonUret, cerezKur, cerezSil, oturumKullanici } from './_oturum.js';
import { girisDogrula, sifreDegistir } from '../../core/kullanicilar.js';

/** Kaba brute-force yavaşlatma. Serverless'ta kalıcı sayaç yok (her çağrı izole),
 *  o yüzden IP kilidi YERİNE her başarısız denemeye sabit gecikme uygulanır.
 *  Ayrıca scrypt'in kendi maliyeti (~100 ms) denemeleri doğal olarak pahalılaştırır. */
const HATA_GECIKME_MS = 700;

function govdeOku(req: any): any {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const k = await oturumKullanici(req);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json(
        k
          ? { girisli: true, kullanici: k.kullanici_ad, rol: k.rol, adSoyad: k.ad_soyad, sifreDegistir: k.sifre_degistir }
          : { girisli: false },
      );
      return;
    }

    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', cerezSil());
      res.status(200).json({ girisli: false });
      return;
    }

    // Kendi şifresini değiştir (ilk giriş zorunlu değişimi de buradan geçer)
    if (req.method === 'PATCH') {
      const k = await oturumKullanici(req);
      if (!k) {
        res.status(401).json({ hata: 'Oturum gerekli.' });
        return;
      }
      const g = govdeOku(req);
      await sifreDegistir(db(), {
        ad: k.kullanici_ad,
        mevcutSifre: String(g.mevcutSifre ?? ''),
        yeniSifre: String(g.yeniSifre ?? ''),
      });
      res.status(200).json({ tamam: true });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ hata: 'Yöntem desteklenmiyor.' });
      return;
    }

    const g = govdeOku(req);
    const k = await girisDogrula(db(), String(g.kullanici ?? ''), String(g.sifre ?? ''));
    if (!k) {
      await new Promise((r) => setTimeout(r, HATA_GECIKME_MS));
      // Hangisinin yanlış olduğunu SÖYLEME (kullanıcı adı sızmasın).
      res.status(401).json({ hata: 'Kullanıcı adı veya şifre hatalı.' });
      return;
    }

    // İMZALI jeton — ham kullanıcı adı çerez yapılırsa herkes kendini admin ilan eder.
    res.setHeader('Set-Cookie', cerezKur(jetonUret(k.kullanici_ad)));
    res.status(200).json({
      girisli: true,
      kullanici: k.kullanici_ad,
      rol: k.rol,
      adSoyad: k.ad_soyad,
      sifreDegistir: k.sifre_degistir,
    });
  } catch (e) {
    hataYanit(res, e);
  }
}
