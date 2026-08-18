// A1b stok-satış anomali kural motoru — DETERMİNİSTİK.
//
// Kaynak: "Günlük Akaryakıt Tank Stok-Satış Anomali Kontrol Sistemi" teknik
// gereksinim dokümanı (Turgut Dağıtım Enerji A.Ş., 18.08.2026, sürüm 1.0).
//
// ⚠️ AI KULLANILMAZ. Doküman 2. madde: tespit matematiksel kurallarla yapılır ki
// aynı veri her gün aynı sonucu versin, eşikler denetlenebilsin ve sonuç denetim
// sürecinde açıklanabilsin. AI yalnız özet/anlatım katmanı olabilir (opsiyonel).
//
// Bu dosya SAF: DB/IO yok, yalnız hesap. Böylece kabul testleri doğrudan koşar.

/** Eşikler — koda GÖMÜLMEZ (doküman 6. madde), sistem_ayar'dan gelir. */
export interface Esikler {
  minSatis: number;        // altındaki satışta operasyonel alarm baskılanır
  ayniStok: number;        // |gerçek çıkış| bu değerin altındaysa "neredeyse aynı"
  kritikOran: number;      // yansımayan oran ≥ → KRİTİK
  yuksekOran: number;      // ≥ → YÜKSEK
  inceleOran: number;      // ≥ (+ mutlak fark şartı) → İNCELE
  inceleFark: number;      // küçük yüzdelerde mutlak fark filtresi (lt)
  kapasiteTolerans: number;
}

/** Dokümandaki başlangıç değerleri (6. madde tablosu). */
export const VARSAYILAN_ESIK: Esikler = {
  minSatis: 1,
  ayniStok: 5,
  kritikOran: 0.80,
  yuksekOran: 0.50,
  inceleOran: 0.20,
  inceleFark: 20,
  kapasiteTolerans: 50,
};
/** Eşik seti sürümü — audit için kayda yazılır (doküman 12.10). */
export const ESIK_SURUM = 'v1.0-2026-08-18';

export type Risk = 'KRITIK' | 'YUKSEK' | 'INCELE' | 'NORMAL' | 'VERI_HATASI';

export interface HamSatir {
  gun: string; istasyonKod: string; tankNo: string; urun: string | null;
  epdkKod: string | null; istasyonAd: string | null; bolge: string | null; mintika: string | null;
  // orijinal + A1A çifti; A1A birincil
  gunBasi: number | null;  a1aGunBasi: number | null;
  dolum: number | null;    a1aDolum: number | null;
  satis: number | null;    a1aSatis: number | null;
  gunSonu: number | null;  a1aGunSonu: number | null;
  kapasite: number | null;
  aciklama: string | null; duzenleyen: string | null; duzenlemeTarih: string | null;
  kriterKs: string | null;
}

export interface Sonuc {
  gunBasi: number; dolum: number; satis: number; gunSonu: number; kapasite: number | null;
  beklenenSonu: number; gercekCikis: number; fark: number;
  yansimayan: number | null; kapasiteAsim: number | null;
  risk: Risk; nedenler: string[];
}

/**
 * A1A öncelikli seçim.
 * ⚠️ SIFIR GEÇERLİ DEĞER (doküman 4.1): `a1a || orijinal` YANLIŞ olur — A1A dolum
 * 0 ise bu gerçek bir bilgidir ("dolum yapılmadı"), orijinale dönülmemeli.
 * Yalnız null/undefined'da fallback yapılır.
 */
export function sec(a1a: number | null, orijinal: number | null): number | null {
  return a1a !== null && a1a !== undefined ? a1a : orijinal ?? null;
}

const RISK_SIRA: Record<Risk, number> = { VERI_HATASI: 5, KRITIK: 4, YUKSEK: 3, INCELE: 2, NORMAL: 1 };
const enKotu = (a: Risk, b: Risk): Risk => (RISK_SIRA[b] > RISK_SIRA[a] ? b : a);

/** Tek satırı değerlendirir. Doküman 5. ve 6. maddeler. */
export function degerlendir(r: HamSatir, e: Esikler = VARSAYILAN_ESIK): Sonuc {
  const gunBasi = sec(r.a1aGunBasi, r.gunBasi);
  const dolum = sec(r.a1aDolum, r.dolum);
  const satis = sec(r.a1aSatis, r.satis);
  const gunSonu = sec(r.a1aGunSonu, r.gunSonu);
  const kapasite = r.kapasite;

  const nedenler: string[] = [];
  let risk: Risk = 'NORMAL';

  // ── Veri kalitesi (doküman 7.4) — hesap yapmadan önce ────────────────────
  if (gunBasi === null || dolum === null || satis === null || gunSonu === null) {
    return {
      gunBasi: gunBasi ?? 0, dolum: dolum ?? 0, satis: satis ?? 0, gunSonu: gunSonu ?? 0,
      kapasite, beklenenSonu: 0, gercekCikis: 0, fark: 0, yansimayan: null, kapasiteAsim: null,
      risk: 'VERI_HATASI', nedenler: ['Zorunlu stok alanı boş'],
    };
  }
  if (satis < 0 || dolum < 0 || gunBasi < 0 || gunSonu < 0) {
    risk = 'VERI_HATASI';
    nedenler.push('Negatif stok/satış değeri');
  }

  // ── Matematiksel model (doküman 5) ───────────────────────────────────────
  const beklenenSonu = gunBasi + dolum - satis;
  const gercekCikis = gunBasi + dolum - gunSonu;
  const fark = gunSonu - beklenenSonu;
  const yansimayan = satis > 0 ? Math.max(0, fark) / satis : null;

  // ── Kapasite (doküman 7.1) — öncelik sırasında EN ÜSTTE (6.3) ────────────
  let kapasiteAsim: number | null = null;
  if (kapasite !== null && kapasite > 0) {
    kapasiteAsim = Math.max(0, gunSonu - kapasite);
    if (kapasiteAsim > e.kapasiteTolerans) {
      risk = enKotu(risk, 'KRITIK');
      nedenler.push('Tank kapasitesi aşılmış');
    }
  }

  // ── Alarm kuralları (doküman 6.1 / 6.2) ──────────────────────────────────
  if (satis > e.minSatis) {
    if (gercekCikis < 0) {
      risk = enKotu(risk, 'KRITIK');
      nedenler.push('Satış varken stok net artmış');
    } else if (Math.abs(gercekCikis) <= e.ayniStok) {
      risk = enKotu(risk, 'KRITIK');
      nedenler.push('Satış var, stok neredeyse hiç değişmemiş');
    } else if (yansimayan !== null && yansimayan >= e.kritikOran) {
      risk = enKotu(risk, 'KRITIK');
      nedenler.push(`Satışın %${Math.round(e.kritikOran * 100)}+ kısmı stokta görünmüyor`);
    } else if (yansimayan !== null && yansimayan >= e.yuksekOran) {
      risk = enKotu(risk, 'YUKSEK');
      nedenler.push(`Satışın %${Math.round(e.yuksekOran * 100)}+ kısmı stokta görünmüyor`);
    } else if (fark >= e.inceleFark && yansimayan !== null && yansimayan >= e.inceleOran) {
      risk = enKotu(risk, 'INCELE');
      nedenler.push('Stok-satış mutabakat farkı');
    }
  }

  return { gunBasi, dolum, satis, gunSonu, kapasite, beklenenSonu, gercekCikis, fark, yansimayan, kapasiteAsim, risk, nedenler };
}
