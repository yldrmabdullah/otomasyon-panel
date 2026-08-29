// İstasyon Günlük Ürün Analizi (POL) — bir tarih aralığı için indir, Postgres'e yaz.
//
// KAYNAK: OtomasyonModulu/UrunRaporlari/IstasyonAnaliz.aspx  (bkz. docs/bilgi/pol-harita.md)
//   Kolonlar (10): Satış Bitiş · ERP Kod · EPDK Kodu · İst. Kod · İstasyon Adı · Ürün ·
//                  Litre · Tutar · Adet · Marka
//   İndirme: "tek tık" — FA excel ikonu (i.fa-file-new_excel_2019). Raporla butonu da
//   yedek olarak denenir (a1bCek.mts ile aynı desen; haritada "tek tık" yazan bazı
//   sayfalarda buton da gerekebiliyor).
//   Tarih filtresi: dtpSatisBaslama_Date1 / _Date2  (⚠️ dtpTarih DEĞİL — bu sayfada
//   filtre adı farklı, haritadaki filtre listesinden alındı.)
//
// NE İŞE YARAR: istasyon × ürün × gün bazında GERÇEKLEŞEN pompa satışı (litre + tutar +
// fiş adedi). Bayi alım verisiyle (satis_fatura) birleştirilince "ne kadar aldı / ne kadar
// sattı" karşılaştırması yapılabilir; ayrıca istasyon performans takibi.
//
// Bu sistem SALT-OKUMA: POL'e hiçbir şey yazılmaz.
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/urunAnalizCek.ts [bas] [bit]
//   (YYYY-MM-DD; boş bırakılırsa DÜN — günlük cron için doğru varsayılan)

import { chromium, type Download } from 'playwright';
import XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pool, kapat } from '../core/db.js';
import { config } from '../core/config.js';

/** Ortam değişkeni oku — BOŞ STRING de "yok" sayılır (fiyatKiyas.mts tuzağı, 2026-08-13). */
const cevre = (ad: string, varsayilan: string): string => {
  const v = process.env[ad];
  return v && v.trim() ? v.trim() : varsayilan;
};

const BASE = cevre('POL_URL', 'https://pol.parkoil.tr/POL/').replace(/\/$/, '') + '/';
const POL_KADI = process.env.POL_KULLANICI ?? '';
const POL_SIFRE = process.env.POL_SIFRE ?? '';
const IND_DIR = join(tmpdir(), 'urunanaliz-indir');
mkdirSync(IND_DIR, { recursive: true });

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** ISO (YYYY-MM-DD) → POL'ün beklediği D/MM/YYYY. */
const trTarih = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}/${m}/${y}`;
};

/** Bir günü ISO'ya çevirir (Europe/Istanbul) — POL tarihleri TR yerel saatte. */
function trGun(gunFarki = 0): string {
  const now = new Date();
  const tr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  tr.setDate(tr.getDate() + gunFarki);
  return `${tr.getFullYear()}-${String(tr.getMonth() + 1).padStart(2, '0')}-${String(tr.getDate()).padStart(2, '0')}`;
}

/** Sayısal dönüşüm — '', '-', NaN → null. SIFIR KORUNUR (gerçek 0 satış anlamlı). */
function say(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '-') return null;
  const n = typeof v === 'number' ? v : Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const metin = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

// ───────────────────────── İNDİRME ─────────────────────────

async function indir(bas: string, bit: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const p = await ctx.newPage();
  try {
    log('POL giriş…');
    await p.goto(BASE + 'login.aspx', { waitUntil: 'domcontentloaded', timeout: 40000 });

    // Saf-HTTP giriş (CAPTCHA/2FA yok) — diğer POL araçlarıyla BİREBİR aynı akış.
    const g = await p.evaluate(async (k: { u: string; p: string }) => {
      const r = await fetch(`Sistem/AjaxResponder.aspx?Command=CheckLogin&uniqueKey=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
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
    }, { u: POL_KADI, p: POL_SIFRE });
    if (!g.ok) throw new Error(`POL giriş reddedildi: error=${g.err}`);
    await p.waitForURL((u) => /DefaultDagitici|Ana/i.test(u.toString()), { timeout: 30000 });
    log('  giriş OK');

    await p.goto(BASE + 'OtomasyonModulu/UrunRaporlari/IstasyonAnaliz.aspx', {
      waitUntil: 'networkidle', timeout: 45000,
    });
    await p.waitForTimeout(2500);

    // ⚠️ Bu sayfada tarih filtresi "dtpSatisBaslama" (A1b'deki "dtpTarih" DEĞİL).
    log(`Tarih: ${trTarih(bas)} – ${trTarih(bit)}`);
    const yazildi = await p.evaluate((t: { b: string; e: string }) => {
      const d1 = document.querySelector('[id*="dtpSatisBaslama_Date1"]') as HTMLInputElement | null;
      const d2 = document.querySelector('[id*="dtpSatisBaslama_Date2"]') as HTMLInputElement | null;
      if (d1) { d1.value = t.b; d1.dispatchEvent(new Event('change', { bubbles: true })); }
      if (d2) { d2.value = t.e; d2.dispatchEvent(new Event('change', { bubbles: true })); }
      return { d1: !!d1, d2: !!d2 };
    }, { b: trTarih(bas), e: trTarih(bit) });
    // Filtre alanı bulunamazsa SESSİZ GEÇME: rapor tüm tarihleri indirir ve veri yanlış olur.
    if (!yazildi.d1 || !yazildi.d2)
      throw new Error(`Tarih filtresi bulunamadı (Date1=${yazildi.d1} Date2=${yazildi.d2}) — sayfa değişmiş olabilir, pol-harita.md güncellenmeli`);
    await p.waitForTimeout(900);

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
    const yol = `${IND_DIR}/urunanaliz-${bas}_${bit}.xlsx`;
    await dl.saveAs(yol);
    log('  indirildi:', dl.suggestedFilename());
    return yol;
  } finally {
    await browser.close();
  }
}

// ───────────────────────── OKUMA ─────────────────────────

export type UrunAnalizSatir = {
  tarih: string | null;
  erpKod: string | null;
  epdkKod: string | null;
  istKod: string | null;
  istasyonAd: string | null;
  urun: string | null;
  litre: number | null;
  tutar: number | null;
  adet: number | null;
  marka: string | null;
};

/** Excel serial ya da metin tarihi → ISO (YYYY-MM-DD). Saat kısmı ATILIR (günlük rapor). */
function tarihCoz(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    // Excel serial: 1899-12-30 epoch (XLSX raw:true bunu sayı verir).
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // "31.08.2026 23:59:59" / "31/08/2026" → ISO
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

/**
 * Excel'i oku — kolonlar BAŞLIK ADIYLA bulunur, harf/indeks sabitlenmez.
 * (Proje kuralı: "yalnızca kolon harfine bağımlı kod yazılmamalıdır" — POL kolon
 * sırasını değiştirdiğinde sessizce yanlış veri yazmayalım.)
 */
export function urunAnalizOku(yol: string): UrunAnalizSatir[] {
  const wb = XLSX.readFile(yol);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1, raw: true,
  });

  // Gerçek başlık satırı: "Ürün" VE ("Litre" ya da "Miktar") içeren ilk satır.
  // Üstte rapor başlığı/logo satırları var (POL raporlarının ortak deseni).
  let bi = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = (rows[i] ?? []).map((c) => String(c ?? '').toLocaleLowerCase('tr'));
    if (h.some((c) => c.includes('ürün')) && h.some((c) => c.includes('litre') || c.includes('miktar'))) {
      bi = i; break;
    }
  }
  if (bi < 0) throw new Error('Başlık satırı bulunamadı (Ürün + Litre/Miktar) — rapor biçimi değişmiş olabilir');

  const baslik = (rows[bi] ?? []).map((c) => String(c ?? '').trim().toLocaleLowerCase('tr'));
  const bul = (...adaylar: string[]): number => {
    for (const a of adaylar) {
      const i = baslik.findIndex((h) => h === a || h.includes(a));
      if (i >= 0) return i;
    }
    return -1;
  };

  const kTarih = bul('satış bitiş', 'satis bitis', 'tarih');
  const kErp = bul('erp kod');
  const kEpdk = bul('epdk kodu', 'epdk');
  const kIstKod = bul('i̇st. kod', 'ist. kod', 'ist kod', 'istasyon kod');
  const kIstAd = bul('i̇stasyon adı', 'istasyon adı', 'istasyon adi');
  const kUrun = bul('ürün');
  const kLitre = bul('litre', 'miktar');
  const kTutar = bul('tutar');
  const kAdet = bul('adet');
  const kMarka = bul('marka');

  // EPDK kodu bu verinin bayiye bağlanma ANAHTARI (bkz. CLAUDE.md eşleme kuralı).
  // Yoksa satırlar bayiyle eşlenemez → sessizce yazmak yerine erken patla.
  if (kUrun < 0 || kLitre < 0) throw new Error('Zorunlu kolon yok (Ürün/Litre)');

  const cikti: UrunAnalizSatir[] = [];
  for (let i = bi + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const urun = metin(r[kUrun]);
    if (!urun) continue; // boş/toplam satırı
    // "TOPLAM" gibi özet satırlarını atla (POL raporları sonda toplam veriyor).
    if (/^topla/i.test(urun)) continue;

    cikti.push({
      tarih: kTarih >= 0 ? tarihCoz(r[kTarih]) : null,
      erpKod: kErp >= 0 ? metin(r[kErp]) : null,
      epdkKod: kEpdk >= 0 ? metin(r[kEpdk]) : null,
      istKod: kIstKod >= 0 ? metin(r[kIstKod]) : null,
      istasyonAd: kIstAd >= 0 ? metin(r[kIstAd]) : null,
      urun,
      litre: say(r[kLitre]),
      tutar: kTutar >= 0 ? say(r[kTutar]) : null,
      adet: kAdet >= 0 ? say(r[kAdet]) : null,
      marka: kMarka >= 0 ? metin(r[kMarka]) : null,
    });
  }
  return cikti;
}

// ───────────────────────── YAZMA ─────────────────────────

async function yaz(satirlar: UrunAnalizSatir[], bas: string, bit: string): Promise<number> {
  if (satirlar.length === 0) return 0;

  const p = pool();

  // Aynı aralık tekrar çekilirse ÇİFTLEMESİN: önce o aralığı sil, sonra yaz.
  // (Cron her gün dünü çeker; elle yeniden çalıştırma da idempotent olmalı.)
  await p.query('DELETE FROM istasyon_urun_analiz WHERE tarih BETWEEN $1 AND $2', [bas, bit]);

  // Tek INSERT yerine parçalı: 10 kolon × binlerce satır Postgres parametre sınırını aşabilir.
  const PARCA = 500;
  let yazilan = 0;
  for (let i = 0; i < satirlar.length; i += PARCA) {
    const dilim = satirlar.slice(i, i + PARCA);
    const d: unknown[] = [];
    const pl: string[] = [];
    dilim.forEach((s, j) => {
      const o = j * 10;
      pl.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10})`);
      d.push(s.tarih, s.erpKod, s.epdkKod, s.istKod, s.istasyonAd, s.urun, s.litre, s.tutar, s.adet, s.marka);
    });
    await p.query(
      `INSERT INTO istasyon_urun_analiz
         (tarih, erp_kod, epdk_kod, ist_kod, istasyon_ad, urun, litre, tutar, adet, marka)
       VALUES ${pl.join(',')}`,
      d,
    );
    yazilan += dilim.length;
  }
  return yazilan;
}

// ───────────────────────── ANA ─────────────────────────

/**
 * Portala (BFF) gönder — İstasyon ekranındaki "Satış" sekmesi bu veriyi gösterir.
 *
 * NEDEN BFF ÇEKMİYOR DA BİZ GÖNDERİYORUZ (2026-08-29 ölçümü): POL saf-HTTP oturum VERMİYOR.
 * login.aspx + CheckLogin (error=0) başarılı olsa bile rapor sayfası 302 ile Giris.aspx'e,
 * oradan tekrar login.aspx'e atıyor → Excel için gerçek tarayıcı şart. BFF ise IIS'te x86
 * self-contained koşuyor (Logo COM) ve oraya Chromium konulmadı. Biz zaten Playwright'lıyız.
 *
 * BFF ucu İDEMPOTENT (bayi+gün+istasyon+ürün benzersiz) → 3 günlük telafi penceresiyle
 * aynı günü tekrar göndermek çiftlemez, üzerine yazar.
 *
 * BFF yapılandırılmamışsa SESSİZ GEÇİLİR (yerel çalıştırmada BFF gerekmesin) ama
 * uyarı basılır — canlı cron'da eksik ayar fark edilsin.
 */
async function bffeGonder(satirlar: UrunAnalizSatir[]): Promise<void> {
  if (satirlar.length === 0) return;
  if (!config.bff.gecerli) {
    log('  ⚠️ BFF yapılandırılmamış (BFF_URL / BFF_API_KEY) — portala GÖNDERİLMEDİ');
    return;
  }

  const govde = {
    satirlar: satirlar.map((s) => ({
      tarih: s.tarih,
      epdkKod: s.epdkKod,
      istasyonKod: s.istKod,
      urunKod: s.urun,
      litre: s.litre,
      tutar: s.tutar,
      adet: s.adet,
    })),
  };

  const url = config.bff.url.replace(/\/$/, '') + '/dis/v1/otomasyon/gunluk-satis';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.bff.apiKey },
    body: JSON.stringify(govde),
  });
  const metin = await r.text();
  if (!r.ok) throw new Error(`BFF ${r.status}: ${metin.slice(0, 300)}`);

  const y = JSON.parse(metin) as {
    eklenen?: number; guncellenen?: number; eslesmeyenSatir?: number; eslesmeyenOrnek?: string[];
  };
  log(`  portala yazıldı: ${y.eklenen ?? 0} yeni, ${y.guncellenen ?? 0} güncel`);
  // Eşleşmeyen satır SESSİZ GEÇİLMEZ: EPDK kodu eksik bayi varsa fark edilmeli
  // (canlıda 212 aktif bayinin 204'ünde kod var → 8 bayi kodsuz).
  if (y.eslesmeyenSatir) {
    log(`  ⚠️ ${y.eslesmeyenSatir} satır bayiyle EŞLEŞMEDİ (EPDK kodu eksik olabilir)`);
    if (y.eslesmeyenOrnek?.length) log(`     örnek: ${y.eslesmeyenOrnek.slice(0, 5).join(', ')}`);
  }
}

async function ana(): Promise<void> {
  // VARSAYILAN: DÜN → BUGÜN. Eskiden yalnız dündü ve BUGÜNÜN satışı hiç gelmiyordu
  // (kullanıcı bildirdi 2026-08-29: POL'de 29.08 satırları var, portalda yok).
  // POL gün içi veriyi de veriyor; bugünü de çekmek "şu ana kadarki satış"ı gösterir.
  const bas = process.argv[2] || trGun(-1);
  const bit = process.argv[3] || trGun(0);

  if (!POL_KADI || !POL_SIFRE) throw new Error('POL_KULLANICI / POL_SIFRE tanımlı değil (.env)');

  log(`İstasyon Günlük Ürün Analizi: ${bas} → ${bit}`);
  const yol = await indir(bas, bit);
  const satirlar = urunAnalizOku(yol);
  log(`  okunan satır: ${satirlar.length}`);

  if (satirlar.length === 0) {
    log('  ⚠️ satır YOK — o tarihte veri olmayabilir ya da filtre çalışmamış olabilir');
  } else {
    const litre = satirlar.reduce((t, s) => t + (s.litre ?? 0), 0);
    const istasyon = new Set(satirlar.map((s) => s.epdkKod ?? s.istKod)).size;
    const urun = new Set(satirlar.map((s) => s.urun)).size;
    log(`  ${istasyon} istasyon · ${urun} ürün · ${litre.toLocaleString('tr-TR')} litre`);
  }

  const yazilan = await yaz(satirlar, bas, bit);
  log(`  panel DB'ye yazılan: ${yazilan}`);

  // Portal (BFF) — İstasyon ekranı "Satış" sekmesi. Hatası panel yazımını GERİ ALMAZ:
  // veri panelde durur, sonraki koşuda portala tekrar denenir.
  try {
    await bffeGonder(satirlar);
  } catch (e) {
    log(`  ⚠️ portala gönderim başarısız: ${e instanceof Error ? e.message : e}`);
  }

  await kapat();
}

ana().catch(async (e) => {
  console.error('HATA:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
