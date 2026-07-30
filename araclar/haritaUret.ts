// Türkiye il haritası SVG yol verisi üretici — GeoJSON → panel/src/haritaYollari.ts
//
// NEDEN BU ARAÇ VAR: harita verisi üretilmiş bir yapı, elle yazılamaz. Kaynak GeoJSON
// (81 il, 5.990 nokta, 236 KB) doğrudan panele konsa hem büyük hem de tarayıcıda her
// açılışta projeksiyon hesabı yapılırdı. Bu araç bir kez çalışıp sabit SVG `path`
// dizesi üretir; panel sadece hazır yolu çizer.
//
// ⚠️ İL ADI EŞLEMESİ: GeoJSON adları EPDK biçiminden FARKLI ("Afyon" vs
// "AFYONKARAHİSAR", "Içel" vs "MERSİN"). AD_DUZELT haritası bu farkı kapatır;
// eşleşmeyen il kalırsa araç HATA verip çıkar (sessizce eksik harita üretmez).
//
// Çalıştır (kaynak dosyayı indirdikten sonra):
//   node --import tsx araclar/haritaUret.ts <geojson-yolu>
//
// Kaynak: github.com/cihadturhan/tr-geojson (tr-cities-utf8.json)

import { readFileSync, writeFileSync } from 'node:fs';

/** SVG tuval boyutu (viewBox). Türkiye ~2:1 en/boy oranında. */
const GENISLIK = 1000;
const YUKSEKLIK = 420;
/** Koordinat yuvarlama basamağı — 1 basamak ~11 km, harita bu ölçekte yeterli
 *  ve dosyayı ~3 kat küçültüyor. 2 basamak gereksiz hassasiyet. */
const BASAMAK = 1;

/** GeoJSON adı → EPDK adı (bayiler_epdk.il biçimi: BÜYÜK HARF, Türkçe karakterli). */
const AD_DUZELT: Record<string, string> = {
  Afyon: 'AFYONKARAHİSAR',
  Içel: 'MERSİN',
  Icel: 'MERSİN',
  Mersin: 'MERSİN',
  'K.maras': 'KAHRAMANMARAŞ',
  Kmaras: 'KAHRAMANMARAŞ',
  Zonguldak: 'ZONGULDAK',
};

interface Ozellik {
  type: string;
  properties: { name?: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}

function epdkAdi(ham: string): string {
  const d = AD_DUZELT[ham];
  if (d) return d;
  // Türkçe büyük harf: i→İ dönüşümü locale ile doğru yapılır
  return ham.toLocaleUpperCase('tr-TR');
}

function main() {
  const kaynak = process.argv[2];
  if (!kaynak) {
    console.error('Kullanım: haritaUret.ts <geojson-yolu>');
    process.exit(1);
  }

  const g = JSON.parse(readFileSync(kaynak, 'utf8')) as { features: Ozellik[] };
  console.log(`Kaynak: ${g.features.length} il`);

  // 1) Sınırları bul (projeksiyon ölçeği için)
  let boyMin = Infinity, boyMax = -Infinity, enMin = Infinity, enMax = -Infinity;
  const halkalar: { ad: string; halka: number[][][] }[] = [];

  for (const f of g.features) {
    const ad = epdkAdi((f.properties.name ?? '').trim());
    // Polygon → [halka][nokta][2] · MultiPolygon → [parça][halka][nokta][2]
    const parcalar =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates as number[][][]]
        : (f.geometry.coordinates as number[][][][]);
    const kendi: number[][][] = [];
    for (const parca of parcalar) {
      for (const halka of parca) {
        kendi.push(halka);
        for (const [boy, en] of halka) {
          if (boy < boyMin) boyMin = boy;
          if (boy > boyMax) boyMax = boy;
          if (en < enMin) enMin = en;
          if (en > enMax) enMax = en;
        }
      }
    }
    halkalar.push({ ad, halka: kendi });
  }

  console.log(`Sınırlar: boylam ${boyMin.toFixed(2)}–${boyMax.toFixed(2)} · enlem ${enMin.toFixed(2)}–${enMax.toFixed(2)}`);

  // 2) Eşit dikdörtgen (equirectangular) projeksiyon + enlem düzeltmesi.
  //    Türkiye'nin orta enlemi ~39° → cos(39°)≈0.777. Bu çarpan olmadan harita
  //    yatay olarak ~%29 gerilir (Mercator'a gerek yok, bu ölçekte fark görünmez).
  const ortEnlem = ((enMin + enMax) / 2) * (Math.PI / 180);
  const cosDuzelt = Math.cos(ortEnlem);
  const boyAralik = (boyMax - boyMin) * cosDuzelt;
  const enAralik = enMax - enMin;
  // Tuvale sığdır, en/boy oranını KORU (harita çarpılmasın)
  const olcek = Math.min(GENISLIK / boyAralik, YUKSEKLIK / enAralik);
  const kaydirX = (GENISLIK - boyAralik * olcek) / 2;
  const kaydirY = (YUKSEKLIK - enAralik * olcek) / 2;

  const X = (boy: number) => (boy - boyMin) * cosDuzelt * olcek + kaydirX;
  // SVG y aşağı doğru artar, enlem yukarı → ters çevir
  const Y = (en: number) => (enMax - en) * olcek + kaydirY;

  // 3) SVG path üret
  const yollar: { ad: string; d: string }[] = [];
  let nokta = 0;
  for (const { ad, halka } of halkalar) {
    const parcalar: string[] = [];
    for (const h of halka) {
      // Ardışık aynı noktaları at (yuvarlama sonrası oluşuyor)
      let onceki = '';
      const adimlar: string[] = [];
      for (let i = 0; i < h.length; i++) {
        const x = X(h[i][0]).toFixed(BASAMAK);
        const y = Y(h[i][1]).toFixed(BASAMAK);
        const s = `${x},${y}`;
        if (s === onceki) continue;
        adimlar.push(`${adimlar.length === 0 ? 'M' : 'L'}${s}`);
        onceki = s;
        nokta++;
      }
      if (adimlar.length > 2) parcalar.push(adimlar.join('') + 'Z');
    }
    yollar.push({ ad, d: parcalar.join('') });
  }

  console.log(`Üretilen nokta: ${nokta} (yuvarlama sonrası)`);

  // 4) Doğrulama — boş yol var mı?
  const bos = yollar.filter((y) => !y.d);
  if (bos.length) {
    console.error(`✗ ${bos.length} ilin yolu BOŞ: ${bos.map((b) => b.ad).join(', ')}`);
    process.exit(2);
  }

  const cikti = `// OTOMATİK ÜRETİLDİ — elle düzenlemeyin.
// Üretici: araclar/haritaUret.ts · Kaynak: github.com/cihadturhan/tr-geojson
// ${yollar.length} il · ${nokta} nokta · viewBox 0 0 ${GENISLIK} ${YUKSEKLIK}
//
// İl adları EPDK biçiminde (BÜYÜK HARF, Türkçe karakterli) — bayiler_epdk.il ile
// doğrudan eşleşir. Yeniden üretmek için:
//   node --import tsx araclar/haritaUret.ts <geojson>

export const HARITA_EN = ${GENISLIK};
export const HARITA_BOY = ${YUKSEKLIK};

/** [il adı (EPDK biçimi), SVG path d]. */
export const IL_YOLLARI: [string, string][] = [
${yollar.map((y) => `  [${JSON.stringify(y.ad)}, ${JSON.stringify(y.d)}],`).join('\n')}
];
`;

  const hedef = 'panel/src/haritaYollari.ts';
  writeFileSync(hedef, cikti, 'utf8');
  const kb = (Buffer.byteLength(cikti) / 1024).toFixed(0);
  console.log(`✔ ${hedef} yazıldı — ${yollar.length} il, ${kb} KB`);
  console.log('\nİl adları (EPDK biçimine çevrilmiş) ilk 10:');
  console.log('  ' + yollar.slice(0, 10).map((y) => y.ad).join(' · '));
}

main();
