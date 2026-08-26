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

import { PARKOIL_LOGO_B64 } from './marka.js';

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

/** Sayı gibi görünen hücreyi saptar ("1.234,5", "%0,888", "12.000 L", "-3").
 *
 *  ⚠️ Excel'e TR biçimli sayıyı metin olarak vermek toplam/sıralama yapılmasını
 *  engelliyor. Bu yüzden sayısal hücreler sağa yaslanır ve `mso-number-format`
 *  ile sayı olarak işaretlenir. Ham noktalı değere ÇEVİRMİYORUZ: kullanıcının
 *  ekranda gördüğü biçim korunmalı (dosya başı 3. tuzak), TR Excel virgüllü
 *  ondalığı zaten sayı olarak okuyor. */
function sayisalMi(s: string): boolean {
  const t = s.trim().replace(/^[%₺]|[%₺]$/g, '').replace(/\s*(L|TL|ton|m³|adet)$/i, '').trim();
  return t.length > 0 && t.length < 24 && /^-?[\d.]+(,\d+)?$/.test(t);
}

export interface XlsSecenek {
  /** Rapor başlığı — dosyanın 1. satırında büyük punto. Verilmezse `baslik`. */
  raporAdi?: string;
  /** Başlığın altına yazılan bağlam (dönem, filtre, kaynak…). Satır satır. */
  notlar?: string[];
  /** Tablonun altına eklenecek özet satırları (kalın, gri zemin). */
  ozetSatirlar?: string[][];
  /** Excel sekme adı (31 karakter sınırı Excel'in kendi kuralı). */
  sayfaAdi?: string;
}

/**
 * Excel (.xls) indir — kütüphanesiz, KURUMSAL BİÇİMLİ.
 *
 * NEDEN HTML-TABLO: gerçek .xlsx (ZIP/OOXML) kütüphane gerektirir (200-900 KB, bkz.
 * dosya başı ilke). Excel, MIME + .xls uzantılı bir HTML tabloyu tam olarak açar;
 * Türkçe karakter (UTF-8 meta), sütun ayrımı, hücre stili ve GÖMÜLÜ RESİM çalışır.
 *
 * Biçim (kullanıcı isteği 2026-08-26 — "logomuz olsa, güzel tablo şeklinde olsa"):
 *   1. satır  : Parkoil logosu (base64 gömülü, bkz. marka.ts) + rapor adı
 *   2-n satır : bağlam notları (dönem/filtre/kaynak) + üretim zamanı + satır sayısı
 *   başlık    : Parkoil kırmızısı zemin, beyaz kalın yazı, DONDURULMUŞ (freeze pane)
 *   gövde     : zebra (tek/çift satır), ince gri kenarlık, sayısal hücreler sağa
 *   otomatik  : sütun genişliği içeriğe göre, otomatik filtre (AutoFilter) açık
 *
 * ⚠️ Freeze pane + AutoFilter `x:WorksheetOptions` ile veriliyor; bu XML yalnız
 * Excel tarafından okunuyor (LibreOffice yok sayar, dosya yine açılır).
 */
export function xlsIndir(
  baslik: string,
  basliklar: string[],
  satirlar: string[][],
  secenekOrOzet?: XlsSecenek | string[][],
): void {
  // Geriye dönük uyum: eski çağrılar 4. parametre olarak doğrudan özet satırı veriyordu.
  const sec: XlsSecenek = Array.isArray(secenekOrOzet)
    ? { ozetSatirlar: secenekOrOzet }
    : (secenekOrOzet ?? {});
  const raporAdi = sec.raporAdi ?? baslik;
  const kolonSayisi = Math.max(1, basliklar.length);

  const KIRMIZI = '#e30613';
  const stilBas =
    `background:${KIRMIZI};color:#ffffff;font-weight:bold;font-size:11pt;` +
    `border:1px solid #b0050f;padding:6px;vertical-align:middle;text-align:center`;

  // ── Rapor başlığı (logo + ad) ──
  const logo =
    `<td rowspan="2" style="width:170px;padding:8px;border:none">` +
    `<img src="data:image/png;base64,${PARKOIL_LOGO_B64}" width="150"/></td>`;
  const adHucre =
    `<td colspan="${Math.max(1, kolonSayisi - 1)}" style="font-size:16pt;font-weight:bold;` +
    `color:${KIRMIZI};border:none;padding:8px 8px 0 8px">${xlsHucre(raporAdi)}</td>`;
  const sirket =
    `<td colspan="${Math.max(1, kolonSayisi - 1)}" style="font-size:9pt;color:#666666;` +
    `border:none;padding:0 8px 8px 8px">Turgut Dağıtım Enerji A.Ş. · Otomasyon Paneli</td>`;

  const damga = new Date().toLocaleString('tr', { dateStyle: 'long', timeStyle: 'short' });
  const notSatirlari = [
    ...(sec.notlar ?? []),
    `${satirlar.length.toLocaleString('tr')} kayıt · ${damga} tarihinde panelden alındı`,
  ]
    .map(
      (n) =>
        `<tr><td colspan="${kolonSayisi}" style="font-size:9pt;color:#444444;` +
        `border:none;padding:2px 8px">${xlsHucre(n)}</td></tr>`,
    )
    .join('');

  // Boş ayırıcı satır — başlık bloğu ile tablo birbirine yapışmasın.
  const bosluk = `<tr><td colspan="${kolonSayisi}" style="border:none;height:8px"></td></tr>`;

  const bas = `<tr>${basliklar.map((b) => `<th style="${stilBas}">${xlsHucre(b)}</th>`).join('')}</tr>`;

  const govde = satirlar
    .map((s, i) => {
      const zemin = i % 2 ? '#f7f7f9' : '#ffffff';
      return (
        `<tr>${s
          .map((c) => {
            const sag = sayisalMi(c);
            const stil =
              `background:${zemin};border:1px solid #d9d9de;padding:4px 6px;` +
              `vertical-align:top;${sag ? 'text-align:right;mso-number-format:"\\@"' : ''}`;
            return `<td style="${stil}">${xlsHucre(c)}</td>`;
          })
          .join('')}</tr>`
      );
    })
    .join('');

  const ozet = sec.ozetSatirlar?.length
    ? `<tr><td colspan="${kolonSayisi}" style="border:none;height:6px"></td></tr>` +
      sec.ozetSatirlar
        .map(
          (s) =>
            `<tr>${s
              .map(
                (c) =>
                  `<td style="font-weight:bold;background:#ececf0;border:1px solid #c9c9d0;` +
                  `padding:5px 6px${sayisalMi(c) ? ';text-align:right' : ''}">${xlsHucre(c)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')
    : '';

  // Başlık satırının Excel'deki gerçek satır numarası = logo(2) + notlar + boşluk + 1.
  const notAdet = (sec.notlar?.length ?? 0) + 1;
  const basSatirNo = 2 + notAdet + 1 + 1;

  const sayfa = (sec.sayfaAdi ?? raporAdi)
    // Excel sekme adında YASAK karakterler: : \ / ? * [ ] — ve 31 karakter sınırı.
    .replace(/[:\\/?*[\]]/g, ' ')
    .slice(0, 31)
    .trim() || 'Rapor';

  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="utf-8"><style>td,th{font-family:Calibri,Arial,sans-serif;font-size:10pt}</style>` +
    `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>` +
    `<x:Name>${xlsHucre(sayfa)}</x:Name><x:WorksheetOptions>` +
    // Kılavuz çizgileri KAPALI: kendi kenarlıklarımız var, ikisi birlikte kirli görünüyor.
    `<x:DoNotDisplayGridlines/>` +
    // Başlık satırını dondur: uzun listede kaydırırken kolon adları görünür kalsın.
    `<x:FreezePanes/><x:FrozenNoSplit/>` +
    `<x:SplitHorizontal>${basSatirNo}</x:SplitHorizontal>` +
    `<x:TopRowBottomPane>${basSatirNo}</x:TopRowBottomPane>` +
    `<x:ActivePane>2</x:ActivePane>` +
    `</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>` +
    `<body><table cellspacing="0">` +
    `<tr>${logo}${adHucre}</tr><tr>${sirket}</tr>` +
    `${notSatirlari}${bosluk}${bas}${govde}${ozet}` +
    `</table></body></html>`;

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
