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

-- ══ A1b STOK-SATIŞ ANOMALİ (2026-08-18) ═══════════════════════════════════
-- Kaynak: POL "Tablo A1b - Düzeltilmiş Otomasyon Sistemi" (günlük Excel).
-- Amaç: pompa satışı olmasına rağmen tank stoğu değişmeyen/artan kayıtları bulmak.
--
-- ⚠️ TESPİT DETERMİNİSTİK: kural motoru matematiksel, AI DEĞİL. Aynı veri → aynı
-- sonuç; eşikler denetlenebilir ve EPDK karşısında savunulabilir olmalı
-- (teknik doküman 2. madde, Turgut Dağıtım 18.08.2026).
--
-- ⚠️ A1A ÖNCELİĞİ: Excel'de hem orijinal hem "(A1A)" düzeltilmiş kolonlar var.
-- A1A birincil; NULL ise orijinale düşülür. SIFIR GEÇERLİ DEĞERDİR — truthy
-- kontrolü (`a1a || orijinal`) yanlış olur, 0 dolum orijinale dönmemeli.
CREATE TABLE IF NOT EXISTS a1b_gun (
  gun            DATE NOT NULL,
  istasyon_kod   TEXT NOT NULL,          -- İst. Kod (POL) = istasyonlar.istasyon_kod
  tank_no        TEXT NOT NULL,
  urun           TEXT,
  epdk_kod       TEXT,
  istasyon_ad    TEXT,
  bolge          TEXT,
  mintika        TEXT,
  -- Normalize edilmiş (A1A öncelikli) değerler — hesap bunlardan yapılır.
  gun_basi       NUMERIC(14,2),
  dolum          NUMERIC(14,2),
  satis          NUMERIC(14,2),
  gun_sonu       NUMERIC(14,2),
  kapasite       NUMERIC(14,2),
  -- Türetilmiş (kural motoru çıktısı)
  beklenen_sonu  NUMERIC(14,2),          -- gun_basi + dolum - satis
  gercek_cikis   NUMERIC(14,2),          -- gun_basi + dolum - gun_sonu
  fark           NUMERIC(14,2),          -- gun_sonu - beklenen_sonu
  yansimayan     NUMERIC(8,4),           -- max(0,fark)/satis  (0-1 arası oran)
  kapasite_asim  NUMERIC(14,2),
  risk           TEXT NOT NULL,          -- KRITIK | YUKSEK | INCELE | NORMAL | VERI_HATASI
  nedenler       TEXT[] NOT NULL DEFAULT '{}',
  aciklama       TEXT,                   -- POL "Açıklama" — alarmı KAPATMAZ, açıklar
  duzenleyen     TEXT,                   -- "Düzenleme Yapan"
  duzenleme_tar  TEXT,
  kriter_ks      TEXT,                   -- KS / Kriter1 / Kriter2 (POL'ün kendi kararı)
  esik_surum     TEXT,                   -- hangi eşik setiyle hesaplandı (audit)
  guncelleme     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gun, istasyon_kod, tank_no)
);
CREATE INDEX IF NOT EXISTS ix_a1b_gun ON a1b_gun (gun DESC);
CREATE INDEX IF NOT EXISTS ix_a1b_risk ON a1b_gun (gun DESC, risk) WHERE risk <> 'NORMAL';
CREATE INDEX IF NOT EXISTS ix_a1b_ist ON a1b_gun (istasyon_kod, gun DESC);
