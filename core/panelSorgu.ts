// Panel veri sorguları — TEK KAYNAK.
//
// NEDEN BURADA: iki tüketici var (local snapshot aracı + Vercel serverless) ve
// bunlar ayrı ayrı yazıldığında SENKRONSUZ İKİ GERÇEK oluştu — serverless
// endpoint'i UI'ın okuduğu 5 alanı (sozlesmeBitecek, bolgesel, beyazAlan,
// kaybedilen, ozet.toplam_bayi) hiç döndürmüyordu ve baglanti'yı kategori/rakip
// alanları olmadan seçiyordu → prod'da Piyasa yarım, İzleme tablosu çöküyordu.
// Ayrıca ONAYLANDI filtresi bir tarafta var bir tarafta yoktu: aynı panel
// local'de 12.624, prod'da 30.303 "aktif bayi" gösteriyordu.
//
// Bundan sonra: sorgu değişikliği YALNIZ bu dosyada yapılır.

import type { Pool } from 'pg';

/** Parkoil'in EPDK'daki tüzel kimliği (bkz docs/bilgi/piyasa-istihbarat.md). */
export const BIZ = 'TURGUT DAĞITIM ENERJİ ANONİM ŞİRKETİ';

/**
 * Her veri kaynağının en son ne zaman güncellendiği (panelde "X önce güncellendi").
 *
 * NEDEN: 2026-07-29'a kadar EPDK piyasa çekimi ELLE yapılıyordu ve panelde sadece
 * 2 günlük snapshot vardı — kullanıcı baktığı verinin bayat olduğunu göremiyordu.
 * "Canlı veri ilkesi" gereği ekranda gösterilen her şeyin yaşı görünmeli.
 *
 * `esik_dk`: bu süreyi geçerse panel uyarı gösterir. Kaynağın kendi ritmine göre:
 * izleme cron'u 15 dk (dış tetikleyici düşerse ~95 dk'ya çıkabiliyor → 180 tolerans),
 * piyasa çekimi günde 1 kez (→ 48 saat).
 */
export async function tazelikVerisi(p: Pool) {
  const r = await p.query(`
    SELECT * FROM (VALUES
      ('istasyonlar', 'İstasyon kütüğü',   (SELECT max(guncelleme) FROM istasyonlar),    180),
      ('baglanti',    'Bağlantı durumu',   (SELECT max(guncelleme) FROM baglanti_durum), 180),
      ('tank',        'Tank durumu',       (SELECT max(guncelleme) FROM tank_durum),     180),
      ('dolum',       'Tank dolumları',    (SELECT max(dolum_baslama) FROM tank_dolum),  1440),
      ('bayiler',     'EPDK bayi kütüğü',  (SELECT max(guncelleme) FROM bayiler_epdk),   2880),
      ('dagiticilar', 'EPDK dağıtıcılar',  (SELECT max(guncelleme) FROM dagiticilar),    2880),
      ('snapshot',    'Piyasa snapshot',   (SELECT max(snapshot_gun)::timestamptz FROM bayi_snapshot), 2880)
    ) t(anahtar, ad, son, esik_dk)
    ORDER BY son NULLS FIRST`);

  return r.rows.map((x) => {
    // son=NULL → o kaynak hiç çekilmemiş; yaş hesaplanamaz, "bilinmiyor" olarak işaretle.
    const yasDk = x.son ? Math.round((Date.now() - new Date(x.son).getTime()) / 60000) : null;
    return {
      anahtar: x.anahtar as string,
      ad: x.ad as string,
      son: x.son ? new Date(x.son).toISOString() : null,
      yasDk,
      esikDk: Number(x.esik_dk),
      bayat: yasDk === null || yasDk > Number(x.esik_dk),
    };
  });
}

/** Piyasa modülünün tüm verisi. */
export async function piyasaVerisi(p: Pool) {
  const [dagiticiBayi, ilDagilim, sonTransfer, ozet, sozlesme, bolgesel, beyazAlan, kaybedilen] =
    await Promise.all([
      p.query(`SELECT dagitim_sirketi,count(*) FILTER (WHERE lisans_durumu='ONAYLANDI') n
               FROM bayiler_epdk WHERE dagitim_sirketi IS NOT NULL
               GROUP BY dagitim_sirketi
               HAVING count(*) FILTER (WHERE lisans_durumu='ONAYLANDI')>0
               ORDER BY n DESC`),
      p.query(`SELECT il,count(*) n FROM bayiler_epdk
               WHERE il IS NOT NULL AND lisans_durumu='ONAYLANDI'
               GROUP BY il ORDER BY n DESC LIMIT 20`),
      p.query(`SELECT bayi_lisans_no,lisans_sahibi,il,tip,eski_deger,yeni_deger,tespit_gun
               FROM transferler ORDER BY tespit_gun DESC,id DESC LIMIT 100`),
      p.query(`SELECT
                 (SELECT count(*) FROM dagiticilar) dagitici_sayisi,
                 (SELECT count(*) FROM bayiler_epdk WHERE lisans_durumu='ONAYLANDI') aktif_bayi,
                 (SELECT count(*) FROM bayiler_epdk) toplam_bayi,
                 (SELECT count(DISTINCT snapshot_gun) FROM bayi_snapshot) snapshot_gun_sayisi,
                 (SELECT count(*) FROM transferler WHERE tespit_gun > now()-interval '30 days') aylik_transfer`),
      // ANALİZ 1: Sözleşmesi 6 ay içinde bitecek AKTİF bayiler
      // (bizimkiler yenileme takibi, rakipler hedef liste)
      p.query(
        `SELECT bayi_lisans_no,lisans_sahibi,dagitim_sirketi,il,sozlesme_bitis,
                (dagitim_sirketi=$1) bizim
         FROM bayiler_epdk
         WHERE lisans_durumu='ONAYLANDI' AND sozlesme_bitis IS NOT NULL
           AND sozlesme_bitis > now() AND sozlesme_bitis < now()+interval '180 days'
         ORDER BY sozlesme_bitis ASC LIMIT 300`,
        [BIZ],
      ),
      // ANALİZ 2: Parkoil'in il bazında konumu (bizim bayi / o ildeki toplam)
      p.query(
        `WITH il_toplam AS (
           SELECT il, count(*) toplam, count(*) FILTER (WHERE dagitim_sirketi=$1) bizim
           FROM bayiler_epdk WHERE lisans_durumu='ONAYLANDI' AND il IS NOT NULL GROUP BY il)
         SELECT il, toplam, bizim, round(100.0*bizim/toplam,1) pay
         FROM il_toplam WHERE bizim>0 ORDER BY bizim DESC`,
        [BIZ],
      ),
      // Beyaz alan: Parkoil'in HİÇ bayisi olmayan ama piyasanın yoğun olduğu iller
      p.query(
        `WITH il_toplam AS (
           SELECT il, count(*) toplam, count(*) FILTER (WHERE dagitim_sirketi=$1) bizim
           FROM bayiler_epdk WHERE lisans_durumu='ONAYLANDI' AND il IS NOT NULL GROUP BY il)
         SELECT il, toplam FROM il_toplam WHERE bizim=0 ORDER BY toplam DESC LIMIT 15`,
        [BIZ],
      ),
      // ANALİZ 3 — KAYBEDİLEN BAYİLER: ASIS'te bizim istasyonumuz OFFLINE ama
      // EPDK'da başka dağıtıcıda AKTİF → bizden ayrılıp rakibe geçmiş.
      p.query(
        `SELECT i.ad, i.epdk_kod, i.sehir, e.dagitim_sirketi rakip, e.il
         FROM istasyonlar i
         JOIN baglanti_durum b ON b.istasyon_kod=i.istasyon_kod AND b.online=false
         JOIN bayiler_epdk e ON e.bayi_lisans_no=i.epdk_kod
         WHERE e.lisans_durumu='ONAYLANDI' AND e.dagitim_sirketi NOT ILIKE '%TURGUT%'
         ORDER BY i.ad`,
      ),
    ]);

  return {
    uretim: new Date().toISOString(),
    biz: BIZ,
    // Piyasa verisi günde 1 kez çekiliyor → bayatlaması EN muhtemel olan burası.
    tazelik: await tazelikVerisi(p),
    ozet: ozet.rows[0],
    dagiticiBayiDagilim: dagiticiBayi.rows,
    ilDagilim: ilDagilim.rows,
    transferler: sonTransfer.rows,
    sozlesmeBitecek: sozlesme.rows,
    bolgesel: bolgesel.rows,
    beyazAlan: beyazAlan.rows,
    kaybedilen: kaybedilen.rows,
  };
}

/** İzleme modülünün verisi.
 *  tanklar SEÇİLMİYOR: UI'da tek tüketicisi yoktu ama yanıtın %41'iydi (114 KB)
 *  ve 60 saniyede bir çekiliyordu (günde ~164 MB boşa trafik). Tank verisi
 *  gerektiğinde ayrı /api/tanklar endpoint'i açılır, ana polling'e binmez. */
export async function durumVerisi(p: Pool) {
  const [ist, bag, alarm, tazelik] = await Promise.all([
    // tip = ASIS IstasyonTip (İstasyonlu / Köy pompası / Köy tankeri) — hepsi gerçek
    // satış noktası, farklı iş modelleri. Panelde kolon + filtre olarak kullanılır.
    p.query('SELECT istasyon_kod,ad,epdk_kod,sehir,bolge,aktif,tip FROM istasyonlar ORDER BY ad'),
    // Offline istasyonu 3 anlamlı kategoriye ayırır (kopuk / kapandi / rakibe).
    // kategori + rakip + iptal_aciklama alanları UI'da ZORUNLU — eksikse tablo çöker.
    //
    // ⚠️ online = GERÇEK bağlantı (SonTarih tazeliği), kayitli_aktif = ASIS kütük durumu.
    // Kütükte pasif olan nokta 'kapandi'ya düşer: EPDK'da hâlâ ONAYLANDI görünse bile
    // ASIS bizim için pasif işaretlemişse "kopuk" diye alarm üretmek yanlış alarmdır.
    p.query(`SELECT b.istasyon_kod, b.online, b.kayitli_aktif, b.son_veri_zamani, b.ip, b.guncelleme,
               CASE
                 WHEN b.online THEN 'online'
                 WHEN b.kayitli_aktif IS FALSE THEN 'kapandi'
                 WHEN e.dagitim_sirketi ILIKE '%TURGUT%' AND e.lisans_durumu='ONAYLANDI' THEN 'kopuk'
                 WHEN e.lisans_durumu IN ('IPTAL_EDILDI','SONLANDIRILDI') THEN 'kapandi'
                 WHEN e.dagitim_sirketi IS NOT NULL AND e.dagitim_sirketi NOT ILIKE '%TURGUT%' THEN 'rakibe'
                 ELSE 'bilinmiyor'
               END kategori,
               e.dagitim_sirketi rakip, e.iptal_aciklama, e.iptal_tarihi
             FROM baglanti_durum b
             LEFT JOIN istasyonlar i ON i.istasyon_kod=b.istasyon_kod
             LEFT JOIN bayiler_epdk e ON e.bayi_lisans_no=i.epdk_kod`),
    p.query(`SELECT id::text,tip,istasyon_kod,tank_no,istasyon_ad,epdk_no,mesaj,acildi,
                    son_bildirim,bildirim_sayisi,kapandi
             FROM alarmlar ORDER BY (kapandi IS NULL) DESC,acildi DESC LIMIT 300`),
    // 7 satır — ana yanıta yük bindirmiyor, karşılığında her ekranda veri yaşı görünür.
    tazelikVerisi(p),
  ]);

  return {
    uretim: new Date().toISOString(),
    istasyonlar: ist.rows,
    baglanti: bag.rows,
    alarmlar: alarm.rows,
    tazelik,
  };
}

/** Bayi tablosu sorgu parametreleri (panel filtre çubuğuyla birebir). */
export interface BayiSorgu {
  q?: string;          // ad / lisans no / ilçe arama
  il?: string;
  dagitici?: string;
  durum?: string;      // ONAYLANDI | SONLANDIRILDI | IPTAL_EDILDI
  sadeceBiz?: boolean;
  sirala?: string;
  artan?: boolean;
  sayfa?: number;
  boyut?: number;
}

/** Sıralanabilir kolonlar — WHITELIST.
 *  ⚠️ Kullanıcı girdisi asla doğrudan ORDER BY'a konmaz (SQL injection). */
const SIRALANABILIR = new Set([
  'lisans_sahibi', 'dagitim_sirketi', 'il', 'ilce',
  'lisans_durumu', 'kategori', 'bayi_lisans_no', 'sozlesme_bitis',
]);

/**
 * Bayi tablosu — SUNUCU TARAFLI sayfalama + filtre + sıralama.
 *
 * ⚠️ NEDEN: tüm tabloyu döndürmek 30.303 satır / 8.88 MB / **26.5 saniye** sürüyordu.
 * Vercel ücretsiz planında serverless limiti 10 sn → endpoint timeout'a düşüyor ve
 * "Tüm Bayiler" tablosu canlıda HİÇ çalışmıyordu. Sayfalı sorgu ~103 ms.
 * Mevcut indeksler (ix_bayi_il, ix_bayi_dagitim) yeterli; ölçüldü.
 */
export async function bayiVerisi(p: Pool, s: BayiSorgu = {}) {
  const kosul: string[] = [];
  const arg: unknown[] = [];
  const ekle = (v: unknown) => { arg.push(v); return `$${arg.length}`; };

  if (s.q?.trim()) {
    const k = ekle(`%${s.q.trim()}%`);
    kosul.push(`(lisans_sahibi ILIKE ${k} OR bayi_lisans_no ILIKE ${k} OR ilce ILIKE ${k})`);
  }
  if (s.il) kosul.push(`il = ${ekle(s.il)}`);
  if (s.dagitici) kosul.push(`dagitim_sirketi = ${ekle(s.dagitici)}`);
  if (s.durum) kosul.push(`lisans_durumu = ${ekle(s.durum)}`);
  if (s.sadeceBiz) kosul.push(`dagitim_sirketi = ${ekle(BIZ)}`);

  const where = kosul.length ? `WHERE ${kosul.join(' AND ')}` : '';
  const kolon = s.sirala && SIRALANABILIR.has(s.sirala) ? s.sirala : 'lisans_sahibi';
  const yon = s.artan === false ? 'DESC' : 'ASC';
  const boyut = Math.min(200, Math.max(1, Number(s.boyut) || 50));
  const sayfa = Math.max(1, Number(s.sayfa) || 1);

  const r = await p.query(
    `SELECT bayi_lisans_no,lisans_sahibi,dagitim_sirketi,il,ilce,lisans_durumu,kategori,sozlesme_bitis,
            count(*) OVER() AS toplam
     FROM bayiler_epdk ${where}
     ORDER BY ${kolon} ${yon} NULLS LAST
     LIMIT ${boyut} OFFSET ${(sayfa - 1) * boyut}`,
    arg,
  );

  const toplam = Number(r.rows[0]?.toplam ?? 0);
  return {
    satirlar: r.rows.map(({ toplam: _t, ...k }) => k),
    toplam,
    sayfa,
    boyut,
  };
}

/** Kalan-gün eşikleri. 1 gün altı = bugün sipariş girilmeli (acil). */
const STOK_ACIL_GUN = 1;
const STOK_UYARI_GUN = 2;
/** Tüketim ortalaması bu kadar günlük dolumdan hesaplanır. */
const TUKETIM_PENCERE_GUN = 30;
/** Tankta bu litreden fazla su = kalite sorunu (ASIS SuSeviyeLT). */
const SU_ESIK_LT = 50;
/** Yanıp sönme (flapping) tanımı: ortalama bu süreden kısa açık kalan alarm...
 *  Tank verisi 30 dk periyotlu olduğu için 45 dk altı "veri gecikmesi" demektir. */
const FLAP_ORT_DK = 45;
/** ...ve en az bu kadar tekrar. Tek seferlik kısa alarm yanıp sönme sayılmaz. */
const FLAP_MIN_TEKRAR = 5;

/**
 * Operasyon modülü — otomasyon ekibinin ELLE takip ettiği 3 iş.
 * Hepsi MEVCUT veriden hesaplanır, yeni ASIS çağrısı gerektirmez.
 *
 * 1) stok — yakıt kaç gün yeter (stok ÷ günlük tüketim)
 * 2) alarmOzet + kronik — alarm geçmişi ve tekrar edenler
 * 3) irsaliyesiz — irsaliye bilgisi ASIS'e akmayan dolumlar
 *
 * ⚠️ STOK HESABINDA İKİ TUZAK (2026-07-29'da ikisine de düşüldü, düzeltildi):
 *
 * a) **Gruplama:** tüketim istasyon+ürün bazında toplanır ama stok TANK bazında
 *    tutulur. Tank başına karşılaştırmak, 4 tanklı bir istasyonun tüm tüketimini
 *    tek tanka yükler → "304 tank 2 günden az" gibi imkânsız sonuç verir.
 *    Doğrusu: İKİ TARAFI DA istasyon+ürün bazında topla (46'ya düştü).
 *
 * b) **Doluluk yüzdesi kritiklik ölçüsü DEĞİL:** dolum öncesi tank normalde boşalır.
 *    "%15 altı" ile bakmak 342/673 tankı "kritik" gösteriyordu — normal işletme.
 *    Anlamlı ölçü SATIŞ HIZINA göre kalan gün.
 *
 * Tüketim vekili olarak DOLUM kullanılır: pompa satışı (GetPumpSaleList) DB'ye
 * çekilmiyor. Uzun vadede dolum ≈ satış (tank kapalı sistem), ama kısa vadede
 * dalgalanır → bu yüzden 30 günlük ortalama alınır ve rakam "tahmin" olarak sunulur.
 */
export async function operasyonVerisi(p: Pool) {
  const [stok, alarmOzet, kronik, irsaliyesiz, irsaliyeIstasyon, kalibrasyon, su] =
    await Promise.all([
      // 1) Kalan gün — İKİ TARAF da istasyon+ürün bazında toplanır (yukarıdaki tuzak a)
      p.query(
        `WITH tuketim AS (
           SELECT istasyon_kod, urun, sum(dolum_miktari) / $1::numeric gunluk
           FROM tank_dolum
           WHERE dolum_baslama >= now() - ($1 || ' days')::interval
           GROUP BY 1, 2
           HAVING sum(dolum_miktari) > 0),
         stok AS (
           SELECT istasyon_kod, urun, sum(mevcut_lt) mevcut, count(*) tank,
                  sum(kapasite_lt) kapasite, max(son_olcum_zamani) son_olcum
           FROM tank_durum WHERE kapasite_lt > 0
           GROUP BY 1, 2)
         SELECT s.istasyon_kod, i.ad istasyon_ad, i.sehir, s.urun, s.tank,
                round(s.mevcut) mevcut_lt, round(s.kapasite) kapasite_lt,
                round(t.gunluk) gunluk_tuketim,
                round((s.mevcut / t.gunluk)::numeric, 1) kalan_gun,
                s.son_olcum
         FROM stok s
         JOIN tuketim t ON t.istasyon_kod = s.istasyon_kod AND t.urun = s.urun
         LEFT JOIN istasyonlar i ON i.istasyon_kod = s.istasyon_kod
         WHERE s.mevcut / t.gunluk < 7   -- 7 günden fazlası operasyonel ilgi dışı
         ORDER BY s.mevcut / t.gunluk`,
        [TUKETIM_PENCERE_GUN],
      ),

      // 2) Alarm özeti — tip bazında sayı + ortalama açık kalma süresi
      p.query(`SELECT tip, count(*)::int toplam,
                      count(*) FILTER (WHERE kapandi IS NULL)::int acik,
                      round(avg(extract(epoch FROM (coalesce(kapandi, now()) - acildi)) / 3600)::numeric, 1) ort_saat,
                      round(max(extract(epoch FROM (coalesce(kapandi, now()) - acildi)) / 3600)::numeric, 1) en_uzun_saat
               FROM alarmlar GROUP BY 1 ORDER BY toplam DESC`),

      // Kronik: aynı istasyon tekrar tekrar alarm alıyor.
      //
      // ⚠️ İKİ FARKLI DURUM, KARIŞTIRILMAMALI (2026-07-30 canlı bulgu):
      //  • YANIP SÖNME (flapping): alarm açılıp ~30 dk içinde kapanıyor, sürekli tekrar.
      //    Örnek: 210221'in 3 tankı da 22 kez, ortalama 28,4 dk. Gerçek arıza DEĞİL —
      //    tank verisi 30 dk periyotlu, eşik 35 dk; veri birkaç dakika gecikince alarm
      //    açılıp sonraki veriyle kapanıyor. Çözüm arıza gidermek değil, EŞİĞİ ayarlamak.
      //  • GERÇEK ARIZA: alarm açılıp uzun süre açık kalıyor (saatler).
      //
      // Bu ayrım yapılmazsa "66 alarm" diye listenin başındaki istasyon ekibi boşa koşturur.
      // `yanip_sonme` bayrağı UI'da ayrı etiketle gösterilir.
      p.query(
        `SELECT a.istasyon_kod, coalesce(i.ad, a.istasyon_ad) istasyon_ad, i.sehir,
                count(*)::int alarm_sayisi,
                count(*) FILTER (WHERE a.kapandi IS NULL)::int acik,
                round(avg(extract(epoch FROM (coalesce(a.kapandi, now()) - a.acildi)) / 60)::numeric, 0) ort_dk,
                round(max(extract(epoch FROM (coalesce(a.kapandi, now()) - a.acildi)) / 3600)::numeric, 1) en_uzun_saat,
                -- kısa süreli + çok tekrar → eşik sorunu, arıza değil
                (avg(extract(epoch FROM (coalesce(a.kapandi, now()) - a.acildi)) / 60) < $1
                 AND count(*) >= $2) yanip_sonme,
                max(a.acildi) son_alarm
         FROM alarmlar a
         LEFT JOIN istasyonlar i ON i.istasyon_kod = a.istasyon_kod
         GROUP BY 1, 2, 3 HAVING count(*) > 1
         ORDER BY alarm_sayisi DESC, son_alarm DESC LIMIT 50`,
        [FLAP_ORT_DK, FLAP_MIN_TEKRAR],
      ),

      // 3) İrsaliyesiz dolum oranı (son 30 gün)
      p.query(
        `SELECT count(*) FILTER (WHERE irsaliye_no IS NULL OR irsaliye_no = '')::int irsaliyesiz,
                count(*)::int toplam,
                count(*) FILTER (WHERE irsaliye_litre = 0)::int litresiz
         FROM tank_dolum WHERE dolum_baslama >= now() - ($1 || ' days')::interval`,
        [TUKETIM_PENCERE_GUN],
      ),

      // İstasyon bazında en kötüler — bu somut, tartışmaya açık değil
      p.query(
        `SELECT d.istasyon_kod, coalesce(i.ad, d.istasyon_kod) istasyon_ad, i.sehir,
                count(*)::int dolum,
                count(*) FILTER (WHERE d.irsaliye_no IS NULL OR d.irsaliye_no = '')::int irsaliyesiz,
                round(100.0 * count(*) FILTER (WHERE d.irsaliye_no IS NULL OR d.irsaliye_no = '') / count(*), 0) yuzde
         FROM tank_dolum d
         LEFT JOIN istasyonlar i ON i.istasyon_kod = d.istasyon_kod
         WHERE d.dolum_baslama >= now() - ($1 || ' days')::interval
         GROUP BY 1, 2, 3 HAVING count(*) FILTER (WHERE d.irsaliye_no IS NULL OR d.irsaliye_no = '') > 0
         ORDER BY yuzde DESC, irsaliyesiz DESC LIMIT 50`,
        [TUKETIM_PENCERE_GUN],
      ),

      // Kalibrasyon — 1240 sayılı Kurul Kararı: değişimde 24 saat içinde yedek zorunlu
      p.query(
        `SELECT d.istasyon_kod, coalesce(i.ad, d.istasyon_kod) istasyon_ad, i.sehir,
                d.tank_no, d.urun, d.kalibrasyon_yuzdesi, d.dolum_baslama
         FROM tank_dolum d
         LEFT JOIN istasyonlar i ON i.istasyon_kod = d.istasyon_kod
         WHERE d.kalibrasyon_yuzdesi > 0
           AND d.dolum_baslama >= now() - ($1 || ' days')::interval
         ORDER BY d.dolum_baslama DESC LIMIT 100`,
        [TUKETIM_PENCERE_GUN],
      ),

      // Tankta su — yakıt kalitesi
      p.query(
        `SELECT t.istasyon_kod, coalesce(i.ad, t.istasyon_kod) istasyon_ad, i.sehir,
                t.tank_no, t.urun, round(t.su_lt) su_lt, round(t.mevcut_lt) mevcut_lt,
                t.son_olcum_zamani
         FROM tank_durum t
         LEFT JOIN istasyonlar i ON i.istasyon_kod = t.istasyon_kod
         WHERE t.su_lt > $1 ORDER BY t.su_lt DESC LIMIT 100`,
        [SU_ESIK_LT],
      ),
    ]);

  const s = stok.rows;
  const ir = irsaliyesiz.rows[0] ?? { irsaliyesiz: 0, toplam: 0, litresiz: 0 };

  return {
    uretim: new Date().toISOString(),
    tazelik: await tazelikVerisi(p),
    esik: { acilGun: STOK_ACIL_GUN, uyariGun: STOK_UYARI_GUN, pencereGun: TUKETIM_PENCERE_GUN, suLt: SU_ESIK_LT },
    ozet: {
      stokAcil: s.filter((x) => Number(x.kalan_gun) < STOK_ACIL_GUN).length,
      stokUyari: s.filter((x) => {
        const g = Number(x.kalan_gun);
        return g >= STOK_ACIL_GUN && g < STOK_UYARI_GUN;
      }).length,
      alarmAcik: alarmOzet.rows.reduce((a, x) => a + Number(x.acik), 0),
      alarmToplam: alarmOzet.rows.reduce((a, x) => a + Number(x.toplam), 0),
      kronikIstasyon: kronik.rows.length,
      // Yanıp sönen istasyon = eşik ayarı işi; gerçek kronik = saha işi. Ayrı sayılır.
      yanipSonen: kronik.rows.filter((x) => x.yanip_sonme).length,
      gercekKronik: kronik.rows.filter((x) => !x.yanip_sonme).length,
      irsaliyesiz: Number(ir.irsaliyesiz),
      irsaliyesizYuzde: Number(ir.toplam) > 0 ? Math.round((1000 * Number(ir.irsaliyesiz)) / Number(ir.toplam)) / 10 : 0,
      dolumToplam: Number(ir.toplam),
      kalibrasyon: kalibrasyon.rows.length,
      suluTank: su.rows.length,
    },
    stok: s,
    alarmOzet: alarmOzet.rows,
    kronik: kronik.rows,
    irsaliyeIstasyon: irsaliyeIstasyon.rows,
    kalibrasyon: kalibrasyon.rows,
    su: su.rows,
  };
}

/** Filtre açılırlarını besleyen ayrık değerler (il + dağıtıcı listesi).
 *  Ayrı endpoint: tüm bayiyi indirmeden dropdown doldurulabilsin. */
export async function bayiSecenekleri(p: Pool) {
  const [il, dag, toplam] = await Promise.all([
    p.query(`SELECT DISTINCT il FROM bayiler_epdk WHERE il IS NOT NULL ORDER BY il`),
    p.query(`SELECT DISTINCT dagitim_sirketi FROM bayiler_epdk WHERE dagitim_sirketi IS NOT NULL ORDER BY dagitim_sirketi`),
    p.query(`SELECT count(*) n FROM bayiler_epdk`),
  ]);
  return {
    iller: il.rows.map((r) => r.il as string),
    dagiticilar: dag.rows.map((r) => r.dagitim_sirketi as string),
    toplamBayi: Number(toplam.rows[0].n),
  };
}
