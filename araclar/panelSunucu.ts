// Local geliştirme API sunucusu — Vercel serverless'ın yerine geçer.
//
// NEDEN STATİK SNAPSHOT YETMİYOR: /api/bayiler artık sunucu-taraflı sayfalama
// yapıyor (query parametresi: q/il/dagitici/durum/sirala/sayfa). Statik bir JSON
// dosyası parametreye cevap veremez. Ayrıca giriş (oturum çerezi) de gerçek bir
// sunucu gerektiriyor. Bu araç Vite proxy'sinin arkasında aynı sözleşmeyi sunar,
// böylece local ile prod DAVRANIŞI da aynı olur (yalnız verisi değil).
//
// Çalıştır:  npm run panel:api      → http://localhost:5178
// Vite proxy'si /api/* isteklerini buraya yönlendirir (panel/vite.config.ts).

import { createServer } from 'node:http';
import { pool, kapat } from '../core/db.js';
import { piyasaVerisi, durumVerisi, bayiVerisi, bayiSecenekleri } from '../core/panelSorgu.js';

const PORT = Number(process.env.PANEL_API_PORT ?? 5178);
const p = pool();

/** Local'de giriş kapısı KAPALI (env yoksa) — geliştirmeyi yavaşlatmasın.
 *  PANEL_KULLANICILAR tanımlıysa gerçek akışı test etmek için açılır. */
const girisGerekli = !!process.env.PANEL_KULLANICILAR;

const sunucu = createServer(async (istek, yanit) => {
  const url = new URL(istek.url ?? '/', `http://localhost:${PORT}`);
  const q = url.searchParams;
  const json = (kod: number, govde: unknown) => {
    yanit.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    yanit.end(JSON.stringify(govde));
  };

  try {
    // Giriş: local'de kullanıcı tanımlı değilse "her zaman girişli" davran.
    if (url.pathname === '/api/giris') {
      if (istek.method === 'GET') return json(200, { girisli: !girisGerekli, kullanici: 'local' });
      if (istek.method === 'DELETE') return json(200, { girisli: false });
      return json(200, { girisli: true, kullanici: 'local' });
    }

    if (url.pathname === '/api/durum') return json(200, await durumVerisi(p));
    if (url.pathname === '/api/piyasa') return json(200, await piyasaVerisi(p));

    if (url.pathname === '/api/bayiler') {
      if (q.get('secenekler')) return json(200, await bayiSecenekleri(p));
      return json(
        200,
        await bayiVerisi(p, {
          q: q.get('q') ?? undefined,
          il: q.get('il') ?? undefined,
          dagitici: q.get('dagitici') ?? undefined,
          durum: q.get('durum') ?? undefined,
          sadeceBiz: q.get('sadeceBiz') === '1',
          sirala: q.get('sirala') ?? undefined,
          artan: q.get('artan') !== '0',
          sayfa: Number(q.get('sayfa') ?? 1),
          boyut: Number(q.get('boyut') ?? 50),
        }),
      );
    }

    json(404, { hata: `Bilinmeyen uç: ${url.pathname}` });
  } catch (e) {
    console.error('API hatası:', e);
    json(500, { hata: e instanceof Error ? e.message : String(e) });
  }
});

sunucu.listen(PORT, () => {
  console.log(`✔ Panel API → http://localhost:${PORT}`);
  console.log(`  Giriş kapısı: ${girisGerekli ? 'AÇIK (PANEL_KULLANICILAR tanımlı)' : 'kapalı (local kolaylık)'}`);
  console.log('  Uçlar: /api/durum  /api/piyasa  /api/bayiler  /api/giris');
});

for (const s of ['SIGINT', 'SIGTERM'] as const) {
  process.on(s, async () => {
    sunucu.close();
    await kapat().catch(() => {});
    process.exit(0);
  });
}
