/** ASIS IstasyonTip — üç ayrı satış noktası iş modeli, hepsi gerçek bayi.
 *  Canlı dağılım (2026-07-28): İstasyonlu 265, Köy pompası 2, Köy tankeri 2. */
export type IstasyonTipi = 'İstasyonlu' | 'Köy pompası' | 'Köy tankeri';

export interface Istasyon {
  istasyon_kod: string;
  ad: string;
  epdk_kod: string | null;
  sehir: string | null;
  bolge: string | null;
  aktif: boolean;
  tip: string | null;
  /** Bayi cep telefonu (bayi_iletisim'den, EPDK no ile eşleşir). Müdahale
   *  kuyruğundaki "Bayiyi ara" tel: bağlantısı için. Kayıt yoksa null. */
  telefon?: string | null;
}
export type BaglantiKategori = 'online' | 'kopuk' | 'rakibe' | 'kapandi' | 'bilinmiyor';
export interface Baglanti {
  istasyon_kod: string;
  /** GERÇEK bağlantı: son veri eşik içinde mi. ASIS IstasyonDurum DEĞİL. */
  online: boolean;
  /** ASIS kütük durumu (IstasyonDurum) — "aktif kayıt mı", bağlantı değil. */
  kayitli_aktif: boolean | null;
  son_veri_zamani: string | null;
  ip: string | null;
  guncelleme: string;
  kategori: BaglantiKategori;
  rakip: string | null;
  iptal_aciklama: string | null;
  iptal_tarihi: string | null;
  /** Dağıtıcı değişiminin TESPİT edildiği gün (transferler.tespit_gun).
   *  EPDK kütüğü resmî geçiş tarihi vermiyor; elimizdeki en iyi yaklaşım bu.
   *  Eski sürüm API'den gelmeyebilir → opsiyonel. */
  gecis_tespit?: string | null;
}
/** Tank anlık durumu. ŞU AN /api/durum'da GÖNDERİLMİYOR: UI'da tüketicisi yoktu
 *  ama yanıtın %41'iydi (114 KB) ve 60 sn'de bir çekiliyordu. Mutabakat hesabı
 *  için gerektiğinde ayrı /api/tanklar endpoint'i açılır. */
export interface Tank {
  istasyon_kod: string;
  tank_no: string;
  urun: string | null;
  kapasite_lt: string | null;
  mevcut_lt: string | null;
  su_lt: string | null;
  son_olcum_zamani: string | null;
}
export interface Alarm {
  id: string;
  tip: 'baglanti_kopuk' | 'tank_veri_yok';
  istasyon_kod: string;
  tank_no: string | null;
  istasyon_ad: string | null;
  epdk_no: string | null;
  mesaj: string | null;
  acildi: string;
  son_bildirim: string | null;
  bildirim_sayisi: number;
  kapandi: string | null;
}
/** Bir veri kaynağının yaşı — panelde "X önce güncellendi" göstergesi. */
export interface Tazelik {
  anahtar: string;
  ad: string;
  /** ISO; null = kaynak hiç çekilmemiş. */
  son: string | null;
  /** Dakika; null = hesaplanamaz (son yok). */
  yasDk: number | null;
  esikDk: number;
  /** yasDk > esikDk ya da hiç veri yok → panelde uyarı. */
  bayat: boolean;
}

export interface Durum {
  uretim: string;
  istasyonlar: Istasyon[];
  baglanti: Baglanti[];
  alarmlar: Alarm[];
  /** Eski sürüm API'den gelmeyebilir → opsiyonel. */
  tazelik?: Tazelik[];
}
