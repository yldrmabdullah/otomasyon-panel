/* Tablo dışa aktarma — CSV (Excel uyumlu) ve yazdırma/PDF.
 *
 * NEDEN KÜTÜPHANE YOK: xlsx/exceljs paketleri 200-900 KB. Excel `.csv`'yi zaten
 * açıyor; PDF için tarayıcının kendi yazdırma diyaloğu ("PDF olarak kaydet") var.
 * Panelin "dış bağımlılık yok" ilkesi korunuyor, bundle büyümüyor.
 *
 * ⚠️ TÜRKÇE EXCEL TUZAKLARI (ikisi de burada çözülü):
 *  1) AYIRICI: Türkçe Windows'ta Excel'in liste ayırıcısı NOKTALI VİRGÜL. Virgülle
 *     yazılan CSV tek sütuna düşer. `;` kullanılır.
 *  2) BOM: UTF-8 BOM olmadan Excel dosyayı ANSI sanıp Türkçe karakterleri bozuyor
 *     (İSTASYON → Ä°STASYON). Dosya `﻿` ile başlar.
 *  3) ONDALIK: TR yerelinde ondalık ayırıcı virgül. `toLocaleString('tr')` çıktısı
 *     ("1.234,5") Excel'de doğru okunur; ham nokta ("1234.5") metin olarak kalır.
 *     Bu yüzden hücrenin EKRANDA görünen metni aktarılır, ham değer değil.
 */

/** Bir CSV alanını güvenli hale getir.
 *  Tırnak, ayırıcı, satır sonu içeren alan tırnaklanır; içteki tırnak ikilenir. */
function alan(deger: string): string {
  const s = deger.replace(/\r?\n/g, ' ').trim();
  // ⚠️ FORMÜL ENJEKSİYONU: = + - @ ile başlayan hücreyi Excel FORMÜL sanar.
  // Bayi adı "=SUM(...)" gibi bir şeyle başlasa (ya da kötü niyetle yazılsa)
  // Excel onu çalıştırmaya kalkar. Başına tek tırnak konarak metin olduğu
  // sabitlenir — bu CSV enjeksiyonuna karşı standart korumadır.
  const guvenli = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(guvenli) ? `"${guvenli.replace(/"/g, '""')}"` : guvenli;
}

/** Satırları CSV metnine çevir (BOM + noktalı virgül). */
export function csvMetni(basliklar: string[], satirlar: string[][]): string {
  const govde = [basliklar, ...satirlar].map((s) => s.map(alan).join(';')).join('\r\n');
  return `﻿${govde}`;
}

/** Dosya adı için güvenli slug + tarih damgası. */
function dosyaAdi(baslik: string): string {
  const temiz = baslik
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const damga = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `${temiz || 'tablo'}-${damga}.csv`;
}

/** CSV indir. Blob + geçici <a> — sunucuya istek gitmez, veri tarayıcıdan çıkmaz. */
export function csvIndir(baslik: string, basliklar: string[], satirlar: string[][]): void {
  const blob = new Blob([csvMetni(basliklar, satirlar)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dosyaAdi(baslik);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Bellek sızıntısını önle — hemen revoke etmek Safari'de indirmeyi iptal
  // ettiği için bir tur bekleniyor.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bir hücreyi HTML olarak kaçır (XSS + Excel formül koruması). */
function xlsHucre(deger: string): string {
  const s = deger.replace(/\r?\n/g, ' ').trim();
  const guvenli = /^[=+\-@]/.test(s) ? `'${s}` : s; // formül enjeksiyonu (CSV ile aynı)
  return guvenli.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * Excel (.xls) indir — kütüphanesiz. HTML tablo yapısı; Excel'in native açtığı format.
 *
 * NEDEN HTML-TABLO: gerçek .xlsx (ZIP/OOXML) kütüphane gerektirir (200-900 KB, bkz.
 * dosya başı ilke). Excel, MIME + .xls uzantılı bir HTML tabloyu tam olarak açar,
 * Türkçe karakter (UTF-8 meta) ve sütun ayrımı sorunsuz gelir. Ondalık için ham
 * sayı değil EKRANDAKİ tr-metni yazılır (CSV ile aynı gerekçe).
 *
 * `sayisalKolon`: bu indeksteki hücreler Excel'de SAYI olsun (mso number format) —
 * litre kolonlarında toplam/sıralama yapılabilsin diye. Verilmezse hepsi metin.
 */
export function xlsIndir(
  baslik: string,
  basliklar: string[],
  satirlar: string[][],
  ozetSatirlar?: string[][],
): void {
  const bas = `<tr>${basliklar.map((b) => `<th style="background:#e30613;color:#fff;font-weight:bold">${xlsHucre(b)}</th>`).join('')}</tr>`;
  const govde = satirlar.map((s) => `<tr>${s.map((c) => `<td>${xlsHucre(c)}</td>`).join('')}</tr>`).join('');
  const ozet = ozetSatirlar?.length
    ? `<tr><td colspan="${basliklar.length}"></td></tr>` +
      ozetSatirlar.map((s) => `<tr>${s.map((c) => `<td style="font-weight:bold;background:#f0f0f0">${xlsHucre(c)}</td>`).join('')}</tr>`).join('')
    : '';
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>` +
    `<x:Name>Mutabakat</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>` +
    `</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>` +
    `<body><table border="1">${bas}${govde}${ozet}</table></body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dosyaAdi(baslik).replace(/\.csv$/, '.xls');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * React düğümünden düz metin çıkar — CSV hücresi için.
 *
 * NEDEN GEREKLİ: kolon tanımlarındaki `hucre()` JSX döndürüyor (`<strong>`, `<time>`,
 * rozet `<span>`…). CSV'ye JSX yazılamaz. `ara()` varsa o tercih edilir (zaten
 * arama için düz metin üretiyor); yoksa düğüm gezilerek metin toplanır.
 *
 * ⚠️ `aria-hidden` işaretli düğümler ATLANIR: ▲ gibi görsel işaretler CSV'ye
 * girmemeli. `sr-only` metinler ise ALINIR — onlar anlamı taşıyor ("— acil").
 */
export function dugumMetni(d: unknown): string {
  if (d === null || d === undefined || typeof d === 'boolean') return '';
  if (typeof d === 'string') return d;
  if (typeof d === 'number') return String(d);
  if (Array.isArray(d)) return d.map(dugumMetni).join('');
  if (typeof d === 'object' && 'props' in (d as Record<string, unknown>)) {
    const el = d as { props?: Record<string, unknown> };
    const p = el.props ?? {};
    if (p['aria-hidden'] === 'true' || p['aria-hidden'] === true) return '';
    return dugumMetni(p.children);
  }
  return '';
}
