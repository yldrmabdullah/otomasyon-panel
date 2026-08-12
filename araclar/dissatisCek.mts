// Bayi Dış Satış (POL "Tablo A4") — bir tarih aralığı için indir, bayi×ürün topla, Postgres'e yaz.
//
// Uzlaştırmada "sattığı" = pompa + DIŞ SATIŞ. A4 dış satışı EPDK+ürün bazında verir
// (tank kırılımı yok) → uzlastirma_dissatis tablosuna bayi düzeyinde yazılır.
// A4 kolonları (2026-08-12 doğrulandı, başlık satır 3): EPDK(2) Tarih(3) Ürün(5)
// Plaka(9) Dorse(10) BelgelenenDışSatışMiktarı(11).
//
// İndirme akışı: dtpTarih Date1/Date2 (format D/MM/YYYY) + AsisButton1 "Raporla" submit
// → Excel iner (A3/uzlaştırma ile aynı desen). Giriş saf-HTTP (CAPTCHA/2FA yok). Salt-okuma.
//
// Çalıştır: node --env-file=.env --import tsx araclar/dissatisCek.mts <bas> <bit>  (YYYY-MM-DD, boş=geçen ay)

import { chromium, type Download } from 'playwright';
import XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pool, kapat } from '../core/db.js';

const BASE = (process.env.POL_URL ?? 'https://pol.parkoil.tr/POL/').replace(/\/$/, '') + '/';
const POL_KADI = process.env.POL_KULLANICI ?? '';
const POL_SIFRE = process.env.POL_SIFRE ?? '';
const IND_DIR = join(tmpdir(), 'dissatis-indir');
mkdirSync(IND_DIR, { recursive: true });
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };

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

    await p.goto(BASE + 'EpdkModulu/Epdk2020/AgHizmeti/A4.aspx', { waitUntil: 'networkidle', timeout: 40000 });
    await p.waitForTimeout(3000);
    // Tarih: dtpTarih Date1/Date2. Format D/MM/YYYY (gün tek haneli olabilir — yakalanan: 1/08/2026).
    const trTarih = (iso: string) => { const [y, m, d] = iso.split('-'); return `${Number(d)}/${m}/${y}`; };
    log(`Tarih aralığı: ${trTarih(bas)} – ${trTarih(bit)}`);
    await p.evaluate((t: { b: string; e: string }) => {
      const d1 = document.querySelector('[id*="dtpTarih_Date1"]') as HTMLInputElement | null;
      const d2 = document.querySelector('[id*="dtpTarih_Date2"]') as HTMLInputElement | null;
      if (d1) { d1.value = t.b; d1.dispatchEvent(new Event('change', { bubbles: true })); }
      if (d2) { d2.value = t.e; d2.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { b: trTarih(bas), e: trTarih(bit) });
    await p.waitForTimeout(800);

    // İndirme = AsisButton1 "Raporla" submit (export tipi önceden xlsx). Yakalanan akış.
    log('Excel indiriliyor…');
    const dl = await Promise.race<Download>([
      p.waitForEvent('download', { timeout: 90000 }),
      (async () => {
        // Önce FA excel ikonu (2019=xlsx) tetiklenirse; olmazsa Raporla submit.
        const xls = p.locator('i[class*="excel_2019"], i[class*="excel"]').first();
        if (await xls.count().catch(() => 0)) await xls.click({ timeout: 4000 }).catch(() => {});
        await p.locator('[id*="AsisButton1"] input, [id*="AsisButton1"]').first().click({ timeout: 4000 }).catch(() => {});
        return await p.waitForEvent('download', { timeout: 80000 });
      })(),
    ]);
    const yol = `${IND_DIR}/a4-${bas}_${bit}.xlsx`;
    await dl.saveAs(yol);
    log('  indirildi:', dl.suggestedFilename());
    return yol;
  } finally { await browser.close(); }
}

interface DisSatis { epdk: string; urun: string; litre: number; }
function oku(yol: string): DisSatis[] {
  const wb = XLSX.readFile(yol);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  let bas = -1;
  for (let i = 0; i < 8; i++) if ((rows[i] || []).some(c => /EPDK Kodu/i.test(String(c)))) { bas = i; break; }
  if (bas < 0) throw new Error('A4 başlık satırı bulunamadı');
  // Kolonlar: EPDK(2) Ürün(5) Belgelenen Dış Satış Miktarı(11)
  return rows.slice(bas + 1)
    .filter(r => String(r?.[2] ?? '').startsWith('BAY'))
    .map(r => ({ epdk: String(r[2]).trim(), urun: String(r[5] ?? '').trim(), litre: num(r[11]) }));
}

async function main() {
  const bugun = new Date();
  const ab = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1);
  const as = new Date(bugun.getFullYear(), bugun.getMonth(), 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const bas = process.argv[2] ?? iso(ab);
  const bit = process.argv[3] ?? iso(as);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bas) || !/^\d{4}-\d{2}-\d{2}$/.test(bit)) { console.error('Kullanım: dissatisCek.mts YYYY-MM-DD YYYY-MM-DD'); process.exit(1); }

  const satirlar = oku(await indir(bas, bit));
  log(`${satirlar.length} dış satış satırı`);
  // Bayi×ürün topla
  const grup = new Map<string, { epdk: string; urun: string; lt: number; adet: number }>();
  for (const s of satirlar) {
    const k = `${s.epdk}|${s.urun}`;
    const g = grup.get(k) ?? { epdk: s.epdk, urun: s.urun, lt: 0, adet: 0 };
    g.lt += s.litre; g.adet++;
    grup.set(k, g);
  }

  const p = pool();
  const c = await p.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM uzlastirma_dissatis WHERE donem_bas=$1 AND donem_bit=$2', [bas, bit]);
    for (const g of grup.values()) {
      await c.query(
        `INSERT INTO uzlastirma_dissatis (donem_bas,donem_bit,epdk_kod,urun,dis_satis_lt,satis_adedi)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [bas, bit, g.epdk, g.urun, Math.round(g.lt), g.adet],
      );
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }

  const toplam = [...grup.values()].reduce((a, g) => a + g.lt, 0);
  log(`\n✅ ${bas}–${bit}: ${grup.size} bayi×ürün, Σ dış satış ${Math.round(toplam).toLocaleString('tr-TR')} lt`);
  await kapat();
}
main().catch(async e => { console.error('HATA:', e.message); await kapat().catch(() => {}); process.exit(1); });
