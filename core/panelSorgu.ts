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
import { KAPANIS_PENCERE_BAS, KAPANIS_PENCERE_BIT } from './db.js';

/** Parkoil'in EPDK'daki tüzel kimliği (bkz docs/bilgi/piyasa-istihbarat.md). */
export const BIZ = 'TURGUT DAĞITIM ENERJİ ANONİM ŞİRKETİ';

/** "Yeni bayi" listeye girdiğinde sözleşmesi bu kadar günden yeniyse GERÇEK
 *  yeni ticari ilişki; daha eskiyse yalnız lisans yenilemesi sayılır.
 *
 *  ⚠️ 30 GÜN, VERİDEN SEÇİLDİ (2026-08-04): 19 kaydın sözleşme yaşları
 *  1,2,3,4,5,9,10,10,19,28,31,43,45,259 gün. 30'da net bir boşluk var —
 *  altındakiler lisansla birlikte imzalanmış (birkaç gün fark), üstündekiler
 *  aylar önce imzalanmış sözleşmeler. EPDK lisans işlemleri de birkaç hafta
 *  sürebildiği için 30 gün tolerans makul. */
export const YENI_SOZLESME_ESIK_GUN = 30;

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
      ('snapshot',    'Piyasa snapshot',   (SELECT max(snapshot_gun)::timestamptz FROM bayi_snapshot), 2880),
      -- ⚠️ 2026-08-13: bu üçü tazelik şeridinde YOKTU. Fiyat çekimi 13.08'de
      -- cron hatasıyla çöktüğünde panel sessiz kaldı — kullanıcı bayat veriye
      -- bakıp güncel sandı. İzlenmeyen kaynak = sessizce bayatlayan kaynak.
      -- Eşikler cron sıklığına göre: fiyat günlük (2 gün tolerans), mutabakat ve
      -- uzlaştırma AYLIK koşuyor (45 gün — ayın 2-3'ünde çekilir).
      ('fiyat',       'Bayi fiyat takibi', (SELECT max(guncelleme) FROM bayi_fiyat),      2880),
      ('mutabakat',   'A3 ↔ Logo kıyası',  (SELECT max(cekim_zamani) FROM mutabakat_a3_donem), 64800),
      ('uzlastirma',  'Tank uzlaştırma',   (SELECT max(cekim_zamani) FROM uzlastirma_donem),   64800)
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
  const [dagiticiBayi, ilDagilim, sonTransfer, ozet, sozlesme, lisansBitis, bolgesel, haritaIl, beyazAlan, kaybedilen] =
    await Promise.all([
      p.query(`SELECT dagitim_sirketi,count(*) FILTER (WHERE lisans_durumu='ONAYLANDI') n
               FROM bayiler_epdk WHERE dagitim_sirketi IS NOT NULL
               GROUP BY dagitim_sirketi
               HAVING count(*) FILTER (WHERE lisans_durumu='ONAYLANDI')>0
               ORDER BY n DESC`),
      p.query(`SELECT il,count(*) n FROM bayiler_epdk
               WHERE il IS NOT NULL AND lisans_durumu='ONAYLANDI'
               GROUP BY il ORDER BY n DESC LIMIT 20`),
      // ⚠️ "yeni_bayi" TEK BAŞINA YANILTICI (2026-08-04, kullanıcı yakaladı).
      //
      // Kod yalnız şuna bakıyor: "dünkü snapshot'ta yoktu, bugün var". Lisans
      // ya da sözleşme tarihine HİÇ bakmıyor. Bu iki ayrı olayı aynı etikete
      // topluyordu:
      //   COB 2      → lisans 1 günlük, sözleşme 10 günlük  = GERÇEKTEN yeni bayi
      //   SDT GRUP   → lisans 1 günlük, sözleşme 259 GÜNLÜK = 8,5 aydır aynı
      //                dağıtıcıyla çalışıyor, yalnız LİSANSI YENİLENMİŞ
      // Ölçüm (19 kayıt): 19'unda lisans yeni, ama 5'inde sözleşme 30 günden eski.
      // Ayırt edici olan SÖZLEŞME yaşı — yeni ticari ilişki mi, yoksa yalnız
      // evrak yenilemesi mi.
      //
      // `alt_tip` bu ayrımı taşır; ham `tip` bozulmadan kalır (geçmiş kayıtlar
      // ve mevcut tüketiciler etkilenmesin).
      p.query(`SELECT t.bayi_lisans_no, t.lisans_sahibi, t.il, t.tip,
                      t.eski_deger, t.yeni_deger, t.tespit_gun,
                      e.lisans_baslangic, e.sozlesme_baslangic, e.dagitim_sirketi,
                      (t.tespit_gun - e.sozlesme_baslangic::date) sozlesme_yas_gun,
                      (t.tespit_gun - e.lisans_baslangic::date)   lisans_yas_gun,
                      CASE
                        WHEN t.tip <> 'yeni_bayi' THEN NULL
                        -- Sözleşme de yeni → gerçekten yeni ticari ilişki
                        WHEN e.sozlesme_baslangic IS NULL THEN 'belirsiz'
                        WHEN (t.tespit_gun - e.sozlesme_baslangic::date) <= $1 THEN 'yeni_sozlesme'
                        -- Sözleşme eski, lisans yeni → yalnız evrak yenilendi
                        ELSE 'lisans_yenilendi'
                      END alt_tip
               FROM transferler t
               LEFT JOIN bayiler_epdk e ON e.bayi_lisans_no = t.bayi_lisans_no
               ORDER BY t.tespit_gun DESC, t.id DESC LIMIT 100`,
        [YENI_SOZLESME_ESIK_GUN],
      ),
      p.query(`SELECT
                 (SELECT count(*) FROM dagiticilar) dagitici_sayisi,
                 (SELECT count(*) FROM bayiler_epdk WHERE lisans_durumu='ONAYLANDI') aktif_bayi,
                 (SELECT count(*) FROM bayiler_epdk) toplam_bayi,
                 (SELECT count(DISTINCT snapshot_gun) FROM bayi_snapshot) snapshot_gun_sayisi,
                 (SELECT count(*) FROM transferler WHERE tespit_gun > now()-interval '30 days') aylik_transfer`),
      // ANALİZ 1: DAĞITICI SÖZLEŞMESİ 6 ay içinde bitecek AKTİF bayiler
      // (bizimkiler yenileme takibi, rakipler hedef liste)
      //
      // ⚠️ BU "BAYİLİK LİSANSI BİTİŞİ" DEĞİL (2026-08-04, kullanıcı ayırt etti).
      // EPDK'da iki ayrı tarih çifti var ve karıştırılırsa yanlış iş yapılır:
      //   lisans_bitis   = EPDK faaliyet izni. Ortalama 17,3 YIL. Bitince bayi
      //                    faaliyeti DURUR — hukuki mesele.
      //   sozlesme_bitis = dağıtıcıyla ticari sözleşme. Ortalama 4,4 yıl, 13 kat
      //                    daha sık yenilenir — satış/yenileme meselesi.
      // Ölçüm (180 gün): sözleşme 1.661 bayi · lisans 130 bayi. Ayrı tablolar.
      p.query(
        `SELECT bayi_lisans_no,lisans_sahibi,dagitim_sirketi,il,ilce,sozlesme_bitis,
                (dagitim_sirketi=$1) bizim
         FROM bayiler_epdk
         WHERE lisans_durumu='ONAYLANDI' AND sozlesme_bitis IS NOT NULL
           AND sozlesme_bitis > now() AND sozlesme_bitis < now()+interval '180 days'
         ORDER BY sozlesme_bitis ASC LIMIT 2000`,
        [BIZ],
      ),
      // ANALİZ 1b: BAYİLİK LİSANSI 6 ay içinde bitecek AKTİF bayiler.
      // Sözleşmeden AYRI tablo — bitmesi faaliyeti durdurur, aciliyeti farklı.
      p.query(
        `SELECT bayi_lisans_no,lisans_sahibi,dagitim_sirketi,il,ilce,lisans_bitis,
                (dagitim_sirketi=$1) bizim
         FROM bayiler_epdk
         WHERE lisans_durumu='ONAYLANDI' AND lisans_bitis IS NOT NULL
           AND lisans_bitis > now() AND lisans_bitis < now()+interval '180 days'
         ORDER BY lisans_bitis ASC LIMIT 2000`,
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
      // HARİTA: TÜM iller — `bolgesel` yalnız bizim bayimizin olduğu illeri
      // döndürüyor (WHERE bizim>0, 61 il). Harita 81 ilin hepsini çizmeli;
      // bayimiz olmayan il NÖTR görünür ("0 bayi" ile "az bayi" ayrı şeyler).
      p.query(
        `SELECT il, count(*) toplam, count(*) FILTER (WHERE dagitim_sirketi=$1) bizim
         FROM bayiler_epdk WHERE lisans_durumu='ONAYLANDI' AND il IS NOT NULL
         GROUP BY il ORDER BY il`,
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
    lisansBitecek: lisansBitis.rows,
    bolgesel: bolgesel.rows,
    haritaIl: haritaIl.rows,
    beyazAlan: beyazAlan.rows,
    kaybedilen: kaybedilen.rows,
  };
}

/** İzleme modülünün verisi.
 *  tanklar SEÇİLMİYOR: UI'da tek tüketicisi yoktu ama yanıtın %41'iydi (114 KB)
 *  ve 60 saniyede bir çekiliyordu (günde ~164 MB boşa trafik). Tank verisi
 *  gerektiğinde ayrı /api/tanklar endpoint'i açılır, ana polling'e binmez. */
export async function durumVerisi(p: Pool) {
  const [ist, bag, alarm, alarmSayi, tazelik] = await Promise.all([
    // tip = ASIS IstasyonTip (İstasyonlu / Köy pompası / Köy tankeri) — hepsi gerçek
    // satış noktası, farklı iş modelleri. Panelde kolon + filtre olarak kullanılır.
    //
    // telefon: müdahale kuyruğundaki "Bayiyi ara" bağlantısı için (tel: linki).
    // bayi_iletisim EPDK NO ile eşleşir (istasyon_kod ile değil) — bkz. schema.sql.
    // Yoksa NULL döner ve panel butonu hiç çizmez.
    p.query(`SELECT i.istasyon_kod, i.ad, i.epdk_kod, i.sehir, i.bolge, i.aktif, i.tip,
                    bi.telefon
             FROM istasyonlar i
             LEFT JOIN bayi_iletisim bi ON bi.epdk_no = i.epdk_no
             ORDER BY i.ad`),
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
               e.dagitim_sirketi rakip, e.iptal_aciklama, e.iptal_tarihi,
               -- NE ZAMAN geçti? İKİ kaynak var, önem sırasıyla:
               --  1) sozlesme_baslangic — bayinin YENİ dağıtıcıyla sözleşme tarihi.
               --     EPDK kütüğünde duruyor ve GERÇEK geçiş tarihidir.
               --  2) transferler.tespit_gun — bizim tespit günümüz. Yalnız
               --     29.07.2026 sonrası kayıtlar var (izleme o gün başladı).
               -- Önce 1 kullanılır; ilk sürümde yalnız 2'ye bakılıyordu ve
               -- "tarih yok" deniyordu — oysa veri kütükte hazırdı (2026-08-13).
               e.sozlesme_baslangic::text gecis_sozlesme,
               t.tespit_gun::text gecis_tespit
             FROM baglanti_durum b
             LEFT JOIN istasyonlar i ON i.istasyon_kod=b.istasyon_kod
             LEFT JOIN bayiler_epdk e ON e.bayi_lisans_no=i.epdk_kod
             LEFT JOIN LATERAL (
               SELECT tespit_gun FROM transferler tr
               WHERE tr.bayi_lisans_no = i.epdk_kod
               ORDER BY tr.tespit_gun DESC, tr.id DESC LIMIT 1
             ) t ON TRUE`),
    // ⚠️ AÇIK ALARMLAR + SON 200 KAPALI (2026-08-04, ölçülerek daraltıldı).
    //
    // Önce LIMIT 300 idi ve 2.223 alarmın %86'sı sessizce kırpılıyordu. İlk
    // düzeltmem sınırı 1000'e çıkarmaktı — sonra UI'ı okudum: panel yalnız
    // AÇIK alarmları kullanıyor (Izleme.tsx `filter(a => !a.kapandi)`), kapalı
    // olanlar hiçbir yerde gösterilmiyor. Yani 1000 satır taşımak, 986'sı
    // kullanılmayan veri demekti (60 sn'de bir çekilen yanıt).
    //
    // Doğrusu: AÇIK olanların TAMAMI (kırpılamaz — alarm kaçarsa iş kaçar) +
    // yakın geçmiş için 200 kapalı. Açık alarm sayısı doğal olarak küçük (14).
    p.query(`(SELECT id::text,tip,istasyon_kod,tank_no,istasyon_ad,epdk_no,mesaj,acildi,
                     son_bildirim,bildirim_sayisi,kapandi
              FROM alarmlar WHERE kapandi IS NULL ORDER BY acildi DESC)
             UNION ALL
             (SELECT id::text,tip,istasyon_kod,tank_no,istasyon_ad,epdk_no,mesaj,acildi,
                     son_bildirim,bildirim_sayisi,kapandi
              FROM alarmlar WHERE kapandi IS NOT NULL ORDER BY acildi DESC LIMIT 200)`),
    p.query(`SELECT count(*)::int toplam,
                    count(*) FILTER (WHERE kapandi IS NULL)::int acik
             FROM alarmlar`),
    // 7 satır — ana yanıta yük bindirmiyor, karşılığında her ekranda veri yaşı görünür.
    tazelikVerisi(p),
  ]);

  return {
    uretim: new Date().toISOString(),
    istasyonlar: ist.rows,
    baglanti: bag.rows,
    alarmlar: alarm.rows,
    // Panel "N / M gösteriliyor" diyebilsin — sessiz kırpma olmasın.
    alarmSayi: alarmSayi.rows[0],
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
  // "Bize geliş" kolonu — bayinin bizimle sözleşme imzaladığı gün.
  // Whitelist ZORUNLU: ORDER BY doğrudan dizeye giriyor.
  'sozlesme_baslangic',
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
    `SELECT bayi_lisans_no,lisans_sahibi,dagitim_sirketi,il,ilce,lisans_durumu,kategori,
            sozlesme_baslangic,sozlesme_bitis,
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
/** Sorun tespiti penceresi (gün). Dolum verisi 2,5 yıllık ama eski kayıtlarda
 *  bazı alanlar boş; 180 gün hem anlamlı hem hızlı. */
const SORUN_PENCERE_GUN = 180;
/** Mükerrer tank dolumu: aynı tanka bu süre içinde ~aynı miktar iki kez. */
const MUKERRER_SAAT = 2;
/** İki dolumun "aynı miktar" sayılması için azami fark (lt). */
const MUKERRER_TOLERANS_LT = 1;

/**
 * SORUN TESPİTİ — POL/EPDK modülünün yakaladığı anomalileri kendi verimizden bulur.
 *
 * NEDEN: POL "EPDK 2020" modülü A1a kriterleriyle sapma yakalıyor ama bunu ancak
 * EPDK'ya gönderdikten SONRA görüyoruz. Aşağıdaki kontroller aynı anomalileri
 * ASIS'ten çektiğimiz ham dolum verisinden, POL'den ÖNCE çıkarır.
 * (bkz. docs/bilgi/epdk-modulu-a-tablolari.md)
 *
 * ⚠️ Buradaki hiçbir bulgu "kaçak" DEĞİLDİR — incelenmesi gereken ANOMALİdir.
 * Çoğunun masum açıklaması olabilir (bir tanker iki bayiye boşaltmış, veri
 * gecikmesi vb.). Panel bunu "şüpheli" diye sunar, "suçlu" diye değil.
 */
export async function sorunTespiti(p: Pool) {
  const [uydurma, mukerrerTesis, mukerrerTank, hayali, kalibrasyon, ozetR] = await Promise.all([
    // 1) UYDURMA İRSALİYE NO — gerçek format: 2-4 harf öneki + 10+ hane (PIR2026000008671).
    //    Ölçüm (180 gün): 13.767 normal kayda karşı 8 tekil "çok kısa" numara
    //    (1111, 1234, 1235, 222, 333…). Bu bir biçim hatası değil, elle uydurma.
    p.query(
      `SELECT d.irsaliye_no, count(DISTINCT d.istasyon_kod)::int istasyon,
              count(*)::int satir, round(sum(d.dolum_miktari))::int litre,
              max(d.dolum_baslama) son,
              string_agg(DISTINCT coalesce(i.ad, d.istasyon_kod), ', ') istasyonlar
       FROM tank_dolum d LEFT JOIN istasyonlar i ON i.istasyon_kod = d.istasyon_kod
       WHERE d.irsaliye_no ~ '^[0-9]{1,6}$'
         AND d.dolum_baslama >= now() - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY litre DESC LIMIT 50`,
      [SORUN_PENCERE_GUN],
    ),

    // 2) MÜKERRER TESİS DOLUM — aynı irsaliye birden fazla İSTASYONA.
    //    ⚠️ Tek başına suç değil: bir tanker iki bayiye boşaltabilir. Ama 3+ istasyon
    //    ya da uydurma numarayla birleşince incelenmeli.
    p.query(
      `SELECT d.irsaliye_no, count(DISTINCT d.istasyon_kod)::int istasyon,
              count(*)::int satir, round(sum(d.dolum_miktari))::int litre,
              max(d.dolum_baslama) son,
              string_agg(DISTINCT coalesce(i.ad, d.istasyon_kod), ', ') istasyonlar
       FROM tank_dolum d LEFT JOIN istasyonlar i ON i.istasyon_kod = d.istasyon_kod
       WHERE d.irsaliye_no IS NOT NULL AND d.irsaliye_no <> ''
         AND d.dolum_baslama >= now() - ($1 || ' days')::interval
       GROUP BY 1 HAVING count(DISTINCT d.istasyon_kod) > 1
       ORDER BY istasyon DESC, litre DESC LIMIT 50`,
      [SORUN_PENCERE_GUN],
    ),

    // 3) MÜKERRER TANK DOLUM — aynı tanka kısa sürede ~aynı miktar iki kez.
    //    Çift kayıt (sistem tekrarı) ya da gerçekten iki dolum olabilir.
    p.query(
      `WITH c AS (
         SELECT d.istasyon_kod, d.tank_no, d.urun, d.dolum_baslama, d.dolum_miktari,
                d.irsaliye_no,
                lag(d.dolum_baslama) OVER w onceki_zaman,
                lag(d.dolum_miktari)  OVER w onceki_miktar,
                lag(d.irsaliye_no)    OVER w onceki_irsaliye
         FROM tank_dolum d
         WHERE d.dolum_baslama >= now() - ($1 || ' days')::interval
         WINDOW w AS (PARTITION BY d.istasyon_kod, d.tank_no ORDER BY d.dolum_baslama))
       SELECT c.istasyon_kod, coalesce(i.ad, c.istasyon_kod) istasyon_ad, i.sehir,
              c.tank_no, c.urun, round(c.dolum_miktari)::int litre,
              c.dolum_baslama, c.onceki_zaman,
              round(extract(epoch FROM (c.dolum_baslama - c.onceki_zaman)) / 60)::int dakika_ara,
              c.irsaliye_no, c.onceki_irsaliye
       FROM c LEFT JOIN istasyonlar i ON i.istasyon_kod = c.istasyon_kod
       WHERE c.onceki_zaman IS NOT NULL
         AND c.dolum_baslama - c.onceki_zaman < ($2 || ' hours')::interval
         AND abs(c.dolum_miktari - c.onceki_miktar) < $3
       ORDER BY c.dolum_baslama DESC LIMIT 50`,
      [SORUN_PENCERE_GUN, MUKERRER_SAAT, MUKERRER_TOLERANS_LT],
    ),

    // 4) HAYALİ DOLUM — dolum kaydı var ama tank seviyesi ARTMAMIŞ.
    //    ⚠️ KAPSAM SINIRLI: seviye_* alanları 2026-07-29'da eklendi, ASIS geriye
    //    dönük vermiyor. Kapsam her gün artıyor; oran bu yüzden ayrıca raporlanır.
    p.query(
      `SELECT d.istasyon_kod, coalesce(i.ad, d.istasyon_kod) istasyon_ad, i.sehir,
              d.tank_no, d.urun, round(d.dolum_miktari)::int litre,
              round(d.seviye_baslangic_lt)::int seviye_bas,
              round(d.seviye_bitis_lt)::int seviye_bit,
              d.irsaliye_no, d.dolum_baslama
       FROM tank_dolum d LEFT JOIN istasyonlar i ON i.istasyon_kod = d.istasyon_kod
       WHERE d.seviye_baslangic_lt > 0
         AND d.seviye_bitis_lt <= d.seviye_baslangic_lt
         AND d.dolum_baslama >= now() - ($1 || ' days')::interval
       ORDER BY d.dolum_baslama DESC LIMIT 50`,
      [SORUN_PENCERE_GUN],
    ),

    // 5) KALİBRASYON DEĞİŞİMİ — 1240 sayılı karar: 24 saat içinde yedek zorunlu.
    p.query(
      `SELECT d.istasyon_kod, coalesce(i.ad, d.istasyon_kod) istasyon_ad, i.sehir,
              d.tank_no, d.urun, d.kalibrasyon_yuzdesi, d.dolum_baslama
       FROM tank_dolum d LEFT JOIN istasyonlar i ON i.istasyon_kod = d.istasyon_kod
       WHERE d.kalibrasyon_yuzdesi > 0
         AND d.dolum_baslama >= now() - ($1 || ' days')::interval
       ORDER BY d.dolum_baslama DESC LIMIT 100`,
      [SORUN_PENCERE_GUN],
    ),

    // Kapsam: hayali dolum kontrolü kaç kayıtta YAPILABİLİYOR (dürüst oran için)
    p.query(
      `SELECT count(*)::int toplam,
              count(*) FILTER (WHERE seviye_baslangic_lt > 0)::int seviye_var
       FROM tank_dolum WHERE dolum_baslama >= now() - ($1 || ' days')::interval`,
      [SORUN_PENCERE_GUN],
    ),
  ]);

  const kapsam = ozetR.rows[0] ?? { toplam: 0, seviye_var: 0 };
  return {
    uretim: new Date().toISOString(),
    tazelik: await tazelikVerisi(p),
    esik: {
      pencereGun: SORUN_PENCERE_GUN,
      mukerrerSaat: MUKERRER_SAAT,
      toleransLt: MUKERRER_TOLERANS_LT,
      // Hayali dolum kontrolünün kapsamı — panelde AÇIKÇA yazılır, yoksa
      // "4 hayali dolum" rakamı tüm veriyi kapsıyormuş gibi okunur.
      seviyeKapsamYuzde:
        Number(kapsam.toplam) > 0
          ? Math.round((100 * Number(kapsam.seviye_var)) / Number(kapsam.toplam))
          : 0,
      seviyeVar: Number(kapsam.seviye_var),
      dolumToplam: Number(kapsam.toplam),
    },
    ozet: {
      uydurma: uydurma.rows.length,
      mukerrerTesis: mukerrerTesis.rows.length,
      mukerrerTank: mukerrerTank.rows.length,
      hayali: hayali.rows.length,
      kalibrasyon: kalibrasyon.rows.length,
    },
    uydurma: uydurma.rows,
    mukerrerTesis: mukerrerTesis.rows,
    mukerrerTank: mukerrerTank.rows,
    hayali: hayali.rows,
    kalibrasyon: kalibrasyon.rows,
  };
}

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

/** EPDK A1a eşikleri — 1240 sayılı Kurul Kararı (bkz docs/bilgi/epdk-mutabakat.md).
 *  İKİSİ BİRLİKTE aşılırsa bildirim gerekir; biri tek başına yeterli değil. */
export const A1A_LITRE_ESIK = 288;
export const A1A_YUZDE_ESIK = 3;

/**
 * EPDK A1a mutabakatı — tank bazında stok farkı.
 *
 *   Fark = (Açılış + Dolum − Satış) − Kapanış
 *
 * ⚠️⚠️ EN BÜYÜK TUZAK — BU BİR **ARALIK** HESABIDIR, GÜN HESABI DEĞİL.
 * `acilis_lt` "bir gün önce"nin değil, o tankın **en son ölçülen kapanışının**
 * değeri (bkz db.ts `oncekiGunKapanis` — cron gün atlayınca zincir kopmasın diye
 * DISTINCT ON ... gun DESC). Cron 2 Ağustos'u atladığı için 3 Ağustos satırının
 * açılışı 1 Ağustos'tan geliyor → o satır **2 GÜNLÜK** aralığı temsil ediyor.
 * Dolum/satış 1 günden toplanırsa fark tamamen uydurma olur.
 * Ölçüldü (2026-08-04): gün-bazlı hesap 398 tankın yalnız 64'ünü limitte
 * gösteriyordu; doğru aralıkla 669'un 394'ü limitte. Aynı veri, 6 kat fark.
 *   → `kaynak_gun` (açılışın geldiği gün) her satırda taşınır ve aralık ondan kurulur.
 *
 * ⚠️ ANAHTAR ÇEVİRİSİ: `satis_ozet.istasyon_kod` = **TIstasyonID** (ör. "201"),
 * `tank_seviye_gun`/`tank_dolum` ise **IstasyonKod** (ör. "210006"). Bunlar AYNI
 * DEĞİL — doğrudan birleştirmek 0 satır döndürür (ölçüldü: 176 vs 154 istasyon,
 * kesişim 0). Köprü `istasyonlar.t_istasyon_id` ↔ `istasyonlar.istasyon_kod`;
 * 154/154 çevrildi, t_istasyon_id 269/269 tekil ve boş yok.
 *
 * ⚠️ KAPSAM DÜRÜSTLÜĞÜ: satışı olup seviye kaydı olmayan 81 tank var (557.197 lt,
 * toplam satışın %9,5'i — hepsi yüksek tank no: 4,5,6,7; istasyonun kendisi
 * seviye gönderiyor ama o tank göndermiyor, muhtemelen LPG/otogaz). Bunlar
 * mutabakat DIŞI: "fark" sütununa yazılsa tüm satış kaçak gibi görünürdü.
 * Hiç gösterilmezse de kayıp sessizleşir → `kapsam` alanında ayrıca raporlanır.
 */
export async function mutabakatVerisi(p: Pool, gun?: string) {
  // Hedef gün: verilmezse **hem seviye hem satış** verisi olan en son gün.
  //
  // ⚠️ NEDEN İKİSİ BİRLİKTE (2026-08-04, ölçüldü): satış çekimi bir gün geriden
  // çalışır (satisCek.ts TR günü olarak DÜNü çeker), seviye ise o geceyi yazar.
  // Sadece seviyeye bakınca hedef 4 Ağustos oluyordu ama o günün satışı henüz
  // yok → C=0 → 669 tankın TAMAMI "satış yok", dolum farkı komple "eksik stok"
  // görünüyordu (bir tankta %996 sapma; gerçekte yalnız veri eksikti).
  const g = await p.query(
    gun
      ? `SELECT $1::date::text gun`
      : `SELECT max(t.gun)::text gun FROM tank_seviye_gun t
         WHERE t.acilis_lt IS NOT NULL
           AND EXISTS (SELECT 1 FROM satis_ozet s WHERE s.gun = t.gun)`,
    gun ? [gun] : [],
  );
  const hedefGun: string | null = g.rows[0]?.gun ?? null;
  if (!hedefGun) {
    return { gun: null, gunler: [], satirlar: [], ozet: null, kapsam: null };
  }

  const [gunler, satirlar, kapsam] = await Promise.all([
    // Seçilebilir günler — yalnız açılışı olanlar (ilk gün hesaplanamaz).
    p.query(
      `SELECT gun::text, count(*)::int tank
       FROM tank_seviye_gun WHERE acilis_lt IS NOT NULL
       GROUP BY gun ORDER BY gun DESC LIMIT 60`,
    ),

    // ── ASIL HESAP ────────────────────────────────────────────────────────
    p.query(
      `WITH sev AS (
         -- Her tankın hedef gündeki açılış/kapanışı + açılışın GELDİĞİ gün.
         -- kaynak_gun: bu tankın hedef günden önceki en son kaydı = aralığın başı.
         SELECT t.istasyon_kod, t.tank_no, t.urun, t.acilis_lt, t.kapanis_lt,
                t.kapanis_zaman,
                pr.gun           kaynak_gun,
                pr.kapanis_zaman acilis_zaman
         FROM tank_seviye_gun t
         LEFT JOIN LATERAL (
           SELECT p2.gun, p2.kapanis_zaman FROM tank_seviye_gun p2
           WHERE p2.istasyon_kod = t.istasyon_kod AND p2.tank_no = t.tank_no
             AND p2.gun < t.gun AND p2.kapanis_lt IS NOT NULL
           ORDER BY p2.gun DESC LIMIT 1
         ) pr ON true
         WHERE t.gun = $1::date AND t.acilis_lt IS NOT NULL AND t.kapanis_lt IS NOT NULL
       ),
       -- ⚠️⚠️ ARALIK **ÖLÇÜM ZAMANI** İLE KURULUR, GÜN ETİKETİYLE DEĞİL.
       --
       -- Bu, bu sorgunun en pahalı dersi (2026-08-04, canlı ölçüldü). Snapshot
       -- ANLIK: gun sütunu "o günün kapanışı" demek DEĞİL, "cron o gün koştu"
       -- demek. Gerçek ölçüm zamanları taban tabana zıt çıktı:
       --     gun=2026-08-01 → ölçüm 01 Ağu 12:00  (öğlen!)
       --     gun=2026-08-03 → ölçüm 04 Ağu 00:30  (ERTESİ GÜN)
       --     gun=2026-08-04 → ölçüm 04 Ağu 08:30  (sabah)
       -- Gün-bazlı pencere kurunca 210192 t2'de A=1.992 (01 Ağu ÖĞLEN ölçümü)
       -- alınıyor, ama o tankın 01 Ağu 13:37'deki 28.266 lt dolumu pencerenin
       -- DIŞINDA kalıyordu → B=0, C=19.628 → tank eksiye düşüyor (fiziksel
       -- olarak imkânsız) ve %1.495 sapma raporlanıyordu. 669 tankın 260'ı
       -- "eşik aşımı", net fark −518.957 lt: tamamı bu hatanın eseri.
       --   → Doğrusu: (acilis_zaman, kapanis_zaman] = iki ölçüm ARASI.
       --
       -- ⚠️ HASSASİYET SINIRI: dolum TIMESTAMP (saat hassas) ama satis_ozet
       -- GÜNLÜK toplam — satış saate bölünemez. Ölçüm gece yarısına yakınsa
       -- (664/669 tank 00:xx) hata küçük; öğlen ölçümünde o günün satışının
       -- yarısı yanlış tarafta kalır. Bu satırlar zaman_riski ile işaretlenir;
       -- gizlenmez, ekranda "hassas değil" diye ayrılır.
       ar AS (
         SELECT *,
                coalesce(acilis_zaman, ($1::date - 1) + time '00:00') bas_zaman,
                coalesce(kapanis_zaman, ($1::date + 1) + time '00:00') bit_zaman
         FROM sev
       ),
       dol AS (
         SELECT a.istasyon_kod, a.tank_no,
                sum(coalesce(d.dolum_miktari_net, d.dolum_miktari)) lt,
                count(*)::int adet
         FROM ar a JOIN tank_dolum d
           ON d.istasyon_kod = a.istasyon_kod AND d.tank_no = a.tank_no
          AND d.dolum_bitim >  a.bas_zaman
          AND d.dolum_bitim <= a.bit_zaman
         GROUP BY 1,2
       ),
       -- Satış GÜNLÜK: aralığa DEĞEN her günü al. Kısmi günlerde (ölçüm gün
       -- ortasındaysa) fazla/eksik sayar → zaman_riski bayrağı bunu duyurur.
       sat AS (
         SELECT a.istasyon_kod, a.tank_no, sum(so.litre) lt, sum(so.fis_sayisi)::int fis
         FROM ar a
         JOIN istasyonlar i ON i.istasyon_kod = a.istasyon_kod
         JOIN satis_ozet so ON so.istasyon_kod = i.t_istasyon_id
          AND so.tank_no = a.tank_no
          -- ⚠️⚠️ SATIŞ İÇİN **GÜN ETİKETİ** KULLANILIR, ölçüm zaman damgası DEĞİL
          -- (2026-08-05, canlıda iki kez yanlış denedim).
          --
          -- Ölçüm TR 03:30'da alınıyor, yani "4 Ağustos'un kapanışı" fiilen
          -- 5 Ağustos sabahı. Zaman damgasından aralık kurulunca:
          --     bas TR 04 Ağu 03:30 · bit TR 05 Ağu 03:30
          --     sorgu: gun > 04 AND gun <= 05 → 4 Ağustos satışı DIŞLANIYOR,
          --     5 Ağustos satışı henüz YOK → 669 tankın hepsi "satış yok"
          --
          -- Oysa gün etiketleri zaten hizalı: seviye gun=4 Ağustos (biten günün
          -- kapanışı) ↔ satış gun=4 Ağustos (o günün satışı). İkisi aynı iş
          -- gününü temsil ediyor. Aralık = (kaynak_gun, hedef_gun].
          --
          -- Dolum farklı: TIMESTAMP ve saat hassas → orada zaman damgası doğru.
          -- kaynak_gun NULL = serinin ilk günü → bir gün öncesini varsay
          AND so.gun >  coalesce(a.kaynak_gun, $1::date - 1)
          AND so.gun <= $1::date
         GROUP BY 1,2
       )
       SELECT a.istasyon_kod, coalesce(i.ad, a.istasyon_kod) istasyon_ad,
              i.sehir, i.bolge, a.tank_no, a.urun,
              a.kaynak_gun::text, $1::text hedef_gun,
              a.bas_zaman, a.bit_zaman,
              -- Aralık uzunluğu SAAT cinsinden ölçülür (gün etiketi yanıltıcı).
              round(extract(epoch FROM (a.bit_zaman - a.bas_zaman)) / 3600)::int aralik_saat,
              -- Kısmi gün riski: iki uçtan biri gün başına yakın DEĞİLSE günlük
              -- satış toplamı aralığa tam oturmaz (bkz. sat CTE yorumu).
              -- ⚠️ TR SAATİ + KAPANIŞ PENCERESİYLE AYNI EŞİK (2026-08-05).
              -- İki hata birden vardı: (1) ::time UTC saatini alıyordu, 3 saat
              -- kaydırıyordu; (2) eşik 02:00–22:00 yazılmıştı ama db.ts'teki
              -- kapanış penceresi 22:00–06:00. Tutarsızlık yüzünden TR 03:30
              -- GECE ölçümü "gün ortası riski" diye işaretleniyor ve 669 tankın
              -- tamamı kullanılamaz sayılıyordu. Tek kaynak: $2 (BIT) / $3 (BAS).
              ((a.bas_zaman AT TIME ZONE 'Europe/Istanbul')::time > make_time($2, 0, 0)
                AND (a.bas_zaman AT TIME ZONE 'Europe/Istanbul')::time < make_time($3, 0, 0))
                OR ((a.bit_zaman AT TIME ZONE 'Europe/Istanbul')::time > make_time($2, 0, 0)
                AND (a.bit_zaman AT TIME ZONE 'Europe/Istanbul')::time < make_time($3, 0, 0))
                                               zaman_riski,
              round(a.acilis_lt)::int         acilis,
              round(coalesce(dol.lt, 0))::int  dolum,
              coalesce(dol.adet, 0)            dolum_adet,
              round(coalesce(sat.lt, 0))::int  satis,
              coalesce(sat.fis, 0)             fis,
              round(a.kapanis_lt)::int         kapanis,
              sat.lt IS NULL                   satis_yok,
              -- Fark = beklenen − gerçek.  (+) fazla stok, (−) eksik stok.
              round((a.acilis_lt + coalesce(dol.lt,0) - coalesce(sat.lt,0)) - a.kapanis_lt)::int fark,
              -- Yüzde tabanı: hareket hacmi (açılış+dolum). Kapanışa bölmek
              -- boş tankta sonsuza gider; EPDK hareket üzerinden bakar.
              CASE WHEN (a.acilis_lt + coalesce(dol.lt,0)) > 0
                   THEN round(100.0 * abs((a.acilis_lt + coalesce(dol.lt,0) - coalesce(sat.lt,0)) - a.kapanis_lt)
                              / (a.acilis_lt + coalesce(dol.lt,0)), 2)
              END fark_yuzde,
              a.kapanis_zaman
       FROM ar a
       LEFT JOIN istasyonlar i ON i.istasyon_kod = a.istasyon_kod
       LEFT JOIN dol ON dol.istasyon_kod = a.istasyon_kod AND dol.tank_no = a.tank_no
       LEFT JOIN sat ON sat.istasyon_kod = a.istasyon_kod AND sat.tank_no = a.tank_no
       ORDER BY abs((a.acilis_lt + coalesce(dol.lt,0) - coalesce(sat.lt,0)) - a.kapanis_lt) DESC`,
      [hedefGun, KAPANIS_PENCERE_BIT, KAPANIS_PENCERE_BAS],
    ),

    // KAPSAM — satışı olup seviyesi olmayan tanklar (mutabakat dışı kalan hacim).
    p.query(
      `WITH s AS (
         SELECT i.istasyon_kod, so.tank_no, sum(so.litre) lt
         FROM satis_ozet so JOIN istasyonlar i ON i.t_istasyon_id = so.istasyon_kod
         WHERE so.gun = $1::date GROUP BY 1,2),
       t AS (SELECT istasyon_kod, tank_no FROM tank_seviye_gun WHERE gun = $1::date)
       SELECT count(*) FILTER (WHERE t.tank_no IS NULL)::int kapsamsiz_tank,
              round(coalesce(sum(s.lt) FILTER (WHERE t.tank_no IS NULL), 0))::int kapsamsiz_lt,
              round(coalesce(sum(s.lt), 0))::int toplam_satis_lt
       FROM s LEFT JOIN t ON t.istasyon_kod = s.istasyon_kod AND t.tank_no = s.tank_no`,
      [hedefGun],
    ),
  ]);

  // Özet: EPDK eşiği İKİ koşulu birlikte ister (288 lt VE %3).
  const r = satirlar.rows;
  const asan = r.filter(
    (x) => Math.abs(Number(x.fark)) > A1A_LITRE_ESIK && Number(x.fark_yuzde) > A1A_YUZDE_ESIK,
  );
  const k = kapsam.rows[0];
  return {
    gun: hedefGun,
    gunler: gunler.rows,
    satirlar: r,
    ozet: {
      tank: r.length,
      limitte: r.length - asan.length,
      asan: asan.length,
      // Satışı hiç eşleşmeyen tank: farkı olduğu gibi okunmamalı
      satisYok: r.filter((x) => x.satis_yok).length,
      // Aralık 30 saati aştıysa arada bir cron koşusu düşmüş (normal ~24 sa).
      kesintiliAralik: r.filter((x) => Number(x.aralik_saat) > 30).length,
      // Ölçüm gün ortasında → günlük satış toplamı aralığa tam oturmuyor.
      zamanRiski: r.filter((x) => x.zaman_riski).length,
      fazla: r.filter((x) => Number(x.fark) > 0).length,
      eksik: r.filter((x) => Number(x.fark) < 0).length,
      netFark: r.reduce((a, x) => a + Number(x.fark), 0),
      litreEsik: A1A_LITRE_ESIK,
      yuzdeEsik: A1A_YUZDE_ESIK,
    },
    kapsam: k
      ? {
          kapsamsizTank: k.kapsamsiz_tank,
          kapsamsizLt: k.kapsamsiz_lt,
          toplamSatisLt: k.toplam_satis_lt,
          kapsamsizYuzde:
            k.toplam_satis_lt > 0
              ? Math.round((1000 * k.kapsamsiz_lt) / k.toplam_satis_lt) / 10
              : 0,
        }
      : null,
  };
}

/** Sözleşmesi bitmek üzere olan BİZİM bayiler (günlük mail).
 *
 *  ⚠️ PENCERE 30 GÜN, ÖLÇÜLEREK (2026-08-04): bugün 0, 5 günde 0, 30 günde 0,
 *  90 günde 2 (BANBAN 32 gün, BAYSEY 37 gün). 5 günlük pencere hem sözleşme
 *  yenilemek için çok geç hem de neredeyse hiç tetiklenmiyor. 30 gün aksiyon
 *  alınabilir süre ve mail ancak gerçekten bir şey varken gidiyor.
 *  `acil` bayrağı ≤7 gün kalanları işaretler (mailde ayrı vurgulanır). */
export async function sozlesmeBitecekBizim(p: Pool, gun = 30) {
  const r = await p.query(
    `SELECT bayi_lisans_no, lisans_sahibi, il, ilce, sozlesme_bitis::text,
            (sozlesme_bitis::date - current_date)::int kalan_gun,
            (sozlesme_bitis::date - current_date) <= 7 acil
     FROM bayiler_epdk
     WHERE dagitim_sirketi = $1 AND lisans_durumu = 'ONAYLANDI'
       AND sozlesme_bitis IS NOT NULL
       AND sozlesme_bitis::date BETWEEN current_date AND current_date + $2::int
     ORDER BY sozlesme_bitis, lisans_sahibi`,
    [BIZ, gun],
  );
  return r.rows;
}

/** Sözleşmesi bitecek RAKİP bayiler (haftalık mail — fırsat listesi).
 *
 *  ⚠️ PENCERE 7 GÜN, HACİMDEN DOLAYI (ölçüm 2026-08-04): 7 gün → 45 bayi,
 *  14 gün → 109, 30 gün → 301. 301 satır bir maile sığmaz ve okunmaz.
 *  Haftalık koştuğu için 7 günlük pencere boşluk da bırakmıyor: her bayi
 *  tam bir kez listelenir. */
export async function sozlesmeBitecekRakip(p: Pool, gun = 7) {
  const [satirlar, ozet] = await Promise.all([
    p.query(
      `SELECT bayi_lisans_no, lisans_sahibi, dagitim_sirketi, il, ilce,
              sozlesme_bitis::text, (sozlesme_bitis::date - current_date)::int kalan_gun
       FROM bayiler_epdk
       WHERE dagitim_sirketi <> $1 AND lisans_durumu = 'ONAYLANDI'
         AND sozlesme_bitis IS NOT NULL
         AND sozlesme_bitis::date BETWEEN current_date AND current_date + $2::int
       ORDER BY sozlesme_bitis, dagitim_sirketi, lisans_sahibi`,
      [BIZ, gun],
    ),
    p.query(
      `SELECT dagitim_sirketi, count(*)::int n
       FROM bayiler_epdk
       WHERE dagitim_sirketi <> $1 AND lisans_durumu = 'ONAYLANDI'
         AND sozlesme_bitis IS NOT NULL
         AND sozlesme_bitis::date BETWEEN current_date AND current_date + $2::int
       GROUP BY 1 ORDER BY n DESC`,
      [BIZ, gun],
    ),
  ]);
  return { satirlar: satirlar.rows, dagiticiOzet: ozet.rows };
}

/** Bir GÜNÜN transferleri (günlük akşam maili).
 *
 *  ⚠️ YALNIZ O GÜN: kullanıcı isteği — eski transferler tekrar gelmesin.
 *  `bizi_ilgilendiren` = biz taraflardan biriyiz (bize gelen / bizden giden).
 *  Ölçüm (2026-08-04): günlük 5-19 kayıt, bunun ~1'i bizi ilgilendiriyor.
 *  Bu yüzden mail ikiye ayrılır: bizimkiler üstte vurgulu, piyasa altta. */
export async function gunlukTransferler(p: Pool, gun?: string) {
  const g = gun ?? null;
  const r = await p.query(
    `SELECT id, bayi_lisans_no, lisans_sahibi, il, tip, eski_deger, yeni_deger,
            tespit_gun::text,
            (eski_deger = $1 OR yeni_deger = $1) bizi_ilgilendiren,
            CASE WHEN yeni_deger = $1 THEN 'kazandik'
                 WHEN eski_deger = $1 THEN 'kaybettik' END yon
     FROM transferler
     WHERE tespit_gun = coalesce($2::date, current_date)
     ORDER BY (eski_deger = $1 OR yeni_deger = $1) DESC, tip, lisans_sahibi`,
    [BIZ, g],
  );
  const bizim = r.rows.filter((x) => x.bizi_ilgilendiren);
  return {
    gun: r.rows[0]?.tespit_gun ?? g,
    tumu: r.rows,
    bizim,
    piyasa: r.rows.filter((x) => !x.bizi_ilgilendiren),
    ozet: {
      toplam: r.rows.length,
      bizim: bizim.length,
      kazandik: bizim.filter((x) => x.yon === 'kazandik').length,
      kaybettik: bizim.filter((x) => x.yon === 'kaybettik').length,
    },
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

/**
 * A3 (ASIS POL) ↔ Logo mutabakatı — dönem listesi + seçili dönemin fatura satırları.
 * Kaynak: mutabakat_a3 / mutabakat_a3_donem (a3Kiyas aracı doldurur).
 * `donem` verilmezse en güncel dönem seçilir. Satırlar durum önceliğine göre:
 * sorunlular üstte (panelde sarı/kırmızı), tam olanlar altta.
 */
export async function a3LogoVerisi(p: Pool, donem?: string) {
  const donemler = await p.query(
    `SELECT donem, ad, fatura_sayisi, tam_sayisi, sorunlu_sayisi,
            a3_toplam_litre, logo_toplam_litre, cekim_zamani
     FROM mutabakat_a3_donem ORDER BY donem DESC`,
  );
  if (donemler.rows.length === 0) {
    return { donemler: [], secili: null, ozet: null, satirlar: [] };
  }
  // İstenen dönem yoksa en güncel.
  const secili = (donem && donemler.rows.some((r) => r.donem === donem)) ? donem : donemler.rows[0].donem;
  const ozetSatir = donemler.rows.find((r) => r.donem === secili)!;

  const satirlar = await p.query(
    `SELECT fatura_no, irsaliye_no, epdk_kod, logo_cari_kod, istasyon,
            a3_urun, a3_litre, a3_tesis, logo_urun, logo_litre, logo_tesis, logo_iptal,
            durum, litre_fark
     FROM mutabakat_a3
     WHERE donem = $1
     ORDER BY (durum <> 'tam') DESC, ABS(COALESCE(litre_fark,0)) DESC, fatura_no`,
    [secili],
  );

  const a3T = Number(ozetSatir.a3_toplam_litre);
  const logoT = Number(ozetSatir.logo_toplam_litre);
  const farkLt = logoT - a3T;
  return {
    donemler: donemler.rows.map((r) => ({
      donem: r.donem, ad: r.ad,
      faturaSayisi: Number(r.fatura_sayisi), tamSayisi: Number(r.tam_sayisi), sorunluSayisi: Number(r.sorunlu_sayisi),
      cekimZamani: r.cekim_zamani,
    })),
    secili,
    ozet: {
      donem: secili, ad: ozetSatir.ad,
      faturaSayisi: Number(ozetSatir.fatura_sayisi),
      tamSayisi: Number(ozetSatir.tam_sayisi),
      sorunluSayisi: Number(ozetSatir.sorunlu_sayisi),
      a3ToplamLitre: a3T, logoToplamLitre: logoT,
      farkLitre: farkLt,
      farkYuzde: a3T > 0 ? (farkLt / a3T) * 100 : 0,
      // EPDK aylık mutabakat toleransı ±%3 (bkz. docs/bilgi/epdk-mutabakat.md 1240 kararı).
      epdkLimitAsim: a3T > 0 && Math.abs((farkLt / a3T) * 100) > 3,
      cekimZamani: ozetSatir.cekim_zamani,
    },
    satirlar: satirlar.rows.map((r) => ({
      faturaNo: r.fatura_no, irsaliyeNo: r.irsaliye_no, epdkKod: r.epdk_kod, logoCariKod: r.logo_cari_kod,
      istasyon: r.istasyon,
      a3Urun: r.a3_urun, a3Litre: r.a3_litre == null ? null : Number(r.a3_litre), a3Tesis: r.a3_tesis,
      logoUrun: r.logo_urun, logoLitre: r.logo_litre == null ? null : Number(r.logo_litre), logoTesis: r.logo_tesis,
      logoIptal: r.logo_iptal, durum: r.durum,
      litreFark: r.litre_fark == null ? null : Number(r.litre_fark),
    })),
  };
}

/**
 * Tank Uzlaştırma (EPDK stok mutabakatı) — tarih aralığı listesi + seçili aralığın
 * BAYİ ÖZETİ (üst tablo) + istenirse tek bayinin TANK DETAYI.
 * Kaynak: uzlastirma / uzlastirma_donem (uzlasCek aracı doldurur).
 * Formül: Fark=(A+B−C)−D, Oran=(E/C)*100. EPDK limiti |oran|>%3 & |fark|>288 lt.
 * Bayi oranı AĞIRLIKLI: Σfark/Σsatış (basit ortalama yanlış olurdu).
 */
export async function uzlastirmaVerisi(p: Pool, bas?: string, bit?: string, epdk?: string) {
  // ⚠️ LPG İZLENMİYOR (kullanıcı kararı 2026-08-12): Parkoil LPG dağıtmıyor; LPG tankı
  // başka tedarikçiden dolar → "satış var dolum yok" sahte alarmı. TÜM sorgular hariç
  // tutar. Aralık özetleri de bu yüzden uzlastirma_donem'den DEĞİL (LPG'li yazılmış
  // olabilir), satırlardan CANLI hesaplanır — eski çekimler bile doğru görünür.
  const LPG_HARIC = `urun NOT ILIKE '%lpg%'`;

  const araliklar = await p.query(
    `SELECT u.donem_bas, u.donem_bit, d.ad, d.cekim_zamani,
            count(distinct u.epdk_kod)::int bayi_sayisi,
            count(*)::int tank_sayisi,
            count(distinct u.epdk_kod) filter (where u.durum='oran_asim')::int sorunlu_bayi,
            round(sum(u.b_dolum))::numeric toplam_dolum,
            round(sum(u.c_satis))::numeric toplam_satis
     FROM uzlastirma u
     JOIN uzlastirma_donem d ON d.donem_bas=u.donem_bas AND d.donem_bit=u.donem_bit
     WHERE ${LPG_HARIC}
     GROUP BY u.donem_bas, u.donem_bit, d.ad, d.cekim_zamani
     ORDER BY u.donem_bas DESC, u.donem_bit DESC`,
  );
  if (araliklar.rows.length === 0) return { araliklar: [], secili: null, ozet: null, bayiler: [], detay: null };

  // pg DATE'i ortamına göre string ('2026-07-01') VEYA Date döndürebilir → güvenli YYYY-MM-DD.
  const gun = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const secili = araliklar.rows.find((r) => gun(r.donem_bas) === bas && gun(r.donem_bit) === bit)
    ?? araliklar.rows[0];
  const sB = gun(secili.donem_bas);
  const sE = gun(secili.donem_bit);

  // Bayi özet: EPDK bazında topla + DIŞ SATIŞ (A4). Dış satışı yüksek bayilerde tank
  // mutabakatı yanıltıcı (BAŞKURT: 244 lt pompa / 745K dış satış = toptancı) → panelde
  // ayrı işaretlenir. Dış satış tank mutabakatı FARKINA KATILMAZ (POL'ün "Kullanılan"
  // hesabı farklı, basit çıkarma yanlış sonuç veriyordu — 2026-08-12 ölçüldü); yalnız
  // BİLGİ + sınıflandırma. LEFT JOIN: dış satışı olmayan bayi de gelir (dis=0).
  const bayiler = await p.query(
    `SELECT u.epdk_kod, max(u.istasyon) istasyon, max(u.bolge) bolge, max(u.mintika) mintika,
            round(sum(u.a_basi))::numeric a_basi, round(sum(u.b_dolum))::numeric b_dolum,
            round(sum(u.c_satis))::numeric c_satis, round(sum(u.d_sonu))::numeric d_sonu,
            round(sum(u.e_fark))::numeric e_fark,
            round(sum(u.e_fark)/nullif(sum(u.c_satis),0)*100, 2) f_oran,
            count(*)::int tank_sayisi,
            count(*) filter (where u.durum='oran_asim')::int asim_tank,
            count(*) filter (where u.durum='kalib_degisti')::int kalib_tank,
            COALESCE(ds.dis, 0)::numeric dis_satis
     FROM uzlastirma u
     LEFT JOIN (
       SELECT epdk_kod, sum(dis_satis_lt) dis FROM uzlastirma_dissatis
       WHERE donem_bas=$1 AND donem_bit=$2 GROUP BY epdk_kod
     ) ds ON ds.epdk_kod = u.epdk_kod
     WHERE u.donem_bas=$1 AND u.donem_bit=$2 AND ${LPG_HARIC.replace(/\burun\b/g, 'u.urun')}
     GROUP BY u.epdk_kod, ds.dis
     ORDER BY (count(*) filter (where u.durum='oran_asim') > 0) DESC, abs(sum(u.e_fark)) DESC`,
    [sB, sE],
  );

  // İstenirse tek bayinin tank detayı (satıra tıklayınca).
  let detay = null;
  if (epdk) {
    const d = await p.query(
      `SELECT ist_kod, istasyon, urun, tank_no, a_basi, b_dolum, c_satis, d_sonu, e_fark, f_oran,
              kalib_ilk, kalib_son, durum
       FROM uzlastirma WHERE donem_bas=$1 AND donem_bit=$2 AND epdk_kod=$3 AND ${LPG_HARIC}
       ORDER BY (durum='oran_asim') DESC, abs(e_fark) DESC`,
      [sB, sE, epdk],
    );
    detay = {
      epdk,
      satirlar: d.rows.map((r) => ({
        istKod: r.ist_kod, istasyon: r.istasyon, urun: r.urun, tankNo: r.tank_no,
        aBasi: Number(r.a_basi), bDolum: Number(r.b_dolum), cSatis: Number(r.c_satis), dSonu: Number(r.d_sonu),
        eFark: Number(r.e_fark), fOran: r.f_oran == null ? null : Number(r.f_oran),
        kalibIlk: r.kalib_ilk == null ? null : Number(r.kalib_ilk), kalibSon: r.kalib_son == null ? null : Number(r.kalib_son),
        durum: r.durum,
      })),
    };
  }

  return {
    araliklar: araliklar.rows.map((r) => ({
      bas: gun(r.donem_bas), bit: gun(r.donem_bit),
      ad: r.ad, bayiSayisi: Number(r.bayi_sayisi), sorunluBayi: Number(r.sorunlu_bayi),
    })),
    secili: { bas: sB, bit: sE },
    ozet: {
      bas: sB, bit: sE, ad: secili.ad,
      bayiSayisi: Number(secili.bayi_sayisi), tankSayisi: Number(secili.tank_sayisi),
      sorunluBayi: Number(secili.sorunlu_bayi),
      toplamDolum: Number(secili.toplam_dolum), toplamSatis: Number(secili.toplam_satis),
      cekimZamani: secili.cekim_zamani,
    },
    bayiler: bayiler.rows.map((r) => {
      const asim = Number(r.asim_tank) > 0;
      const cSatis = Number(r.c_satis), disSatis = Number(r.dis_satis);
      // Dış satış pompanın %20'sinden fazlaysa bayi TOPTANCI karakterli → tank mutabakatı
      // yanıltıcı (pompadan az satıyor, çoğu kamyonla dış satış). Sorunlu SAYILMAZ, ayrı
      // işaretlenir. Eşik %20: altında dış satış marjinal, tank mutabakatı hâlâ anlamlı.
      const disAgirlikli = disSatis > 0 && cSatis > 0 && disSatis > cSatis * 0.2;
      const durum = disAgirlikli ? 'dis_satis_agirlikli' : asim ? 'oran_asim' : 'uygun';
      return {
        epdk: r.epdk_kod, istasyon: r.istasyon, bolge: r.bolge, mintika: r.mintika,
        aBasi: Number(r.a_basi), bDolum: Number(r.b_dolum), cSatis, dSonu: Number(r.d_sonu),
        eFark: Number(r.e_fark), fOran: r.f_oran == null ? null : Number(r.f_oran),
        disSatis,
        tankSayisi: Number(r.tank_sayisi), asimTank: Number(r.asim_tank), kalibTank: Number(r.kalib_tank),
        durum,
      };
    }),
    detay,
  };
}

/**
 * Bayi FİYAT TAKİBİ — gün listesi + seçili günün bayi fiyatları (rekabet kontrolü).
 * Kaynak: bayi_fiyat (fiyatKiyas aracı doldurur). Bayi fiyatı > parkoil.com.tr (PO) il
 * referansı + eşik ise 'pahali'. EPDK yasal tavan DEĞİL — rekabet göstergesi.
 * `gun` verilmezse en güncel gün.
 */
export async function fiyatVerisi(p: Pool, gun?: string) {
  // ⚠️ SON 60 TAKVİM GÜNÜ — yalnız kayıt OLAN günler değil (2026-08-13, kullanıcı).
  // Önceki sürüm `FROM bayi_fiyat GROUP BY gun` yapıyordu: çekim yapılmamış gün
  // listede HİÇ görünmüyordu, dolayısıyla BUGÜN seçilemiyordu ve kullanıcı
  // "bugünün fiyatı nerede?" sorusunun cevabını alamıyordu.
  // Şimdi takvim üretilip LEFT JOIN ediliyor → boş günler de seçilebilir ve
  // panel "bu gün için çekim yapılmamış" diyebilir (sessiz boşluk yerine).
  const gunler = await p.query(
    `SELECT d.gun::date gun,
            coalesce(f.kayit, 0)  kayit,
            coalesce(f.pahali, 0) pahali,
            f.ref_guncelleme, f.cekim
     FROM generate_series(current_date - 59, current_date, interval '1 day') d(gun)
     LEFT JOIN (
       SELECT gun, count(*)::int kayit,
              count(*) filter (where durum='pahali')::int pahali,
              max(ref_guncelleme) ref_guncelleme, max(guncelleme) cekim
       FROM bayi_fiyat GROUP BY gun
     ) f ON f.gun = d.gun::date
     ORDER BY d.gun DESC`,
  );
  const g = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  // İstenen gün varsa o, yoksa VERİSİ OLAN en yeni gün (boş güne düşüp "kayıt yok"
  // göstermek ilk açılışta yanıltıcı olurdu).
  const secili =
    gunler.rows.find((r) => g(r.gun) === gun) ??
    gunler.rows.find((r) => Number(r.kayit) > 0) ??
    gunler.rows[0];
  if (!secili) return { gunler: [], secili: null, ozet: null, satirlar: [] };
  const sG = g(secili.gun);

  const satirlar = await p.query(
    `SELECT epdk_kod, ist_kod, istasyon, bolge, il, urun, urun_ham,
            bayi_fiyat, ref_fiyat, fark, durum
     FROM bayi_fiyat WHERE gun = $1
     ORDER BY (durum='pahali') DESC, fark DESC NULLS LAST, istasyon`,
    [sG],
  );
  return {
    gunler: gunler.rows.map((r) => ({ gun: g(r.gun), kayit: Number(r.kayit), pahali: Number(r.pahali) })),
    secili: sG,
    ozet: {
      gun: sG, kayit: Number(secili.kayit), pahali: Number(secili.pahali),
      refGuncelleme: secili.ref_guncelleme ? g(secili.ref_guncelleme) : null,
      cekim: secili.cekim,
      // Referans fiyat kaç gün eski (bayatsa panelde uyarı gösterilir)
      refYas: secili.ref_guncelleme ? Math.round((new Date(sG).getTime() - new Date(g(secili.ref_guncelleme)).getTime()) / 864e5) : null,
    },
    satirlar: satirlar.rows.map((r) => ({
      epdk: r.epdk_kod, istKod: r.ist_kod, istasyon: r.istasyon, bolge: r.bolge, il: r.il,
      urun: r.urun, urunHam: r.urun_ham,
      bayiFiyat: Number(r.bayi_fiyat), refFiyat: r.ref_fiyat == null ? null : Number(r.ref_fiyat),
      fark: r.fark == null ? null : Number(r.fark), durum: r.durum,
    })),
  };
}
