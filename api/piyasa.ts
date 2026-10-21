// Vercel serverless: Piyasa modülü verisi (EPDK dağıtıcı + bayi özetleri + transferler + analizler).
// Salt-okuma. Sorgu core/panelSorgu.ts'te — local snapshot aracı AYNI modülü kullanır.
//
// ⚠️ BAYİLER DE BURADA (2026-10-21): Vercel Hobby plan 12 serverless function limiti doldu
// (kalibrasyon eklenince 13 oldu). bayiler.ts bu dosyaya BİRLEŞTİRİLDİ — ikisi de 'piyasa'
// yetkili ve ikisi de Piyasa.tsx'ten çağrılıyor, yetki/güvenlik aynı kalır. FE artık
// /api/piyasa?bayiler=1 (liste) ve /api/piyasa?secenekler=1 (dropdown) çağırır.
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { piyasaVerisi, bayiVerisi, bayiSecenekleri } from '../core/panelSorgu.js';

const tekil = (v: unknown): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
};

// Bu endpoint en hassas veriyi taşıyor: kaybedilen bayiler, rakip hedef listesi,
// pazar payı. korumali() + private cache ZORUNLU (paylaşımlı edge cache'e girmesin).
export default korumali(async (req: any, res: any) => {
  try {
    const s = req?.query ?? {};
    res.setHeader('Cache-Control', 'private, no-store');

    // ── Bayi dropdown seçenekleri (il/dağıtıcı listesi) ──
    if (tekil(s.secenekler)) {
      res.status(200).json(await bayiSecenekleri(db()));
      return;
    }

    // ── Bayi listesi (sunucu-taraflı sayfalama/filtre/sıralama) ──
    if (tekil(s.bayiler)) {
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
      res.status(200).json(sonuc);
      return;
    }

    // ── Varsayılan: Piyasa modülü özeti ──
    res.status(200).json(await piyasaVerisi(db()));
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'piyasa' });
