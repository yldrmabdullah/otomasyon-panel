// Panel kullanıcı yönetimi — DB tabanlı (panel_kullanicilar tablosu).
//
// Şifre saklama: scrypt + rastgele tuz. node:crypto içinde olduğu için ek
// bağımlılık yok; bcrypt'ten güçlü (bellek-zor). Düz şifre HİÇ saklanmaz, hiçbir
// yere loglanmaz.
//
// Rol modeli KASITEN basit: 'admin' (kullanıcı yönetebilir) ve 'izleyici' (yalnız
// panel okur). İhtiyaç büyürse rol tablosu ayrılır.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

const N = 16384; // CPU/bellek maliyeti
const ANAHTAR_UZUNLUK = 64;

// promisify(scrypt) opsiyon parametreli aşırı yüklemeyi tanımıyor → elle sarmalıyoruz.
function scrypt(sifre: string, tuz: Buffer, uzunluk: number): Promise<Buffer> {
  return new Promise((coz, red) => {
    scryptCb(sifre, tuz, uzunluk, { N }, (e, anahtar) => (e ? red(e) : coz(anahtar)));
  });
}

export type Rol = 'admin' | 'izleyici';

export interface Kullanici {
  kullanici_ad: string;
  rol: Rol;
  ad_soyad: string | null;
  sifre_degistir: boolean;
  son_giris: string | null;
  olusturan: string | null;
  olusturma: string;
}

/** Kullanıcı adını normalize et (büyük/küçük harf ve boşluk farkı sorun olmasın). */
export function adNormal(ad: string): string {
  return (ad ?? '').trim().toLocaleLowerCase('tr');
}

/** Şifreyi hash'le: 'scrypt$tuzHex$hashHex'. */
export async function sifreHash(sifre: string): Promise<string> {
  const tuz = randomBytes(16);
  const hash = await scrypt(sifre, tuz, ANAHTAR_UZUNLUK);
  return `scrypt$${tuz.toString('hex')}$${hash.toString('hex')}`;
}

/** Şifre doğrula. Sabit-zamanlı karşılaştırma. */
export async function sifreDogru(sifre: string, kayit: string): Promise<boolean> {
  const p = (kayit ?? '').split('$');
  if (p.length !== 3 || p[0] !== 'scrypt') return false;
  try {
    const tuz = Buffer.from(p[1], 'hex');
    const beklenen = Buffer.from(p[2], 'hex');
    const hash = await scrypt(sifre, tuz, beklenen.length);
    return hash.length === beklenen.length && timingSafeEqual(hash, beklenen);
  } catch {
    return false;
  }
}

/**
 * Okunabilir ama güçlü şifre (~52 bit entropi). Telefonda okunup yazılabilsin diye
 * hece tabanlı; karışan karakterler (l/1/O/0) kullanılmaz.
 */
export function sifreUret(): string {
  const bas = 'bcdfgkmnprstvyz';
  const sesli = 'aeiou';
  const b = randomBytes(16);
  let s = '';
  for (let i = 0; i < 4; i++) s += bas[b[i * 2] % bas.length] + sesli[b[i * 2 + 1] % sesli.length];
  return s.charAt(0).toUpperCase() + s.slice(1) + String(100 + (b[12] % 900)) + '!@#$%&*'[b[13] % 7];
}

/** Şifre politikası. Zayıf şifre kabul edilmez. */
export function sifreGecerliMi(s: string): { tamam: boolean; sebep?: string } {
  if (!s || s.length < 8) return { tamam: false, sebep: 'Şifre en az 8 karakter olmalı.' };
  if (s.length > 200) return { tamam: false, sebep: 'Şifre çok uzun.' };
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s)) return { tamam: false, sebep: 'Şifre en az bir harf içermeli.' };
  if (!/[0-9]/.test(s)) return { tamam: false, sebep: 'Şifre en az bir rakam içermeli.' };
  return { tamam: true };
}

/** Girişi doğrula. Başarılıysa kullanıcı, değilse null. Son giriş zamanını günceller. */
export async function girisDogrula(p: Pool, ad: string, sifre: string): Promise<Kullanici | null> {
  const k = adNormal(ad);
  const r = await p.query(
    `SELECT kullanici_ad, sifre_hash, rol, ad_soyad, sifre_degistir, son_giris, olusturan, olusturma
     FROM panel_kullanicilar WHERE kullanici_ad = $1`,
    [k],
  );
  const satir = r.rows[0];
  // Kullanıcı yoksa da scrypt çalıştır → "bu kullanıcı var mı" zamanlamadan sızmasın.
  const kayit = satir?.sifre_hash ?? `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;
  const dogru = await sifreDogru(sifre, kayit);
  if (!satir || !dogru) return null;

  await p.query(`UPDATE panel_kullanicilar SET son_giris = now() WHERE kullanici_ad = $1`, [k]);
  const { sifre_hash: _gizli, ...temiz } = satir;
  return temiz as Kullanici;
}

/** Kullanıcı listesi (şifre hash'i ASLA dönmez). */
export async function kullaniciListesi(p: Pool): Promise<Kullanici[]> {
  const r = await p.query(
    `SELECT kullanici_ad, rol, ad_soyad, sifre_degistir, son_giris, olusturan, olusturma
     FROM panel_kullanicilar ORDER BY kullanici_ad`,
  );
  return r.rows as Kullanici[];
}

/** Tek kullanıcı (oturum doğrulamada rol/şifre-değiştir durumu için). */
export async function kullaniciBul(p: Pool, ad: string): Promise<Kullanici | null> {
  const r = await p.query(
    `SELECT kullanici_ad, rol, ad_soyad, sifre_degistir, son_giris, olusturan, olusturma
     FROM panel_kullanicilar WHERE kullanici_ad = $1`,
    [adNormal(ad)],
  );
  return (r.rows[0] as Kullanici) ?? null;
}

/** Yeni kullanıcı ekle. Yalnız admin çağırmalı (kontrol endpoint'te). */
export async function kullaniciEkle(
  p: Pool,
  opts: { ad: string; sifre: string; rol?: Rol; adSoyad?: string; olusturan: string; sifreDegistir?: boolean },
): Promise<Kullanici> {
  const k = adNormal(opts.ad);
  if (!/^[a-z0-9._-]{3,32}$/.test(k))
    throw new Error('Kullanıcı adı 3-32 karakter olmalı; harf, rakam, nokta, alt çizgi ve tire kullanılabilir.');
  const pol = sifreGecerliMi(opts.sifre);
  if (!pol.tamam) throw new Error(pol.sebep!);

  const hash = await sifreHash(opts.sifre);
  try {
    const r = await p.query(
      `INSERT INTO panel_kullanicilar (kullanici_ad, sifre_hash, rol, ad_soyad, olusturan, sifre_degistir)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING kullanici_ad, rol, ad_soyad, sifre_degistir, son_giris, olusturan, olusturma`,
      [k, hash, opts.rol ?? 'izleyici', opts.adSoyad ?? null, adNormal(opts.olusturan), opts.sifreDegistir ?? true],
    );
    return r.rows[0] as Kullanici;
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === '23505') throw new Error(`"${k}" kullanıcısı zaten var.`);
    throw e;
  }
}

/** Şifre değiştir. Kullanıcı kendi şifresini değiştirirse `mevcutSifre` zorunlu. */
export async function sifreDegistir(
  p: Pool,
  opts: { ad: string; yeniSifre: string; mevcutSifre?: string; adminAtlama?: boolean },
): Promise<void> {
  const k = adNormal(opts.ad);
  const pol = sifreGecerliMi(opts.yeniSifre);
  if (!pol.tamam) throw new Error(pol.sebep!);

  if (!opts.adminAtlama) {
    const r = await p.query(`SELECT sifre_hash FROM panel_kullanicilar WHERE kullanici_ad = $1`, [k]);
    if (!r.rows[0]) throw new Error('Kullanıcı bulunamadı.');
    if (!(await sifreDogru(opts.mevcutSifre ?? '', r.rows[0].sifre_hash)))
      throw new Error('Mevcut şifre hatalı.');
  }

  const hash = await sifreHash(opts.yeniSifre);
  await p.query(
    `UPDATE panel_kullanicilar SET sifre_hash=$2, sifre_degistir=FALSE, guncelleme=now()
     WHERE kullanici_ad=$1`,
    [k, hash],
  );
}

/** Kullanıcı sil. Son admin silinemez (kilitlenmeyi önle). */
export async function kullaniciSil(p: Pool, ad: string): Promise<void> {
  const k = adNormal(ad);
  const hedef = await p.query(`SELECT rol FROM panel_kullanicilar WHERE kullanici_ad=$1`, [k]);
  if (!hedef.rows[0]) throw new Error('Kullanıcı bulunamadı.');
  if (hedef.rows[0].rol === 'admin') {
    const say = await p.query(`SELECT count(*) n FROM panel_kullanicilar WHERE rol='admin'`);
    if (Number(say.rows[0].n) <= 1)
      throw new Error('Son yönetici silinemez — önce başka bir yönetici ekle.');
  }
  await p.query(`DELETE FROM panel_kullanicilar WHERE kullanici_ad=$1`, [k]);
}

/** Rol değiştir. Son admin'in rolü düşürülemez. */
export async function rolDegistir(p: Pool, ad: string, rol: Rol): Promise<void> {
  const k = adNormal(ad);
  if (rol !== 'admin') {
    const mevcut = await p.query(`SELECT rol FROM panel_kullanicilar WHERE kullanici_ad=$1`, [k]);
    if (mevcut.rows[0]?.rol === 'admin') {
      const say = await p.query(`SELECT count(*) n FROM panel_kullanicilar WHERE rol='admin'`);
      if (Number(say.rows[0].n) <= 1)
        throw new Error('Son yöneticinin rolü düşürülemez — önce başka bir yönetici ekle.');
    }
  }
  await p.query(`UPDATE panel_kullanicilar SET rol=$2, guncelleme=now() WHERE kullanici_ad=$1`, [k, rol]);
}

/** Hiç kullanıcı var mı (ilk kurulum kontrolü). */
export async function kullaniciSayisi(p: Pool): Promise<number> {
  const r = await p.query(`SELECT count(*) n FROM panel_kullanicilar`);
  return Number(r.rows[0].n);
}
