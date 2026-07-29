// Ortak tipler — ASIS verisi, alarm ve durum modelleri.

/** GetStationList → istasyon kütüğü. EPDK ile bayi eşlemesi burada. */
export interface AsisIstasyon {
  kod: string; // IstasyonKod (ör. 210001)
  tIstasyonId: string; // TIstasyonID
  ad: string; // IstasyonAd (bayi ünvanı)
  epdkKod: string; // EPDKKod (BAY/939-82/{no})
  sehir: string;
  bolge: string | null;
  mantika: string | null;
  enlem: number | null;
  boylam: number | null;
  durum: boolean; // IstasyonDurum (aktif mi)
  tip: string | null; // IstasyonTip
  sonTarih: Date | null; // SonTarih (son veri gönderim zamanı — bağlantı canlılığı)
}

/**
 * Bağlantı izleme kaynağı = `GetStationList.SonTarih` (ekrandaki "Son Veri Gönderim
 * Zamanı"nın aynısı).
 *
 * ⚠️ DÜZELTME (2026-07-29): Eskiden burada "IstasyonOnlineDurum bu guidKey ile BOŞ
 * dönüyor, yetki yok" yazıyordu — **YANLIŞTI**. Metot çalışıyor (179 kayıt); sorun
 * parametre ADIydı: `<Key>` (büyük K) şart. `key`/`guidKey`/`KEY` → HTTP 200, hata
 * yok, sessizce BOŞ. Yine de kopukluk tespiti SonTarih'ten yapılır, çünkü
 * IstasyonOnlineDurum'un `SonVeriTarihi` alanı her kayıtta boş geliyor ve listede
 * 179 istasyon var (kütükte 268) → yokluğu "offline" saymak ~90 yanlış alarm üretir.
 *
 * ⚠️ `online` ≠ `kayitliAktif` (2026-07-28 düzeltmesi). ASIS'in `IstasyonDurum` alanı
 * "bu istasyon kütükte aktif mi" demek — 5 gün veri göndermeyen istasyon da `true`
 * dönüyor. **Gerçek online = SonTarih tazeliği.** Eskiden ikisi karıştırıldığı için
 * panel "180 Online" gösterirken o istasyonların son verisi 5 gün öncesiydi.
 */
export interface AsisOnlineDurum {
  istasyonKod: string | null;
  epdkKod: string;
  /** GERÇEK bağlantı: SonTarih eşik içinde mi (config.esik.kopukSaat). */
  online: boolean;
  /** ASIS kütük durumu (IstasyonDurum) — "kayıtlı/aktif mi", bağlantı DEĞİL. */
  kayitliAktif: boolean;
  sonVeriZamani: Date | null; // SonTarih (UTC'ye çevrilmiş)
  ip: string | null;
  tankVersiyon: string | null;
  pompaVersiyon: string | null;
}

/** GetTankLastLevel → tank anlık durum (tank izleme kaynağı). */
export interface AsisTank {
  istasyonKod: string;
  tankNo: string;
  urunAdi: string;
  kapasiteLt: number;
  yakitLt: number;
  suLt: number;
  durumZamani: Date; // DurumTarihi (UTC'ye çevrilmiş)
}

/** GetProductTypeList → ASIS ürün tanımı. */
export interface AsisUrun {
  tUrunId: string;
  ad: string;
  kisaAd: string;
}

/** GetPumpSaleList → pompa satışı (mutabakat: tank bazında satış toplamı). Artımlı. */
export interface AsisSatis {
  satisId: number; // TPompaSatisID
  tarih: Date;
  tIstasyonId: string;
  tankNo: string;
  litre: number;
}

/** GetTankLevelList → tank seviye geçmişi (mutabakat: dönem başı/sonu stok). Artımlı. */
export interface AsisSeviye {
  durumId: number; // TTankDurumID
  istasyonKod: string;
  tankNo: string;
  urunAdi: string;
  durumZamani: Date;
  yakitLt: number; // YakitSeviyeLTNet tercih, yoksa YakitSeviyeLT
  kapasiteLt: number;
}

/** GetTankFillingList → tank dolumu + irsaliye (mutabakat için). Artımlı (TTankDolumID cursor). */
export interface AsisDolum {
  dolumId: number; // TTankDolumID
  istasyonKod: string;
  tankNo: string;
  urunAdi: string;
  dolumBaslama: Date;
  dolumBitim: Date;
  dolumMiktari: number; // tanka giren, ALGILANAN (lt)
  dolumMiktariNet: number;
  /** POL'ün "Eşleşen Tank Dolum"u — MUTABAKATTA KULLANILAN değer.
   *  ⚠️ `dolumMiktari` (algılanan) ile AYNI DEĞİL: RAHA Temmuz'da algılanan
   *  141.439, eşleşen 138.619 (fark 2.820 = dönem dışı/eşleşmemiş kayıtlar).
   *  POL ekranı ikisini ayrı satırda gösteriyor. (bkz epdk-mutabakat.md §4g) */
  eslesmeMiktari: number;
  irsaliyeNo: string | null;
  /** İrsaliyede yazan (lt). SATIRLARA BÖLÜNMÜŞ → irsaliye bazında TOPLANIR.
   *  ⚠️ Teslimlerin ~%45'inde ASIS'te 0 geliyor ama POL'de fatura dolu →
   *  fatura tarafı ASIS'ten TAM hesaplanamaz (§4g). */
  irsaliyeLitre: number;
  irsaliyeMiktar: number;      // canlıda hep 0 görüldü
  irsaliyeHacimFark: number;   // irsaliye − tank (satır bazında; toplama uygun DEĞİL)
  irsaliyeMiktarFark: number;
  irsaliyeBirimFiyat: number;
  /** Tank seviyesi (lt) — dolum ÖNCESİ/SONRASI.
   *  ⚠️ 2026-07-29: Eskiden "GetTankLevelRecord KayitID=0 dönüyor, seviyeyi buradan
   *  almak zorundayız" yazıyordu. O engel YOK (bkz. epdk-mutabakat §4 soru 3 —
   *  `bitis` ertesi gün 00:00 olmalıydı). Mutabakatın A/D girdisi için asıl kaynak
   *  `GetTankLevelList` (30 dk grid, tek damgada 662 tank, `YakitSeviyeLTNet`).
   *  Buradaki alanlar dolum anına özgü olduğu için yine değerli ama A/D için tek
   *  dayanak değil. */
  seviyeBaslangicLt: number;
  seviyeBitisLt: number;
  /** 1240 kararı: kalibrasyon değişiminde 24 saat içinde yedek zorunlu → takip. */
  kalibrasyonYuzdesi: number;
  dolumTipi: string | null;    // O / M
  tankerSicakligi: number;     // hacim düzeltmesi
  kapasiteLt: number;
  tankerDolumTarihi: Date;
}

export type AlarmTipi = 'baglanti_kopuk' | 'tank_veri_yok';

/** Kural motorunun ürettiği tespit (henüz DB durumuyla harmanlanmamış). */
export interface Tespit {
  tip: AlarmTipi;
  istasyonKod: string;
  epdkKod: string;
  istasyonAd: string;
  /** tank_veri_yok için tank numarası; baglanti_kopuk için null. */
  tankNo: string | null;
  /** Son veri/ölçüm zamanı (kopukluğun ne kadar sürdüğünü hesaplamak için). */
  sonVeriZamani: Date | null;
  /** İnsan-okur açıklama (bildirim metnine girer). */
  mesaj: string;
}

/** Bir tespitin tekilliğini belirleyen anahtar (aynı alarmı bulmak için). */
export function tespitAnahtari(t: { tip: AlarmTipi; istasyonKod: string; tankNo: string | null }): string {
  return `${t.tip}|${t.istasyonKod}|${t.tankNo ?? '-'}`;
}
