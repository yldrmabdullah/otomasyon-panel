// Vercel serverless: bayi listesi — SUNUCU TARAFLI sayfalama/filtre/sıralama.
// Salt-okuma. Sorgu core/panelSorgu.ts'te (whitelist'li ORDER BY).
//
// ⚠️ Tüm tabloyu döndürmek 30.303 satır / 8.88 MB / 26.5 saniye sürüyordu →
// Vercel ücretsiz plan 10 sn limitini aşıp timeout'a düşüyordu. Sayfalı: ~103 ms.
//
// GET /api/bayiler?q=&il=&dagitici=&durum=&sadeceBiz=1&sirala=il&artan=0&sayfa=2&boyut=50
//   → { satirlar: [...], toplam: N, sayfa, boyut }
// GET /api/bayiler?secenekler=1 → { iller, dagiticilar, toplamBayi }  (dropdown besleme)
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { bayiVerisi, bayiSecenekleri } from '../../core/panelSorgu.js';

const tekil = (v: unknown): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
};

export default korumali(async (req: any, res: any) => {
  try {
    const s = req?.query ?? {};

    if (tekil(s.secenekler)) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json(await bayiSecenekleri(db()));
      return;
    }

    const sonuc = await bayiVerisi(db(), {
      q: tekil(s.q),
      il: tekil(s.il),
      dagitici: tekil(s.dagitici),
      durum: tekil(s.durum),
      sadeceBiz: tekil(s.sadeceBiz) === '1',
      sirala: tekil(s.sirala),
      artan: tekil(s.artan) !== '0',
      sayfa: Number(tekil(s.sayfa) ?? 1),
      boyut: Number(tekil(s.boyut) ?? 50),
    });

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(sonuc);
  } catch (e) {
    hataYanit(res, e);
  }
});
