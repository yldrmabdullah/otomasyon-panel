// Local geliştirme API sunucusu — Vercel serverless'ın yerine geçer.
//
// NEDEN: /api/bayiler sunucu-taraflı sayfalama yapıyor (query parametresi) ve
// giriş akışı gerçek bir sunucu gerektiriyor. Statik JSON dosyaları ikisini de
// karşılayamaz. Bu araç aynı SÖZLEŞMEYİ sunar → local ile prod aynı davranır.
//
// Çalıştır:  npm run panel:api      → http://localhost:5178
// Vite proxy'si /api/* isteklerini buraya yönlendirir (panel/vite.config.ts).

import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pool, kapat } from '../core/db.js';
import { piyasaVerisi, durumVerisi, operasyonVerisi, sorunTespiti, bayiVerisi, bayiSecenekleri, a3LogoVerisi, uzlastirmaVerisi, fiyatVerisi, a1bVerisi, a1bEsikOku, a1bEsikKaydet, yonetimVerisi } from '../core/panelSorgu.js';
import {
  girisDogrula, kullaniciBul, kullaniciListesi, kullaniciEkle, kullaniciSil,
  rolDegistir, sifreDegistir, ekranlariGuncelle, sifreUret, adNormal,
} from '../core/kullanicilar.js';
import { EKRANLAR, EKRAN_AD, gorebilir, gorunurEkranlar, type Ekran } from '../core/ekranlar.js';
import { ESIK_SURUM } from '../core/a1bKural.js';

const PORT = Number(process.env.PANEL_API_PORT ?? 5178);
const SIR = process.env.PANEL_OTURUM_SIRRI ?? 'local-gelistirme-sirri-en-az-32-karakter-olmali';
const COOKIE = 'parkoil_oturum';
const OMUR = 12 * 60 * 60;
const p = pool();

// --- Oturum (prod ile aynı imzalama mantığı) ---
const jetonUret = (ad: string) => {
  const bitis = Math.floor(Date.now() / 1000) + OMUR;
  const govde = `${Buffer.from(ad).toString('base64url')}.${bitis}`;
  return `${govde}.${createHmac('sha256', SIR).update(govde).digest('base64url')}`;
};
const jetonDogrula = (j?: string): string | null => {
  if (!j) return null;
  const x = j.split('.');
  if (x.length !== 3) return null;
  const bek = createHmac('sha256', SIR).update(`${x[0]}.${x[1]}`).digest('base64url');
  if (bek.length !== x[2].length || !timingSafeEqual(Buffer.from(bek), Buffer.from(x[2]))) return null;
  if (Number(x[1]) < Math.floor(Date.now() / 1000)) return null;
  try { return Buffer.from(x[0], 'base64url').toString('utf8'); } catch { return null; }
};
const cerezOku = (istek: any): string | null => {
  const ham = istek.headers?.cookie;
  if (typeof ham !== 'string') return null;
  for (const c of ham.split(';')) {
    const [ad, ...k] = c.trim().split('=');
    if (ad === COOKIE) return jetonDogrula(k.join('='));
  }
  return null;
};

function govdeOku(istek: any): Promise<any> {
  return new Promise((coz) => {
    let d = '';
    istek.on('data', (c: Buffer) => (d += c));
    istek.on('end', () => { try { coz(d ? JSON.parse(d) : {}); } catch { coz({}); } });
  });
}

const sunucu = createServer(async (istek, yanit) => {
  const url = new URL(istek.url ?? '/', `http://localhost:${PORT}`);
  const q = url.searchParams;
  const json = (kod: number, govde: unknown, cerez?: string) => {
    const b: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (cerez) b['Set-Cookie'] = cerez;
    yanit.writeHead(kod, b);
    yanit.end(JSON.stringify(govde));
  };

  try {
    // ---- Giriş / oturum ----
    if (url.pathname === '/api/giris') {
      if (istek.method === 'GET') {
        const ad = cerezOku(istek);
        const k = ad ? await kullaniciBul(p, ad) : null;
        return json(200, k
          ? { girisli: true, kullanici: k.kullanici_ad, rol: k.rol, adSoyad: k.ad_soyad, sifreDegistir: k.sifre_degistir, ekranlar: gorunurEkranlar(k) }
          : { girisli: false });
      }
      if (istek.method === 'DELETE') {
        return json(200, { girisli: false }, `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      }
      if (istek.method === 'PATCH') {
        const ad = cerezOku(istek);
        if (!ad) return json(401, { hata: 'Oturum gerekli.' });
        const g = await govdeOku(istek);
        await sifreDegistir(p, { ad, mevcutSifre: String(g.mevcutSifre ?? ''), yeniSifre: String(g.yeniSifre ?? '') });
        return json(200, { tamam: true });
      }
      const g = await govdeOku(istek);
      const k = await girisDogrula(p, String(g.kullanici ?? ''), String(g.sifre ?? ''));
      if (!k) {
        await new Promise((r) => setTimeout(r, 700));
        return json(401, { hata: 'Kullanıcı adı veya şifre hatalı.' });
      }
      // Local'de Secure yok (http) — prod'da var.
      return json(200,
        { girisli: true, kullanici: k.kullanici_ad, rol: k.rol, adSoyad: k.ad_soyad, sifreDegistir: k.sifre_degistir, ekranlar: gorunurEkranlar(k) },
        `${COOKIE}=${jetonUret(k.kullanici_ad)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${OMUR}`);
    }

    // ---- Bundan sonrası oturum ister (prod ile aynı) ----
    const oturumAd = cerezOku(istek);
    const benKim = oturumAd ? await kullaniciBul(p, oturumAd) : null;
    if (!benKim) return json(401, { hata: 'Oturum gerekli. Lütfen giriş yapın.' });

    // ---- Kullanıcı yönetimi (admin) ----
    if (url.pathname === '/api/kullanicilar') {
      if (benKim.rol !== 'admin') return json(403, { hata: 'Bu işlem için yönetici yetkisi gerekli.' });
      try {
        if (istek.method === 'GET')
          return json(200, { kullanicilar: await kullaniciListesi(p), benKim: benKim.kullanici_ad, tumEkranlar: EKRANLAR });
        if (istek.method === 'POST') {
          const g = await govdeOku(istek);
          const uretildi = !g.sifre;
          const sifre = uretildi ? sifreUret() : String(g.sifre);
          const k = await kullaniciEkle(p, {
            ad: String(g.ad ?? ''), sifre,
            rol: g.rol === 'admin' ? 'admin' : 'izleyici',
            adSoyad: g.adSoyad ? String(g.adSoyad) : undefined,
            olusturan: benKim.kullanici_ad, sifreDegistir: true,
            ekranlar: 'ekranlar' in g ? g.ekranlar : undefined,
          });
          return json(201, { kullanici: k, sifre, uretildi });
        }
        if (istek.method === 'PATCH') {
          const g = await govdeOku(istek);
          const hedef = adNormal(String(g.ad ?? ''));
          if (!hedef) throw new Error('Kullanıcı adı gerekli.');
          let yeniSifre: string | undefined;
          if (g.sifreSifirla || g.yeniSifre) {
            yeniSifre = g.yeniSifre ? String(g.yeniSifre) : sifreUret();
            await sifreDegistir(p, { ad: hedef, yeniSifre, adminAtlama: true });
          }
          if (g.rol === 'admin' || g.rol === 'izleyici') {
            if (hedef === benKim.kullanici_ad && g.rol !== 'admin')
              throw new Error('Kendi yönetici rolünü düşüremezsin.');
            await rolDegistir(p, hedef, g.rol);
          }
          if ('ekranlar' in g) await ekranlariGuncelle(p, hedef, g.ekranlar);
          return json(200, { tamam: true, sifre: yeniSifre });
        }
        if (istek.method === 'DELETE') {
          const hedef = adNormal(q.get('ad') ?? '');
          if (!hedef) throw new Error('Kullanıcı adı gerekli.');
          if (hedef === benKim.kullanici_ad) throw new Error('Kendini silemezsin.');
          await kullaniciSil(p, hedef);
          return json(200, { tamam: true });
        }
        return json(405, { hata: 'Yöntem desteklenmiyor.' });
      } catch (e) {
        return json(400, { hata: e instanceof Error ? e.message : String(e) });
      }
    }

    // ---- Veri uçları ----
    // Ekran yetkisi: prod'da korumali({ekran}) yapıyor (api/_oturum.ts). Local
    // sunucu prod ile AYNI SÖZLEŞMEYİ sunmalı — yoksa yetki hatası yalnız canlıda
    // ortaya çıkar. Menüden gizlemek yetki değildir; kapı sunucuda.
    /** Yetkisizse 403 yazıp `false` döner → çağıran yeri hemen terk eder. */
    const ekranKapi = (e: Ekran): boolean => {
      if (gorebilir(benKim, e)) return true;
      json(403, { hata: `"${EKRAN_AD[e]}" ekranı için yetkiniz yok. Yöneticinize başvurun.` });
      return false;
    };
    if (url.pathname === '/api/durum') {
      if (!ekranKapi('izleme')) return;
      return json(200, await durumVerisi(p));
    }
    if (url.pathname === '/api/piyasa') {
      if (!ekranKapi('piyasa')) return;
      return json(200, await piyasaVerisi(p));
    }
    // Yönetim: bayi × ürün grubu alımları (tarih filtreli). Vercel'deki
    // api/yonetim.ts ile AYNI sorguyu kullanır — ikisi ayrı kod, birlikte güncellenir.
    if (url.pathname === '/api/yonetim') {
      if (!ekranKapi('yonetim')) return;
      return json(200, await yonetimVerisi(
        p,
        url.searchParams.get('baslangic') ?? undefined,
        url.searchParams.get('bitis') ?? undefined,
      ));
    }
    if (url.pathname === '/api/operasyon') {
      if (!ekranKapi('operasyon')) return;
      return json(200, await operasyonVerisi(p));
    }
    if (url.pathname === '/api/sorun') {
      if (!ekranKapi('sorun')) return;
      return json(200, await sorunTespiti(p));
    }
    if (url.pathname === '/api/mutabakat') {
      if (!ekranKapi('mevzuat')) return;
      return json(200, await a3LogoVerisi(p, q.get('donem') ?? undefined));
    }
    if (url.pathname === '/api/uzlastirma') {
      if (!ekranKapi('mevzuat')) return;
      return json(200, await uzlastirmaVerisi(p, q.get('bas') ?? undefined, q.get('bit') ?? undefined, q.get('epdk') ?? undefined));
    }
    if (url.pathname === '/api/fiyat') {
      if (!ekranKapi('mevzuat')) return;
      return json(200, await fiyatVerisi(p, q.get('gun') ?? undefined));
    }
    // a1b + esik TEK UC (2026-08-25): Vercel Hobby 12 fonksiyon siniri nedeniyle
    // api/a1b-esik.ts, api/a1b.ts icine ?kapsam=esik olarak tasindi. Yerel sunucu
    // uretimle AYNI davranmali, yoksa local'de calisan bir sey canlida 404 olur.
    if (url.pathname === '/api/a1b') {
      if (!ekranKapi('mevzuat')) return;
      // ESIK dali: yalniz ADMIN (esik degisikligi tum gecmis alarmlari yeniden siniflandirir)
      if (q.get('kapsam') === 'esik') {
        if (benKim.rol !== 'admin') return json(403, { hata: 'Bu işlem için yönetici yetkisi gerekli.' });
        if (istek.method === 'GET') return json(200, { esik: await a1bEsikOku(p) });
        if (istek.method === 'POST') {
          const g = await govdeOku(istek);
          const surum = `${ESIK_SURUM}+elle-${new Date().toISOString().slice(0, 10)}`;
          return json(200, await a1bEsikKaydet(p, g, surum));
        }
        return json(405, { hata: 'Yöntem desteklenmiyor.' });
      }
      return json(200, await a1bVerisi(p, q.get('gun') ?? undefined));
    }
    if (url.pathname === '/api/bayiler') {
      if (!ekranKapi('piyasa')) return;
      if (q.get('secenekler')) return json(200, await bayiSecenekleri(p));
      return json(200, await bayiVerisi(p, {
        q: q.get('q') ?? undefined,
        il: q.get('il') ?? undefined,
        dagitici: q.get('dagitici') ?? undefined,
        durum: q.get('durum') ?? undefined,
        sadeceBiz: q.get('sadeceBiz') === '1',
        sirala: q.get('sirala') ?? undefined,
        artan: q.get('artan') !== '0',
        sayfa: Number(q.get('sayfa') ?? 1),
        boyut: Number(q.get('boyut') ?? 50),
      }));
    }

    json(404, { hata: `Bilinmeyen uç: ${url.pathname}` });
  } catch (e) {
    console.error('API hatası:', e);
    json(500, { hata: e instanceof Error ? e.message : String(e) });
  }
});

sunucu.listen(PORT, () => {
  console.log(`✔ Panel API → http://localhost:${PORT}`);
  console.log('  Giriş GEREKLİ (prod ile aynı). Kullanıcı yok ise:');
  console.log('    npm run kullanici -- ekle ahmet --admin');
  console.log('  Uçlar: /api/giris /api/kullanicilar /api/durum /api/piyasa /api/yonetim /api/operasyon /api/sorun /api/bayiler');
});

for (const s of ['SIGINT', 'SIGTERM'] as const) {
  process.on(s, async () => { sunucu.close(); await kapat().catch(() => {}); process.exit(0); });
}
