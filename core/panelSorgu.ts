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
  const [ist, bag, alarm] = await Promise.all([
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
  ]);

  return {
    uretim: new Date().toISOString(),
    istasyonlar: ist.rows,
    baglanti: bag.rows,
    alarmlar: alarm.rows,
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
