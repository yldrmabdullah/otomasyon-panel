// Panel kimlik doğrulama — kullanıcı adı + şifre, imzalı oturum çerezi.
//
// TASARIM KARARLARI (neden böyle):
//  · Panel ticari istihbarat gösteriyor (hangi bayi rakibe geçti, hedef listesi,
//    pazar payı). Korumasız yayınlanamaz.
//  · Şifreler DÜZ METİN saklanmaz: env'de `kullanıcı:sha256(şifre)` çiftleri.
//  · Oturum = HMAC-SHA256 imzalı çerez. DB/KV gerekmez (serverless'ta durum yok),
//    imza sunucu sırrıyla doğrulanır → istemci kurcalayamaz.
//  · Çerez HttpOnly + Secure + SameSite=Strict → JS okuyamaz, CSRF zorlaşır.
//  · Sabit-zamanlı karşılaştırma (timingSafeEqual) → şifre/imza sızdırmaz.
//
// ⚠️ Bu tek-katman bir kapı: kullanıcı YÖNETİMİ yok (rol, kilitleme, parola
// değiştirme). Kullanıcı sayısı artınca portal (BFF) kimlik doğrulamasına geçilir.

import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';

const COOKIE_AD = 'parkoil_oturum';
const OMUR_SN = 12 * 60 * 60; // 12 saat

/** Sabit-zamanlı string karşılaştırma (uzunluk farkı da sızdırmaz). */
function esitMi(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Uzunluk farklıysa yine de bir karşılaştırma yap → zamanlama sabit kalsın.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function sir(): string {
  const s = process.env.PANEL_OTURUM_SIRRI;
  if (!s || s.length < 32)
    throw new Error('PANEL_OTURUM_SIRRI tanımlı değil veya 32 karakterden kısa.');
  return s;
}

/**
 * Kullanıcı listesi: `PANEL_KULLANICILAR` env'i.
 * Biçim: `ad1:sha256hex,ad2:sha256hex` (virgülle ayrılmış).
 * Hash üretimi: `node -e "console.log(require('crypto').createHash('sha256').update('ŞIFRE').digest('hex'))"`
 */
function kullanicilar(): Map<string, string> {
  const m = new Map<string, string>();
  for (const parca of (process.env.PANEL_KULLANICILAR ?? '').split(',')) {
    const [ad, hash] = parca.split(':');
    if (ad?.trim() && hash?.trim()) m.set(ad.trim().toLowerCase(), hash.trim().toLowerCase());
  }
  return m;
}

/** Kimlik doğrula. Başarılıysa kullanıcı adı, değilse null. */
export function kimlikDogrula(ad: string, sifre: string): string | null {
  const liste = kullanicilar();
  if (liste.size === 0) return null; // kullanıcı tanımlı değilse giriş YOK (fail-closed)
  const k = (ad ?? '').trim().toLowerCase();
  const beklenen = liste.get(k);
  const verilen = createHash('sha256').update(sifre ?? '', 'utf8').digest('hex');
  // Kullanıcı yoksa da hash hesaplayıp karşılaştır → "bu kullanıcı var mı" sızmasın.
  if (!esitMi(beklenen ?? 'x'.repeat(64), verilen)) return null;
  return k;
}

/** `kullanıcı.sonKullanma.imza` biçiminde imzalı jeton üret. */
export function jetonUret(kullanici: string): string {
  const bitis = Math.floor(Date.now() / 1000) + OMUR_SN;
  const govde = `${Buffer.from(kullanici).toString('base64url')}.${bitis}`;
  const imza = createHmac('sha256', sir()).update(govde).digest('base64url');
  return `${govde}.${imza}`;
}

/** Jetonu doğrula. Geçerliyse kullanıcı adı, değilse null. */
export function jetonDogrula(jeton: string | undefined): string | null {
  if (!jeton) return null;
  const p = jeton.split('.');
  if (p.length !== 3) return null;
  const [adB64, bitisStr, imza] = p;
  const govde = `${adB64}.${bitisStr}`;
  const beklenen = createHmac('sha256', sir()).update(govde).digest('base64url');
  if (!esitMi(beklenen, imza)) return null; // imza tutmuyor → kurcalanmış
  const bitis = Number(bitisStr);
  if (!Number.isFinite(bitis) || bitis < Math.floor(Date.now() / 1000)) return null; // süresi geçmiş
  try {
    return Buffer.from(adB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/** Set-Cookie başlığı (giriş). */
export function cerezKur(jeton: string): string {
  return `${COOKIE_AD}=${jeton}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${OMUR_SN}`;
}

/** Set-Cookie başlığı (çıkış). */
export function cerezSil(): string {
  return `${COOKIE_AD}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** İstek başlıklarından oturumu oku. */
export function oturumOku(req: { headers?: Record<string, unknown> }): string | null {
  const ham = req?.headers?.cookie;
  if (typeof ham !== 'string') return null;
  for (const c of ham.split(';')) {
    const [ad, ...kalan] = c.trim().split('=');
    if (ad === COOKIE_AD) return jetonDogrula(kalan.join('='));
  }
  return null;
}

/**
 * Korumalı endpoint sarmalayıcısı. Oturum yoksa 401 döner ve handler HİÇ çalışmaz
 * (yani DB'ye sorgu bile gitmez).
 */
export function korumali(
  handler: (req: any, res: any) => Promise<void>,
): (req: any, res: any) => Promise<void> {
  return async (req, res) => {
    if (!oturumOku(req)) {
      res.status(401).json({ hata: 'Oturum gerekli. Lütfen giriş yapın.' });
      return;
    }
    await handler(req, res);
  };
}

/** Kurulum yardımcısı: rastgele oturum sırrı üret (CLI'dan çağrılır). */
export function sirUret(): string {
  return randomBytes(32).toString('hex');
}
