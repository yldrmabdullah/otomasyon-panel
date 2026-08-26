// EPDK Sektör Raporu → HACİM bazlı pazar payı çekimi.
//
// NEDEN: panelin pazar payı bayi ADEDİ oranıydı; kullanıcı motorin/benzin SATIŞ
// HACMİ bazlı istedi. Hacim verisi EPDK web servislerinde YOK (lisans uçları kütük
// verisi, fiyat ucu firma kırılımı kabul etmiyor, bildirim* uçları "Sorgu Yetkisi Yok").
// Tek public kaynak: aylık sektör raporunun Excel eki.
//
// Tam keşif + tuzaklar: docs/bilgi/epdk-sektor-raporu-hacim.md
//
// ⚠️ İKİ FARKLI BİÇİM (yıla göre): 2026+ "Tablo N" sheet'leri, 2025- il-başına-sheet.
//    İkisi de destekli; biçim otomatik saptanır ve koşu tablosuna yazılır.
// ⚠️ Rapor KÜMÜLATİF (Ocak–ilgili ay). Tek ay farkı panelde/sorguda alınır.
// ⚠️ Ay↔dosya ID eşlemesi GÖMÜLMEZ — dizin sayfası her koşuda ayrıştırılır.
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/hacimCek.ts              (en yeni dönem)
//   node --env-file=.env --import tsx araclar/hacimCek.ts 2026         (2026'nın tüm ayları)
//   node --env-file=.env --import tsx araclar/hacimCek.ts 2026 6       (belirli dönem)
//   node --env-file=.env --import tsx araclar/hacimCek.ts --tumu       (dizindeki tüm Excel'ler)

import XLSX from 'xlsx';
import { hacimDagiticiKaydet, hacimIlKaydet, hacimKosuKaydet, kapat } from '../core/db.js';

const DIZIN = 'https://www.epdk.gov.tr/Detay/Icerik/3-0-104/petrolaylik-sektor-raporu';
const INDIR = 'https://www.epdk.gov.tr/Detay/DownloadDocument?id=';

const AYLAR = ['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık'];

export interface RaporRef { yil: number; ay: number; id: string; baslik: string }

/** Türkçe küçültme — büyük İ/I ayrımı için (toLowerCase 'İ'yi 'i̇' yapıyor). */
function kucult(s: string): string {
  return s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

/**
 * HTML varlıklarını çöz (`Eyl&#252;l` → `Eylül`).
 *
 * ⚠️ TUZAK (2026-08-26, canlı yakalandı): EPDK dizin sayfası UTF-8 ama başlıklardaki
 * Türkçe karakterlerin BİR KISMINI sayısal varlık olarak gönderiyor —
 * `Eyl&#252;l`, `Sekt&#246;r`. Çözülmediğinde ay adı eşleşmiyor ve o ay SESSİZCE
 * atlanıyordu: Eylül 2025 eki mevcut olduğu halde listede çıkmıyordu (20 yerine 21 ay).
 * Yalnız 'ü/ö' içeren aylar etkileniyordu, bu yüzden fark edilmesi zor.
 */
function varlikCoz(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

/**
 * Dizin sayfasından (yıl, ay) → Excel doküman ID haritası.
 *
 * ⚠️ Sayfa iç içe ACCORDION (`<li class="accordion-pop">`), tablo DEĞİL — `<tr>` ile
 *    ayrıştırma tek satır döndürür (denendi).
 * ⚠️ Biçim ikonundan ayırt edilir: linkten hemen sonra `/Content/img/excel.png`.
 *    PDF/Word linkleri de aynı DownloadDocument yolunu kullanıyor.
 */
export async function raporListesi(): Promise<RaporRef[]> {
  const r = await fetch(DIZIN);
  if (!r.ok) throw new Error(`EPDK dizin sayfası HTTP ${r.status}`);
  const html = await r.text();

  const cikti: RaporRef[] = [];
  for (const blok of html.split('<li class="accordion-pop">').slice(1)) {
    // Başlık: "2026 Yılı Petrol Piyasası Haziran Ayı Sektör Raporu"
    const bas = /ShowDetailList\(this\);">[\s\S]*?<\/i>([\s\S]*?)&nbsp;/.exec(blok);
    if (!bas) continue;
    const baslik = varlikCoz(bas[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

    const yil = /(20\d{2})\s*Y[ıi]l/i.exec(baslik)?.[1];
    if (!yil) continue;
    const bk = kucult(baslik);
    const ayIdx = AYLAR.findIndex((a) => bk.includes(kucult(a)));
    if (ayIdx < 0) continue; // çeyreklik/yıllık özetler — ay bazlı değil, atla

    // Link + hemen ardındaki biçim ikonu.
    const link = /href="\/Detay\/DownloadDocument\?id=([^"]+)"[^>]*>\s*<img src =.([^.]*)\.png/g;
    let m: RegExpExecArray | null;
    while ((m = link.exec(blok))) {
      if (!m[2].endsWith('excel')) continue;
      cikti.push({ yil: Number(yil), ay: ayIdx + 1, id: m[1], baslik });
      break; // ilk Excel yeter
    }
  }
  // En yeni önce.
  return cikti.sort((a, b) => b.yil - a.yil || b.ay - a.ay);
}

/** Ünvan normalize — eşleşmeyen ünvan sessizce kaybolmasın diye tek noktadan geçer. */
function unvan(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function sayi(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Ara toplam / başlık satırlarını ayıkla (veri değil). */
function veriSatiriMi(u: string): boolean {
  if (!u) return false;
  const k = kucult(u);
  return !k.includes('toplam') && !k.includes('unvan') && !k.includes('ünvan') && !k.includes('genel');
}

/** Başlık satırında kolon adıyla indeks bul — kolon SAYISI benzin/motorinde farklı. */
function kolonBul(basliklar: unknown[], ...adaylar: string[]): number {
  for (let i = 0; i < basliklar.length; i++) {
    const h = kucult(String(basliklar[i] ?? ''));
    if (adaylar.some((a) => h.includes(kucult(a)))) return i;
  }
  return -1;
}

export interface DagiticiSatir {
  unvan: string; urunGrubu: 'benzin' | 'motorin';
  istasyon: number | null; koy: number | null; tarim: number | null;
  dis: number | null; toplam: number; pay: number | null;
}
export interface IlSatir {
  il: string; unvan: string;
  benzin: number | null; motorin: number | null; toplam: number | null;
}

/** Biçim A (2026+): Tablo 17 = benzin, Tablo 18 = motorin. */
function tabloDagitici(wb: XLSX.WorkBook): DagiticiSatir[] {
  const cikti: DagiticiSatir[] = [];
  for (const [sheet, grup] of [['Tablo 17', 'benzin'], ['Tablo 18', 'motorin']] as const) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    // Başlık satırı: "Toplam Satış" kolonu içeren ilk satır.
    //
    // ⚠️ TUZAK (2026-08-26, canlı yakalandı): önce ilk kolondaki "Lisans" kelimesiyle
    // aranıyordu ama EPDK **Tablo 17'de ünvan başlığını "Lisanas Sahibinin Unvanı"
    // diye YAZIM HATASIYLA** gönderiyor (Tablo 18'de doğru: "Lisans Sahibinin Ünvanı").
    // Sonuç: benzin tablosu SESSİZCE 0 satır dönüyordu — hata yok, yalnız motorin geldi.
    // Ayrıca "Unvanı"/"Ünvanı" yazımı da iki tabloda farklı. Bu yüzden başlık, EPDK'nın
    // tutarlı yazdığı VERİ kolonundan (`Toplam Satış`) saptanıyor.
    const bIdx = rows.findIndex((r) => r.some((c) => kucult(String(c ?? '')).includes('toplam satış')));
    if (bIdx < 0) continue;
    const h = rows[bIdx];
    const kIst = kolonBul(h, 'İstasyon Pompa');
    const kKoy = kolonBul(h, 'Köy Pompa');
    const kTar = kolonBul(h, 'Tarımsal');
    const kDis = kolonBul(h, 'Dış Satış');
    const kTop = kolonBul(h, 'Toplam Satış');
    const kPay = kolonBul(h, 'Pazar Payı', 'Pay (%)');

    for (const r of rows.slice(bIdx + 1)) {
      const u = unvan(r[0]);
      if (!veriSatiriMi(u)) continue;
      const toplam = sayi(r[kTop]);
      if (toplam == null) continue;
      cikti.push({
        unvan: u, urunGrubu: grup,
        istasyon: kIst < 0 ? null : sayi(r[kIst]),
        koy: kKoy < 0 ? null : sayi(r[kKoy]),
        tarim: kTar < 0 ? null : sayi(r[kTar]),
        dis: kDis < 0 ? null : sayi(r[kDis]),
        toplam,
        pay: kPay < 0 ? null : sayi(r[kPay]),
      });
    }
  }
  return cikti;
}

/** Biçim A (2026+): Tablo 24 = il × şirket × ürün (TON). İL kolonu birleşik → forward-fill. */
function tabloIl(wb: XLSX.WorkBook): IlSatir[] {
  const ws = wb.Sheets['Tablo 24'];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  const bIdx = rows.findIndex((r) => kucult(String(r[0] ?? '')) === 'il');
  if (bIdx < 0) return [];
  const h = rows[bIdx];
  const kBen = kolonBul(h, 'Benzin');
  const kMot = kolonBul(h, 'Motorin');
  const kTop = kolonBul(h, 'Toplam');

  const cikti: IlSatir[] = [];
  let il = '';
  for (const r of rows.slice(bIdx + 1)) {
    const c0 = unvan(r[0]);
    if (c0) il = c0;                       // ⚠️ forward-fill: birleşik hücre
    const u = unvan(r[1]);
    if (!veriSatiriMi(u) || !veriSatiriMi(il)) continue;
    cikti.push({
      il, unvan: u,
      benzin: kBen < 0 ? null : sayi(r[kBen]),
      motorin: kMot < 0 ? null : sayi(r[kMot]),
      toplam: kTop < 0 ? null : sayi(r[kTop]),
    });
  }
  return cikti;
}

/**
 * Biçim B (2025-): her il bir sheet. İKİ SATIRLI başlık — r2 ürün grubu, r3 teslim tipi.
 * Ürün grubu başlığı yalnız grubun İLK kolonunda dolu → forward-fill ile kolon→grup haritası.
 * Pazar payı yüzdesi YOK (dağıtıcı tablosu da yok) — yalnız il kırılımı döner.
 */
function ilSheetIl(wb: XLSX.WorkBook): IlSatir[] {
  const cikti: IlSatir[] = [];
  for (const ad of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[ad], { header: 1, blankrows: false });
    const bIdx = rows.findIndex((r) => kucult(String(r[0] ?? '')) === 'il');
    if (bIdx < 1) continue;

    // Ürün grubu satırı (başlığın bir üstü) → kolon indeksi → grup adı, forward-fill.
    const grupSatir = rows[bIdx - 1] ?? [];
    const grupCol: string[] = [];
    let son = '';
    for (let i = 0; i < Math.max(grupSatir.length, (rows[bIdx] ?? []).length); i++) {
      const g = unvan(grupSatir[i]);
      if (g) son = g;
      grupCol[i] = son;
    }
    const h = rows[bIdx];
    const kTop = kolonBul(h, 'Toplam');

    // "Bayiye Teslim" kolonları grup grup toplanır (bayi satışı = bizim ilgi alanı).
    const benzinCols: number[] = [];
    const motorinCols: number[] = [];
    for (let i = 0; i < h.length; i++) {
      const grup = kucult(grupCol[i] ?? '');
      const tip = kucult(String(h[i] ?? ''));
      if (!tip.includes('teslim')) continue;
      if (grup.includes('benzin')) benzinCols.push(i);
      else if (grup.includes('motorin')) motorinCols.push(i);
    }

    let il = '';
    for (const r of rows.slice(bIdx + 1)) {
      const c0 = unvan(r[0]);
      if (c0) il = c0;
      const u = unvan(r[1]);
      const ilAd = il || ad;                 // sheet adı ilin kendisi (yedek)
      if (!veriSatiriMi(u) || !veriSatiriMi(ilAd)) continue;
      const topla = (cols: number[]) => {
        const v = cols.map((c) => sayi(r[c])).filter((x): x is number => x != null);
        return v.length ? v.reduce((a, b) => a + b, 0) : null;
      };
      cikti.push({
        il: ilAd, unvan: u,
        benzin: topla(benzinCols),
        motorin: topla(motorinCols),
        toplam: kTop < 0 ? null : sayi(r[kTop]),
      });
    }
  }
  return cikti;
}

/** Bir dönemi indir + ayrıştır + kaydet. */
export async function donemCek(ref: RaporRef): Promise<void> {
  const etiket = `${ref.yil}-${String(ref.ay).padStart(2, '0')}`;
  try {
    const r = await fetch(INDIR + encodeURIComponent(ref.id));
    if (!r.ok) throw new Error(`indirme HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Biçim saptama: "Tablo *" sheet'i varsa A, yoksa B.
    const tabloVar = wb.SheetNames.some((n) => /^Tablo/i.test(n));
    const bicim = tabloVar ? 'tablo' : 'il_sheet';

    const dag = tabloVar ? tabloDagitici(wb) : [];
    const iller = tabloVar ? tabloIl(wb) : ilSheetIl(wb);

    // ⚠️ Aralık 2025 eki tek sheet (ADANA) ile geldi — bozuk yayın. Sessizce
    // "0 satır başarılı" demek yerine uyar; kısmi veri de kaydedilir.
    if (!dag.length && !iller.length) throw new Error(`veri yok (${wb.SheetNames.length} sheet, biçim ${bicim})`);

    if (dag.length) await hacimDagiticiKaydet(ref.yil, ref.ay, ref.baslik, dag);
    // 2026 Tablo 24 tek AY, 2025 il-sheet biçimi de tek AY → kumulatif=false.
    if (iller.length) await hacimIlKaydet(ref.yil, ref.ay, false, iller);
    await hacimKosuKaydet(ref.yil, ref.ay, bicim, dag.length, iller.length, buf.length, null);

    // Kendi satırımız görünüyor mu — ünvan eşlemesi sessizce koparsa burada belli olur.
    // il_sheet biçiminde dağıtıcı tablosu YOK (o yayında yalnız il kırılımı var), o yüzden
    // orada il satırlarına bakılır; "dağıtıcı 0" tek başına hata değil.
    const bizDag = dag.filter((d) => kucult(d.unvan).includes('turgut'));
    const bizIl = iller.filter((x) => kucult(x.unvan).includes('turgut'));
    const bizNot = bizDag.length
      ? ` · BİZ: ${bizDag.map((b) => `${b.urunGrubu} %${b.pay?.toFixed(3) ?? '?'}`).join(', ')}`
      : bizIl.length
        ? ` · BİZ: ${bizIl.length} il (dağıtıcı tablosu bu biçimde yok)`
        : ' · ⚠️ TURGUT satırı HİÇ yok (ünvan eşlemesi kopmuş olabilir)';
    console.log(`✔ ${etiket} [${bicim}] dağıtıcı ${dag.length} · il ${iller.length} satır${bizNot}`);
  } catch (e: any) {
    const mesaj = e?.message ?? String(e);
    console.error(`✖ ${etiket}: ${mesaj}`);
    await hacimKosuKaydet(ref.yil, ref.ay, '?', 0, 0, null, mesaj);
  }
}

async function main() {
  const arg = process.argv.slice(2);
  const liste = await raporListesi();
  if (!liste.length) throw new Error('EPDK dizin sayfasından hiç Excel eki ayrıştırılamadı (sayfa yapısı değişmiş olabilir)');
  console.log(`Dizinde ${liste.length} aylık Excel eki bulundu (en yeni: ${liste[0].yil}-${liste[0].ay}).`);

  let hedef: RaporRef[];
  if (arg[0] === '--tumu') hedef = liste;
  else if (arg[0] && arg[1]) hedef = liste.filter((x) => x.yil === Number(arg[0]) && x.ay === Number(arg[1]));
  else if (arg[0]) hedef = liste.filter((x) => x.yil === Number(arg[0]));
  else hedef = [liste[0]];

  if (!hedef.length) throw new Error(`İstenen dönem dizinde yok (${arg.join(' ')})`);
  for (const ref of hedef) await donemCek(ref);
  await kapat();
}

// Doğrudan çalıştırıldıysa main; import edilirse yalnız fonksiyonlar.
if (process.argv[1]?.includes('hacimCek')) {
  main().catch(async (e) => {
    console.error('Hacim çekim hatası:', e);
    await kapat();
    process.exit(1);
  });
}
