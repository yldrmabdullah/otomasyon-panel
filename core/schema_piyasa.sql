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
  -- Lisans iptal/sonlandırma bilgisi. EPDK: iptalSonaErdirmeTarihi/Aciklama.
  -- ⚠️ ONAYLANDI kayıtlarda tanım gereği BOŞ; yalnız SONLANDIRILDI/IPTAL_EDILDI
  -- durumlarında dolu (%95+). İzleme modülü "kapandı" kategorisi bunu kullanıyor.
  iptal_tarihi         DATE,
  iptal_aciklama       TEXT,
  ilk_gorulme          TIMESTAMPTZ NOT NULL DEFAULT now(),
  guncelleme           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bayi_dagitim ON bayiler_epdk (dagitim_sirketi);
CREATE INDEX IF NOT EXISTS ix_bayi_il ON bayiler_epdk (il);
-- ⚠️ 2026-08-27: `kayipBayileriUzlastir` (core/db.ts) bu kolonla süzüyor ve çekim
-- başına dağıtıcı sayısı kadar (32) çağrılıyor. İndekssiz her çağrı 30.370 satırı
-- baştan sona tarıyordu (EXPLAIN: Seq Scan, Rows Removed by Filter: 30370).
CREATE INDEX IF NOT EXISTS ix_bayi_dagitici_lisans ON bayiler_epdk (dagitici_lisans_no);

-- ⭐ SÖZLEŞME/LİSANS BİTİŞ SORGULARI İÇİN (2026-08-04, EXPLAIN ile ölçüldü).
--
-- Bu iki sorgu panel her açıldığında koşuyor ve 30.323 satırı BAŞTAN SONA
-- tarıyordu (Seq Scan, maliyet 2792). `lisans_durumu` üzerinde indeks yoktu.
--
-- KISMİ indeks (WHERE lisans_durumu='ONAYLANDI'): tabloda 12.633 onaylı bayi
-- var, yani indeks tam indeksin %42'si kadar. Sorguların HEPSİ zaten bu
-- filtreyi taşıyor — pasif/iptal bayileri indekslemenin anlamı yok.
--
-- ⚠️ Not: panelSorgu.ts'te "mevcut indeksler yeterli; ölçüldü" yazıyor. O ölçüm
-- BAYİ TABLOSU sorgusu içindi (il/dağıtıcı filtreli); sözleşme ve lisans bitiş
-- sorguları sonradan eklendi ve farklı kolonlara bakıyor.
CREATE INDEX IF NOT EXISTS ix_bayi_sozlesme_bitis ON bayiler_epdk (sozlesme_bitis)
  WHERE lisans_durumu = 'ONAYLANDI';
CREATE INDEX IF NOT EXISTS ix_bayi_lisans_bitis ON bayiler_epdk (lisans_bitis)
  WHERE lisans_durumu = 'ONAYLANDI';

-- Şema kayması onarımı: bu iki kolon canlıya `db.ts` üzerinden elle eklenmişti ama
-- şema dosyasına yazılmamıştı (2026-07-30'da fark edildi). Sıfırdan migrate edilen
-- ortamda `bayileriKaydet` "column does not exist" ile patlıyordu. Mevcut kurulumlar
-- için idempotent ALTER — CREATE TABLE IF NOT EXISTS var olan tabloyu değiştirmez.
ALTER TABLE bayiler_epdk ADD COLUMN IF NOT EXISTS iptal_tarihi   DATE;
ALTER TABLE bayiler_epdk ADD COLUMN IF NOT EXISTS iptal_aciklama TEXT;

-- Günlük snapshot — her gün her bayinin hangi dağıtıcıda/durumda olduğu. Transfer bundan türetilir.
--
-- ⚠️ `kapsam` KOLONU ZORUNLU (2026-07-29 dersi): çekim iki farklı kapsamda
-- yapılabiliyor — `onaylandi` (yalnız aktif, ~12.6bin) veya `tum` (iptal/sonlanmış
-- dahil, ~30.3bin). Kapsam kaydedilmediği için farklı kapsamdaki iki gün
-- karşılaştırıldı ve 17bin hayalet "ayrildi" üretecekti; yalnız satır SAYISI
-- kontrolü yakaladı. Artık kapsam da karşılaştırılıyor → uyuşmazlık net anlaşılır.
CREATE TABLE IF NOT EXISTS bayi_snapshot (
  snapshot_gun    DATE NOT NULL,
  bayi_lisans_no  TEXT NOT NULL,
  dagitim_sirketi TEXT,
  lisans_durumu   TEXT,
  il              TEXT,
  kapsam          TEXT,   -- 'tum' | 'onaylandi' — transfer karşılaştırmasında EŞİT olmalı
  PRIMARY KEY (snapshot_gun, bayi_lisans_no)
);
CREATE INDEX IF NOT EXISTS ix_snap_bayi ON bayi_snapshot (bayi_lisans_no, snapshot_gun DESC);
ALTER TABLE bayi_snapshot ADD COLUMN IF NOT EXISTS kapsam TEXT;

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
