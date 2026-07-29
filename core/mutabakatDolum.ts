// A1B bildirim eksikliği analizi — dolum kayıtlarında irsaliye bilgisi var mı?
//
// ⛔ NE YAPMIYOR: mutabakat/ihlal HESAPLAMIYOR.
// `tank_dolum.irsaliye_litre` alanı güvenilmez — farklı irsaliye numaralarında aynı
// değer tekrar ediyor (PIR...7775 ve PIR...8064, iki ayrı gün, ikisinde de "17.779").
// Yani bu alan teslimin gerçek litresi değil, muhtemelen sabit tanker kapasitesi.
// O alandan ihlal üretmek 788 teslimin 420'sini (%53) "EPDK ihlali" gösteriyordu —
// gerçek bir dağıtıcıda imkânsız oran. Detay: docs/bilgi/epdk-mutabakat.md §4d.
//
// ✅ NE YAPIYOR: irsaliye bilgisinin VARLIĞINI kontrol ediyor — bu alanın anlamına
// bağlı değil. İki somut A1B eksikliği:
//   1. İrsaliye no hiç girilmemiş
//   2. İrsaliye no var ama litre boş/0
// Son 30 günde 1.630 teslimin 842'si (%52) bu durumda; 137 istasyonda bulgu var,
// bazılarında %100 (GÖNÜLCÜ 83/83). Kimse takip etmiyor.
//
// ⚠️ GRUPLAMA: irsaliye ÇOK TANKA bölünüyor (dolumların %58'i) ve litre her satırda
// tekrar ediyor. Bu yüzden birim = irsaliye_no, satır DEĞİL. Aksi halde tek teslim
// 7 ayrı kayıt gibi sayılır.

import type { Pool } from 'pg';

export type EksikTipi =
  | 'irsaliye_no_yok'      // irsaliye hiç girilmemiş
  | 'irsaliye_litre_yok';  // no var, litre boş/0

export interface DolumEksik {
  tip: EksikTipi;
  istasyon_kod: string;
  istasyon_ad: string | null;
  epdk_no: string | null;
  sehir: string | null;
  irsaliye_no: string | null;
  urun: string | null;
  tank_sayisi: number;
  tank_toplam: number;   // tanka giren toplam (lt) — bu güvenilir
  ilk_dolum: string;
  son_dolum: string;
}

/* Gruplama üç sorguda AYNI olmak zorunda (özet ile liste tutarlı kalsın). $1 = gün. */
const GRUP_SQL = `
  d AS (
    SELECT * FROM tank_dolum WHERE dolum_baslama > now() - ($1 || ' days')::interval
  ),
  g AS (
    -- İrsaliyesi olanlar: İRSALİYE bazında topla (çok tanka bölünüyor)
    SELECT NULLIF(TRIM(COALESCE(irsaliye_no,'')),'') irsaliye_no,
           min(istasyon_kod) istasyon_kod,
           max(urun) urun,
           count(*) tank_sayisi,
           sum(COALESCE(dolum_miktari,0)) tank_toplam,
           max(COALESCE(irsaliye_litre,0)) irsaliye_litre,
           min(dolum_baslama) ilk_dolum, max(dolum_baslama) son_dolum
    FROM d
    WHERE NULLIF(TRIM(COALESCE(irsaliye_no,'')),'') IS NOT NULL
    GROUP BY NULLIF(TRIM(COALESCE(irsaliye_no,'')),'')
    UNION ALL
    -- İrsaliyesi olmayanlar gruplanamaz (tek NULL grubuna düşerdi) → satır bazında
    SELECT NULL, istasyon_kod, urun, 1, COALESCE(dolum_miktari,0), 0,
           dolum_baslama, dolum_baslama
    FROM d WHERE NULLIF(TRIM(COALESCE(irsaliye_no,'')),'') IS NULL
  )`;

/** Eksik bildirim koşulu — irsaliye_litre'nin ANLAMINA değil VARLIĞINA bakar. */
const EKSIK_SQL = `(g.irsaliye_no IS NULL OR g.irsaliye_litre = 0)`;

/** Eksik A1B bildirimi olan teslimler. */
export async function dolumEksikleri(p: Pool, gun = 30): Promise<DolumEksik[]> {
  const r = await p.query<DolumEksik>(
    `WITH ${GRUP_SQL}
     SELECT
       CASE WHEN g.irsaliye_no IS NULL THEN 'irsaliye_no_yok'
            ELSE 'irsaliye_litre_yok' END AS tip,
       g.istasyon_kod, i.ad AS istasyon_ad, i.epdk_no, i.sehir,
       g.irsaliye_no, g.urun, g.tank_sayisi,
       round(g.tank_toplam, 2) tank_toplam,
       g.ilk_dolum::text, g.son_dolum::text
     FROM g
     LEFT JOIN istasyonlar i ON i.istasyon_kod = g.istasyon_kod
     WHERE ${EKSIK_SQL}
     ORDER BY CASE WHEN g.irsaliye_no IS NULL THEN 0 ELSE 1 END,
              g.tank_toplam DESC`,
    [gun],
  );
  return r.rows;
}

/** Dönem özeti — panel kartları. */
export async function dolumOzet(p: Pool, gun = 30) {
  const r = await p.query(
    `WITH ${GRUP_SQL}
     SELECT
       (SELECT count(*) FROM d) dolum_satiri,
       count(*) teslim,
       count(*) FILTER (WHERE g.irsaliye_no IS NULL) irsaliye_no_yok,
       count(*) FILTER (WHERE g.irsaliye_no IS NOT NULL AND g.irsaliye_litre = 0) litre_yok,
       count(*) FILTER (WHERE NOT ${EKSIK_SQL}) tam,
       count(*) FILTER (WHERE g.tank_sayisi > 1) cok_tanka_bolunen,
       count(DISTINCT g.istasyon_kod) istasyon,
       round(sum(g.tank_toplam)) toplam_dolum_lt
     FROM g`,
    [gun],
  );
  return r.rows[0];
}

/** İstasyon bazında eksik bildirim sıralaması — kimi arayacağız. */
export async function dolumIstasyonBazli(p: Pool, gun = 30) {
  const r = await p.query(
    `WITH ${GRUP_SQL}
     SELECT g.istasyon_kod, i.ad istasyon_ad, i.epdk_no, i.sehir,
            count(*) teslim,
            count(*) FILTER (WHERE ${EKSIK_SQL}) eksik,
            count(*) FILTER (WHERE g.irsaliye_no IS NULL) no_yok,
            count(*) FILTER (WHERE g.irsaliye_no IS NOT NULL AND g.irsaliye_litre = 0) litre_yok,
            round(100.0 * count(*) FILTER (WHERE ${EKSIK_SQL}) / count(*), 1) eksik_oran,
            round(sum(g.tank_toplam)) dolum_lt
     FROM g
     LEFT JOIN istasyonlar i ON i.istasyon_kod = g.istasyon_kod
     GROUP BY g.istasyon_kod, i.ad, i.epdk_no, i.sehir
     HAVING count(*) FILTER (WHERE ${EKSIK_SQL}) > 0
     ORDER BY eksik DESC, eksik_oran DESC`,
    [gun],
  );
  return r.rows;
}
