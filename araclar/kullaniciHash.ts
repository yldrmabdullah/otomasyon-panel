// Panel kullanıcısı üretici. Şifreyi hash'e çevirir, Vercel env satırını hazırlar.
//
// Çalıştır:
//   npm run kullanici -- ahmet mehmet ayse          → her biri için rastgele şifre üretir
//   npm run kullanici -- ahmet:BenimSifrem123!      → verilen şifreyi kullanır
//
// Çıktı: PANEL_KULLANICILAR env değeri + düz şifreler (bir kez gösterilir).
// ⚠️ Düz şifreler HİÇBİR yere kaydedilmez — ekrandan alıp güvenli yere koy.

import { createHash, randomBytes } from 'node:crypto';

/** Okunabilir ama güçlü şifre: 4 hece + rakam + sembol (~52 bit entropi). */
function sifreUret(): string {
  const bas = 'bcdfgkmnprstvyz';
  const sesli = 'aeiou';
  const b = randomBytes(16);
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += bas[b[i * 2] % bas.length] + sesli[b[i * 2 + 1] % sesli.length];
  }
  const rakam = String(100 + (b[12] % 900));
  const sembol = '!@#$%&*'[b[13] % 7];
  return s.charAt(0).toUpperCase() + s.slice(1) + rakam + sembol;
}

const girdiler = process.argv.slice(2);
if (girdiler.length === 0) {
  console.log('Kullanım:');
  console.log('  npm run kullanici -- ahmet mehmet             (rastgele şifre üret)');
  console.log('  npm run kullanici -- ahmet:Sifre123!          (şifreyi sen ver)');
  process.exit(1);
}

const ciftler: string[] = [];
const gosterilecek: [string, string][] = [];

for (const g of girdiler) {
  const iki = g.indexOf(':');
  const ad = (iki === -1 ? g : g.slice(0, iki)).trim().toLowerCase();
  const sifre = iki === -1 ? sifreUret() : g.slice(iki + 1);
  if (!ad) continue;
  if (sifre.length < 8) {
    console.error(`✗ "${ad}" şifresi 8 karakterden kısa — atlandı.`);
    continue;
  }
  const hash = createHash('sha256').update(sifre, 'utf8').digest('hex');
  ciftler.push(`${ad}:${hash}`);
  gosterilecek.push([ad, sifre]);
}

console.log('\n=== KULLANICI BİLGİLERİ (bir kez gösterilir, güvenli yere kaydet) ===');
for (const [ad, sifre] of gosterilecek) console.log(`  ${ad.padEnd(14)} ${sifre}`);

console.log('\n=== Vercel env: PANEL_KULLANICILAR ===');
console.log(ciftler.join(','));

console.log('\n=== Vercel env: PANEL_OTURUM_SIRRI (yeni üretildi) ===');
console.log(randomBytes(32).toString('hex'));
console.log('\nNot: oturum sırrını DEĞİŞTİRİRSEN tüm açık oturumlar düşer.');
