-- A3 (ASIS POL) ↔ Logo mutabakatı — dönem bazında fatura satış kıyaslaması.
-- Kaynak: POL "A3 Aylık Satış Kontrol" Excel'i + BFF /dis/v1/mutabakat/fatura-satislari (Logo).
-- Kıyas anahtarı: fatura no. Alanlar: ürün, fatura satış litresi, çıkış tesisi (DEP).
-- Plaka/dorse KIYASA GİRMEZ (Logo'da tutulmuyor — 1.601 irsaliyenin 1'inde plaka; yanlış alarm olurdu).
-- İdempotent.

-- Her (dönem, fatura no) için tek satır: A3 ile Logo yan yana + durum.
CREATE TABLE IF NOT EXISTS mutabakat_a3 (
  donem          TEXT NOT NULL,           -- 'YYYY-MM' (ör. 2026-07)
  fatura_no      TEXT NOT NULL,           -- PRK2026000009677 (kıyas anahtarı)
  irsaliye_no    TEXT,                    -- PIR... (A3'ten; Logo'da fatura üstünden gelmiyor, bilgi amaçlı)
  epdk_kod       TEXT,                    -- A3'ten (BAY/939-82/...) — panel bayi eşlemesi için
  logo_cari_kod  TEXT,                    -- Logo cari kodu (120....) — aynı faturanın Logo tarafı
  istasyon       TEXT,                    -- A3 istasyon adı
  -- A3 (ASIS POL) tarafı
  a3_urun        TEXT,
  a3_litre       NUMERIC,                 -- Fatura Satış Miktarı
  a3_tesis       TEXT,                    -- Çıkış Tesisi (DEP/...)
  -- Logo tarafı
  logo_urun      TEXT,
  logo_litre     NUMERIC,
  logo_tesis     TEXT,
  logo_iptal     BOOLEAN DEFAULT FALSE,   -- Logo'da CANCELLED=1 ama A3'te geçerli → EPDK'ya düzeltme
  -- Kıyas sonucu
  durum          TEXT NOT NULL,           -- 'tam' | 'litre_fark' | 'urun_fark' | 'tesis_fark' | 'iptal' | 'logoda_yok'
  litre_fark     NUMERIC,                 -- logo_litre - a3_litre (işaretli)
  guncelleme     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (donem, fatura_no)
);

CREATE INDEX IF NOT EXISTS ix_mutabakat_a3_donem  ON mutabakat_a3 (donem);
CREATE INDEX IF NOT EXISTS ix_mutabakat_a3_durum  ON mutabakat_a3 (donem, durum);

-- Dönem başlıkları — panel dropdown'ı ve özet için (her çekimde upsert).
CREATE TABLE IF NOT EXISTS mutabakat_a3_donem (
  donem         TEXT PRIMARY KEY,         -- 'YYYY-MM'
  ad            TEXT,                     -- '2026 Temmuz' (POL dönem adı)
  pol_donem_kod TEXT,                     -- POL combo value (18, 19...) — yeniden çekim için
  fatura_sayisi INT NOT NULL DEFAULT 0,
  tam_sayisi    INT NOT NULL DEFAULT 0,
  sorunlu_sayisi INT NOT NULL DEFAULT 0,
  a3_toplam_litre   NUMERIC NOT NULL DEFAULT 0,
  logo_toplam_litre NUMERIC NOT NULL DEFAULT 0,
  cekim_zamani  TIMESTAMPTZ NOT NULL DEFAULT now()
);
