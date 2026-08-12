-- Bayi FİYAT TAKİBİ — POL "Tablo A5" (bayi pompa fiyatı) ↔ parkoil.com.tr referans fiyatı.
--
-- Amaç (kullanıcı 2026-08-12): bayimiz Petrol Ofisi il fiyatının ÜSTÜNDE satıyorsa işaretle
-- ("pahalı satıyor, müşteri kaçırıyor" — REKABET kontrolü). EPDK yasal tavan ihlali DEĞİL;
-- web sitesindeki fiyat PO pompa fiyatıdır (parkoil.com.tr/data/fiyatlar-guncel.json, public).
--
-- Kaynaklar:
--   A5 (POL): Bayi Lisans No · Akaryakıt Türü · Fiyat · Tarih · İst.Kod · Bölge · Mıntıka(il)
--   Web: il/ilçe × benzin/motorin/kalorifer/fuel_oil (günlük güncellenir)
-- Eşleştirme: A5 mıntıka (il) ↔ web il (normalize TR). Ölçüldü: 58/61 il eşleşiyor.
-- İdempotent.

CREATE TABLE IF NOT EXISTS bayi_fiyat (
  gun            DATE NOT NULL,          -- fiyatın geçerli olduğu gün
  epdk_kod       TEXT NOT NULL,
  ist_kod        TEXT,
  istasyon       TEXT,
  bolge          TEXT,
  il             TEXT,                    -- A5 "Mıntıka"
  urun           TEXT NOT NULL,           -- kanonik: 'benzin' | 'motorin'
  urun_ham       TEXT,                    -- A5 ham adı (Kurşunsuz Benzin 95 Oktan…)
  bayi_fiyat     NUMERIC NOT NULL,        -- bayinin pompa fiyatı (TL/lt)
  ref_fiyat      NUMERIC,                 -- web sitesi (PO) il referans fiyatı — il içi EN YÜKSEK
  fark           NUMERIC,                 -- bayi_fiyat − ref_fiyat (pozitif = bayi PAHALI)
  ref_guncelleme DATE,                    -- referans fiyatın tarihi (bayat mı anlaşılsın)
  durum          TEXT NOT NULL,           -- 'uygun' | 'pahali' | 'ref_yok'
  guncelleme     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Aynı gün aynı bayi aynı ürün için birden çok fiyat değişimi olabilir → en SON fiyat tutulur
  PRIMARY KEY (gun, epdk_kod, ist_kod, urun)
);
CREATE INDEX IF NOT EXISTS ix_bfiyat_gun   ON bayi_fiyat (gun DESC);
CREATE INDEX IF NOT EXISTS ix_bfiyat_durum ON bayi_fiyat (gun, durum);
CREATE INDEX IF NOT EXISTS ix_bfiyat_bayi  ON bayi_fiyat (epdk_kod, gun DESC);
