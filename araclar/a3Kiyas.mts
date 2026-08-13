// A3 (ASIS POL) ↔ Logo mutabakatı — POL'den A3 indir, BFF'ten Logo al, kıyasla, Postgres'e yaz.
//
// Akış:
//   1) POL'e giriş (saf-HTTP; CAPTCHA/2FA yok — 2026-08-08 çözüldü) + A3 Excel indir (Playwright)
//   2) BFF /dis/v1/mutabakat/fatura-satislari → aynı dönemin Logo faturaları (Logo'ya DOĞRUDAN
//      bağlanmaz → Vercel/bulutta da çalışır)
//   3) Fatura no anahtar; ürün / litre / çıkış tesisi ALAN ALAN kıyasla
//   4) mutabakat_a3 + mutabakat_a3_donem tablolarına yaz (panel buradan okur)
//
// ⚠️ Plaka/dorse KIYASA GİRMEZ — Logo'da yok (yanlış alarm olurdu).
// ⚠️ Salt-okuma: POL'de yalnız rapor indirilir, Logo BFF üstünden okunur, yazma yok.
//
// Çalıştır: node --env-file=.env --import tsx araclar/a3Kiyas.mts [POL_DONEM_KODU]
//   POL_DONEM_KODU: POL combo value (18=2026 Temmuz, 19=Ağustos…). Verilmezse en güncel (ilk).

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
// BFF: yerelde localhost, canlıda reportapi. BFF_URL boşsa localhost https (yerel test).
const BFF_URL = (process.env.BFF_URL || 'https://localhost:7262').replace(/\/$/, '');
const BFF_KEY = process.env.BFF_API_KEY || process.env.DIS_API_KEY || '';
// İndirme dizini: OS geçici (GitHub Actions runner + yerel makine ikisinde de çalışır).
const IND_DIR = join(tmpdir(), 'a3-indir');
mkdirSync(IND_DIR, { recursive: true });
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const num = (v: unknown) => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? 0 : x; };
// Çıkış tesisi kodu: A3 "DEP/2758-2/28241" / Logo "AYTEMİZ/.../…-28241" → son sayı bloğu eşleştirme anahtarı.

// Ürün kanonik: A3 ("Kurşunsuz Benzin 95 Oktan") ve Logo ("K.Benzin 95 Oktan (Etanollü)") aynı
// yakıtı FARKLI yazıyor. Alt türler (Etanollü/Biodizel) ana yakıtla aynı sayılır — EPDK satış
// kalemi tek ürün. Kanonik: benzin | motorin | fueloil | gazyagi | belirsiz.
function urunKanon(s: string | null | undefined): string {
  const t = String(s ?? '').toLocaleLowerCase('tr');
  if (/benzin|k\.?benzin|95\s*oktan|kur[şs]unsuz/.test(t)) return 'benzin';
  if (/motorin|mazot|d[ií]zel/.test(t)) return 'motorin';
  if (/fuel\s*oil|fueloil|f\.?oil/.test(t)) return 'fueloil';
  if (/gaz\s*ya[ğg]|gazya[ğg]/.test(t)) return 'gazyagi';
  if (/kalorifer|kalyak/.test(t)) return 'kalorifer';
  return 'belirsiz';
}

interface A3Kayit { faturaNo: string; irsaliyeNo: string; epdk: string; ist: string; urun: string; litre: number; tesis: string; }
interface LogoKayit { faturaNo: string; cariKod: string; urun: string | null; litre: number; cikisTesisi: string | null; iptal: boolean; }

// ── 1) POL'e giriş + A3 Excel indir ─────────────────────────────────────────
async function a3Indir(donemKodu: string): Promise<{ yol: string; donemAd: string; donemKod: string }> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    log('POL giriş…');
    await page.goto(BASE + 'login.aspx', { waitUntil: 'domcontentloaded', timeout: 40000 });
    // CheckLogin AJAX → uID → form1.__ARG="listID;uID" → submit (yakalanan gerçek akış).
    const giris = await page.evaluate(async (kimlik: { un: string; pw: string }) => {
      const r = await fetch(`Sistem/AjaxResponder.aspx?Command=CheckLogin&uniqueKey=${Date.now()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: `un=${encodeURIComponent(kimlik.un)}&pw=${encodeURIComponent(kimlik.pw)}&k=&uid=&cnn=MsSql2005_1`,
      });
      const xml = await r.text();
      const err = (xml.match(/error='(\d+)'/) || [])[1];
      const uID = (xml.match(/uID='([^']+)'/) || [])[1];
      const listID = (xml.match(/listID='([^']+)'/) || [])[1];
      if (err !== '0') return { ok: false, err };
      const f = document.getElementById('form1') as HTMLFormElement;
      const alanlar: [string, string][] = [['kadi', kimlik.un], ['sifre', kimlik.pw], ['__ARG', `${listID};${uID}`], ['hdnBtnName', 'MsSql2005_1']];
      for (const [name, val] of alanlar) {
        let el = f.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = name; f.appendChild(el); }
        el.value = val;
      }
      f.submit();
      return { ok: true };
    }, { un: POL_KADI, pw: POL_SIFRE });
    if (!giris.ok) throw new Error(`POL giriş reddedildi: error=${giris.err}`);
    await page.waitForURL(u => /DefaultDagitici|Ana/i.test(u.toString()), { timeout: 30000 });
    log('  giriş OK');

    log('A3 sayfası…');
    await page.goto(BASE + 'EpdkModulu/Epdk2020/Raporlar/A3AylikSatisKontrol.aspx', { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForSelector('[id*="ddlDonemAdFiltercmbAlt"]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);

    // Dönem listesini oku (dinamik — POL yeni ay açtıkça büyür). Kod verilmezse en güncel (ilk).
    const donemler = await page.evaluate(() => {
      const box = document.querySelector('[id*="ddlDonemAd"]');
      const opts = box ? [...box.querySelectorAll('option,li')] : [];
      return opts.map(o => ({ v: (o as HTMLOptionElement).value || o.getAttribute('data-value') || '', t: (o.textContent || '').trim() })).filter(x => x.v && /\d/.test(x.v));
    });
    // Seçim: 'onceki' → listenin 2. sırası (bir önceki ay) · 'guncel'/'' → en güncel (ilk) ·
    // sayısal kod → o dönem. POL combo en yeni ayı başa koyuyor.
    const secili = donemKodu === 'onceki'
      ? (donemler[1] ?? donemler[0])
      : (donemKodu === '' || donemKodu === 'guncel')
        ? donemler[0]
        : (donemler.find(d => d.v === donemKodu) ?? donemler[0]);
    if (!secili) throw new Error('POL dönem listesi okunamadı');
    log(`Dönem: ${secili.t} (kod ${secili.v})`);

    await page.evaluate((d: string) => {
      const alt = document.querySelector('[id*="ddlDonemAdFiltercmbAlt"]') as HTMLInputElement | null;
      if (alt) { alt.value = d; alt.dispatchEvent(new Event('change', { bubbles: true })); }
    }, secili.v);
    await page.waitForTimeout(1500);

    log('Excel indiriliyor…');
    const dl = await Promise.race<Download>([
      page.waitForEvent('download', { timeout: 70000 }),
      (async () => {
        const xls = page.locator('img[src*="xls"], [onclick*="xlsx" i], [title*="Excel" i]').first();
        if (await xls.count().catch(() => 0)) await xls.click({ timeout: 4000 }).catch(() => {});
        await page.locator('[id*="AsisButton1"] input, [id*="AsisButton1"]').first().click({ timeout: 4000 }).catch(() => {});
        return await page.waitForEvent('download', { timeout: 60000 });
      })(),
    ]);
    const yol = `${IND_DIR}/a3-${secili.v}.xlsx`;
    await dl.saveAs(yol);
    log('  indirildi:', dl.suggestedFilename());
    return { yol, donemAd: secili.t, donemKod: secili.v };
  } finally {
    await browser.close();
  }
}

// ── 2) A3 Excel → fatura bazında kayıt ──────────────────────────────────────
function a3Oku(yol: string): { kayitlar: Map<string, A3Kayit>; donem: string } {
  const wb = XLSX.readFile(yol);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  // Kolon indeksleri (A3 sabit düzen, satır 3 başlık): 1=EPDK 2=İstKod 3=İstAd 6=FaturaNo
  // 8=İrsaliyeNo 10=Ürün 11=FaturaSatışMiktarı 13=ÇıkışTesisi
  const veri = rows.slice(4).filter(r => String(r?.[6] ?? '').trim());
  // Aynı fatura dolum tipine göre bölününce fatura litresi TEKRAR eder → fatura+irsaliye+ürün TEKİL.
  const tekil = new Map<string, unknown[]>();
  for (const r of veri) { const k = `${r[6]}|${r[8]}|${r[10]}`; if (!tekil.has(k)) tekil.set(k, r); }
  const fat = new Map<string, A3Kayit>();
  for (const r of tekil.values()) {
    const f = String(r[6]).trim();
    if (!fat.has(f)) fat.set(f, { faturaNo: f, irsaliyeNo: String(r[8] ?? '').trim(), epdk: String(r[1] ?? '').trim(), ist: String(r[3] ?? '').trim(), urun: String(r[10] ?? '').trim(), litre: 0, tesis: String(r[13] ?? '').trim() });
    fat.get(f)!.litre += num(r[11]);
  }
  // Dönem: ilk kaydın fatura tarihinden YYYY-MM (Excel seri no → tarih)
  const ilkTarih = num(veri[0]?.[7]);
  const donem = ilkTarih > 0 ? excelAy(ilkTarih) : new Date().toISOString().slice(0, 7);
  return { kayitlar: fat, donem };
}
function excelAy(seri: number): string { const d = new Date(Date.UTC(1899, 11, 30) + seri * 864e5); return d.toISOString().slice(0, 7); }

// ── 3) BFF'ten Logo faturaları ──────────────────────────────────────────────
async function logoCek(donem: string): Promise<Map<string, LogoKayit>> {
  const [y, m] = donem.split('-').map(Number);
  const bas = `${y}-${String(m).padStart(2, '0')}-01`;
  const bit = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const url = `${BFF_URL}/dis/v1/mutabakat/fatura-satislari?baslangic=${bas}&bitis=${bit}`;
  // Yerelde localhost öz-imzalı sertifika → TLS doğrulamasını yalnız localhost için gevşet.
  if (/localhost/.test(BFF_URL)) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const r = await fetch(url, { headers: { 'X-Api-Key': BFF_KEY } });
  if (!r.ok) throw new Error(`BFF ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const d = await r.json() as { veri: LogoKayit[] };
  // Fatura×ürün satırlarını fatura bazında birleştir (litre topla, tesis/iptal ilk).
  const m2 = new Map<string, LogoKayit>();
  for (const s of d.veri) {
    const e = m2.get(s.faturaNo);
    if (e) { e.litre += s.litre; if (!e.cikisTesisi) e.cikisTesisi = s.cikisTesisi; }
    else m2.set(s.faturaNo, { faturaNo: s.faturaNo, cariKod: s.cariKod, urun: s.urun, litre: s.litre, cikisTesisi: s.cikisTesisi, iptal: s.iptal });
  }
  return m2;
}

// ── 4) Kıyasla + Postgres'e yaz ──────────────────────────────────────────────
async function main() {
  const donemKodu = process.argv[2] ?? '';
  const { yol, donemAd } = await a3Indir(donemKodu);
  const { kayitlar: a3, donem } = a3Oku(yol);
  log(`A3: ${a3.size} fatura, dönem ${donem}`);
  const logo = await logoCek(donem);
  log(`Logo (BFF): ${logo.size} fatura`);

  const satirlar: Record<string, unknown>[] = [];
  let tam = 0, sorunlu = 0, a3Top = 0, logoTop = 0;
  for (const [f, A] of a3) {
    a3Top += A.litre;
    const L = logo.get(f);
    let durum: string, litreFark: number | null = null;
    if (!L) durum = 'logoda_yok';
    else {
      logoTop += L.litre;
      litreFark = Math.round((L.litre - A.litre) * 100) / 100;
      // Ürün: kanonik yakıt eşit mi (yazım/alt-tür farkı tolere). belirsiz kalırsa fark sayma.
      const ka = urunKanon(A.urun), kl = urunKanon(L.urun);
      const urunEsit = ka === kl || ka === 'belirsiz' || kl === 'belirsiz';
      // ⚠️ ÇIKIŞ TESİSİ KIYASA GİRMEZ (2026-08-08, ölçüldü): A3'ün EPDK depo lisans
      // no'su (DEP/9318/43037) ile Logo ambar no'su (…ALPET-11083) FARKLI kodlama —
      // doğrudan eşleşmiyor. Kıyaslasa Ocak-Nisan'da yüzlerce YANLIŞ "tesis farkı"
      // üretiyordu (litre 0 farkla). Plaka gibi: iki taraf tutmuyor, bilgi olarak
      // gösterilir ama fark durumu üretmez. Güvenilir kıyas: litre + ürün.
      if (L.iptal) durum = 'iptal';
      else if (Math.abs(litreFark) >= 0.5) durum = 'litre_fark';
      else if (!urunEsit) durum = 'urun_fark';
      else durum = 'tam';
    }
    if (durum === 'tam') tam++; else sorunlu++;
    satirlar.push({
      donem, fatura_no: f, irsaliye_no: A.irsaliyeNo, epdk_kod: A.epdk, logo_cari_kod: L?.cariKod ?? null, istasyon: A.ist,
      a3_urun: A.urun, a3_litre: A.litre, a3_tesis: A.tesis,
      logo_urun: L?.urun ?? null, logo_litre: L?.litre ?? null, logo_tesis: L?.cikisTesisi ?? null, logo_iptal: L?.iptal ?? false,
      durum, litre_fark: litreFark,
    });
  }

  const p = pool();
  const c = await p.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM mutabakat_a3 WHERE donem=$1', [donem]);
    for (const s of satirlar) {
      await c.query(
        `INSERT INTO mutabakat_a3 (donem,fatura_no,irsaliye_no,epdk_kod,logo_cari_kod,istasyon,
           a3_urun,a3_litre,a3_tesis,logo_urun,logo_litre,logo_tesis,logo_iptal,durum,litre_fark)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [s.donem, s.fatura_no, s.irsaliye_no, s.epdk_kod, s.logo_cari_kod, s.istasyon,
          s.a3_urun, s.a3_litre, s.a3_tesis, s.logo_urun, s.logo_litre, s.logo_tesis, s.logo_iptal, s.durum, s.litre_fark],
      );
    }
    await c.query(
      `INSERT INTO mutabakat_a3_donem (donem,ad,pol_donem_kod,fatura_sayisi,tam_sayisi,sorunlu_sayisi,a3_toplam_litre,logo_toplam_litre,cekim_zamani)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (donem) DO UPDATE SET ad=$2,pol_donem_kod=$3,fatura_sayisi=$4,tam_sayisi=$5,sorunlu_sayisi=$6,a3_toplam_litre=$7,logo_toplam_litre=$8,cekim_zamani=now()`,
      [donem, donemAd, donemKodu || null, a3.size, tam, sorunlu, Math.round(a3Top), Math.round(logoTop)],
    );
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }

  log(`\n✅ ${donem} yazıldı: ${a3.size} fatura, ${tam} tam, ${sorunlu} sorunlu`);
  log(`   A3 ${Math.round(a3Top).toLocaleString('tr-TR')} lt · Logo ${Math.round(logoTop).toLocaleString('tr-TR')} lt · fark ${Math.round(logoTop - a3Top).toLocaleString('tr-TR')} lt`);
  const sorunTipleri = satirlar.filter(s => s.durum !== 'tam').reduce((a: Record<string, number>, s) => { a[s.durum as string] = (a[s.durum as string] || 0) + 1; return a; }, {});
  if (Object.keys(sorunTipleri).length) log('   sorun dağılımı:', JSON.stringify(sorunTipleri));
  await kapat();
}
main().catch(async e => { console.error('HATA:', e.message); await kapat().catch(() => {}); process.exit(1); });
