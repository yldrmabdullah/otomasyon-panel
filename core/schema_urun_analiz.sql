-- İstasyon Günlük Ürün Analizi (POL) — istasyon × ürün × gün pompa satışı.
--
-- KAYNAK: POL OtomasyonModulu/UrunRaporlari/IstasyonAnaliz.aspx
--         (araclar/urunAnalizCek.ts indirir; bkz. docs/bilgi/pol-harita.md satır 303)
--
-- NE İŞE YARAR:
--   · İstasyonun GERÇEKLEŞEN pompa satışı (litre + tutar + fiş adedi).
--   · EPDK kodu ile bayiye bağlanır (proje eşleme anahtarı: ASIS EPDKKod =
--     'BAY/939-82/{no}'; buradaki epdk_kod da aynı no'yu taşır).
--   · satis_fatura (bayinin BİZDEN aldığı) ile birleştirilince "aldı / sattı"
--     karşılaştırması yapılabilir.
--
-- Bu sistem SALT-OKUMA: POL'e hiçbir şey yazılmaz.

CREATE TABLE IF NOT EXISTS istasyon_urun_analiz (
  id           BIGSERIAL PRIMARY KEY,
  tarih        DATE,
  erp_kod      TEXT,
  epdk_kod     TEXT,
  ist_kod      TEXT,
  istasyon_ad  TEXT,
  urun         TEXT,
  litre        NUMERIC(18,3),
  tutar        NUMERIC(18,2),
  adet         NUMERIC(18,0),
  marka        TEXT,
  cekilme      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aracın idempotent yazımı: aynı aralık tekrar çekilince önce DELETE ... WHERE tarih
-- BETWEEN yapılıyor → tarih üzerinde indeks şart (cron her gün dünü yeniden çeker).
CREATE INDEX IF NOT EXISTS ix_iua_tarih ON istasyon_urun_analiz (tarih);

-- Bayi bazlı sorgular (EPDK ile eşleme) ve istasyon kırılımı için.
CREATE INDEX IF NOT EXISTS ix_iua_epdk_tarih ON istasyon_urun_analiz (epdk_kod, tarih);
CREATE INDEX IF NOT EXISTS ix_iua_urun_tarih ON istasyon_urun_analiz (urun, tarih);

-- NOT: UNIQUE kısıt BİLİNÇLİ olarak YOK. POL aynı istasyon+ürün+gün için birden çok
-- satır dönebiliyor (işlem tipi/marka kırılımı) ve hangi kombinasyonun gerçekten tekil
-- olduğu HENÜZ ÖLÇÜLMEDİ. Yanlış bir UNIQUE koymak sessiz veri kaybı yaratırdı;
-- idempotentlik DELETE+INSERT ile sağlanıyor. İlk gerçek çekimden sonra dağılıma
-- bakılıp (istasyon,ürün,gün) tekil çıkarsa kısıt eklenebilir.
