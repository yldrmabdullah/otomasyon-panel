// Piyasa bildirimleri — sözleşme bitişi + günlük transferler.
//
// Alarm job'undan (job/index.ts) AYRI: o 15 dakikada bir koşan operasyonel
// alarm turu (bağlantı/tank). Bunlar günlük/haftalık piyasa istihbaratı —
// aciliyeti farklı, ritmi farklı, alıcısı ileride farklı olabilir.
//
// Dört mod:
//   --sozlesme-bizim       günlük sabah · bizim bayiler, 30 gün penceresi
//   --sozlesme-rakip       haftalık     · rakip bayiler, 7 gün penceresi (fırsat)
//   --transfer             günlük akşam · YALNIZ o günün transferleri
//   --fiyat-referans-ustu  günlük       · Fiyat Takibi'nde referans üstü (pahalı) bayiler
//                          (fiyat-takip.yml çekiminden SONRA koşmalı, aynı gündeki veriyi okur)
//
// ⚠️ BOŞSA MAİL GÖNDERİLMEZ (kullanıcı kararı + ölçüm): bizim sözleşme
// penceresi çoğu gün boş (30 günde 0 bayi). "Bugün bir şey yok" maili
// insanı maile bakmamaya alıştırır; sonra gerçek uyarı da göz ardı edilir.
// İstisna: --zorla ile boş olsa da gönderilir (kanal testi için).
//
// Çalıştır:
//   npm run piyasa:mail -- --sozlesme-bizim
//   npm run piyasa:mail -- --transfer
//   npm run piyasa:mail -- --sozlesme-rakip
//   npm run piyasa:mail -- --fiyat-referans-ustu
//   ... --kuru   (göndermeden ekrana bas)

import { config } from '../core/config.js';
import { pool, kapat } from '../core/db.js';
import { bildir } from '../core/bildirim/index.js';
import {
  sozlesmeBitecekBizim,
  sozlesmeBitecekRakip,
  gunlukTransferler,
  fiyatReferansUstu,
} from '../core/panelSorgu.js';

const ARG = process.argv.slice(2);
const kuru = ARG.includes('--kuru');
const zorla = ARG.includes('--zorla');

/** HTML kaçırma — bayi unvanları serbest metin (& ve < içerebilir). */
function kac(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TR_TARIH = (g: string): string => {
  const [y, a, gg] = g.slice(0, 10).split('-');
  return `${gg}.${a}.${y}`;
};

/** Ortak stil — e-posta istemcileri <style> bloğunu sık sık atıyor, inline şart. */
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
  `Kaynak: EPDK lisans verisi.</small>`;

async function gonder(konu: string, govde: string, sms: string): Promise<void> {
  if (kuru) {
    console.log(`\n──── KURU ÇALIŞMA — gönderilmedi ────`);
    console.log(`KONU: ${konu}`);
    console.log(govde.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200));
    return;
  }
  // Piyasa bildirimi bayiye GİTMEZ — hedef yalnız ekip (bildir() ekip
  // adreslerini kendisi ekler; buraya boş hedef veriyoruz).
  const s = await bildir(konu, govde + ALTBILGI, sms, { epostalar: [], telefonlar: [] });
  if (s.hatalar.length) console.error('  hatalar:', s.hatalar.join(' | '));
  console.log(
    s.mailDenendi > 0
      ? `  ✔ mail gönderildi → ${config.mail.ekip.join(', ')}`
      : '  ⚠ mail GİTMEDİ (SMTP yapılandırılmamış ya da EKIP_MAIL boş)',
  );
}

// ── 1) SÖZLEŞME — BİZİM BAYİLER (günlük) ─────────────────────────────────────
async function sozlesmeBizim(): Promise<void> {
  const satirlar = await sozlesmeBitecekBizim(pool(), 30);
  console.log(`Sözleşme (bizim, 30 gün): ${satirlar.length} bayi`);
  if (!satirlar.length && !zorla) {
    console.log('  → boş, mail gönderilmedi (--zorla ile gönderilir)');
    return;
  }

  const acil = satirlar.filter((x) => x.acil);
  const satir = (x: (typeof satirlar)[number]) => `
    <tr>
      <td style="${x.acil ? S.acil : S.td}">${x.kalan_gun} gün</td>
      <td style="${S.td}">${TR_TARIH(x.sozlesme_bitis)}</td>
      <td style="${S.td}"><b>${kac(x.lisans_sahibi)}</b><br>
        <span style="${S.kucuk}">${kac(x.bayi_lisans_no)}</span></td>
      <td style="${S.td}">${kac(x.il)}${x.ilce ? ` / ${kac(x.ilce)}` : ''}</td>
    </tr>`;

  const govde = `
    <p><b>Sözleşmesi bitmek üzere olan bayilerimiz</b> — önümüzdeki 30 gün</p>
    ${
      acil.length
        ? `<p style="color:#b00"><b>⚠ ${acil.length} bayinin sözleşmesine 7 gün veya daha az kaldı.</b></p>`
        : ''
    }
    <table style="${S.tablo}">
      <tr><th style="${S.th}">Kalan</th><th style="${S.th}">Bitiş</th>
          <th style="${S.th}">Bayi</th><th style="${S.th}">İl / İlçe</th></tr>
      ${satirlar.map(satir).join('')}
    </table>
    <p style="${S.kucuk}">Bu liste yalnız <b>bizim</b> bayilerimizi kapsar
    (${kac(config.mail.ekip.length ? 'TURGUT DAĞITIM ENERJİ A.Ş.' : '')}).
    Boş olduğu günlerde mail gönderilmez.</p>`;

  await gonder(
    `[Parkoil] Sözleşme bitiyor — ${satirlar.length} bayi${acil.length ? ` (${acil.length} ACİL)` : ''}`,
    govde,
    `Parkoil: ${satirlar.length} bayinin sozlesmesi 30 gun icinde bitiyor.`,
  );
}

// ── 2) SÖZLEŞME — RAKİP BAYİLER (haftalık, fırsat listesi) ───────────────────
async function sozlesmeRakip(): Promise<void> {
  const { satirlar, dagiticiOzet } = await sozlesmeBitecekRakip(pool(), 7);
  console.log(`Sözleşme (rakip, 7 gün): ${satirlar.length} bayi`);
  if (!satirlar.length && !zorla) {
    console.log('  → boş, mail gönderilmedi');
    return;
  }

  const govde = `
    <p><b>Rakip bayilerde sözleşme bitişi</b> — önümüzdeki 7 gün</p>
    <p style="${S.kucuk}">Sözleşmesi biten bayi dağıtıcı değiştirebilir.
    Bu liste bir <b>fırsat listesidir</b>, kesinlik taşımaz.</p>

    <p><b>Dağıtıcıya göre</b></p>
    <table style="${S.tablo}">
      <tr><th style="${S.th}">Dağıtıcı</th><th style="${S.th}">Bayi</th></tr>
      ${dagiticiOzet
        .map(
          (d) =>
            `<tr><td style="${S.td}">${kac(d.dagitim_sirketi)}</td>` +
            `<td style="${S.td}"><b>${d.n}</b></td></tr>`,
        )
        .join('')}
    </table>

    <p><b>Bayi listesi</b></p>
    <table style="${S.tablo}">
      <tr><th style="${S.th}">Kalan</th><th style="${S.th}">Bayi</th>
          <th style="${S.th}">Dağıtıcı</th><th style="${S.th}">İl / İlçe</th></tr>
      ${satirlar
        .map(
          (x) => `
        <tr>
          <td style="${S.td}">${x.kalan_gun} gün</td>
          <td style="${S.td}"><b>${kac(x.lisans_sahibi)}</b><br>
            <span style="${S.kucuk}">${kac(x.bayi_lisans_no)}</span></td>
          <td style="${S.td}">${kac(x.dagitim_sirketi)}</td>
          <td style="${S.td}">${kac(x.il)}${x.ilce ? ` / ${kac(x.ilce)}` : ''}</td>
        </tr>`,
        )
        .join('')}
    </table>`;

  await gonder(
    `[Parkoil] Rakip sözleşme bitişleri — ${satirlar.length} bayi (7 gün)`,
    govde,
    `Parkoil: 7 gun icinde ${satirlar.length} rakip bayinin sozlesmesi bitiyor.`,
  );
}

// ── 3) TRANSFERLER (günlük akşam, YALNIZ o gün) ──────────────────────────────
const TIP_AD: Record<string, string> = {
  yeni_bayi: 'Yeni bayi',
  dagitici_degisti: 'Dağıtıcı değişti',
  durum_degisti: 'Durum değişti',
};

async function transfer(): Promise<void> {
  // Tarih argümanı: --transfer 2026-08-03
  const tarih = ARG.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const t = await gunlukTransferler(pool(), tarih);
  console.log(`Transferler (${t.gun ?? 'bugün'}):`, JSON.stringify(t.ozet));
  if (!t.tumu.length && !zorla) {
    console.log('  → boş, mail gönderilmedi');
    return;
  }

  const satir = (x: (typeof t.tumu)[number], vurgu: boolean) => `
    <tr${vurgu ? ' style="background:#fff8e1"' : ''}>
      <td style="${S.td}">${kac(TIP_AD[x.tip] ?? x.tip)}</td>
      <td style="${S.td}"><b>${kac(x.lisans_sahibi)}</b><br>
        <span style="${S.kucuk}">${kac(x.bayi_lisans_no)} · ${kac(x.il)}</span></td>
      <td style="${S.td}">${x.eski_deger ? kac(x.eski_deger) : '<span style="' + S.kucuk + '">—</span>'}</td>
      <td style="${S.td}">${x.yeni_deger ? kac(x.yeni_deger) : '<span style="' + S.kucuk + '">—</span>'}</td>
    </tr>`;

  const baslikSatiri = `<tr><th style="${S.th}">Tip</th><th style="${S.th}">Bayi</th>
      <th style="${S.th}">Eski</th><th style="${S.th}">Yeni</th></tr>`;

  const govde = `
    <p><b>Piyasa hareketleri</b> — ${t.gun ? TR_TARIH(t.gun) : 'bugün'}</p>
    <p>Toplam <b>${t.ozet.toplam}</b> hareket${
      t.ozet.bizim
        ? ` · bizi ilgilendiren <b>${t.ozet.bizim}</b>` +
          (t.ozet.kazandik ? ` (${t.ozet.kazandik} kazandık` : '') +
          (t.ozet.kaybettik ? `${t.ozet.kazandik ? ', ' : ' ('}${t.ozet.kaybettik} kaybettik` : '') +
          (t.ozet.kazandik || t.ozet.kaybettik ? ')' : '')
        : ''
    }</p>

    ${
      t.bizim.length
        ? `<p style="border-left:4px solid #b8860b;padding-left:8px">
             <b>★ Bizi ilgilendirenler</b></p>
           <table style="${S.tablo}">${baslikSatiri}
             ${t.bizim.map((x) => satir(x, true)).join('')}
           </table>`
        : `<p style="${S.kucuk}">Bugün bizi doğrudan ilgilendiren hareket yok.</p>`
    }

    ${
      t.piyasa.length
        ? `<p><b>Piyasa geneli</b> (${t.piyasa.length})</p>
           <table style="${S.tablo}">${baslikSatiri}
             ${t.piyasa.map((x) => satir(x, false)).join('')}
           </table>`
        : ''
    }
    <p style="${S.kucuk}">Yalnız bu güne ait hareketler listelenir; önceki günler tekrar gönderilmez.</p>`;

  await gonder(
    `[Parkoil] Piyasa hareketleri — ${t.ozet.toplam} kayıt${t.ozet.bizim ? ` (${t.ozet.bizim} bizi ilgilendiriyor)` : ''}`,
    govde,
    `Parkoil: bugun ${t.ozet.toplam} piyasa hareketi, ${t.ozet.bizim} tanesi bizi ilgilendiriyor.`,
  );
}

// ── 4) FİYAT TAKİBİ — REFERANS ÜSTÜ (günlük, fiyat çekiminden sonra) ─────────
async function fiyatUstu(): Promise<void> {
  const { gun, satirlar } = await fiyatReferansUstu(pool());
  console.log(`Fiyat referans üstü (${gun ?? 'veri yok'}): ${satirlar.length} bayi`);
  if (!satirlar.length && !zorla) {
    console.log('  → boş, mail gönderilmedi');
    return;
  }

  const satir = (x: (typeof satirlar)[number]) => `
    <tr>
      <td style="${S.acil}">+${x.fark.toFixed(2)} ₺</td>
      <td style="${S.td}"><b>${kac(x.istasyon)}</b><br>
        <span style="${S.kucuk}">${kac(x.epdk)}</span></td>
      <td style="${S.td}">${kac(x.il)}${x.bolge ? ` / ${kac(x.bolge)}` : ''}</td>
      <td style="${S.td}">${kac(x.urunHam)}</td>
      <td style="${S.td}">${x.bayiFiyat.toFixed(2)} ₺</td>
      <td style="${S.td}">${x.refFiyat.toFixed(2)} ₺</td>
    </tr>`;

  const govde = `
    <p><b>Referansın üstünde satan bayiler</b> — ${gun ? TR_TARIH(gun) : ''}</p>
    <p style="${S.kucuk}">Bayi pompa fiyatı (POL A5) ↔ parkoil.com.tr il referans fiyatı (Petrol
    Ofisi). Referansın 0,20 ₺ üstünde satan bayi işaretlenir — <b>rekabet göstergesidir,
    EPDK yasal tavan ihlali DEĞİLDİR.</b></p>
    <table style="${S.tablo}">
      <tr><th style="${S.th}">Fark</th><th style="${S.th}">Bayi</th>
          <th style="${S.th}">İl / Bölge</th><th style="${S.th}">Ürün</th>
          <th style="${S.th}">Bayi Fiyatı</th><th style="${S.th}">Referans</th></tr>
      ${satirlar.map(satir).join('')}
    </table>`;

  await gonder(
    `[Parkoil] Fiyat takibi — ${satirlar.length} bayi referans üstü${gun ? ` (${TR_TARIH(gun)})` : ''}`,
    govde,
    `Parkoil: ${satirlar.length} bayi referans fiyatin ustunde satiyor.`,
  );
}

async function main(): Promise<void> {
  const modlar = [
    ['--sozlesme-bizim', sozlesmeBizim],
    ['--sozlesme-rakip', sozlesmeRakip],
    ['--transfer', transfer],
    ['--fiyat-referans-ustu', fiyatUstu],
  ] as const;

  const secili = modlar.filter(([bayrak]) => ARG.includes(bayrak));
  if (!secili.length) {
    console.error('Kullanım: piyasaMail.ts --sozlesme-bizim | --sozlesme-rakip | --transfer | --fiyat-referans-ustu');
    console.error('  ek: --kuru (göndermeden bas) · --zorla (boş olsa da gönder)');
    process.exit(1);
  }
  for (const [, fn] of secili) await fn();
  await kapat();
}

main().catch(async (e) => {
  console.error('Piyasa mail hatası:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
