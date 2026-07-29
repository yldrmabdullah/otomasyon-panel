// Minimal .xlsx okuyucu — bağımlılık YOK (node:zlib + XML regex).
//
// NEDEN kütüphane değil: tek ihtiyacımız POL export'larını okumak. exceljs/xlsx
// paketleri ~5-10 MB ve serverless bundle'a giriyor; buradaki ~120 satır yeterli.
// (POL'ün ESKİ export'u SpreadsheetML/XML idi — araclar/polExcelImport.ts onu okur.
//  YENİ export'lar gerçek .xlsx = ZIP arşivi, bu modül onun için.)

import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const KACIS: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};
const xmlCoz = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => KACIS[m] ?? m);

/** ZIP arşivinden dosyaları çıkar (yalnız stored/deflate — xlsx bunları kullanır). */
function zipAc(buf: Buffer): Map<string, string> {
  const cikti = new Map<string, string>();
  // Merkezi dizin yerine yerel başlıkları tara: xlsx'te yeterli ve basit.
  let i = 0;
  while (i < buf.length - 4) {
    if (buf.readUInt32LE(i) !== 0x04034b50) { i++; continue; }  // "PK\x03\x04"
    const yontem = buf.readUInt16LE(i + 8);
    const sikBoy = buf.readUInt32LE(i + 18);
    const adBoy = buf.readUInt16LE(i + 26);
    const ekBoy = buf.readUInt16LE(i + 28);
    const ad = buf.subarray(i + 30, i + 30 + adBoy).toString('utf8');
    const veriBas = i + 30 + adBoy + ekBoy;
    if (sikBoy > 0 && veriBas + sikBoy <= buf.length) {
      const ham = buf.subarray(veriBas, veriBas + sikBoy);
      try {
        cikti.set(ad, yontem === 0 ? ham.toString('utf8') : inflateRawSync(ham).toString('utf8'));
      } catch { /* bozuk girdi → atla */ }
      i = veriBas + sikBoy;
    } else {
      i = veriBas;  // streaming (boyut 0) → merkezi dizin gerekir; xlsx'te görülmedi
    }
  }
  return cikti;
}

/** A1 → 0 tabanlı sütun indeksi. */
function sutunIndeksi(ref: string): number | null {
  const m = ref.match(/^([A-Z]+)\d+$/);
  if (!m) return null;
  let s = 0;
  for (const ch of m[1]) s = s * 26 + (ch.charCodeAt(0) - 64);
  return s - 1;
}

/**
 * .xlsx dosyasını satır dizisi olarak oku. Hücreler HAM string döner
 * (sayılar nokta ondalıklı — Number() ile çevir, TR binlik dönüşümü YAPMA).
 */
export async function xlsxOku(yol: string, sayfaNo = 1): Promise<string[][]> {
  const dosyalar = zipAc(await readFile(yol));

  // sharedStrings: hücreler t="s" ile buraya indeksler
  const ssXml = dosyalar.get('xl/sharedStrings.xml') ?? '';
  const paylasilan = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    // Zengin metin <r><t> parçalarına bölünmüş olabilir → hepsini birleştir
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlCoz(t[1])).join(''),
  );

  const sayfaXml = dosyalar.get(`xl/worksheets/sheet${sayfaNo}.xml`);
  if (!sayfaXml) throw new Error(`sheet${sayfaNo} bulunamadı (${yol})`);

  const satirlar: string[][] = [];
  for (const r of sayfaXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const hucreler: string[] = [];
    for (const c of r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g)) {
      const nitelik = c[1] ?? c[3] ?? '';
      const govde = c[2] ?? '';
      const tip = nitelik.match(/t="(\w+)"/)?.[1];
      const v = govde.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = govde.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1];

      let deger = '';
      if (tip === 's' && v !== undefined) deger = paylasilan[Number(v)] ?? '';
      else if (tip === 'inlineStr' && inline !== undefined) deger = xmlCoz(inline);
      else if (v !== undefined) deger = xmlCoz(v);

      const ref = nitelik.match(/r="([A-Z]+\d+)"/)?.[1];
      const ix = ref ? sutunIndeksi(ref) : null;
      if (ix !== null && ix >= 0) hucreler[ix] = deger;
      else hucreler.push(deger);
    }
    satirlar.push(hucreler);
  }
  return satirlar;
}

/** Excel serial tarih → Date. 46228 = 25.07.2026. Temel: 1899-12-30 (Excel'in 1900 hatası dahil). */
export function excelTarih(serial: string | number | undefined): Date | null {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Gün + gün-içi kesir. UTC olarak kur (POL tarihleri gün bazlı).
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
}

/** Hücreyi sayıya çevir. ⚠️ TR binlik/ondalık dönüşümü YAPILMAZ — xlsx ham nokta
 *  ondalık tutar. (İlk denemede '14991.21' binlik sanılıp 12 milyon çıkmıştı.) */
export function sayi(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Başlık satırını bul (ilk hücresi verilen metinle başlayan satır). */
export function baslikSatiri(satirlar: string[][], ilkHucre: string): number {
  return satirlar.findIndex((r) => (r?.[0] ?? '').trim() === ilkHucre);
}
