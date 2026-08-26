-- HACİM ŞEMASI — iki ayrı konu, ikisi de "litre/ton bazında ne kadar" sorusu:
--   1) epdk_hacim*  → PİYASA hacmi (EPDK sektör raporu): rakip dahil, hacim bazlı pazar payı.
--   2) satis_fatura → BİZİM satışımız (Logo fatura satırı): hangi bayi ürün grubunda ne aldı.
-- Ayrı tablolar; kaynakları, birimleri ve güncellenme sıklıkları farklı. İdempotent.

-- ══ 1) EPDK SEKTÖR RAPORU — HACİM BAZLI PAZAR PAYI ═══════════════════════
-- Kaynak: EPDK Petrol Piyasası Aylık Sektör Raporu eki (Excel, public, kimlik yok).
-- Tam keşif + tuzaklar: docs/bilgi/epdk-sektor-raporu-hacim.md
--
-- NEDEN GEREKLİ: panelin mevcut pazar payı (panelSorgu ANALİZ 2) bayi ADEDİ oranı.
-- Kullanıcı hacim bazlı istedi (motorin/benzin satışına göre). Ölçüldü: adet ve hacim
-- ciddi ayrışıyor — ISPARTA adet %2,7 ama hacim %7,27.
--
-- ⚠️ KÜMÜLATİF VERİ: rapor Ocak–ilgili ay toplamıdır, tek ay DEĞİL.
--    `donem_ay` = raporun ayı (kümülatifin bittiği ay). Tek-ay değeri için ardışık
--    iki dönemin farkı alınır (panelde/sorguda, saklamada değil).
-- ⚠️ EPDK bildirim DÜZELTMESİ yapılabiliyor → aynı dönem sonraki yayınlarda değişebilir.
--    Bu yüzden PK'da rapor kaynağı yok: yeniden çekilince ÜZERİNE yazılır (upsert),
--    değişen değer job logunda görünür.
CREATE TABLE IF NOT EXISTS epdk_hacim_dagitici (
  donem_yil    INT  NOT NULL,
  donem_ay     INT  NOT NULL,            -- kümülatifin bittiği ay (6 = Ocak–Haziran)
  unvan        TEXT NOT NULL,            -- EPDK ünvanı (TURGUT DAĞITIM ENERJİ ANONİM ŞİRKETİ)
  urun_grubu   TEXT NOT NULL,            -- 'benzin' | 'motorin'  (kanonik)
  -- Satış kanalları (Tablo 17/18 kolonları). Motorinde tarımsal tanker VAR, benzinde YOK.
  istasyon_litre NUMERIC,                -- İstasyon Pompa Satış
  koy_litre      NUMERIC,                -- Köy Pompası Satış
  tarim_litre    NUMERIC,                -- Tarımsal Satış Amaçlı Tanker (yalnız motorin)
  dis_litre      NUMERIC,                -- Dış Satış
  toplam_litre   NUMERIC NOT NULL,       -- Toplam Satış
  -- ⭐ EPDK'nın KENDİ hesapladığı pay — biz yeniden hesaplamıyoruz (kaynak otoritesi).
  pazar_payi     NUMERIC,                -- Pazar Payı (%)
  kaynak_rapor   TEXT,                   -- hangi yayından geldi (izlenebilirlik)
  guncelleme     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (donem_yil, donem_ay, unvan, urun_grubu)
);
CREATE INDEX IF NOT EXISTS ix_ehd_donem ON epdk_hacim_dagitici (donem_yil DESC, donem_ay DESC);
-- Bizim satırımızı ve ürün trendini çeken sorgular için (panel her açılışta okur).
CREATE INDEX IF NOT EXISTS ix_ehd_unvan ON epdk_hacim_dagitici (unvan, urun_grubu, donem_yil, donem_ay);

-- İL × şirket × ürün hacmi (2026 biçimi: Tablo 24 / 2025 biçimi: il-başına-sheet).
-- ⚠️ BİRİM TON (litre değil) — Tablo 17/18 ile TOPLANMAZ, kıyaslanmaz. Yoğunluk
--    bilinmediği için dönüşüm yapılmaz; panelde birim etiketlenir.
-- Bu tablo hacim bazlı İL ısı ızgarasını besler (mevcut adet bazlı olanın yanına).
CREATE TABLE IF NOT EXISTS epdk_hacim_il (
  donem_yil   INT  NOT NULL,
  donem_ay    INT  NOT NULL,
  kumulatif   BOOLEAN NOT NULL DEFAULT TRUE,  -- 2026 Tablo 24 tek AY, 2025 biçimi tek AY → false
  il          TEXT NOT NULL,
  unvan       TEXT NOT NULL,
  benzin_ton  NUMERIC,
  motorin_ton NUMERIC,
  toplam_ton  NUMERIC,
  guncelleme  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (donem_yil, donem_ay, il, unvan)
);
CREATE INDEX IF NOT EXISTS ix_ehi_donem ON epdk_hacim_il (donem_yil DESC, donem_ay DESC);
CREATE INDEX IF NOT EXISTS ix_ehi_il    ON epdk_hacim_il (il, donem_yil DESC, donem_ay DESC);

-- Çekim koşusu kaydı — hangi rapor ne zaman indirildi, kaç satır, hangi biçim.
-- Otomasyon kuralı (bkz. memory: elle iş istenmiyor): son koşusu elle tetiklenmişse
-- görünür olsun. Biçim kayması (A/B) burada izlenir.
CREATE TABLE IF NOT EXISTS epdk_hacim_kosu (
  donem_yil   INT NOT NULL,
  donem_ay    INT NOT NULL,
  bicim       TEXT NOT NULL,          -- 'tablo' (2026+) | 'il_sheet' (2025-)
  dagitici_satir INT NOT NULL DEFAULT 0,
  il_satir       INT NOT NULL DEFAULT 0,
  dosya_bayt     INT,
  hata           TEXT,
  kosu_zamani  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (donem_yil, donem_ay)
);

-- ══ 2) BİZİM SATIŞIMIZ — bayi × ürün grubu alımları (YÖNETİM sekmesi) ════
-- Kaynak: BFF /dis/v1/mutabakat/fatura-satislari → Logo INVOICE+STLINE (canlı, salt-oku).
-- Logo tarafı kanıtlı: "Temmuz fatura litresi A3 ile %99,9 birebir" (LogoCanliServisi).
--
-- NEDEN AYRI TABLO: mutabakat_a3 bir KIYAS tablosu (A3 ile Logo'yu yan yana koyar,
-- durum/litre_fark kolonlu). "Hangi bayi ne kadar aldı" sorusu için yanlış şekil —
-- orada yalnız mutabakata giren dönem var ve satırlar kıyas sonucuna göre filtreli.
-- Burası düz bir SATIŞ FACT tablosu: tarih × bayi × ürün × litre × tutar.
--
-- ⚠️ İPTAL SATIRI SİLİNMEZ, işaretlenir. Toplamlar `WHERE NOT iptal` ile alınır;
--    iptali de görmek gerekebilir (yönetim "neden düştü" sorar).
CREATE TABLE IF NOT EXISTS satis_fatura (
  fatura_no    TEXT NOT NULL,
  tarih        DATE NOT NULL,
  cari_kod     TEXT NOT NULL,          -- Logo cari kodu (120.xx)
  bayi_ad      TEXT,                   -- Logo ClCard ünvanı (BFF ucundan)
  urun_kod     TEXT NOT NULL,          -- Logo stok kodu
  urun         TEXT,                   -- Logo ürün adı (ham)
  urun_grubu   TEXT,                   -- kanonik: 'motorin' | 'benzin' | 'fuel_oil' | 'kalorifer' | 'diger'
  litre        NUMERIC NOT NULL DEFAULT 0,
  tutar        NUMERIC,                -- TL (BFF'e SUM(sl.TOTAL) eklendi)
  cikis_tesisi TEXT,
  iptal        BOOLEAN NOT NULL DEFAULT FALSE,
  guncelleme   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Aynı faturada aynı ürün BFF ucunda GROUP BY ile tekilleştirilmiş geliyor.
  PRIMARY KEY (fatura_no, urun_kod)
);
CREATE INDEX IF NOT EXISTS ix_sf_tarih ON satis_fatura (tarih DESC);
-- Yönetim sekmesinin ana sorgusu: tarih aralığı + bayi kırılımı.
CREATE INDEX IF NOT EXISTS ix_sf_cari  ON satis_fatura (cari_kod, tarih DESC);
CREATE INDEX IF NOT EXISTS ix_sf_grup  ON satis_fatura (urun_grubu, tarih DESC);

-- Çekim koşusu — hangi dönem çekildi (boşluk tespiti için).
CREATE TABLE IF NOT EXISTS satis_fatura_kosu (
  donem_bas   DATE NOT NULL,
  donem_bit   DATE NOT NULL,
  satir       INT NOT NULL DEFAULT 0,
  litre       NUMERIC,
  tutar       NUMERIC,
  hata        TEXT,
  kosu_zamani TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (donem_bas, donem_bit)
);

-- Şema kayması onarımı: tutar/bayi_ad kolonları sonradan eklendi (BFF ucu önce
-- yalnız litre veriyordu). İdempotent — CREATE TABLE IF NOT EXISTS var olanı değiştirmez.
ALTER TABLE satis_fatura ADD COLUMN IF NOT EXISTS tutar   NUMERIC;
ALTER TABLE satis_fatura ADD COLUMN IF NOT EXISTS bayi_ad TEXT;
