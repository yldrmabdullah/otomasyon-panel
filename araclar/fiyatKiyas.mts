// Bayi fiyat takibi — POL "Tablo A5" ↔ parkoil.com.tr referans fiyatı (REKABET kontrolü).
//
// Bayimiz Petrol Ofisi il fiyatının ÜSTÜNDE satıyorsa işaretlenir ("pahalı satıyor").
// ⚠️ EPDK yasal tavan ihlali DEĞİL — web sitesindeki fiyat PO pompa fiyatıdır.
//
// A5 (2026-08-12 doğrulandı, bkz. docs/bilgi/pol-harita.md):
//   Yol: EpdkModulu/Epdk2020/AgHizmeti/A5.aspx · tarih: dtpTarih_Date1/Date2 (D/MM/YYYY)
//   İndirme: FA excel ikonu TEK TIK (Raporla'ya BASMA — akışı bozar)
//   Kolonlar: [2]=EPDK [4]=Ürün [5]=Fiyat [6]=Tarih(Excel seri) [8]=İstKod [9]=İstasyon
//             [10]=Bölge [11]=Mıntıka(il)
// Referans: https://parkoil.com.tr/data/fiyatlar-guncel.json (public, il/ilçe × ürün, günlük)
//   Eşleştirme: A5 mıntıka ↔ web il (TR normalize). Ölçüm: 58/61 il eşleşiyor.
//   İl içinde birden çok ilçe fiyatı var → EN YÜKSEK alınır (bayi onu da aşıyorsa kesin pahalı).
//
// Çalıştır: node --env-file=.env --import tsx araclar/fiyatKiyas.mts [bas] [bit]  (YYYY-MM-DD, boş=son 2 gün)

import { chromium, type Download } from 'playwright';
import XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pool, kapat } from '../core/db.js';

const BASE = (process.env.POL_URL ?? 'https://pol.parkoil.tr/POL/').replace(/\/$/, '') + '/';
const REF_URL = process.env.FIYAT_REF_URL ?? 'https://parkoil.com.tr/data/fiyatlar-guncel.json';
const IND_DIR = join(tmpdir(), 'a5-indir');
mkdirSync(IND_DIR, { recursive: true });
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** TR normalize — il adı eşleştirme.
 *  ⚠️ Web sitesi Türkçe KARAKTERSİZ yazıyor ("Kahramanmaras", "Agri"), A5 tam Türkçe
 *  ("Kahramanmaraş", "Ağrı") → tüm TR karakterler ASCII'ye indirilir. Ayrıca
 *  "Afyonkarahisar" (A5) ↔ "Afyon" (web) gibi kısaltmalar için EŞ AD tablosu. */
const TR_ASCII: Record<string, string> = { 'İ': 'I', 'I': 'I', 'Ş': 'S', 'Ğ': 'G', 'Ü': 'U', 'Ö': 'O', 'Ç': 'C' };
const norm = (s: unknown) => String(s ?? '').toLocaleUpperCase('tr')
  .replace(/[İIŞĞÜÖÇ]/g, (c) => TR_ASCII[c] ?? c).replace(/\s+/g, ' ').trim();
/** A5 il adı → web sitesindeki karşılığı (normalize sonrası hâlâ farklı olanlar). */
const IL_ES_AD: Record<string, string> = {
  'AFYONKARAHISAR': 'AFYON',
};
const ilAnahtar = (il: unknown) => { const n = norm(il); return IL_ES_AD[n] ?? n; };
/** A5 ürün adı → kanonik. Web JSON alan adlarıyla aynı olmalı (benzin/motorin). */
const urunKanon = (u: string): 'benzin' | 'motorin' | null =>
  /motorin|mazot/i.test(u) ? 'motorin' : /benzin|oktan/i.test(u) ? 'benzin' : null;
/** Excel seri no → YYYY-MM-DD (1899-12-30 epoch). */
const excelGun = (seri: number) => new Date(Date.UTC(1899, 11, 30) + Math.floor(seri) * 864e5).toISOString().slice(0, 10);

/** "Pahalı" sayılma eşiği (TL/lt).
 *  ⚠️ NEDEN 0.20 (2026-08-12 ölçüldü): eşiksiz 17 kayıt "pahalı" çıkıyordu ama 11'i
 *  +0,02…+0,15 TL — bunlar ilçe fiyat farkı / zam zamanlaması, gerçek sapma değil.
 *  Gerçek sapmalar +1,24 ve +1,34 TL (ILGINPARK Konya, ABDULKADİR TEKİNTAŞ Çankırı).
 *  0,20 TL bu iki grubu net ayırıyor; kuruş gürültüsü alarm üretmiyor. */
const PAHALI_ESIK = 0.20;

async function a5Indir(bas: string, bit: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const p = await (await browser.newContext({ acceptDownloads: true })).newPage();
  p.setDefaultTimeout(60000);
  try {
    log('POL giriş…');
    await p.goto(BASE + 'login.aspx', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    }, { u: process.env.POL_KULLANICI ?? '', p: process.env.POL_SIFRE ?? '' });
    if (!g.ok) throw new Error(`POL giriş reddedildi: error=${g.err}`);
    await p.waitForURL(u => /DefaultDagitici|Ana/i.test(u.toString()), { timeout: 45000 });
    log('  giriş OK');

    await p.goto(BASE + 'EpdkModulu/Epdk2020/AgHizmeti/A5.aspx', { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(2500);
    const tr = (iso: string) => { const [y, m, d] = iso.split('-'); return `${Number(d)}/${m}/${y}`; };
    log(`Tarih: ${tr(bas)} – ${tr(bit)}`);
    await p.evaluate((t: { b: string; e: string }) => {
      const d1 = document.querySelector('[id*="dtpTarih_Date1"]') as HTMLInputElement | null;
      const d2 = document.querySelector('[id*="dtpTarih_Date2"]') as HTMLInputElement | null;
      if (d1) { d1.value = t.b; d1.dispatchEvent(new Event('change', { bubbles: true })); }
      if (d2) { d2.value = t.e; d2.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { b: tr(bas), e: tr(bit) });
    await p.waitForTimeout(800);

    // ⚠️ A5'te rapor butonu `ReportButton1` (A4'te AsisButton1) — tur POST'undan çıkarıldı.
    // Excel ikonu export tipini seçer, ReportButton1 submit'i indirmeyi yapar.
    log('Excel indiriliyor…');
    const dl = await Promise.race<Download>([
      p.waitForEvent('download', { timeout: 90000 }),
      (async () => {
        const ikon = p.locator('i[class*="excel_2019"], i[class*="excel"]').first();
        if (await ikon.count().catch(() => 0)) await ikon.click({ timeout: 5000 }).catch(() => {});
        const btn = p.locator('[id*="ReportButton1"] input, [id*="ReportButton1"], input[value="Raporla"]').first();
        await btn.click({ timeout: 6000 }).catch(() => {});
        return await p.waitForEvent('download', { timeout: 80000 });
      })(),
    ]);
    const yol = `${IND_DIR}/a5-${bas}_${bit}.xlsx`;
    await dl.saveAs(yol);
    log('  indirildi:', dl.suggestedFilename());
    return yol;
  } finally { await browser.close(); }
}

interface Satir { gun: string; epdk: string; istKod: string; istasyon: string; bolge: string; il: string; urun: 'benzin' | 'motorin'; urunHam: string; fiyat: number; }

function a5Oku(yol: string): Satir[] {
  const wb = XLSX.readFile(yol);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  const out: Satir[] = [];
  for (const r of rows) {
    if (!String(r?.[2] ?? '').startsWith('BAY')) continue;
    const uk = urunKanon(String(r[4] ?? ''));
    const fiyat = Number(r[5]);
    if (!uk || !(fiyat > 0)) continue;
    out.push({
      gun: excelGun(Number(r[6])), epdk: String(r[2]).trim(), istKod: String(r[8] ?? '').trim(),
      istasyon: String(r[9] ?? '').trim(), bolge: String(r[10] ?? '').trim(), il: String(r[11] ?? '').trim(),
      urun: uk, urunHam: String(r[4] ?? '').trim(), fiyat,
    });
  }
  return out;
}

/** Web referans fiyatı: il → { benzin, motorin } (il içi EN YÜKSEK ilçe fiyatı). */
async function refFiyat(): Promise<{ guncelleme: string; il: Map<string, { benzin?: number; motorin?: number }> }> {
  const r = await fetch(REF_URL);
  if (!r.ok) throw new Error(`Referans fiyat alınamadı: ${r.status}`);
  const j = await r.json() as { guncelleme: string; data: Array<Record<string, string>> };
  const il = new Map<string, { benzin?: number; motorin?: number }>();
  for (const w of j.data) {
    const k = ilAnahtar(w.il);
    const e = il.get(k) ?? {};
    for (const u of ['benzin', 'motorin'] as const) {
      const v = parseFloat(w[u]);
      if (v > 0 && (e[u] === undefined || v > e[u]!)) e[u] = v;  // il içi EN YÜKSEK
    }
    il.set(k, e);
  }
  return { guncelleme: j.guncelleme, il };
}

async function main() {
  const bugun = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dun = new Date(bugun.getTime() - 864e5);
  const bas = process.argv[2] ?? iso(dun);
  const bit = process.argv[3] ?? iso(bugun);

  const [satirlar, ref] = await Promise.all([a5Indir(bas, bit).then(a5Oku), refFiyat()]);
  log(`A5: ${satirlar.length} fiyat kaydı · referans: ${ref.il.size} il (${ref.guncelleme})`);

  // Aynı gün+bayi+ürün için EN SON (en yüksek fiyat değişimi değil, son kayıt) → dosya sırası son kazanır
  const tekil = new Map<string, Satir>();
  for (const s of satirlar) tekil.set(`${s.gun}|${s.epdk}|${s.istKod}|${s.urun}`, s);

  const p = pool();
  const c = await p.connect();
  let pahali = 0, uygun = 0, refYok = 0;
  try {
    await c.query('BEGIN');
    for (const s of tekil.values()) {
      const r = ref.il.get(ilAnahtar(s.il))?.[s.urun];
      const fark = r === undefined ? null : Math.round((s.fiyat - r) * 100) / 100;
      // Eşik altı fark (kuruş) 'uygun' — gürültü alarm üretmesin (bkz. PAHALI_ESIK).
      const durum = r === undefined ? 'ref_yok' : (fark! >= PAHALI_ESIK ? 'pahali' : 'uygun');
      if (durum === 'pahali') pahali++; else if (durum === 'uygun') uygun++; else refYok++;
      await c.query(
        `INSERT INTO bayi_fiyat (gun,epdk_kod,ist_kod,istasyon,bolge,il,urun,urun_ham,bayi_fiyat,ref_fiyat,fark,ref_guncelleme,durum)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (gun,epdk_kod,ist_kod,urun) DO UPDATE SET
           bayi_fiyat=$9, ref_fiyat=$10, fark=$11, ref_guncelleme=$12, durum=$13, guncelleme=now()`,
        [s.gun, s.epdk, s.istKod, s.istasyon, s.bolge, s.il, s.urun, s.urunHam, s.fiyat, r ?? null, fark, ref.guncelleme, durum],
      );
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }

  log(`\n✅ ${tekil.size} kayıt yazıldı: ${pahali} PAHALI · ${uygun} uygun · ${refYok} referans yok`);
  await kapat();
}
main().catch(async e => { console.error('HATA:', e.message); await kapat().catch(() => {}); process.exit(1); });
