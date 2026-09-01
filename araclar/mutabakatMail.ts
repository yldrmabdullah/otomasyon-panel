// A3 (ASIS POL) ↔ Logo mutabakatı — uyuşmayan (durum≠'tam') fatura bildirimi.
//
// piyasaMail.ts'ten AYRI: o piyasa istihbaratı (sözleşme/transfer), bu ise fatura
// kıyaslaması. Veri haftalık/aylık çekilir (a3-mutabakat.yml: Pazartesi + ayın 2'si)
// ama bu script GÜNLÜK koşar — DEBOUNCE ile aynı çekim için tekrar mail atmaz,
// yalnız mutabakat_a3_donem.cekim_zamani bir öncekinden İLERİ gitmişse (yeni veri
// geldiyse) gönderir. Aksi halde aynı 1 sorunlu fatura günlerce tekrar bildirilirdi.
//
// ⚠️ BOŞSA MAİL GÖNDERİLMEZ (piyasaMail.ts ile aynı prensip): sorunlu sayısı 0 ise
// atlanır. İstisna: --zorla ile debounce'u da atlayıp zorla gönderir (kanal testi).
//
// Çalıştır:
//   npm run mutabakat:mail
//   ... --kuru   (göndermeden ekrana bas)
//   ... --zorla  (debounce'u atla, sorunlu 0 olsa da gönder)

import { config } from '../core/config.js';
import { pool, kapat } from '../core/db.js';
import { bildir } from '../core/bildirim/index.js';
import { a3LogoVerisi } from '../core/panelSorgu.js';

const ARG = process.argv.slice(2);
const kuru = ARG.includes('--kuru');
const zorla = ARG.includes('--zorla');

function kac(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const S = {
  tablo: 'border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 16px',
  th: 'text-align:left;padding:6px 8px;border-bottom:2px solid #333;font-size:13px',
  td: 'padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top',
  acil: 'padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top;color:#b00;font-weight:bold',
  kucuk: 'color:#666;font-size:12px',
};

const ALTBILGI =
  `<hr style="margin-top:20px;border:none;border-top:1px solid #ddd">` +
  `<small style="${S.kucuk}">Parkoil Otomasyon Paneli — otomatik bildirim. ` +
  `Kaynak: POL A3 ↔ Logo fatura kıyası.</small>`;

const DURUM_AD: Record<string, string> = {
  litre_fark: 'Litre farkı',
  urun_fark: 'Ürün farkı',
  tesis_fark: 'Tesis farkı',
  iptal: 'Logo\'da iptal, A3\'te geçerli',
  logoda_yok: 'Logo\'da yok',
};

async function main(): Promise<void> {
  const veri = await a3LogoVerisi(pool());
  if (!veri.secili || !veri.ozet) {
    console.log('Mutabakat verisi yok (henüz çekim yapılmamış).');
    await kapat();
    return;
  }

  const { secili, ozet } = veri;
  const sorunlular = veri.satirlar.filter((s) => s.durum !== 'tam');
  console.log(`A3↔Logo mutabakatı (${ozet.ad}, çekim ${ozet.cekimZamani}): ${sorunlular.length} sorunlu / ${ozet.faturaSayisi} fatura`);

  if (!zorla) {
    const p = pool();
    const onceki = await p.query(
      `SELECT son_cekim_zamani FROM mutabakat_bildirim WHERE donem = $1`,
      [secili],
    );
    const oncekiZaman = onceki.rows[0]?.son_cekim_zamani ? new Date(onceki.rows[0].son_cekim_zamani).getTime() : 0;
    const buZaman = ozet.cekimZamani ? new Date(ozet.cekimZamani).getTime() : 0;
    if (buZaman <= oncekiZaman) {
      console.log('  → bu dönem için zaten bildirilen çekim, YENİ veri yok — mail gönderilmedi (debounce).');
      await kapat();
      return;
    }
  }

  if (!sorunlular.length && !zorla) {
    console.log('  → sorunlu fatura yok, mail gönderilmedi');
    await kapat();
    return;
  }

  const satir = (x: (typeof sorunlular)[number]) => `
    <tr>
      <td style="${S.acil}">${kac(DURUM_AD[x.durum] ?? x.durum)}</td>
      <td style="${S.td}"><b>${kac(x.istasyon)}</b><br>
        <span style="${S.kucuk}">${kac(x.faturaNo)}${x.epdkKod ? ` · ${kac(x.epdkKod)}` : ''}</span></td>
      <td style="${S.td}">${kac(x.a3Urun) || '—'} / ${kac(x.logoUrun) || '—'}</td>
      <td style="${S.td}">${x.a3Litre ?? '—'} lt</td>
      <td style="${S.td}">${x.logoLitre ?? '—'} lt</td>
      <td style="${S.td}">${x.litreFark == null ? '—' : `${x.litreFark > 0 ? '+' : ''}${x.litreFark} lt`}</td>
    </tr>`;

  const govde = `
    <p><b>A3 ↔ Logo mutabakatı — uyuşmayan faturalar</b> — ${kac(ozet.ad)}</p>
    <p style="${S.kucuk}">Fatura no eşleştirmesiyle ürün ve fatura satış litresi karşılaştırılır.
    Toplam <b>${ozet.faturaSayisi}</b> fatura, <b>${sorunlular.length}</b> uyuşmayan
    (uyum oranı ${ozet.faturaSayisi > 0 ? (100 * ozet.tamSayisi / ozet.faturaSayisi).toFixed(1) : '—'}%).</p>
    <table style="${S.tablo}">
      <tr><th style="${S.th}">Durum</th><th style="${S.th}">Bayi / Fatura</th>
          <th style="${S.th}">Ürün (A3/Logo)</th><th style="${S.th}">A3 Litre</th>
          <th style="${S.th}">Logo Litre</th><th style="${S.th}">Fark</th></tr>
      ${sorunlular.map(satir).join('')}
    </table>
    <p style="${S.kucuk}">Bu mail yalnız YENİ bir çekimde (bu dönem için veri değiştiğinde) gönderilir;
    aynı çekim için tekrar gönderilmez.</p>`;

  const konu = `[Parkoil] A3↔Logo mutabakatı — ${sorunlular.length} uyuşmayan fatura (${ozet.ad})`;
  const smsMetin = `Parkoil: ${ozet.ad} mutabakatinda ${sorunlular.length} uyusmayan fatura var.`;

  if (kuru) {
    console.log(`\n──── KURU ÇALIŞMA — gönderilmedi ────`);
    console.log(`KONU: ${konu}`);
    console.log((govde + ALTBILGI).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200));
    await kapat();
    return;
  }

  const s = await bildir(konu, govde + ALTBILGI, smsMetin, { epostalar: [], telefonlar: [] });
  if (s.hatalar.length) console.error('  hatalar:', s.hatalar.join(' | '));
  console.log(
    s.mailDenendi > 0
      ? `  ✔ mail gönderildi → ${config.mail.ekip.join(', ')}`
      : '  ⚠ mail GİTMEDİ (SMTP yapılandırılmamış ya da EKIP_MAIL boş)',
  );

  // Debounce durumunu yalnız gerçekten gönderildiyse (ya da dry-run DEĞİLSE ve
  // deneme yapıldıysa) ilerlet — DRY_RUN'da işaretlemek ilk gerçek maili kaçırırdı
  // (bkz. job/index.ts aynı tuzak, 2026-08-04).
  if (!config.dryRun && ozet.cekimZamani) {
    await pool().query(
      `INSERT INTO mutabakat_bildirim (donem, son_cekim_zamani, bildirildi)
       VALUES ($1, $2, now())
       ON CONFLICT (donem) DO UPDATE SET son_cekim_zamani = $2, bildirildi = now()`,
      [secili, ozet.cekimZamani],
    );
  }

  await kapat();
}

main().catch(async (e) => {
  console.error('Mutabakat mail hatası:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
