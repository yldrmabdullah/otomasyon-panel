// Panel kullanıcı aracı — DB'ye kullanıcı ekler/listeler/şifre sıfırlar.
//
// Kullanıcılar artık VERİTABANINDA (panel_kullanicilar), env'de değil: yönetim
// ekranından çalışma anında ekleme/silme yapılabilsin. Env yaklaşımı her yeni
// kullanıcı için yeniden deploy gerektiriyordu.
//
// Kullanım:
//   npm run kullanici                          → listele
//   npm run kullanici -- ekle ahmet --admin    → ekle (şifre otomatik üretilir)
//   npm run kullanici -- ekle ayse --sifre Abc12345
//   npm run kullanici -- sifirla ahmet         → şifresini sıfırla (yeni üret)
//   npm run kullanici -- sil ayse
//
// Üretilen şifre BİR KEZ gösterilir; hash'lenmiş hali saklanır.

import { pool, kapat } from '../core/db.js';
import {
  kullaniciListesi, kullaniciEkle, kullaniciSil, sifreDegistir, sifreUret, kullaniciSayisi,
} from '../core/kullanicilar.js';

const a = process.argv.slice(2);
const komut = a[0] ?? 'listele';
const bayrak = (ad: string) => a.includes(`--${ad}`);
const deger = (ad: string) => {
  const i = a.indexOf(`--${ad}`);
  return i >= 0 ? a[i + 1] : undefined;
};

async function main() {
  const p = pool();

  if (komut === 'listele') {
    const liste = await kullaniciListesi(p);
    if (liste.length === 0) {
      console.log('Hiç kullanıcı yok. İlk yöneticiyi ekle:');
      console.log('  npm run kullanici -- ekle ahmet --admin');
      return;
    }
    console.log(`\n${liste.length} kullanıcı:\n`);
    console.log('  KULLANICI       ROL        SON GİRİŞ            ŞİFRE DEĞİŞTİR');
    for (const k of liste) {
      const sg = k.son_giris ? new Date(k.son_giris).toLocaleString('tr-TR') : '—';
      console.log(
        `  ${k.kullanici_ad.padEnd(15)} ${k.rol.padEnd(10)} ${sg.padEnd(20)} ${k.sifre_degistir ? 'GEREKLİ' : '—'}`,
      );
    }
    return;
  }

  if (komut === 'ekle') {
    const ad = a[1];
    if (!ad) throw new Error('Kullanıcı adı gerekli: npm run kullanici -- ekle ahmet --admin');
    const verilen = deger('sifre');
    const sifre = verilen ?? sifreUret();
    // İlk kullanıcı otomatik admin olur (yoksa kimse yönetim yapamaz).
    const ilk = (await kullaniciSayisi(p)) === 0;
    const rol = bayrak('admin') || ilk ? 'admin' : 'izleyici';
    const k = await kullaniciEkle(p, {
      ad,
      sifre,
      rol,
      adSoyad: deger('adsoyad'),
      olusturan: 'kurulum-araci',
      sifreDegistir: !verilen, // üretilmiş şifre ise ilk girişte değiştir
    });
    console.log(`\n✔ Kullanıcı oluşturuldu${ilk ? ' (ilk kullanıcı → otomatik YÖNETİCİ)' : ''}\n`);
    console.log(`  Kullanıcı adı : ${k.kullanici_ad}`);
    console.log(`  Şifre         : ${sifre}`);
    console.log(`  Rol           : ${k.rol}`);
    if (k.sifre_degistir) console.log(`\n  ⚠ İlk girişte şifre değiştirmesi istenecek.`);
    console.log(`\n  Bu şifre bir daha gösterilmez — kullanıcıya ilet.`);
    return;
  }

  if (komut === 'sifirla') {
    const ad = a[1];
    if (!ad) throw new Error('Kullanıcı adı gerekli: npm run kullanici -- sifirla ahmet');
    const sifre = deger('sifre') ?? sifreUret();
    await sifreDegistir(p, { ad, yeniSifre: sifre, adminAtlama: true });
    console.log(`\n✔ ${ad} şifresi sıfırlandı\n  Yeni şifre: ${sifre}\n`);
    return;
  }

  if (komut === 'sil') {
    const ad = a[1];
    if (!ad) throw new Error('Kullanıcı adı gerekli: npm run kullanici -- sil ayse');
    await kullaniciSil(p, ad);
    console.log(`✔ ${ad} silindi.`);
    return;
  }

  console.log('Bilinmeyen komut. Kullanım:');
  console.log('  npm run kullanici                          → listele');
  console.log('  npm run kullanici -- ekle ahmet --admin    → ekle');
  console.log('  npm run kullanici -- sifirla ahmet         → şifre sıfırla');
  console.log('  npm run kullanici -- sil ayse              → sil');
}

main()
  .then(() => kapat())
  .catch(async (e) => {
    console.error('✗', e instanceof Error ? e.message : e);
    await kapat().catch(() => {});
    process.exit(1);
  });
