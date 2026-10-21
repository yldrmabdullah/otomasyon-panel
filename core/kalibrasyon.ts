// ════════════════════════════════════════════════════════════════════════════════════════
// KALİBRASYON MOTORU — tank mm→litre eğrisi üretir. SAF fonksiyon: I/O YOK (DB/ASIS yok).
//
// Girdi: ham (mm, lt) ölçüm bulutu + POL kapasitesi. Çıktı: 1 cm adımlı cetvel + güven + türetilen çap.
//
// Bu dosya İKİ PROJEDE AYNI (eski vercel + yeni Otomasyon). Hiç I/O içermediği için birebir
// kopyalanır; sapma olmaz. Değişiklik ikisine de uygulanmalı.
//
// Yöntem (gerçek ASIS verisinde doğrulandı, ist 210002):
//   1) Aynı mm tekrarlarını medyanla birleştir (sensör gürültüsü)
//   2) Monotonlaştır (seviye artarken hacim düşemez — fiziksel kural)
//   3) Çapı mm-lt bulutuna en küçük kareyle FİT ET (bayi beyanı DEĞİL — türet) + kapasite doğrula
//   4) 1 cm (10 mm) ızgarasına üret: saha aralığında interpolasyon, üstünde yatay silindir geometrisi
//   5) Her noktaya "kaynak" (saha|geometri), tanka güven skoru (A/B/C/D)
// ════════════════════════════════════════════════════════════════════════════════════════

export interface HamOlcum {
  mm: number;
  lt: number;
}

export interface CetvelNoktasi {
  mm: number;
  litre: number;
  kaynak: 'saha' | 'geometri';
}

export interface KalibrasyonSonuc {
  cetvel: CetvelNoktasi[];
  turetilmisCapMm: number;
  kapsamYuzde: number; // tank yüksekliğinin % kaçı saha verisiyle kaplı
  fitHatasi: number; // 0-1 (ör. 0.012 = %1.2)
  capKapasiteUyum: number; // türetilen tam hacim / POL kapasite × 100
  guven: 'A' | 'B' | 'C' | 'D';
  noktaSayisi: number;
}

/** Yatay silindir kesit alanı (yarıçap r, dolu yükseklik h). Birim-uzunluk hacim oranı için. */
function kesitAlani(h: number, r: number): number {
  const hh = Math.max(0, Math.min(h, 2 * r));
  if (hh <= 0) return 0;
  const x = Math.max(-1, Math.min(1, (r - hh) / r));
  return r * r * Math.acos(x) - (r - hh) * Math.sqrt(Math.max(0, 2 * r * hh - hh * hh));
}

function medyan(dizi: number[]): number {
  if (dizi.length === 0) return 0;
  const s = [...dizi].sort((a, b) => a - b);
  const o = Math.floor(s.length / 2);
  return s.length % 2 ? s[o] : (s[o - 1] + s[o]) / 2;
}

/**
 * mm-lt bulutundan en iyi (çap, uzunluk-ölçeği) — en küçük kareyle. Çapı tarar, her çap için
 * uzunluğu kapalı formla çözer, en düşük bağıl hatayı seçer. Döner: {capMm, olcek, hata}.
 * olcek = hacim ölçeği (uzunluk×birim), litre = olcek × kesitAlani(mm, r).
 */
function capTuret(noktalar: HamOlcum[]): { capMm: number; olcek: number; hata: number } {
  const maxMm = Math.max(...noktalar.map((n) => n.mm));
  const toplamLt = noktalar.reduce((a, n) => a + n.lt, 0) || 1;
  let best = { capMm: 0, olcek: 0, hata: Infinity };
  // Çap 500-3600 mm arası 10 mm adımlarla (saha tankları bu aralıkta).
  for (let capMm = 500; capMm <= 3600; capMm += 10) {
    const r = capMm / 2;
    if (maxMm > 2 * r) continue; // gözlenen seviye çapı aşamaz
    const alanlar = noktalar.map((n) => kesitAlani(n.mm, r));
    const payda = alanlar.reduce((a, A) => a + A * A, 0);
    if (payda <= 0) continue;
    const olcek = alanlar.reduce((a, A, i) => a + A * noktalar[i].lt, 0) / payda;
    const hata = alanlar.reduce((a, A, i) => a + Math.abs(olcek * A - noktalar[i].lt), 0) / toplamLt;
    if (hata < best.hata) best = { capMm, olcek, hata };
  }
  return best;
}

/**
 * Kalibrasyon cetveli üret. En az ~5 nokta gerekir; azsa düşük güvenle yine üretir.
 * @param ham ham (mm, lt) ölçümleri (aynı mm tekrar edebilir, sıralı olması şart değil)
 * @param polKapasite POL'ün bildirdiği tank kapasitesi (litre) — çapraz doğrulama için
 */
export function cetvelUret(ham: HamOlcum[], polKapasite: number): KalibrasyonSonuc | null {
  // Geçerli ölçümler: mm>0 ve lt>=0 (dip 0 olabilir). mm=0 noktası dışlanır (çap türetmeyi bozar).
  const gecerli = ham.filter((o) => o.mm > 0 && o.lt >= 0 && Number.isFinite(o.mm) && Number.isFinite(o.lt));
  if (gecerli.length < 3) return null;

  // 1) 10 mm kutulara MEDYANLA birleştir (sensör gürültüsünü bastır)
  const kutu = new Map<number, number[]>();
  for (const o of gecerli) {
    const k = Math.round(o.mm / 10) * 10;
    (kutu.get(k) ?? kutu.set(k, []).get(k)!).push(o.lt);
  }
  let saha = [...kutu.entries()].map(([mm, lts]) => ({ mm, lt: medyan(lts) })).sort((a, b) => a.mm - b.mm);

  // 2) Monotonlaştır (seviye artarken hacim düşemez)
  let enYuksek = -Infinity;
  saha = saha.map((p) => {
    const lt = Math.max(p.lt, enYuksek);
    enYuksek = lt;
    return { mm: p.mm, lt };
  });

  const sahaMaxMm = saha[saha.length - 1].mm;
  const sahaMinMm = saha[0].mm;

  // 3) Çapı türet (geometrik tamamlama + fiziksel tavan için)
  const { capMm, olcek, hata } = capTuret(gecerli);
  if (capMm === 0) return null;
  const r = capMm / 2;

  // Saha eğrisini geometriye bağla: saha son noktasında ölçek uyumu (süreklilik)
  const sonSaha = saha[saha.length - 1];
  const geomSon = olcek * kesitAlani(Math.min(sonSaha.mm, 2 * r), r);
  const gecisOlcek = geomSon > 0 ? sonSaha.lt / geomSon : 1;

  // 4) 1 cm (10 mm) ızgarasına üret
  const tepeMm = Math.round(2 * r); // fiziksel tavan
  const mmler = saha.map((p) => p.mm);
  const ltler = saha.map((p) => p.lt);
  const cetvelHam: CetvelNoktasi[] = [];
  for (let seviye = 0; seviye <= tepeMm; seviye += 10) {
    let litre: number;
    let kaynak: 'saha' | 'geometri';
    if (seviye <= sahaMaxMm && seviye >= sahaMinMm) {
      // saha aralığında: lineer interpolasyon
      litre = interpolasyon(mmler, ltler, seviye);
      kaynak = 'saha';
    } else if (seviye < sahaMinMm) {
      // saha altı (dip boşluğu): geometriyle doldur (nadiren — dip ölçümü genelde var)
      litre = gecisOlcek * olcek * kesitAlani(seviye, r);
      kaynak = 'geometri';
    } else {
      // saha üstü: geometriyle tamamla
      litre = gecisOlcek * olcek * kesitAlani(Math.min(seviye, 2 * r), r);
      kaynak = 'geometri';
    }
    cetvelHam.push({ mm: seviye, litre: Math.max(0, litre), kaynak });
  }

  // Son monotoniklik (interpolasyon↔geometri sınırında kırılma olmasın)
  let eny = -Infinity;
  const cetvel = cetvelHam.map((c) => {
    const litre = Math.max(c.litre, eny);
    eny = litre;
    return { mm: c.mm, litre: Math.round(litre * 100) / 100, kaynak: c.kaynak };
  });

  // 5) Güven skoru
  const kapsamYuzde = tepeMm > 0 ? (100 * (sahaMaxMm - 0)) / tepeMm : 0;
  const tamHacim = cetvel[cetvel.length - 1].litre;
  const capKapasiteUyum = polKapasite > 0 ? (100 * tamHacim) / polKapasite : 0;
  const guven = guvenSinifi(kapsamYuzde, hata, capKapasiteUyum, gecerli.length);

  return {
    cetvel,
    turetilmisCapMm: capMm,
    kapsamYuzde: Math.round(kapsamYuzde * 10) / 10,
    fitHatasi: Math.round(hata * 10000) / 10000,
    capKapasiteUyum: Math.round(capKapasiteUyum * 10) / 10,
    guven,
    noktaSayisi: gecerli.length,
  };
}

/** Sıralı (mmler, ltler) üzerinde lineer interpolasyon. */
function interpolasyon(mmler: number[], ltler: number[], hedef: number): number {
  if (hedef <= mmler[0]) return mmler[0] > 0 ? ltler[0] * (hedef / mmler[0]) : 0;
  if (hedef >= mmler[mmler.length - 1]) return ltler[ltler.length - 1];
  // ikili arama yerine basit tarama (cetvel noktaları az)
  let i = 0;
  while (i < mmler.length - 1 && mmler[i + 1] < hedef) i++;
  const m0 = mmler[i], m1 = mmler[i + 1], l0 = ltler[i], l1 = ltler[i + 1];
  return m1 > m0 ? l0 + ((l1 - l0) * (hedef - m0)) / (m1 - m0) : l0;
}

/**
 * Güven sınıfı. A=yüksek (bol saha + düşük hata), D=düşük (çoğu geometri / az nokta).
 * capKapasiteUyum %80-120 dışıysa güven düşürülür (türetilen çap şüpheli).
 */
function guvenSinifi(kapsam: number, hata: number, kapUyum: number, nokta: number): 'A' | 'B' | 'C' | 'D' {
  const uyumIyi = kapUyum >= 80 && kapUyum <= 125;
  if (nokta < 10 || kapsam < 15) return 'D';
  if (kapsam >= 60 && hata < 0.03 && uyumIyi) return 'A';
  if (kapsam >= 40 && hata < 0.06 && uyumIyi) return 'B';
  if (kapsam >= 25) return 'C';
  return 'D';
}
