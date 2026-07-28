-- Piyasa İstihbarat şeması (EPDK resmi verisi) — dağıtıcılar, bayiler, günlük snapshot, transferler.
-- Kaynak: EPDK petrolDagiticiLisansSorgula + petrolBayilikLisansiSorgula (public, kimliksiz).
-- İdempotent.

-- Dağıtım firmaları (32 onaylı + iptal/sonlanmışlar).
CREATE TABLE IF NOT EXISTS dagiticilar (
  lisans_no    TEXT PRIMARY KEY,      -- DAĞ/416-55/00516
  unvan        TEXT NOT NULL,
  vergi_no     TEXT,
  il           TEXT,
  ilce         TEXT,
  adres        TEXT,
  baslangic    DATE,
  bitis        DATE,
  durum        TEXT,                  -- ONAYLANDI / IPTAL_EDILDI / ...
  markalar     TEXT[] NOT NULL DEFAULT '{}',
  yakit_turleri TEXT[] NOT NULL DEFAULT '{}',
  guncelleme   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bayiler — GÜNCEL durum (her çekimde upsert). Bayi lisans no birincil anahtar.
CREATE TABLE IF NOT EXISTS bayiler_epdk (
  bayi_lisans_no       TEXT PRIMARY KEY,   -- BAY/939-82/21383
  lisans_sahibi        TEXT,               -- bayi sahibi (kişi/şirket)
  dagitim_sirketi      TEXT,               -- bağlı olduğu dağıtıcı ünvanı (TRANSFER anahtarı)
  dagitici_lisans_no   TEXT,               -- sorguda kullanılan dağıtıcı lisans no
  il                   TEXT,
  ilce                 TEXT,
  tesis_adresi         TEXT,
  vergi_no             TEXT,
  kategori             TEXT,               -- ISTASYONLU vb.
  alt_baslik           TEXT,               -- AKARYAKIT vb.
  lisans_durumu        TEXT,
  kacakcilik_iptal     INT DEFAULT 0,
  lisans_baslangic     DATE,
  lisans_bitis         DATE,
  sozlesme_baslangic   DATE,               -- dağıtıcıyla sözleşme başlangıcı
  sozlesme_bitis       DATE,
  ilk_gorulme          TIMESTAMPTZ NOT NULL DEFAULT now(),
  guncelleme           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bayi_dagitim ON bayiler_epdk (dagitim_sirketi);
CREATE INDEX IF NOT EXISTS ix_bayi_il ON bayiler_epdk (il);

-- Günlük snapshot — her gün her bayinin hangi dağıtıcıda/durumda olduğu. Transfer bundan türetilir.
CREATE TABLE IF NOT EXISTS bayi_snapshot (
  snapshot_gun    DATE NOT NULL,
  bayi_lisans_no  TEXT NOT NULL,
  dagitim_sirketi TEXT,
  lisans_durumu   TEXT,
  il              TEXT,
  PRIMARY KEY (snapshot_gun, bayi_lisans_no)
);
CREATE INDEX IF NOT EXISTS ix_snap_bayi ON bayi_snapshot (bayi_lisans_no, snapshot_gun DESC);

-- Tespit edilen transferler (dağıtıcı değişimi) + durum değişimleri.
CREATE TABLE IF NOT EXISTS transferler (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bayi_lisans_no TEXT NOT NULL,
  lisans_sahibi  TEXT,
  il             TEXT,
  tip            TEXT NOT NULL,        -- dagitici_degisti | yeni_bayi | durum_degisti | ayrildi
  eski_deger     TEXT,                 -- eski dağıtıcı / eski durum
  yeni_deger     TEXT,                 -- yeni dağıtıcı / yeni durum
  tespit_gun     DATE NOT NULL,
  olusturma      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_transfer_gun ON transferler (tespit_gun DESC);
CREATE INDEX IF NOT EXISTS ix_transfer_tip ON transferler (tip);
