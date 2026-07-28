// POL İstasyon Tanımları Excel (SpreadsheetML .xls) → Supabase bayi_iletisim.
// POL panelinde telefon %100, mail %90 dolu (Logo'da telefon %0!). Bu araç o Excel'i
// bayi_iletisim tablosuna yazar; job iletişimi BFF(Logo) + bayi_iletisim(POL) birleştirir.
//
// ARA SIRA çalışır (bayi değişince / ayda bir yeni export). Periyodik değil.
// Çalıştır: node --env-file=.env --import tsx araclar/polExcelImport.ts <excel-yolu>
//
// ⚠️ NEDEN İÇERİK-TABANLI (sabit index DEĞİL): POL export'unda satırlar arası hizalama
// SABİT DEĞİL — bir bayide 2 telefon varsa sonraki hücreler kayıyor (ASLANLAR: idx13+idx14
// iki telefon → mail idx17'ye kayıyor). Ayrıca 10 haneli VKN/EPDK no telefonla karışıyor.
// Çözüm: EPDK'yı 'BAY/' içeren hücreden al; telefon = 5 ile başlayan 10 hane (gerçek cep);
// mail = '@' içeren (KEP = kep.tr → ayrı). Satırdaki TÜM hücreler taranır, ÇOKLU toplanır.

import { readFile } from 'node:fs/promises';
import { pool, kapat } from '../core/db.js';

interface Satir {
  [ix: number]: string;
}

/** SpreadsheetML satırlarını ss:Index'e saygılı parse eder. */
function satirlariAyikla(xml: string): Satir[] {
  const rowRe = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
  const cellRe = /<Cell([^>]*)>([\s\S]*?)<\/Cell>/g;
  const dataRe = /<Data[^>]*>([\s\S]*?)<\/Data>/;
  const satirlar: Satir[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const row: Satir = {};
    let idx = 0;
    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rm[1]))) {
      const im = /ss:Index="(\d+)"/.exec(cm[1]);
      idx = im ? Number(im[1]) : idx + 1;
      const dm = dataRe.exec(cm[2]);
      row[idx] = dm ? dm[1].trim() : '';
    }
    satirlar.push(row);
  }
  return satirlar;
}

/** 'BAY/939-82/47501' → '47501'. Satırdaki herhangi bir hücrede olabilir. */
function epdkNoBul(hucreler: string[]): string | null {
  for (const h of hucreler) {
    const m = /BAY\/[\d-]+\/(\d+)/.exec(h || '');
    if (m) return m[1];
  }
  return null;
}

/** Gerçek CEP telefonu: 10 hane + '5' ile başlar (VKN/EPDK'yı eler). Değilse null. */
function cepNormal(v: string): string | null {
  let s = (v || '').replace(/\D/g, '');
  if (s.startsWith('90')) s = s.slice(2);
  if (s.startsWith('0')) s = s.slice(1);
  return s.length === 10 && s[0] === '5' ? s : null;
}

function normalMail(v: string): string | null {
  const s = (v || '').trim();
  if (!s.includes('@') || s.includes(' ') || s.length > 256) return null;
  if (/kep\.tr$/i.test(s)) return null; // KEP değil → normal mail
  return s.toLowerCase();
}

function kepMail(v: string): string | null {
  const s = (v || '').trim();
  return /@.*kep\.tr$/i.test(s) ? s.toLowerCase() : null;
}

/** Diziyi tekilleştir (sıra korunur). */
function tekil(arr: (string | null)[]): string[] {
  return [...new Set(arr.filter((x): x is string => !!x))];
}

async function main() {
  const yol = process.argv[2];
  if (!yol) {
    console.error('Kullanım: node --env-file=.env --import tsx araclar/polExcelImport.ts <excel-yolu>');
    process.exit(1);
  }

  const xml = await readFile(yol, 'utf8');
  const satirlar = satirlariAyikla(xml);

  const kayitlar = satirlar
    .slice(1) // başlık satırı
    .map((r) => {
      const hucreler = Object.values(r);
      const telefonlar = tekil(hucreler.map(cepNormal));
      const epostalar = tekil(hucreler.map(normalMail));
      const kep = tekil(hucreler.map(kepMail))[0] ?? null;
      const ad = hucreler.find((h) => /[A-ZÇĞİÖŞÜ]{3,}.*(PETROL|ENERJI|ENERJİ|AKARYAKIT|LTD|A\.Ş|ANONİM|LİMİTED)/i.test(h)) ?? '';
      return { epdkNo: epdkNoBul(hucreler), ad, telefonlar, epostalar, kep };
    })
    .filter((k) => k.epdkNo);

  const cokTel = kayitlar.filter((k) => k.telefonlar.length > 1).length;
  const cokMail = kayitlar.filter((k) => k.epostalar.length > 1).length;
  console.log(`Excel: ${satirlar.length - 1} satır, ${kayitlar.length} EPDK'lı kayıt.`);
  console.log(`  telefonu olan: ${kayitlar.filter((k) => k.telefonlar.length).length} (2+ telefonlu: ${cokTel})`);
  console.log(`  epostası olan: ${kayitlar.filter((k) => k.epostalar.length).length} (2+ maillı: ${cokMail})`);

  const p = pool();
  let yazilan = 0;
  for (const k of kayitlar) {
    await p.query(
      `INSERT INTO bayi_iletisim (epdk_no, ad, telefon, eposta, telefonlar, epostalar, kep, guncelleme)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (epdk_no) DO UPDATE SET
         ad=EXCLUDED.ad, telefon=EXCLUDED.telefon, eposta=EXCLUDED.eposta,
         telefonlar=EXCLUDED.telefonlar, epostalar=EXCLUDED.epostalar, kep=EXCLUDED.kep, guncelleme=now()`,
      [
        k.epdkNo,
        k.ad,
        k.telefonlar[0] ?? null, // birincil (geriye uyum)
        k.epostalar[0] ?? null,
        k.telefonlar,
        k.epostalar,
        k.kep,
      ],
    );
    yazilan++;
  }
  console.log(`✔ bayi_iletisim'e ${yazilan} kayıt yazıldı (çoklu telefon/mail dahil).`);
  await kapat();
}

main().catch(async (e) => {
  console.error('Import hatası:', e);
  await kapat().catch(() => {});
  process.exit(1);
});
