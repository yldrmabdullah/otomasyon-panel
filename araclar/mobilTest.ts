// Responsive taşma testi — GERÇEK tarayıcıda ölçer.
//
// NEDEN VAR: responsive'i CSS okuyarak "doğrulamak" iki kez yetersiz kaldı.
// 2026-07-30'da kullanıcı 430px ekran görüntüsü gönderdi ve panel bozuktu; CSS
// kuralları doğru görünüyordu. Gerçek sebep ancak tarayıcıda ölçülünce çıktı:
// mobil menü şeridi (`.kenar`) İÇERİĞİ kadar genişliyordu (430px viewport'ta
// 770px) çünkü flex öğesinin varsayılanı `min-width: auto` — yani içeriğinden
// küçülmez. Sayfa bu yüzden yatay kayıyordu; kartlar/tazelik şeridi kesik
// görünüyordu ama sebep içerik DEĞİL menüydü.
//
// Ders: görsel/yerleşim iddiaları statik analizle kanıtlanamaz. Bu araç
// `scrollWidth > clientWidth` ölçerek taşmayı kesin söyler ve taşan ÖĞEYİ adlandırır.
//
// Ön koşul: panel ayakta olmalı (npm run panel:api + panel/ içinde vite).
// Çalıştır:
//   PANEL_SIFRE=<sifre> node --import tsx araclar/mobilTest.ts [url]
//
// Not: kendi içinde kaydırılabilir öğeler (tablolar — `.tablo-sar`) taşma sayılmaz;
// onlar bilinçli yatay kaydırma alanları.

/// <reference lib="dom" />
// ⚠️ `page.evaluate` içindeki kod TARAYICIDA çalışır (document/getComputedStyle).
// Node tsconfig'inde DOM lib yok → yukarıdaki referans olmadan typecheck kırılıyor.
import { chromium } from 'playwright';

const CIHAZLAR: [number, number, string][] = [
  [320, 568, 'iPhone SE (en dar)'],
  [360, 800, 'Android'],
  [390, 844, 'iPhone 14'],
  [430, 932, 'iPhone 14 Pro Max'],
  [768, 1024, 'iPad dikey'],
  [1024, 768, 'iPad yatay'],
];
const MODULLER = ['İzleme', 'Operasyon', 'Piyasa', 'Mevzuat'];

async function main() {
  const url = process.argv[2] ?? 'http://localhost:5173';
  const sifre = process.env.PANEL_SIFRE;
  if (!sifre) {
    console.error('PANEL_SIFRE ortam değişkeni gerekli (şifre komut satırına yazılmaz).');
    process.exit(1);
  }

  const tarayici = await chromium.launch();
  let hataSayisi = 0;

  for (const [en, boy, ad] of CIHAZLAR) {
    const ctx = await tarayici.newContext({ viewport: { width: en, height: boy } });
    const sayfa = await ctx.newPage();
    const sayfaHatalari: string[] = [];
    sayfa.on('pageerror', (e) => sayfaHatalari.push(e.message.slice(0, 100)));

    await sayfa.goto(url, { waitUntil: 'networkidle' });
    await sayfa.waitForSelector('input', { timeout: 15_000 });
    const alanlar = await sayfa.locator('input').all();
    await alanlar[0].fill('ahmet');
    await alanlar[1].fill(sifre);
    await sayfa.click('.giris-btn, button[type="submit"]');
    await sayfa.waitForSelector('.kenar', { timeout: 15_000 });
    await sayfa.waitForTimeout(1200);

    console.log(`\n${ad} — ${en}×${boy}`);

    for (const modul of MODULLER) {
      await sayfa.click(`.kenar-oge:has-text("${modul}")`).catch(() => {});
      await sayfa.waitForTimeout(900);

      const sonuc = await sayfa.evaluate(() => {
        const de = document.documentElement;
        const tasan: { etiket: string; sinif: string; en: number }[] = [];
        // Array.from: NodeListOf iterasyonu Node tsconfig'inde (downlevelIteration
        // kapalı) tip hatası veriyor; davranış aynı.
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const k = el.getBoundingClientRect();
          if (k.width === 0) continue;
          if (k.right <= de.clientWidth + 1) continue;
          // Kendi içinde kaydırılabilir bir atası varsa BİLİNÇLİ kaydırma alanı
          let ata: Element | null = el.parentElement;
          let kaydirilabilir = false;
          while (ata) {
            const s = getComputedStyle(ata);
            if (s.overflowX === 'auto' || s.overflowX === 'scroll') { kaydirilabilir = true; break; }
            ata = ata.parentElement;
          }
          if (kaydirilabilir) continue;
          tasan.push({
            etiket: el.tagName.toLowerCase(),
            sinif: String((el as HTMLElement).className ?? '').slice(0, 36),
            en: Math.round(k.width),
          });
        }
        const cikis = document.querySelector('.cikis-btn');

        // ⚠️ OKUNABİLİRLİK — ilk sürümde YOKTU ve kullanıcı haklı olarak
        // "tabloları incelemek zor, font büyük, sidebar" dedi. Taşma testi
        // geçiyordu ama tablo 1305px/356px kutuda yatay kayıyor, menüde 5
        // öğeden 1'i görünüyordu. Bunlar artık ölçülüyor.
        const tb = document.querySelector('table');
        const sar = tb?.closest('.tablo-sar') as HTMLElement | null;
        const td = tb?.querySelector('tbody td');
        const nav = document.querySelector('.kenar-nav');
        const ogeler = Array.from(document.querySelectorAll('.kenar-oge'));
        const navK = nav?.getBoundingClientRect();
        const gorunurOge = navK
          ? ogeler.filter((e) => {
              const k = e.getBoundingClientRect();
              return k.left >= navK.left - 1 && k.right <= navK.right + 1;
            }).length
          : 0;
        const kucukYazi = Array.from(document.querySelectorAll('td, th, .kart-baslik, .alt-satir'))
          .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).length;

        return {
          viewport: de.clientWidth,
          scrollW: de.scrollWidth,
          yatay: de.scrollWidth > de.clientWidth + 1,
          tasan: tasan.slice(0, 5),
          // Çıkış butonu mobilde erişilebilir kalmalı (menü şeridi kırpılırken kaybolabiliyor)
          cikisErisilebilir: !!cikis && cikis.getBoundingClientRect().right <= de.clientWidth + 1,
          // Tablo kendi kutusunda yatay kayıyor mu (kaydırılabilir ama ZORUNLU olmamalı)
          tabloKayiyor: sar ? sar.scrollWidth > sar.clientWidth + 2 : false,
          tabloEn: tb ? Math.round(tb.getBoundingClientRect().width) : 0,
          kutuEn: sar ? sar.clientWidth : 0,
          satirYuk: td ? Math.round(td.getBoundingClientRect().height) : 0,
          // Menüde aynı anda kaç modül görünüyor
          menuGorunur: gorunurOge,
          menuToplam: ogeler.length,
          // 12px altı yazı sayısı (telefonda okunmuyor)
          kucukYazi,
        };
      });

      const uyari: string[] = [];
      if (sonuc.yatay) uyari.push('SAYFA YATAY KAYIYOR');
      if (!sonuc.cikisErisilebilir) uyari.push('ÇIKIŞ ERİŞİLEMEZ');
      // Tablo kutusundan geniş olması KENDİ İÇİNDE kaydırma demek — dar ekranda
      // kabul edilebilir sınır: kutunun 1,5 katı. Ötesi "incelemek zor".
      if (sonuc.tabloKayiyor && sonuc.tabloEn > sonuc.kutuEn * 1.5)
        uyari.push(`TABLO ${sonuc.tabloEn}px/${sonuc.kutuEn}px`);
      if (sonuc.satirYuk > 110) uyari.push(`SATIR ${sonuc.satirYuk}px`);
      if (sonuc.menuToplam > 0 && sonuc.menuGorunur < sonuc.menuToplam - 1)
        uyari.push(`MENÜ ${sonuc.menuGorunur}/${sonuc.menuToplam}`);
      if (sonuc.kucukYazi > 0) uyari.push(`${sonuc.kucukYazi} öğe <12px`);

      const durum = uyari.length ? `⚠ ${uyari.join(' · ')}` : '✓';
      console.log(`  ${modul.padEnd(10)} ${durum}`);
      for (const t of sonuc.tasan) {
        console.log(`      taşan: <${t.etiket} class="${t.sinif}"> genişlik ${t.en}`);
      }
      if (uyari.length) hataSayisi++;
    }

    if (sayfaHatalari.length) {
      console.log(`  ⚠ sayfa hatası: ${sayfaHatalari[0]}`);
      hataSayisi++;
    }
    await ctx.close();
  }

  await tarayici.close();
  console.log(
    hataSayisi === 0
      ? `\n✔ ${CIHAZLAR.length} cihaz × ${MODULLER.length} modül — taşma YOK.`
      : `\n✗ ${hataSayisi} sorun bulundu.`,
  );
  process.exit(hataSayisi === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Test hatası:', e instanceof Error ? e.message : e);
  process.exit(2);
});
