/**
 * BAYAT VERİ ALARMI — panelde gösterilen hangi kaynak güncelliğini yitirdi?
 *
 * ⭐ NEDEN VAR (2026-09-18): panel `tazelikVerisi()` ile her kaynağın yaşını ZATEN
 * hesaplıyordu ve `bayat` bayrağını üretiyordu — ama bunu kimseye SÖYLEMİYORDU.
 * Bayrak yalnız panele bakan biri fark ederse işe yarıyordu. Sonuç: A3 mutabakatının
 * 2026 Ocak verisi 12 Ağustos'tan beri donmuştu, kullanıcı Logo'da ÇÖZDÜĞÜ sorunu
 * panelde haftalarca "sorunlu" gördü ve veriye güvenini yitirdi. Kimse uyarılmadı
 * çünkü uyaracak mekanizma yoktu.
 *
 * Aynı ders daha önce de alınmıştı: canlı nabız işi (canli-nabiz.yml) "uygulama hata
 * verdi mi" ile "sistem dışarıdan çalışıyor mu" ayrımı için yazılmıştı. Bu araç onun
 * VERİ tarafındaki karşılığı: "iş yeşil bitti mi" değil, "veri gerçekten tazelendi mi".
 * Cron yeşil bitip yanlış dönemi çekebilir (a3Kiyas'ta tam bu oluyordu) — o durumda
 * tek imza, hedef kaynağın yaşının ilerlememesidir.
 *
 * Salt-okuma: hiçbir tabloya yazmaz. YALNIZ ekibe gider (EKIP_MAIL), bayiye ASLA —
 * yanlış alarm bayiyi yorar (CLAUDE.md kuralı).
 *
 * Kullanım:
 *   npm run tazelik:uyar            # bayat kaynak varsa mail at, çıkış 1
 *   DRY_RUN=1 npm run tazelik:uyar  # yalnız raporla, mail atma
 */
import { pool, kapat } from '../core/db.js';
import { tazelikVerisi } from '../core/panelSorgu.js';
import { mailGonder } from '../core/bildirim/mail.js';
import { config } from '../core/config.js';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function sureMetni(dk: number | null): string {
  if (dk === null) return 'hiç çekilmemiş';
  if (dk < 60) return `${dk} dk`;
  if (dk < 1440) return `${(dk / 60).toFixed(1)} saat`;
  return `${Math.round(dk / 1440)} gün`;
}

async function main() {
  const satirlar = await tazelikVerisi(pool());
  const bayat = satirlar.filter((s) => s.bayat);

  console.log(`Tazelik kontrolü: ${satirlar.length} kaynak, ${bayat.length} bayat.`);
  for (const s of satirlar) {
    console.log(`  ${s.bayat ? '⚠️ ' : '   '}${s.ad.padEnd(22)} ${sureMetni(s.yasDk).padStart(14)}  (eşik ${sureMetni(s.esikDk)})`);
  }

  if (!bayat.length) {
    console.log('✅ Tüm kaynaklar taze.');
    await kapat();
    return;
  }

  // DRY_RUN varsayılanı 1 (core/config.ts) — güvenli taraf. Mail için bilinçli 0 gerekir.
  if (config.dryRun) {
    console.log('ℹ️ DRY_RUN=1 → mail ATILMADI.');
    await kapat();
    process.exit(1);
  }
  if (!config.mail.gecerli || !config.mail.ekip.length) {
    console.error('⚠️ SMTP/EKIP_MAIL eksik → mail atılamadı.');
    await kapat();
    process.exit(1);
  }

  const html =
    `<p><b>Panelde gösterilen ${bayat.length} veri kaynağı güncelliğini yitirdi.</b></p>` +
    '<p>Bu kaynakların cron işleri koşmamış ya da yeşil bitip veriyi tazelememiş olabilir. ' +
    'Panel bu veriyi <i>taze sanarak</i> gösterir — karar almadan önce kontrol edin.</p>' +
    '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">' +
    '<tr><th align="left">Kaynak</th><th align="left">Son çekim</th><th align="left">Yaş</th><th align="left">Eşik</th></tr>' +
    bayat
      .map(
        (s) =>
          `<tr><td>${esc(s.ad)}</td>` +
          `<td>${s.son ? esc(new Date(s.son).toLocaleString('tr-TR')) : '—'}</td>` +
          `<td><b>${esc(sureMetni(s.yasDk))}</b></td>` +
          `<td>${esc(sureMetni(s.esikDk))}</td></tr>`,
      )
      .join('') +
    '</table>' +
    '<p style="color:#666;font-size:12px">Parkoil otomasyon paneli · tazelikUyar · salt-okuma</p>';

  await mailGonder(config.mail.ekip, `⚠️ Bayat veri: ${bayat.length} kaynak güncel değil`, html);
  console.log(`📧 ${config.mail.ekip.length} alıcıya gönderildi.`);
  await kapat();
  process.exit(1); // iş KIRMIZI bitsin — Actions sayfasında görünür olsun
}

main().catch(async (e) => {
  console.error('HATA:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
