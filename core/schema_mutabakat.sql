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

-- Mutabakat maili DEBOUNCE (araclar/mutabakatMail.ts). Veri haftalık/aylık çekilir
-- (a3-mutabakat.yml: Pazartesi + ayın 2'si) ama mail günlük kontrol edilir — aynı
-- çekimden aynı sorunlu liste günlerce tekrar gönderilmesin, yalnız YENİ çekimde
-- (mutabakat_a3_donem.cekim_zamani ilerlediğinde) mail atılsın.
CREATE TABLE IF NOT EXISTS mutabakat_bildirim (
  donem            TEXT PRIMARY KEY,
  son_cekim_zamani TIMESTAMPTZ NOT NULL,
  bildirildi       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── TANK UZLAŞTIRMA (EPDK stok mutabakatı) — POL Tank Uzlaştırma Raporu ──────
-- Formül (POL ekranı + Excel ile doğrulandı 2026-08-11): Fark = (A + B − C) − D,
-- Oran = (Fark/C)*100. A=Dönem Başı Stok, B=Dolum, C=Pompa Satış, D=Dönem Sonu Stok.
-- EPDK limiti |Oran| ≤ %3 (ve mutlak 288 lt — 1240 kararı). Kırılım: bayi×ürün×tank.
-- Tarih ARALIĞI anahtar (A3'te ay idi; burada serbest başlangıç–bitiş).
-- İdempotent. Kaynak: POL TankUzlastirma.aspx (dtpTarih2 Date1/Date2).

CREATE TABLE IF NOT EXISTS uzlastirma (
  donem_bas    DATE NOT NULL,          -- aralık başlangıcı
  donem_bit    DATE NOT NULL,          -- aralık bitişi
  epdk_kod     TEXT NOT NULL,          -- BAY/939-82/...
  istasyon     TEXT,
  ist_kod      TEXT,
  bolge        TEXT,
  mintika      TEXT,
  urun         TEXT NOT NULL,          -- Mtrn / K95 / ...
  tank_no      TEXT NOT NULL,
  a_basi       NUMERIC,                -- Dönem Başı Stok (lt)
  b_dolum      NUMERIC,                -- Dolum Miktarı (lt) = bizden aldığı
  c_satis      NUMERIC,                -- Pompa Satış (lt) = sattığı
  d_sonu       NUMERIC,                -- Dönem Sonu Stok (lt) = kalan (fiziksel)
  e_fark       NUMERIC,                -- (A+B−C)−D
  f_oran       NUMERIC,                -- (E/C)*100
  kalib_ilk    NUMERIC,                -- İlk kalibrasyon %
  kalib_son    NUMERIC,                -- Son kalibrasyon %
  durum        TEXT NOT NULL,          -- 'uygun' | 'oran_asim' | 'kalib_degisti' | 'satis_yok'
  guncelleme   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ⚠️ ist_kod anahtarda: bir bayinin (aynı EPDK) BİRDEN ÇOK istasyonu olabilir
  -- (FULYAKIT: 210114 ana + 210114100 köy pompası, aynı ürün+tank no) → 2026-08-11.
  PRIMARY KEY (donem_bas, donem_bit, epdk_kod, ist_kod, urun, tank_no)
);
CREATE INDEX IF NOT EXISTS ix_uzlas_aralik ON uzlastirma (donem_bas, donem_bit);
CREATE INDEX IF NOT EXISTS ix_uzlas_bayi   ON uzlastirma (donem_bas, donem_bit, epdk_kod);
CREATE INDEX IF NOT EXISTS ix_uzlas_durum  ON uzlastirma (donem_bas, donem_bit, durum);

-- DIŞ SATIŞ (POL "Tablo A4 - Bayi Dış Satış") — bayi×ürün bazında dış satış litresi.
-- Uzlaştırmada "sattığı" = pompa (uzlastirma.c_satis) + DIŞ SATIŞ (bu tablo). A4 tank
-- kırılımı VERMEZ (EPDK+ürün) → bayi düzeyinde tutulur, panel bayi özetine eklenir.
-- Neden ayrı tablo: uzlastirma tank bazında; dış satışı tanka dağıtamayız (yanlış olur).
-- Kanıt (2026-08-12): A4 kolonları EPDK/Tarih/Ürün/Plaka/Belgelenen Dış Satış Miktarı.
CREATE TABLE IF NOT EXISTS uzlastirma_dissatis (
  donem_bas    DATE NOT NULL,
  donem_bit    DATE NOT NULL,
  epdk_kod     TEXT NOT NULL,
  urun         TEXT NOT NULL,           -- Motorin / K95 (kanonik değil, A4 ham adı)
  dis_satis_lt NUMERIC NOT NULL DEFAULT 0,
  satis_adedi  INT NOT NULL DEFAULT 0,  -- kaç dış satış fişi
  guncelleme   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (donem_bas, donem_bit, epdk_kod, urun)
);
CREATE INDEX IF NOT EXISTS ix_dissatis_bayi ON uzlastirma_dissatis (donem_bas, donem_bit, epdk_kod);

-- Çekilen aralıkların özeti (panel dropdown + üst kartlar).
CREATE TABLE IF NOT EXISTS uzlastirma_donem (
  donem_bas    DATE NOT NULL,
  donem_bit    DATE NOT NULL,
  ad           TEXT,                   -- '2026 Temmuz' ya da '01.07–31.07.2026'
  bayi_sayisi  INT NOT NULL DEFAULT 0,
  tank_sayisi  INT NOT NULL DEFAULT 0,
  sorunlu_bayi INT NOT NULL DEFAULT 0, -- ±%3 aşan en az 1 tankı olan bayi
  toplam_dolum NUMERIC NOT NULL DEFAULT 0,
  toplam_satis NUMERIC NOT NULL DEFAULT 0,
  cekim_zamani TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (donem_bas, donem_bit)
);
