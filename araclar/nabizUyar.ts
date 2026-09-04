// Canlı Nabız uyarı maili — .github/workflows/canli-nabiz.yml çağırır.
//
// NEDEN AYRI DOSYA: proje TS'i tsx ile DOĞRUDAN koşturuyor (derlenmiş .js yok),
// bu yüzden workflow içinden `node -e "import ... mail.js"` çalışmaz. Diğer
// araçlarla aynı desen: araclar/*.ts + `tsx` ile çağrı.
//
// Sorun metnini SORUN env'inden alır, EKIP_MAIL'e yollar. Bayiye ASLA gitmez.

import { mailGonder } from '../core/bildirim/mail.js';
import { config } from '../core/config.js';

const sorun = (process.env.SORUN ?? '').trim();

if (!sorun) {
  console.log('Sorun yok — mail atılmadı.');
  process.exit(0);
}

// config.mail.ekip zaten EKIP_MAIL'i parse ediyor (virgülle ayrık, trim'li).
const ekip = config.mail.ekip;

if (!ekip.length) {
  console.error('EKIP_MAIL tanımlı değil — uyarı maili ATILAMADI.');
  process.exit(1);
}

// ⚠️ SMTP eksikse sessizce "gönderdim" sayma (config.gecerli host+user+pass bakar).
if (!config.mail.gecerli) {
  console.error('SMTP ayarları eksik (SMTP_HOST/USER/PASS) — uyarı maili ATILAMADI.');
  process.exit(1);
}

const html = `
  <h2 style="margin:0 0 12px">⚠️ Parkoil canlı sistem uyarısı</h2>
  <p><b>reportapi.parkoil.com.tr</b> üzerinde sorun tespit edildi:</p>
  <pre style="background:#f6f6f6;padding:12px;border-radius:6px;white-space:pre-wrap">${sorun}</pre>
  <p><b>Etki:</b> bu uç bozuksa bayi portalı girişi ve dış sipariş API'si de çalışmaz
     (2026-09-04'te tam bu yaşandı — arızayı müşteri fark etmişti).</p>
  <p><b>İlk bakılacaklar:</b></p>
  <ul>
    <li>IIS app pool ayakta mı (reportapi.parkoil.com.tr)</li>
    <li>Cloudflare SSL modu — <b>Flexible</b> ise origin'deki HTTPS yönlendirmesiyle
        sonsuz 307 döngüsü yapar</li>
    <li>Son deploy başarılı mı (Actions → Deploy Parkoil.Bff.Api)</li>
  </ul>
  <p style="color:#888;font-size:12px">Canlı Nabız işi · ${new Date().toISOString()}</p>
`;

await mailGonder(ekip, '⚠️ Parkoil CANLI: reportapi sorunlu', html);
console.log('Uyarı maili gönderildi →', ekip.join(', '));
