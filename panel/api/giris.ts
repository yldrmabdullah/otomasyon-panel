// Giriş / çıkış / oturum sorgulama.
//   POST /api/giris  {kullanici, sifre} → çerez kurar
//   GET  /api/giris                     → {girisli, kullanici}
//   DELETE /api/giris                   → çerezi siler
import { kimlikDogrula, jetonUret, cerezKur, cerezSil, oturumOku } from './_oturum.js';

/** Kaba brute-force yavaşlatma. Serverless'ta kalıcı sayaç yok (her çağrı izole),
 *  o yüzden IP bazlı kilit YERİNE her başarısız denemeye sabit gecikme uygulanır.
 *  Saldırgan paralel deneyebilir ama tek-hesap tahmini pahalılaşır. Gerçek kilit
 *  gerekirse Postgres'e deneme tablosu eklenir. */
const HATA_GECIKME_MS = 900;

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const k = oturumOku(req);
      res.status(200).json({ girisli: !!k, kullanici: k });
      return;
    }

    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', cerezSil());
      res.status(200).json({ girisli: false });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ hata: 'Yöntem desteklenmiyor.' });
      return;
    }

    // Gövde string olarak gelebilir (Vercel bazı durumlarda parse etmez).
    const g = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const kullanici = String(g.kullanici ?? '');
    const sifre = String(g.sifre ?? '');

    const dogru = kimlikDogrula(kullanici, sifre);
    if (!dogru) {
      await new Promise((r) => setTimeout(r, HATA_GECIKME_MS));
      // Hangisinin yanlış olduğunu SÖYLEME (kullanıcı adı sızmasın).
      res.status(401).json({ hata: 'Kullanıcı adı veya şifre hatalı.' });
      return;
    }

    res.setHeader('Set-Cookie', cerezKur(jetonUret(dogru)));
    res.status(200).json({ girisli: true, kullanici: dogru });
  } catch (e) {
    res.status(500).json({ hata: e instanceof Error ? e.message : String(e) });
  }
}
