// A1b (Düzeltilmiş Otomasyon Sistemi) günlük çekimi + stok-satış anomali analizi.
//
// POL "Tablo A1b" Excel'ini indirir, A1A öncelikli normalize eder, deterministik
// kural motorundan (core/a1bKural.ts) geçirir ve a1b_gun tablosuna yazar.
//
// Kaynak gereksinim: "Günlük Akaryakıt Tank Stok-Satış Anomali Kontrol Sistemi"
// teknik dokümanı (Turgut Dağıtım, 18.08.2026 v1.0).
//
// ⚠️ DOKÜMANDAN SAPMA (bilinçli): doküman "Excel sisteme YÜKLENİR" diyor (12.1).
// Burada POL'den OTOMATİK indiriliyor — elle dosya yükleme iş akışı istenmiyor.
// Aynı desen fiyatKiyas.mts'te kanıtlı.
//
// Çalıştır: npx tsx --env-file=.env araclar/a1bCek.mts [bas] [bit]   (boş = dün+bugün)

import { chromium, type Download } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import XLSX from 'xlsx';
import type { Pool } from 'pg';
import { pool, kapat } from '../core/db.js';
import { degerlendir, VARSAYILAN_ESIK, ESIK_SURUM, type Esikler, type HamSatir } from '../core/a1bKural.js';

/** Boş string de "yok" sayılır — `??` boş stringi geçirir (2026-08-13 dersi). */
const cevre = (ad: string, varsayilan: string): string => {
  const v = process.env[ad];
  return v && v.trim() ? v.trim() : varsayilan;
};
const BASE = cevre('POL_URL', 'https://pol.parkoil.tr/POL/').replace(/\/$/, '') + '/';
const IND_DIR = join(tmpdir(), 'a1b-indir');
mkdirSync(IND_DIR, { recursive: true });
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const trTarih = (i: string) => { const [y, m, d] = i.split('-'); return `${Number(d)}/${m}/${y}`; };
/** Excel seri tarihi → ISO. 25569 = 1970-01-01 ofseti. */
const excelGun = (n: number) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);

async function a1bIndir(bas: string, bit: string): Promise<string> {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const p = await ctx.newPage();
    log('POL giriş…');
    await p.goto(BASE + 'login.aspx', { waitUntil: 'domcontentloaded', timeout: 40000 });
    const g = await p.evaluate(async (k: { u: string; p: string }) => {
      const r = await fetch(`Sistem/AjaxResponder.aspx?Command=CheckLogin&uniqueKey=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: `un=${encodeURIComponent(k.u)}&pw=${encodeURIComponent(k.p)}&k=&uid=&cnn=MsSql2005_1`,
      });
      const x = await r.text();
      const err = (x.match(/error='(\d+)'/) || [])[1];
      const uID = (x.match(/uID='([^']+)'/) || [])[1];
      const listID = (x.match(/listID='([^']+)'/) || [])[1];
      if (err !== '0') return { ok: false, err };
      const f = document.getElementById('form1') as HTMLFormElement;
      const alanlar: [string, string][] = [
        ['kadi', k.u], ['sifre', k.p], ['__ARG', `${listID};${uID}`], ['hdnBtnName', 'MsSql2005_1'],
      ];
      for (const [n, v] of alanlar) {
        let e = f.querySelector(`[name="${n}"]`) as HTMLInputElement | null;
        if (!e) { e = document.createElement('input'); e.type = 'hidden'; e.name = n; f.appendChild(e); }
        e.value = v;
      }
      f.submit();
      return { ok: true };
    }, { u: process.env.POL_KULLANICI ?? '', p: process.env.POL_SIFRE ?? '' });
    if (!g.ok) throw new Error(`POL giriş reddedildi: error=${g.err}`);
    await p.waitForURL((u) => /DefaultDagitici|Ana/i.test(u.toString()), { timeout: 30000 });
    log('  giriş OK');

    await p.goto(BASE + 'EpdkModulu/Epdk2020/AgHizmeti/A1b.aspx', { waitUntil: 'networkidle', timeout: 45000 });
    await p.waitForTimeout(2500);
    log(`Tarih: ${trTarih(bas)} – ${trTarih(bit)}`);
    await p.evaluate((t: { b: string; e: string }) => {
      const d1 = document.querySelector('[id*="dtpTarih_Date1"]') as HTMLInputElement | null;
      const d2 = document.querySelector('[id*="dtpTarih_Date2"]') as HTMLInputElement | null;
      if (d1) { d1.value = t.b; d1.dispatchEvent(new Event('change', { bubbles: true })); }
      if (d2) { d2.value = t.e; d2.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { b: trTarih(bas), e: trTarih(bit) });
    await p.waitForTimeout(900);

    // Harita "tek tık" diyor ama Raporla da gerekebiliyor → ikisi de denenir.
    log('Excel indiriliyor…');
    const dl = await Promise.race<Download>([
      p.waitForEvent('download', { timeout: 100000 }),
      (async () => {
        const ikon = p.locator('i[class*="excel_2019"], i[class*="excel"]').first();
        if (await ikon.count().catch(() => 0)) await ikon.click({ timeout: 5000 }).catch(() => {});
        const btn = p.locator('[id*="ReportButton1"] input, [id*="ReportButton1"], [id*="AsisButton1"] input, input[value="Raporla"]').first();
        await btn.click({ timeout: 6000 }).catch(() => {});
        return await p.waitForEvent('download', { timeout: 90000 });
      })(),
    ]);
    const yol = `${IND_DIR}/a1b-${bas}_${bit}.xlsx`;
    await dl.saveAs(yol);
    log('  indirildi:', dl.suggestedFilename());
    return yol;
  } finally {
    await browser.close();
  }
}

/** Sayısal dönüşüm — '', '-', NaN → null (doküman 4.2). SIFIR KORUNUR. */
function say(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '-') return null;
  const n = typeof v === 'number' ? v : Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Excel'i oku — kolonlar BAŞLIK ADIYLA bulunur, harf/indeks sabitlenmez
 *  (doküman 3: "yalnızca kolon harfine bağımlı kod yazılmamalıdır"). */
export function a1bOku(yol: string): HamSatir[] {
  const wb = XLSX.readFile(yol);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  // Gerçek başlık satırı: "Tank No" + "Tarih" içeren ilk satır (üstte rapor başlığı var).
  let bi = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const s = (rows[i] ?? []).map(String).join('|');
    if (/Tank No/i.test(s) && /Tarih/i.test(s)) { bi = i; break; }
  }
  if (bi < 0) throw new Error('A1b başlık satırı bulunamadı (rapor biçimi değişmiş olabilir).');

  const bas = (rows[bi] ?? []).map((x) => String(x ?? '').replace(/\s+/g, ' ').trim());
  const bul = (...adaylar: string[]): number => {
    for (const a of adaylar) {
      const i = bas.findIndex((h) => h.toLocaleLowerCase('tr') === a.toLocaleLowerCase('tr'));
      if (i >= 0) return i;
    }
    return -1;
  };
  const K = {
    tarih: bul('Tarih'), ist: bul('İst. Kod', 'Ist. Kod'), tank: bul('Tank No'),
    urun: bul('Akaryakit Türü', 'Akaryakıt Türü'), epdk: bul('Bayi Lisans No'),
    ad: bul('İstasyon Ad', 'İstasyon Adı'), bolge: bul('Bölge'), mintika: bul('Mıntıka'),
    gb: bul('Gün Başı Stok'), dol: bul('Tanka Dolum'), sat: bul('Satış'), gs: bul('Ertesi Gün Açılış'),
    aGb: bul('Gün Başı Stok (A1A)'), aDol: bul('Tanka Dolum (A1A)'),
    aSat: bul('Satış (A1A)'), aGs: bul('Ertesi Gün Açılış(A1A)', 'Ertesi Gün Açılış (A1A)'),
    kap: bul('Tank Kapasitesi'), acik: bul('Açıklama'),
    duz: bul('Düzenleme Yapan'), duzT: bul('Düzenleme Tarihi'), ks: bul('KS'),
  };
  for (const zorunlu of ['tarih', 'ist', 'tank'] as const) {
    if (K[zorunlu] < 0) throw new Error(`Zorunlu kolon bulunamadı: ${zorunlu}`);
  }
  const al = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);
  const metin = (r: unknown[], i: number) => String(al(r, i) ?? '').trim() || null;

  const out: HamSatir[] = [];
  for (const r of rows.slice(bi + 1)) {
    const t = al(r, K.tarih);
    if (t === null || t === undefined || t === '') continue;
    const gun = typeof t === 'number' ? excelGun(t) : String(t).split(/[ T]/)[0].split('.').reverse().join('-');
    const ist = String(al(r, K.ist) ?? '').trim();
    const tank = String(al(r, K.tank) ?? '').trim();
    if (!ist || !tank) continue;
    out.push({
      gun, istasyonKod: ist, tankNo: tank,
      urun: metin(r, K.urun), epdkKod: metin(r, K.epdk), istasyonAd: metin(r, K.ad),
      bolge: metin(r, K.bolge), mintika: metin(r, K.mintika),
      gunBasi: say(al(r, K.gb)), a1aGunBasi: say(al(r, K.aGb)),
      dolum: say(al(r, K.dol)), a1aDolum: say(al(r, K.aDol)),
      satis: say(al(r, K.sat)), a1aSatis: say(al(r, K.aSat)),
      gunSonu: say(al(r, K.gs)), a1aGunSonu: say(al(r, K.aGs)),
      kapasite: say(al(r, K.kap)),
      aciklama: metin(r, K.acik), duzenleyen: metin(r, K.duz),
      duzenlemeTarih: metin(r, K.duzT), kriterKs: metin(r, K.ks),
    });
  }
  return out;
}

/** Eşikleri sistem_ayar'dan oku (doküman 6: koda gömülmesin, ayarlanabilir olsun). */
async function esikleriOku(p: Pool): Promise<Esikler> {
  const r = await p.query(`SELECT anahtar, deger FROM sistem_ayar WHERE anahtar LIKE 'a1b.%'`);
  const m = new Map(r.rows.map((x) => [String(x.anahtar), Number(x.deger)]));
  const g = (k: string, v: number) => {
    const x = m.get(`a1b.${k}`);
    return Number.isFinite(x) ? (x as number) : v;
  };
  return {
    minSatis: g('minSatis', VARSAYILAN_ESIK.minSatis),
    ayniStok: g('ayniStok', VARSAYILAN_ESIK.ayniStok),
    kritikOran: g('kritikOran', VARSAYILAN_ESIK.kritikOran),
    yuksekOran: g('yuksekOran', VARSAYILAN_ESIK.yuksekOran),
    inceleOran: g('inceleOran', VARSAYILAN_ESIK.inceleOran),
    inceleFark: g('inceleFark', VARSAYILAN_ESIK.inceleFark),
    kapasiteTolerans: g('kapasiteTolerans', VARSAYILAN_ESIK.kapasiteTolerans),
  };
}

async function main() {
  const bugun = new Date();
  const dun = new Date(bugun.getTime() - 864e5);
  const bas = process.argv[2] || iso(dun);
  const bit = process.argv[3] || iso(bugun);

  const p = pool();
  const esik = await esikleriOku(p);
  const yol = await a1bIndir(bas, bit);
  const ham = a1bOku(yol);
  log(`A1b: ${ham.length} tank-gün kaydı`);
  if (!ham.length) {
    log('⚠ satır yok — POL o gün için veri vermemiş olabilir.');
    await kapat();
    return;
  }

  // Duplicate kontrolü (doküman 4.3) — sessizce toplamıyoruz, uyarıyoruz.
  const anahtar = new Set<string>();
  let cift = 0;
  for (const h of ham) {
    const k = `${h.gun}|${h.istasyonKod}|${h.tankNo}`;
    if (anahtar.has(k)) cift++;
    else anahtar.add(k);
  }
  if (cift) log(`⚠ DUPLICATE_INPUT: ${cift} tekrar eden kayıt (son kayıt geçerli olur)`);

  const sayac: Record<string, number> = {};
  for (const h of ham) {
    const s = degerlendir(h, esik);
    sayac[s.risk] = (sayac[s.risk] ?? 0) + 1;
    await p.query(
      `INSERT INTO a1b_gun (gun,istasyon_kod,tank_no,urun,epdk_kod,istasyon_ad,bolge,mintika,
         gun_basi,dolum,satis,gun_sonu,kapasite,beklenen_sonu,gercek_cikis,fark,yansimayan,
         kapasite_asim,risk,nedenler,aciklama,duzenleyen,duzenleme_tar,kriter_ks,esik_surum)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       ON CONFLICT (gun,istasyon_kod,tank_no) DO UPDATE SET
         urun=EXCLUDED.urun, epdk_kod=EXCLUDED.epdk_kod, istasyon_ad=EXCLUDED.istasyon_ad,
         bolge=EXCLUDED.bolge, mintika=EXCLUDED.mintika,
         gun_basi=EXCLUDED.gun_basi, dolum=EXCLUDED.dolum, satis=EXCLUDED.satis, gun_sonu=EXCLUDED.gun_sonu,
         kapasite=EXCLUDED.kapasite, beklenen_sonu=EXCLUDED.beklenen_sonu, gercek_cikis=EXCLUDED.gercek_cikis,
         fark=EXCLUDED.fark, yansimayan=EXCLUDED.yansimayan, kapasite_asim=EXCLUDED.kapasite_asim,
         risk=EXCLUDED.risk, nedenler=EXCLUDED.nedenler, aciklama=EXCLUDED.aciklama,
         duzenleyen=EXCLUDED.duzenleyen, duzenleme_tar=EXCLUDED.duzenleme_tar, kriter_ks=EXCLUDED.kriter_ks,
         esik_surum=EXCLUDED.esik_surum, guncelleme=now()`,
      [h.gun, h.istasyonKod, h.tankNo, h.urun, h.epdkKod, h.istasyonAd, h.bolge, h.mintika,
        s.gunBasi, s.dolum, s.satis, s.gunSonu, s.kapasite, s.beklenenSonu, s.gercekCikis, s.fark,
        s.yansimayan, s.kapasiteAsim, s.risk, s.nedenler, h.aciklama, h.duzenleyen, h.duzenlemeTarih,
        h.kriterKs, ESIK_SURUM],
    );
  }
  log('Risk dağılımı:', JSON.stringify(sayac));
  log('✔ a1b_gun güncellendi');
  await kapat();
}

main().catch(async (e) => {
  console.error('HATA:', e instanceof Error ? e.message : e);
  await kapat();
  process.exit(1);
});
