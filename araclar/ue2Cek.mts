// "(Eski) UE2 Kontrol" — Aylık Satış Takip (POL) → mutabakat_irsaliye tablosu.
//
// ✅ CANLI DOĞRULANDI (2026-09-02, POL menü + sayfa taraması + gerçek indirme testi):
//   - Gerçek yol: EpdkModulu/Epdk2020/Raporlar/UE2Kontrol.aspx (Epdk2011 DEĞİL — ilk tahmin yanlıştı)
//   - Menü etiketi: "(Eski) UE2 Kontrol", kod 0822
//   - Tarih filtresi: dtpTarih_Date1/Date2 (dissatisCek.mts ile AYNI selector deseni)
//   - Rapor/indirme butonu: ReportButton1_ReportButton1_innerButton (A4'teki AsisButton1
//     DEĞİL — bu sayfada farklı bileşen adı)
//   - ⚠️ DOSYA FORMATI xlsx UZANTILI AMA SpreadsheetML XML (core/xlsx.js'in okuduğu gerçek
//     zip .xlsx DEĞİL) — polExcelImport.ts'in okuduğu eski formatla AYNI. Kullanıcının
//     paylaştığı örnek muhtemelen Excel'de "farklı kaydet" ile gerçek .xlsx'e çevrilmişti;
//     POL'ün kendi ürettiği ham dosya SpreadsheetML'dir. Bu araç kendi XML parser'ını kullanır.
//   - Kolon sırası CANLI dosyayla doğrulandı (2026-08 dönemi, 1. satır: AKAPET/Kütahya).
//   - Tarih hücreleri ISO string ("2026-08-31T00:00:00.000"), Excel serial DEĞİL.
//
// NEDEN: UE2 "Evrak Durum" (Kapali/Acik/Kullanilmamis) taşıyor ama PLAKA taşımıyor —
// A3/A4/Tesis Dolum export'larıyla (dissatisCek.mts, a3Kiyas.mts, polMutabakatImport.ts)
// AYNI irsaliye_no üzerinden mutabakat_irsaliye'de birleşir (upsert, aynı PRIMARY KEY).
// Dorse Durum Kontrol Sistemi (BFF) bu tabloyu dış API üzerinden okur.
//
// Çalıştır: node --env-file=.env --import tsx araclar/ue2Cek.mts <bas> <bit>  (YYYY-MM-DD, boş=geçen ay)

import { chromium, type Download } from 'playwright';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pool, kapat } from '../core/db.js';

const cevre = (ad: string, varsayilan: string): string => {
  const v = process.env[ad];
  return v && v.trim() ? v.trim() : varsayilan;
};
const BASE = cevre('POL_URL', 'https://pol.parkoil.tr/POL/').replace(/\/$/, '') + '/';
const POL_KADI = process.env.POL_KULLANICI ?? '';
const POL_SIFRE = process.env.POL_SIFRE ?? '';
// ✅ Canlı POL menüsünden doğrulandı (2026-09-02): "(Eski) UE2 Kontrol" -> bu yol, kod 0822.
const POL_SAYFA_YOLU = cevre('UE2_SAYFA_YOLU', 'EpdkModulu/Epdk2020/Raporlar/UE2Kontrol.aspx');
const IND_DIR = join(tmpdir(), 'ue2-indir');
mkdirSync(IND_DIR, { recursive: true });
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n; };

async function indir(bas: string, bit: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const p = await (await browser.newContext({ acceptDownloads: true })).newPage();
  try {
    log('POL giriş…');
    await p.goto(BASE + 'login.aspx', { waitUntil: 'domcontentloaded', timeout: 40000 });
    const g = await p.evaluate(async (k: { u: string; p: string }) => {
      const r = await fetch(`Sistem/AjaxResponder.aspx?Command=CheckLogin&uniqueKey=${Date.now()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: `un=${encodeURIComponent(k.u)}&pw=${encodeURIComponent(k.p)}&k=&uid=&cnn=MsSql2005_1`,
      });
      const x = await r.text();
      const err = (x.match(/error='(\d+)'/) || [])[1];
      const uID = (x.match(/uID='([^']+)'/) || [])[1];
      const listID = (x.match(/listID='([^']+)'/) || [])[1];
      if (err !== '0') return { ok: false, err };
      const f = document.getElementById('form1') as HTMLFormElement;
      for (const [n, v] of [['kadi', k.u], ['sifre', k.p], ['__ARG', `${listID};${uID}`], ['hdnBtnName', 'MsSql2005_1']] as [string, string][]) {
        let e = f.querySelector(`[name="${n}"]`) as HTMLInputElement | null;
        if (!e) { e = document.createElement('input'); e.type = 'hidden'; e.name = n; f.appendChild(e); }
        e.value = v;
      }
      f.submit(); return { ok: true };
    }, { u: POL_KADI, p: POL_SIFRE });
    if (!g.ok) throw new Error(`POL giriş reddedildi: error=${g.err}`);
    await p.waitForURL(u => /DefaultDagitici|Ana/i.test(u.toString()), { timeout: 30000 });
    log('  giriş OK');

    await p.goto(BASE + POL_SAYFA_YOLU, { waitUntil: 'networkidle', timeout: 40000 });
    await p.waitForTimeout(3000);
    const trTarih = (iso: string) => { const [y, m, d] = iso.split('-'); return `${Number(d)}/${m}/${y}`; };
    log(`Tarih aralığı: ${trTarih(bas)} – ${trTarih(bit)}`);
    // ✅ Canlı sayfa taramasıyla doğrulandı (2026-09-02): dtpTarih_Date1/Date2 A4 ile AYNI
    // deseni kullanıyor (ctl00_CPH_dtp_Tarih_dtp_Tarih_Date1/2).
    await p.evaluate((t: { b: string; e: string }) => {
      const d1 = document.querySelector('[id*="dtpTarih_Date1"]') as HTMLInputElement | null;
      const d2 = document.querySelector('[id*="dtpTarih_Date2"]') as HTMLInputElement | null;
      if (d1) { d1.value = t.b; d1.dispatchEvent(new Event('change', { bubbles: true })); }
      if (d2) { d2.value = t.e; d2.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { b: trTarih(bas), e: trTarih(bit) });
    await p.waitForTimeout(800);

    log('Excel indiriliyor…');
    // ✅ Buton A4'teki AsisButton1'DEN FARKLI — bu sayfada ReportButton1 (canlı doğrulandı).
    const dl = await Promise.race<Download>([
      p.waitForEvent('download', { timeout: 90000 }),
      (async () => {
        const xls = p.locator('i[class*="excel_2019"], i[class*="excel"]').first();
        if (await xls.count().catch(() => 0)) await xls.click({ timeout: 4000 }).catch(() => {});
        await p.locator('[id*="ReportButton1"] input, [id*="ReportButton1"]').first().click({ timeout: 4000 }).catch(() => {});
        return await p.waitForEvent('download', { timeout: 80000 });
      })(),
    ]);
    const yol = `${IND_DIR}/ue2-${bas}_${bit}.xlsx`;
    await dl.saveAs(yol);
    log('  indirildi:', dl.suggestedFilename());
    return yol;
  } finally { await browser.close(); }
}

interface Satir { [ix: number]: string }

/** SpreadsheetML (.xls XML, POL'ün ham export formatı) satırlarını ss:Index'e saygılı parse
 *  eder — polExcelImport.ts'teki satirlariAyikla() ile AYNI desen. */
function satirlariAyikla(xml: string): Satir[] {
  const rowRe = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
  const cellRe = /<Cell([^>]*)>([\s\S]*?)<\/Cell>/g;
  const dataRe = /<Data[^>]*>([\s\S]*?)<\/Data>/;
  const satirlar: Satir[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const row: Satir = {};
    let idx = 0;
    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rm[1]))) {
      const im = /ss:Index="(\d+)"/.exec(cm[1]);
      idx = im ? Number(im[1]) - 1 : idx + 1;
      const dm = dataRe.exec(cm[2]);
      row[idx] = dm ? dm[1].trim() : '';
    }
    satirlar.push(row);
  }
  return satirlar;
}

/** UE2 kolon sırası — CANLI indirilen dosyayla doğrulandı (2026-09-02, 2026-08 dönemi).
 *  ⚠️ ss:Index 1-TABANLI ve ilk sütun (A, index 1) HİÇ KULLANILMIYOR (boş/gizli) — gerçek
 *  veri index 1'den (İrsaliye Tarihi) başlıyor, satirlariAyikla() bunu ham ss:Index-1 olarak
 *  taşır. Bu yüzden İrsaliye Tarihi=1, EpdkKodu=2, ... (0-tabanlı KOLON haritasından FARKLI,
 *  polMutabakatImport.ts'teki gibi sıfırdan başlamaz). */
const KOLON = {
  irsaliyeTarihi: 1, epdkKodu: 2, istKod: 3, erpKod: 4, istasyonAd: 5, bolge: 6, mintika: 7,
  urun: 8, irsaliyeNo: 9, faturaMiktar: 10, istasyonDolum: 11, koyPompasi: 12, tanker: 13,
  disSatis: 14, iadeMiktari: 15, aciklama: 16, faturaNo: 17, satisTip: 18, kalan: 19,
  farkYuzde: 20, evrakDurum: 21, muteahhit: 22, sorumluKullanici: 23,
} as const;

/** BAY/939-82/47501 → 47501 */
function epdkNo(lisans: string | undefined): string | null {
  const m = /BAY\/[\d-]+\/(\d+)/.exec(lisans ?? '');
  return m ? m[1] : null;
}

/** Hücredeki ISO tarih ("2026-08-31T00:00:00.000") → 'YYYY-MM-DD'. Excel serial DEĞİL
 *  (canlı dosyada doğrulandı — core/xlsx.js'teki excelTarih() burada KULLANILMAZ). */
function isoTarih(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v.trim());
  return m ? m[1] : null;
}

function dosyaIsle(xml: string): { eklenen: number; atlanan: number; kayitlar: unknown[] } {
  const satirlar = satirlariAyikla(xml);
  const basIx = satirlar.findIndex((r) => (r[KOLON.irsaliyeTarihi] ?? '').trim() === 'İrsaliye Tarihi');
  if (basIx < 0) throw new Error('UE2 başlık satırı ("İrsaliye Tarihi") bulunamadı — POL export biçimi değişmiş olabilir');

  const b = satirlar[basIx];
  const bekle = (ix: number, metin: string) => {
    const gercek = (b[ix] ?? '').trim();
    if (!gercek.startsWith(metin))
      throw new Error(`Kolon sırası beklenenden farklı: [${ix}] '${gercek}' ≠ '${metin}...'. UE2 KOLON haritası güncellenmeli.`);
  };
  bekle(KOLON.irsaliyeNo, 'Dagitici Sevk İrsaliye');
  bekle(KOLON.faturaMiktar, 'Fatura Satış Miktar');
  bekle(KOLON.istasyonDolum, 'İstasyon Dolum');
  bekle(KOLON.evrakDurum, 'Evrak Durum');

  const kayitlar: unknown[] = [];
  let atlanan = 0;

  for (let i = basIx + 1; i < satirlar.length; i++) {
    const r = satirlar[i];
    const irsNo = (r?.[KOLON.irsaliyeNo] ?? '').trim();
    const tarih = isoTarih(r?.[KOLON.irsaliyeTarihi]);
    if (!irsNo || !tarih) { atlanan++; continue; }

    const urun = (r[KOLON.urun] ?? '').trim() || 'BİLİNMİYOR';
    kayitlar.push([
      irsNo, tarih, epdkNo(r[KOLON.epdkKodu]), r[KOLON.istasyonAd] ?? null, urun,
      r[KOLON.faturaNo] ?? null, num(r[KOLON.faturaMiktar]), num(r[KOLON.istasyonDolum]),
      num(r[KOLON.kalan]), num(r[KOLON.koyPompasi]), num(r[KOLON.tanker]),
      num(r[KOLON.disSatis]), num(r[KOLON.iadeMiktari]), num(r[KOLON.farkYuzde]),
      r[KOLON.evrakDurum] ?? null, r[KOLON.bolge] ?? null, r[KOLON.mintika] ?? null,
      'ue2Cek',
    ]);
  }
  return { eklenen: kayitlar.length, atlanan, kayitlar };
}

async function yaz(kayitlar: unknown[][]): Promise<void> {
  const p = pool();
  for (const k of kayitlar) {
    // UE2'de PLAKA yok — o kolonlar dokunulmadan kalır; aynı irsaliye_no'yu A4/Tesis Dolum
    // importu (polMutabakatImport.ts / dissatisCek.mts) sonradan doldurabilir (ayrı upsert,
    // COALESCE yok, kolon adı listede yok — bu import onları SET etmiyor, ezmesin diye).
    await p.query(
      `INSERT INTO mutabakat_irsaliye (
         irsaliye_no, irsaliye_tarihi, epdk_no, istasyon_ad, urun, fatura_no,
         fatura_miktar, istasyon_dolum, kalan_miktar, koy_pompasi, tanker, dis_satis,
         dagiticiya_iade, fark_yuzde, evrak_durum, bolge, mintika, kaynak_dosya, guncelleme)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
       ON CONFLICT (irsaliye_no, irsaliye_tarihi, urun) DO UPDATE SET
         epdk_no=EXCLUDED.epdk_no, istasyon_ad=EXCLUDED.istasyon_ad,
         fatura_no=EXCLUDED.fatura_no, fatura_miktar=EXCLUDED.fatura_miktar,
         istasyon_dolum=EXCLUDED.istasyon_dolum, kalan_miktar=EXCLUDED.kalan_miktar,
         koy_pompasi=EXCLUDED.koy_pompasi, tanker=EXCLUDED.tanker, dis_satis=EXCLUDED.dis_satis,
         dagiticiya_iade=EXCLUDED.dagiticiya_iade, fark_yuzde=EXCLUDED.fark_yuzde,
         evrak_durum=EXCLUDED.evrak_durum, bolge=EXCLUDED.bolge, mintika=EXCLUDED.mintika,
         kaynak_dosya=EXCLUDED.kaynak_dosya, guncelleme=now()`,
      k,
    );
  }
}

async function main() {
  const bugun = new Date();
  const ab = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1);
  const as = new Date(bugun.getFullYear(), bugun.getMonth(), 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const bas = process.argv[2] ?? iso(ab);
  const bit = process.argv[3] ?? iso(as);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bas) || !/^\d{4}-\d{2}-\d{2}$/.test(bit)) {
    console.error('Kullanım: ue2Cek.mts YYYY-MM-DD YYYY-MM-DD'); process.exit(1);
  }

  const yol = await indir(bas, bit);
  const xml = await readFile(yol, 'utf8');
  const { eklenen, atlanan, kayitlar } = dosyaIsle(xml);
  await yaz(kayitlar as unknown[][]);
  log(`\n✅ ${bas}–${bit}: ${eklenen} irsaliye satırı yazıldı${atlanan ? ` (${atlanan} atlandı)` : ''}`);
  await kapat();
}
main().catch(async e => { console.error('HATA:', e.message); await kapat().catch(() => {}); process.exit(1); });
