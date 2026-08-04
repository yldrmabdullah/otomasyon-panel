// Kolon seçici menüsünün DOKUNMA HEDEFLERİNİ gerçek tarayıcıda ölçer.
//
// ⚠️ NEDEN AYRI TEST (2026-08-04): kullanıcı "o kutuyu denk getirmek çok zor,
// mobilde imkansız" dedi. mobilTest.ts yalnız taşma + okunabilirlik ölçüyor,
// AÇILIR MENÜ içine hiç bakmıyordu — menü kapalıyken ölçüm yapıldığı için
// sorun görünmedi. Bu test menüyü AÇIP içindeki satırları ölçer.
//
// WCAG 2.5.5 (AAA) 44×44px ister; 2.5.8 (AA) 24×24px. Dokunmatik için 44 hedef.
//
// Çalıştır: node --import tsx araclar/kolonMenuTest.ts [url]

import { chromium, devices } from 'playwright';

const CIHAZLAR: [number, number, string, boolean][] = [
  [390, 844, 'iPhone 14', true],
  [360, 740, 'Android küçük', true],
  [768, 1024, 'iPad dikey', true],
  [1440, 900, 'Masaüstü', false],
];

const MIN_DOKUNMA = 44; // px
const MIN_MASAUSTU = 32; // fare hassas → daha düşük eşik kabul edilebilir

async function main() {
  const url = process.argv[2] ?? 'http://localhost:5173';
  const tarayici = await chromium.launch();
  const sorunlar: string[] = [];
  const raporlar: string[] = [];

  for (const [en, boy, ad, dokunmatik] of CIHAZLAR) {
    // ⚠️ SIRA ÖNEMLİ: devices spread'i kendi viewport'unu getirir, sonrasında
    // bizimkini yazmazsak iPhone 14 boyutu her cihaz için geçerli olur.
    const ctx = await tarayici.newContext({
      ...(dokunmatik ? devices['iPhone 14'] : {}),
      viewport: { width: en, height: boy },
      isMobile: dokunmatik,
      hasTouch: dokunmatik,
    });
    const sayfa = await ctx.newPage();

    try {
      await sayfa.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });

      // Giriş ekranı varsa testi atla (kimlik bu araca verilmiyor)
      if (await sayfa.locator('input[type="password"]').count()) {
        raporlar.push(`${ad.padEnd(14)} — giriş ekranı, atlandı (panel:api ile çalıştır)`);
        await ctx.close();
        continue;
      }

      const btn = sayfa.locator('.kolon-btn').first();
      if (!(await btn.count())) {
        raporlar.push(`${ad.padEnd(14)} — kolon butonu bulunamadı`);
        await ctx.close();
        continue;
      }

      // Butonun kendisi de bir dokunma hedefi
      const btnKutu = await btn.boundingBox();
      const esik = dokunmatik ? MIN_DOKUNMA : MIN_MASAUSTU;
      if (btnKutu && btnKutu.height < esik) {
        sorunlar.push(`${ad}: "Kolonlar" butonu ${btnKutu.height.toFixed(0)}px < ${esik}px`);
      }

      await btn.click();
      await sayfa.waitForSelector('.kolon-menu', { timeout: 3000 });

      const ogeler = sayfa.locator('.kolon-oge');
      const n = await ogeler.count();
      let enKucuk = Infinity;
      let kutuEnKucuk = Infinity;

      for (let i = 0; i < n; i++) {
        const oge = ogeler.nth(i);
        const k = await oge.boundingBox();
        if (k) enKucuk = Math.min(enKucuk, k.height);
        const cb = oge.locator('input[type="checkbox"]');
        if (await cb.count()) {
          const ck = await cb.first().boundingBox();
          if (ck) kutuEnKucuk = Math.min(kutuEnKucuk, ck.width);
        }
      }

      // Menü ekran içinde mi (taşma / kesilme)
      const menuKutu = await sayfa.locator('.kolon-menu').boundingBox();
      // ⚠️ TOLERANS 2px: alt sayfa tam viewport sınırına oturuyor (844.0 vs 844)
      // ve 1px tolerans kayan nokta yuvarlamasında sınırda kalıp yanlış "taşıyor"
      // diyordu — kodda sorun yokken test hata üretiyordu.
      const TOL = 2;
      const tasma =
        menuKutu &&
        (menuKutu.x < -TOL ||
          menuKutu.x + menuKutu.width > en + TOL ||
          menuKutu.y + menuKutu.height > boy + TOL);

      raporlar.push(
        `${ad.padEnd(14)} satır ${enKucuk === Infinity ? '?' : enKucuk.toFixed(0).padStart(3)}px · ` +
          `kutu ${kutuEnKucuk === Infinity ? '?' : kutuEnKucuk.toFixed(0)}px · ` +
          `${n} öge · menü ${tasma ? '⚠ TAŞIYOR' : 'ekran içinde'}`,
      );

      if (enKucuk < esik) {
        sorunlar.push(`${ad}: menü satırı ${enKucuk.toFixed(0)}px < ${esik}px (dokunma hedefi)`);
      }
      if (tasma) sorunlar.push(`${ad}: kolon menüsü ekran dışına taşıyor`);

      // Satırın HER YERİ tıklanabilir mi — kutunun dışına, metnin sağına tıkla
      const ilkSecilebilir = sayfa.locator('.kolon-oge:not(.sabit)').first();
      if (await ilkSecilebilir.count()) {
        const cb = ilkSecilebilir.locator('input');
        const onceki = await cb.isChecked();
        const k = await ilkSecilebilir.boundingBox();
        if (k) {
          // Sağ kenara yakın bir nokta (checkbox'tan uzak)
          await sayfa.mouse.click(k.x + k.width - 12, k.y + k.height / 2);
          await sayfa.waitForTimeout(120);
          const sonraki = await cb.isChecked();
          if (onceki === sonraki) {
            sorunlar.push(`${ad}: satırın sağ tarafına tıklamak kolonu değiştirmiyor`);
          }
        }
      }
    } catch (e) {
      sorunlar.push(`${ad}: test hatası — ${e instanceof Error ? e.message : e}`);
    }
    await ctx.close();
  }

  await tarayici.close();

  console.log('\n=== KOLON MENÜSÜ — DOKUNMA HEDEFİ ÖLÇÜMÜ');
  for (const r of raporlar) console.log('  ' + r);
  if (sorunlar.length) {
    console.log(`\n⚠ ${sorunlar.length} SORUN:`);
    for (const s of sorunlar) console.log('  • ' + s);
    process.exit(1);
  }
  console.log('\n✔ Tüm dokunma hedefleri yeterli, menü ekran içinde, satır tamamı tıklanabilir.');
}

main().catch((e) => {
  console.error('Test hatası:', e instanceof Error ? e.message : e);
  process.exit(1);
});
