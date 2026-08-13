// Tank Uzlaştırma (EPDK stok mutabakatı) — POL'den indir, Postgres'e yaz.
//
// POL Tank Uzlaştırma Raporu (TankUzlastirma.aspx): bayi×ürün×tank bazında
//   Fark E = (A + B − C) − D,  Oran F = (E/C)*100.  A=başı, B=dolum, C=satış, D=sonu.
// EPDK limiti |F| ≤ %3 (ve mutlak 288 lt — 1240 kararı). Tarih ARALIĞI seçilir.
//
// Giriş A3 ile aynı saf-HTTP akış (CAPTCHA/2FA yok). BFF'e gerek YOK — POL zaten
// hesaplamış, Logo'ya bakmıyoruz. Salt-okuma (yalnız rapor indirilir).
//
// Çalıştır: node --env-file=.env --import tsx araclar/uzlasCek.mts <bas> <bit>
//   bas/bit: YYYY-MM-DD (ör. 2026-07-01 2026-07-31). Verilmezse GEÇEN AY.

import { chromium, type Download } from 'playwright';
import XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pool, kapat } from '../core/db.js';

/** Ortam değişkeni oku — BOŞ STRING de "yok" sayılır. `??` yalnız undefined/null'da
 *  devreye girer; workflow tanımsız bir variable geçirirse '' gelir ve varsayılan
 *  ATLANIR (fiyatKiyas.mts bu yüzden çökmüştü, 2026-08-13). */
const cevre = (ad: string, varsayilan: string): string => {
  const v = process.env[ad];
  return v && v.trim() ? v.trim() : varsayilan;
};
const BASE = cevre('POL_URL', 'https://pol.parkoil.tr/POL/').replace(/\/$/, '') + '/';
const POL_KADI = process.env.POL_KULLANICI ?? '';
const POL_SIFRE = process.env.POL_SIFRE ?? '';
const IND_DIR = join(tmpdir(), 'uzlas-indir');
mkdirSync(IND_DIR, { recursive: true });
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// EPDK mutabakat limiti: |oran| > %3 VE |fark| > 288 lt → gerçek sapma.
// (Küçük tanklarda %3 kolay aşılır ama 288 lt altı EPDK'ca önemsiz — ikisi birlikte.)
const ORAN_LIMIT = 3;
const FARK_LIMIT = 288;

interface Satir {
  epdk: string; ist: string; istKod: string; bolge: string; mintika: string; urun: string; tank: string;
  a: number; b: number; c: number; d: number; e: number; f: number; kalibIlk: number; kalibSon: number;
}

function num(v: unknown): number { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }

// ── POL giriş + Tank Uzlaştırma indir ───────────────────────────────────────
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

    await p.goto(BASE + 'OtomasyonModulu/TankRaporlari/TankUzlastirma.aspx', { waitUntil: 'networkidle', timeout: 40000 });
    await p.waitForTimeout(3000);
    // Tarih aralığı: dtpTarih2 Date1/Date2, format DD/MM/YYYY.
    const [by, bm, bd] = bas.split('-'); const [ey, em, ed] = bit.split('-');
    const trBas = `${bd}/${bm}/${by}`, trBit = `${ed}/${em}/${ey}`;
    log(`Tarih aralığı: ${trBas} – ${trBit}`);
    await p.evaluate((t: { b: string; e: string }) => {
      const d1 = document.querySelector('[id*="dtpTarih2_Date1"]') as HTMLInputElement | null;
      const d2 = document.querySelector('[id*="dtpTarih2_Date2"]') as HTMLInputElement | null;
      if (d1) { d1.value = t.b; d1.dispatchEvent(new Event('change', { bubbles: true })); }
      if (d2) { d2.value = t.e; d2.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { b: trBas, e: trBit });
    await p.waitForTimeout(1000);

    log('Excel indiriliyor…');
    const dl = await Promise.race<Download>([
      p.waitForEvent('download', { timeout: 90000 }),
      (async () => {
        const x = p.locator('img[src*="xls"], [onclick*="xlsx" i], [title*="Excel" i]').first();
        if (await x.count().catch(() => 0)) await x.click({ timeout: 4000 }).catch(() => {});
        await p.locator('[id*="AsisButton1"] input, [id*="AsisButton1"]').first().click({ timeout: 4000 }).catch(() => {});
        return await p.waitForEvent('download', { timeout: 80000 });
      })(),
    ]);
    const yol = `${IND_DIR}/uzlas-${bas}_${bit}.xlsx`;
    await dl.saveAs(yol);
    log('  indirildi:', dl.suggestedFilename());
    return yol;
  } finally { await browser.close(); }
}

// ── Excel → satırlar ────────────────────────────────────────────────────────
function oku(yol: string): Satir[] {
  const wb = XLSX.readFile(yol);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  let bas = -1;
  for (let i = 0; i < 12; i++) if ((rows[i] || []).some(c => /ERP|EPDK/.test(String(c)))) { bas = i; break; }
  if (bas < 0) throw new Error('Uzlaştırma başlık satırı bulunamadı');
  return rows.slice(bas + 1)
    .filter(r => String(r?.[1] ?? '').startsWith('BAY'))
    // ⚠️ LPG İZLENMİYOR (kullanıcı kararı 2026-08-12): Parkoil LPG dağıtımı yapmıyor,
    // LPG tankları bayinin başka tedarikçisinden dolar → bizim mutabakatta her zaman
    // "satış var dolum yok" sahte alarmı üretir (EFECAN LPG T6: 208.640 lt, −%100).
    .filter(r => !/lpg/i.test(String(r?.[6] ?? '')))
    .map(r => ({
      epdk: String(r[1]).trim(), ist: String(r[3] ?? '').trim(), istKod: String(r[2] ?? '').trim(),
      mintika: String(r[4] ?? '').trim(), bolge: String(r[5] ?? '').trim(), urun: String(r[6] ?? '').trim(), tank: String(r[7] ?? '').trim(),
      a: num(r[8]), b: num(r[9]), c: num(r[10]), d: num(r[11]), e: num(r[12]), f: num(r[13]),
      kalibIlk: num(r[14]), kalibSon: num(r[15]),
    }));
}

// Durum sınıfı: satış yoksa oran anlamsız (0'a bölme → ±100); kalibrasyon değişmişse
// fark ölçüm değişimi olabilir; ikisi de değilse limit kontrolü.
function durumBul(s: Satir): string {
  if (s.c === 0) return 'satis_yok';                              // pompa satışı 0 → oran anlamsız
  if (s.kalibIlk !== s.kalibSon) return 'kalib_degisti';          // 1240: kalibrasyon değişimi
  if (Math.abs(s.f) > ORAN_LIMIT && Math.abs(s.e) > FARK_LIMIT) return 'oran_asim';
  return 'uygun';
}

async function main() {
  const bugun = new Date();
  const gecenAyBas = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1);
  const gecenAySon = new Date(bugun.getFullYear(), bugun.getMonth(), 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const bas = process.argv[2] ?? iso(gecenAyBas);
  const bit = process.argv[3] ?? iso(gecenAySon);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bas) || !/^\d{4}-\d{2}-\d{2}$/.test(bit)) { console.error('Kullanım: uzlasCek.mts YYYY-MM-DD YYYY-MM-DD'); process.exit(1); }

  const yol = await indir(bas, bit);
  const satirlar = oku(yol);
  log(`${satirlar.length} tank satırı okundu`);

  // Bayi bazında sorunlu = ±%3+288 aşan en az 1 tankı olan bayi.
  const bayiler = new Set(satirlar.map(s => s.epdk));
  const sorunluBayi = new Set(satirlar.filter(s => durumBul(s) === 'oran_asim').map(s => s.epdk));
  const topDolum = satirlar.reduce((a, s) => a + s.b, 0);
  const topSatis = satirlar.reduce((a, s) => a + s.c, 0);
  const ay = new Date(bas).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
  const ad = (bas.endsWith('-01') && Number(bit.slice(8)) >= 28) ? ay : `${bas.split('-').reverse().join('.')}–${bit.split('-').reverse().join('.')}`;

  const p = pool();
  const c = await p.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM uzlastirma WHERE donem_bas=$1 AND donem_bit=$2', [bas, bit]);
    for (const s of satirlar) {
      await c.query(
        `INSERT INTO uzlastirma (donem_bas,donem_bit,epdk_kod,istasyon,ist_kod,bolge,mintika,urun,tank_no,
           a_basi,b_dolum,c_satis,d_sonu,e_fark,f_oran,kalib_ilk,kalib_son,durum)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [bas, bit, s.epdk, s.ist, s.istKod, s.bolge, s.mintika, s.urun, s.tank,
          s.a, s.b, s.c, s.d, s.e, s.f, s.kalibIlk, s.kalibSon, durumBul(s)],
      );
    }
    await c.query(
      `INSERT INTO uzlastirma_donem (donem_bas,donem_bit,ad,bayi_sayisi,tank_sayisi,sorunlu_bayi,toplam_dolum,toplam_satis,cekim_zamani)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (donem_bas,donem_bit) DO UPDATE SET ad=$3,bayi_sayisi=$4,tank_sayisi=$5,sorunlu_bayi=$6,toplam_dolum=$7,toplam_satis=$8,cekim_zamani=now()`,
      [bas, bit, ad, bayiler.size, satirlar.length, sorunluBayi.size, Math.round(topDolum), Math.round(topSatis)],
    );
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }

  const dagilim = satirlar.reduce((a: Record<string, number>, s) => { const d = durumBul(s); a[d] = (a[d] || 0) + 1; return a; }, {});
  log(`\n✅ ${ad} yazıldı: ${bayiler.size} bayi, ${satirlar.length} tank`);
  log(`   sorunlu bayi (oran aşım): ${sorunluBayi.size}`);
  log(`   tank durum dağılımı: ${JSON.stringify(dagilim)}`);
  log(`   Σ dolum ${Math.round(topDolum).toLocaleString('tr-TR')} lt · Σ satış ${Math.round(topSatis).toLocaleString('tr-TR')} lt`);
  await kapat();
}
main().catch(async e => { console.error('HATA:', e.message); await kapat().catch(() => {}); process.exit(1); });
