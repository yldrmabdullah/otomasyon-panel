-- Parkoil Otomasyon Paneli — Postgres şeması (idempotent).
-- Supabase / Neon üzerinde çalışır. npm run db:migrate ile uygulanır.

-- İstasyon kütüğü (GetStationList'ten senkronlanır).
-- NOT (istasyon_kod): ASIS'te 5 istasyonun IstasyonKod alanı '0' (atanmamış) —
-- bunlar için core/asisClient.ts `istasyonKimlik()` EPDK no'dan 'E-{no}' türetir.
-- Yoksa PK çakışıp 4 gerçek bayi upsert'te birbirini eziyordu.
CREATE TABLE IF NOT EXISTS istasyonlar (
  istasyon_kod   TEXT PRIMARY KEY,          -- POL IstasyonKod (ör. 210001) veya E-{epdkNo}
  t_istasyon_id  TEXT,
  ad             TEXT NOT NULL,
  epdk_kod       TEXT,                       -- BAY/939-82/{no}
  epdk_no        TEXT,                       -- ayıklanmış {no} (eşleme anahtarı)
  sehir          TEXT,
  bolge          TEXT,
  mantika        TEXT,
  enlem          NUMERIC,
  boylam         NUMERIC,
  aktif          BOOLEAN NOT NULL DEFAULT TRUE,
  tip            TEXT,                       -- ASIS IstasyonTip: İstasyonlu / Köy pompası / Tanker
  guncelleme     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_istasyon_epdk_no ON istasyonlar (epdk_no);
-- Sonradan eklenen kolonlar (mevcut DB'yi bozmadan)
ALTER TABLE istasyonlar ADD COLUMN IF NOT EXISTS tip TEXT;
CREATE INDEX IF NOT EXISTS ix_istasyon_tip ON istasyonlar (tip);

-- İstasyon bağlantı son durumu.
-- online       = GERÇEK bağlantı (SonTarih eşik içinde mi)
-- kayitli_aktif = ASIS IstasyonDurum ("kütükte aktif mi") — bağlantı DEĞİL.
-- Bu ikisi eskiden karıştırılıyordu: panel "180 Online" gösterirken o istasyonların
-- son verisi 5 gün öncesiydi (2026-07-28 canlı tespit).
CREATE TABLE IF NOT EXISTS baglanti_durum (
  istasyon_kod    TEXT PRIMARY KEY REFERENCES istasyonlar (istasyon_kod) ON DELETE CASCADE,
  online          BOOLEAN NOT NULL,
  kayitli_aktif   BOOLEAN,
  son_veri_zamani TIMESTAMPTZ,
  ip              TEXT,
  guncelleme      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE baglanti_durum ADD COLUMN IF NOT EXISTS kayitli_aktif BOOLEAN;

-- Tank son durumu (GetTankLastLevel'dan). İstasyon+tank tekil.
CREATE TABLE IF NOT EXISTS tank_durum (
  istasyon_kod      TEXT NOT NULL REFERENCES istasyonlar (istasyon_kod) ON DELETE CASCADE,
  tank_no           TEXT NOT NULL,
  urun              TEXT,
  kapasite_lt       NUMERIC,
  mevcut_lt         NUMERIC,
  su_lt             NUMERIC,
  son_olcum_zamani  TIMESTAMPTZ,
  guncelleme        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (istasyon_kod, tank_no)
);

-- Bayi iletişim (alarm hedefi). Kaynak: POL Excel/Logo — kod bundan bağımsız.
-- ÇOKLU: bir bayide birden fazla cep/mail olabilir (POL'de 27 bayi 2+ tel, 11 bayi 2+ mail).
-- Bildirim HEPSİNE gider. telefon/eposta (tekil) geriye-dönük uyum için birincil değeri tutar.
CREATE TABLE IF NOT EXISTS bayi_iletisim (
  epdk_no    TEXT PRIMARY KEY,   -- istasyon.epdk_no ile eşleşir
  ad         TEXT,
  eposta     TEXT,               -- birincil (ilk) — geriye uyum
  telefon    TEXT,               -- birincil (ilk) — Netgsm formatı (5xxxxxxxxx)
  telefonlar TEXT[] NOT NULL DEFAULT '{}',  -- tüm cepler (5xx)
  epostalar  TEXT[] NOT NULL DEFAULT '{}',  -- tüm normal mailler (KEP hariç)
  kep        TEXT,               -- kayıt için (bildirim atılmaz)
  guncelleme TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Mevcut tabloya kolon ekle (idempotent — tablo zaten varsa).
ALTER TABLE bayi_iletisim ADD COLUMN IF NOT EXISTS telefonlar TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE bayi_iletisim ADD COLUMN IF NOT EXISTS epostalar  TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE bayi_iletisim ADD COLUMN IF NOT EXISTS kep        TEXT;

-- Panel kullanıcıları.
--
-- NEDEN DB'DE (env değil): kullanıcı yönetimi ekranı çalışma anında ekleme/silme
-- yapabilsin. Vercel ortam değişkeni çalışma anında değiştirilemez — her yeni
-- kullanıcı yeniden deploy gerektirirdi.
--
-- Şifre: scrypt(N=16384, r=8, p=1) + 16 bayt rastgele tuz. node:crypto içinde,
-- ek bağımlılık yok. Format: 'scrypt$<tuzHex>$<hashHex>'. Düz şifre HİÇ saklanmaz.
CREATE TABLE IF NOT EXISTS panel_kullanicilar (
  kullanici_ad   TEXT PRIMARY KEY,          -- küçük harfe normalize
  sifre_hash     TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'izleyici',  -- admin | izleyici
  ad_soyad       TEXT,
  sifre_degistir BOOLEAN NOT NULL DEFAULT FALSE,    -- ilk girişte zorunlu değişim
  son_giris      TIMESTAMPTZ,
  olusturan      TEXT,                      -- kim ekledi (denetim izi)
  olusturma      TIMESTAMPTZ NOT NULL DEFAULT now(),
  guncelleme     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Sonradan eklenen kolonlar (mevcut DB'yi bozmadan)
ALTER TABLE panel_kullanicilar ADD COLUMN IF NOT EXISTS sifre_degistir BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE panel_kullanicilar ADD COLUMN IF NOT EXISTS son_giris TIMESTAMPTZ;
ALTER TABLE panel_kullanicilar ADD COLUMN IF NOT EXISTS olusturan TEXT;

-- Alarmlar. Açık alarm = kapandi IS NULL. Debounce son_bildirim ile.
CREATE TABLE IF NOT EXISTS alarmlar (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tip             TEXT NOT NULL,               -- baglanti_kopuk | tank_veri_yok
  istasyon_kod    TEXT NOT NULL,
  tank_no         TEXT,                        -- tank_veri_yok için
  anahtar         TEXT NOT NULL,               -- tip|istasyon|tank (tekillik)
  istasyon_ad     TEXT,
  epdk_no         TEXT,
  mesaj           TEXT,
  acildi          TIMESTAMPTZ NOT NULL DEFAULT now(),
  son_bildirim    TIMESTAMPTZ,
  bildirim_sayisi INT NOT NULL DEFAULT 0,
  kapandi         TIMESTAMPTZ                  -- NULL ise hâlâ açık
);
-- Aynı anahtardan aynı anda EN FAZLA bir AÇIK alarm olsun.
CREATE UNIQUE INDEX IF NOT EXISTS ux_alarm_acik ON alarmlar (anahtar) WHERE kapandi IS NULL;
CREATE INDEX IF NOT EXISTS ix_alarm_acildi ON alarmlar (acildi DESC);

-- Tank dolumları (GetTankFillingList, artımlı). İrsaliye + hacim farkı → mutabakat kontrolü.
CREATE TABLE IF NOT EXISTS tank_dolum (
  dolum_id            BIGINT PRIMARY KEY,   -- TTankDolumID (ASIS tekil)
  istasyon_kod        TEXT NOT NULL,
  tank_no             TEXT,
  urun                TEXT,
  dolum_baslama       TIMESTAMPTZ,
  dolum_bitim         TIMESTAMPTZ,
  dolum_miktari       NUMERIC,              -- tanka giren (lt)
  dolum_miktari_net   NUMERIC,
  irsaliye_no         TEXT,
  irsaliye_litre      NUMERIC,              -- irsaliyede yazan (lt)
  irsaliye_hacim_fark NUMERIC,              -- irsaliye - tank (mutabakatın kalbi)
  kapasite_lt         NUMERIC,
  tanker_dolum_tarihi TIMESTAMPTZ,
  guncelleme          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dolum_tarih ON tank_dolum (dolum_baslama DESC);
CREATE INDEX IF NOT EXISTS ix_dolum_istasyon ON tank_dolum (istasyon_kod);

-- Sistem ayarları / cursor'lar (artımlı çekim: asis.son_dolum_id vb.).
CREATE TABLE IF NOT EXISTS sistem_ayar (
  anahtar    TEXT PRIMARY KEY,
  deger      TEXT,
  guncelleme TIMESTAMPTZ NOT NULL DEFAULT now()
);
