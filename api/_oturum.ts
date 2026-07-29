// Panel oturum yönetimi — imzalı çerez. Kullanıcı doğrulama core/kullanicilar.ts'te (DB).
//
// TASARIM KARARLARI (neden böyle):
//  · Panel ticari istihbarat gösteriyor (hangi bayi rakibe geçti, hedef listesi,
//    pazar payı). Korumasız yayınlanamaz.
//  · Oturum = HMAC-SHA256 imzalı çerez. Serverless'ta durum yok → DB/KV gerekmez;
//    imza sunucu sırrıyla doğrulanır, istemci kurcalayamaz.
//  · Çerez HttpOnly + Secure + SameSite=Strict → JS okuyamaz, CSRF zorlaşır.
//  · Jetonda ROL taşınmaz — yetki her istekte DB'den okunur. Rol düşürülen
//    kullanıcı eski jetonuyla admin işlemi yapamaz (12 saat beklenmez).

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { db } from './_db.js';
import { kullaniciBul, type Kullanici } from '../core/kullanicilar.js';

const COOKIE_AD = 'parkoil_oturum';
const OMUR_SN = 12 * 60 * 60; // 12 saat

/** Sabit-zamanlı string karşılaştırma (uzunluk farkı da sızdırmaz). */
function esitMi(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab); // zamanlamayı sabit tut
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
  const beklenen = createHmac('sha256', sir()).update(`${adB64}.${bitisStr}`).digest('base64url');
  if (!esitMi(beklenen, imza)) return null; // kurcalanmış
  const bitis = Number(bitisStr);
  if (!Number.isFinite(bitis) || bitis < Math.floor(Date.now() / 1000)) return null; // süresi geçmiş
  try {
    return Buffer.from(adB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function cerezKur(jeton: string): string {
  return `${COOKIE_AD}=${jeton}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${OMUR_SN}`;
}

export function cerezSil(): string {
  return `${COOKIE_AD}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** İstek başlıklarından oturum kullanıcı ADINI oku (DB'ye bakmaz). */
export function oturumAdi(req: { headers?: Record<string, unknown> }): string | null {
  const ham = req?.headers?.cookie;
  if (typeof ham !== 'string') return null;
  for (const c of ham.split(';')) {
    const [ad, ...kalan] = c.trim().split('=');
    if (ad === COOKIE_AD) return jetonDogrula(kalan.join('='));
  }
  return null;
}

/** Oturumu DB'den DOĞRULA — kullanıcı silinmiş/rolü değişmişse anında yansır. */
export async function oturumKullanici(req: any): Promise<Kullanici | null> {
  const ad = oturumAdi(req);
  if (!ad) return null;
  return kullaniciBul(db(), ad);
}

/**
 * Korumalı endpoint sarmalayıcısı. Oturum yoksa 401 → handler HİÇ çalışmaz
 * (DB'ye veri sorgusu bile gitmez). `rol: 'admin'` verilirse yetki de kontrol edilir.
 */
export function korumali(
  handler: (req: any, res: any, kullanici: Kullanici) => Promise<void>,
  opts: { rol?: 'admin' } = {},
): (req: any, res: any) => Promise<void> {
  return async (req, res) => {
    let k: Kullanici | null;
    try {
      k = await oturumKullanici(req);
    } catch (e) {
      res.status(500).json({ hata: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (!k) {
      res.status(401).json({ hata: 'Oturum gerekli. Lütfen giriş yapın.' });
      return;
    }
    if (opts.rol === 'admin' && k.rol !== 'admin') {
      res.status(403).json({ hata: 'Bu işlem için yönetici yetkisi gerekli.' });
      return;
    }
    await handler(req, res, k);
  };
}

/** Kurulum yardımcısı: rastgele oturum sırrı üret. */
export function sirUret(): string {
  return randomBytes(32).toString('hex');
}
