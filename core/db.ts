// Postgres erişim katmanı. Supabase/Neon connection string (DATABASE_URL).

import pg from 'pg';
import { config } from './config.js';
import type { AsisIstasyon, AsisOnlineDurum, AsisTank, AsisDolum, AlarmTipi } from './tipler.js';
import { epdkNo } from './asisClient.js';

const { Pool } = pg;

/**
 * DATE alanlarını STRING olarak oku — `Date` nesnesine çevirme.
 *
 * ⚠️ NEDEN (2026-07-30, canlıda yakalandı): `pg` varsayılan olarak `DATE`'i
 * yerel-saatli `Date` nesnesine çeviriyor. `2025-02-11` → `2025-02-10T21:00:00Z`
 * (TR = UTC+3). API yanıtı JSON'a `toISOString()` ile yazıldığında tarih
 * **BİR GÜN GERİYE KAYIYOR**: DB'de 11 Şubat, API'de 10 Şubat.
 *
 * Ekranda fark görünmüyordu çünkü `trTarih()` yerel saatle biçimlendirip günü
 * geri düzeltiyor — ama `<time dateTime="2025-02-10">` özniteliği (makine-okur
 * değer, ekran okuyucu + sıralama) yanlış kalıyordu. Sözleşme başlangıç/bitiş
 * gibi alanlarda bir günlük kayma sözleşme takibinde kabul edilemez.
 *
 * DATE saat taşımaz; string olarak okumak doğru davranış. 1082 = DATE OID.
 * (TIMESTAMPTZ dokunulmaz — o gerçekten an bilgisi taşır ve Date olması doğru.)
 */
pg.types.setTypeParser(1082, (v: string) => v);

let _pool: pg.Pool | null = null;

export function pool(): pg.Pool {
  if (!_pool) {
    if (!config.db.url) throw new Error('DATABASE_URL tanımlı değil.');
    // sslmode parametresini string'den ayıkla; SSL'i obje ile yönet (Supabase pooler
    // self-signed cert kullanır → rejectUnauthorized:false şart). String'de sslmode
    // kalırsa pg obje ayarıyla çakışıp "self-signed certificate in chain" veriyor.
    const url = new URL(config.db.url);
    const sslIster = url.searchParams.has('sslmode') || url.hostname.includes('supabase');
    url.searchParams.delete('sslmode');
    // ⚠️ HAVUZ BOYUTU — Supabase session pooler'da SERT LİMİT 15 bağlantı.
    //
    // CANLIDA YANDI (2026-07-30): `max: 4` sabitti. Vercel'de her API ucu AYRI
    // serverless örneği ve her biri kendi havuzunu açıyor:
    //   4 uç (durum/piyasa/operasyon/bayiler) × 4 bağlantı = 16 > 15
    // → panel rastgele `(EMAXCONNSESSION) max clients reached` hatası veriyordu;
    // yenilemek "düzeltiyor" gibi görünüyordu çünkü başka bir örnek boşalıyordu.
    // `durum` ucu 60 sn'de bir çekildiği için örnekler sürekli canlı kalıyor.
    //
    // Serverless'ta bir örnek TEK istek işler → 1 bağlantı yeter (+1 pay).
    // Job/araç tarafında (uzun süreli, çok sorgulu) 4 kalır.
    // VERCEL / AWS_LAMBDA_FUNCTION_NAME: platformun kendi işaretleri.
    const serverless = !!(process.env.VERCEL ?? process.env.AWS_LAMBDA_FUNCTION_NAME);
    _pool = new Pool({
      connectionString: url.toString(),
      ssl: sslIster ? { rejectUnauthorized: false } : undefined,
      max: serverless ? 2 : 4,
      // Boşta kalan bağlantıyı çabuk bırak — serverless örneği donduğunda
      // bağlantı sunucuda "asılı" kalıp limiti yiyordu.
      idleTimeoutMillis: serverless ? 5_000 : 30_000,
      // Limit doluysa sonsuz bekleme yerine anlaşılır hata ver.
      connectionTimeoutMillis: 10_000,
    });
  }
  return _pool;
}

export async function kapat(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

// --- İstasyon kütüğü upsert ---
export async function istasyonlariKaydet(liste: AsisIstasyon[]): Promise<void> {
  const p = pool();
  for (const i of liste) {
    // Kimliksiz kayıt (ASIS IstasyonKod='0' + EPDK no da yok) — sessizce ezmek yerine atla+logla.
    if (!i.kod) {
      console.warn(`⚠ İstasyon kimliği üretilemedi, atlandı: "${i.ad}" (epdk=${i.epdkKod || 'yok'})`);
      continue;
    }
    await p.query(
      `INSERT INTO istasyonlar (istasyon_kod, t_istasyon_id, ad, epdk_kod, epdk_no, sehir, bolge, mantika, enlem, boylam, aktif, tip, guncelleme)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (istasyon_kod) DO UPDATE SET
         t_istasyon_id=EXCLUDED.t_istasyon_id, ad=EXCLUDED.ad, epdk_kod=EXCLUDED.epdk_kod,
         epdk_no=EXCLUDED.epdk_no, sehir=EXCLUDED.sehir, bolge=EXCLUDED.bolge,
         mantika=EXCLUDED.mantika, enlem=EXCLUDED.enlem, boylam=EXCLUDED.boylam,
         aktif=EXCLUDED.aktif, tip=EXCLUDED.tip, guncelleme=now()`,
      [i.kod, i.tIstasyonId, i.ad, i.epdkKod, epdkNo(i.epdkKod), i.sehir, i.bolge, i.mantika, i.enlem, i.boylam, i.durum, i.tip],
    );
  }
}

// --- Bağlantı durumu upsert ---
export async function baglantiKaydet(liste: AsisOnlineDurum[], istKodByEpdk: Map<string, string>): Promise<void> {
  const p = pool();
  for (const d of liste) {
    const istKod = d.istasyonKod ?? istKodByEpdk.get(epdkNo(d.epdkKod) ?? '') ?? null;
    if (!istKod) continue; // eşleşmeyen durum kaydını atla
    await p.query(
      `INSERT INTO baglanti_durum (istasyon_kod, online, kayitli_aktif, son_veri_zamani, ip, guncelleme)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (istasyon_kod) DO UPDATE SET
         online=EXCLUDED.online, kayitli_aktif=EXCLUDED.kayitli_aktif,
         son_veri_zamani=EXCLUDED.son_veri_zamani,
         ip=EXCLUDED.ip, guncelleme=now()`,
      [istKod, d.online, d.kayitliAktif, d.sonVeriZamani, d.ip],
    );
  }
}

// --- Tank durumu upsert ---
export async function tanklariKaydet(istasyonKod: string, tanklar: AsisTank[]): Promise<void> {
  const p = pool();
  for (const t of tanklar) {
    await p.query(
      `INSERT INTO tank_durum (istasyon_kod, tank_no, urun, kapasite_lt, mevcut_lt, su_lt, son_olcum_zamani, guncelleme)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (istasyon_kod, tank_no) DO UPDATE SET
         urun=EXCLUDED.urun, kapasite_lt=EXCLUDED.kapasite_lt, mevcut_lt=EXCLUDED.mevcut_lt,
         su_lt=EXCLUDED.su_lt, son_olcum_zamani=EXCLUDED.son_olcum_zamani, guncelleme=now()`,
      [istasyonKod, t.tankNo, t.urunAdi, t.kapasiteLt, t.yakitLt, t.suLt, t.durumZamani],
    );
  }
}

// --- Tank dolumları (artımlı) — TOPLU insert (satır-satır çok yavaştı) ---
export async function dolumlariKaydet(dolumlar: AsisDolum[]): Promise<void> {
  if (dolumlar.length === 0) return;
  const p = pool();
  const KOLON = 22;
  const PARCA = 500; // 500×22 = 11000 parametre (limit ~65535, güvenli)
  // ⚠️ AYNI dolum_id bir yanıtta İKİ KEZ gelebiliyor. ON CONFLICT DO UPDATE aynı
  // komutta aynı satırı iki kez güncellemeyi reddediyor ("ON CONFLICT DO UPDATE
  // command cannot affect row a second time") → önce tekilleştir.
  const tekil = [...new Map(dolumlar.map((d) => [d.dolumId, d])).values()];
  for (let i = 0; i < tekil.length; i += PARCA) {
    const grup = tekil.slice(i, i + PARCA);
    const degerler: unknown[] = [];
    const satirlar = grup.map((d, j) => {
      const b = j * KOLON;
      degerler.push(
        d.dolumId, d.istasyonKod, d.tankNo, d.urunAdi, d.dolumBaslama, d.dolumBitim,
        d.dolumMiktari, d.dolumMiktariNet, d.eslesmeMiktari, d.irsaliyeNo, d.irsaliyeLitre,
        d.irsaliyeMiktar, d.irsaliyeHacimFark, d.irsaliyeMiktarFark, d.irsaliyeBirimFiyat,
        d.seviyeBaslangicLt, d.seviyeBitisLt, d.kalibrasyonYuzdesi, d.dolumTipi,
        d.tankerSicakligi, d.kapasiteLt, d.tankerDolumTarihi,
      );
      return `(${Array.from({ length: KOLON }, (_, k) => `$${b + k + 1}`).join(',')})`;
    });
    // ⚠️ DO NOTHING DEĞİL DO UPDATE: yeni alanlar (eslesme_miktari, seviye_*, kalibrasyon)
    // sonradan eklendi; mevcut 36 bin kayıt DO NOTHING ile boş kalırdı. Artımlı çekim
    // aynı kaydı tekrar getirdiğinde eksik alanlar doldurulur.
    await p.query(
      `INSERT INTO tank_dolum (dolum_id, istasyon_kod, tank_no, urun, dolum_baslama, dolum_bitim,
         dolum_miktari, dolum_miktari_net, eslesme_miktari, irsaliye_no, irsaliye_litre,
         irsaliye_miktar, irsaliye_hacim_fark, irsaliye_miktar_fark, irsaliye_birim_fiyat,
         seviye_baslangic_lt, seviye_bitis_lt, kalibrasyon_yuzdesi, dolum_tipi,
         tanker_sicakligi, kapasite_lt, tanker_dolum_tarihi)
       VALUES ${satirlar.join(',')}
       ON CONFLICT (dolum_id) DO UPDATE SET
         eslesme_miktari=EXCLUDED.eslesme_miktari,
         irsaliye_miktar=EXCLUDED.irsaliye_miktar,
         irsaliye_miktar_fark=EXCLUDED.irsaliye_miktar_fark,
         irsaliye_birim_fiyat=EXCLUDED.irsaliye_birim_fiyat,
         seviye_baslangic_lt=EXCLUDED.seviye_baslangic_lt,
         seviye_bitis_lt=EXCLUDED.seviye_bitis_lt,
         kalibrasyon_yuzdesi=EXCLUDED.kalibrasyon_yuzdesi,
         dolum_tipi=EXCLUDED.dolum_tipi,
         tanker_sicakligi=EXCLUDED.tanker_sicakligi,
         guncelleme=now()`,
      degerler,
    );
  }
}

/** Pompa satışı ÖZET upsert (toplu).
 *
 *  ⚠️ Ham satış DEĞİL özet yazılır — günde 20.325 ham kayıt, gün+istasyon+tank
 *  kırılımında 21 kat sıkışıyor (~947 satır/gün). Bkz. araclar/satisCek.ts.
 *
 *  Aynı gün tekrar çekilirse ÜZERİNE yazar (DO UPDATE) — yarım çekim sonrası
 *  tekrar çalıştırmak güvenli. */
export async function satisOzetKaydet(
  liste: { gun: string; istasyonKod: string; tankNo: string; urunId: string;
           cariTip: string; litre: number; tutar: number; fisSayisi: number }[],
): Promise<void> {
  if (liste.length === 0) return;
  const p = pool();
  const KOLON = 8;
  const PARCA = 800; // 800×8 = 6400 parametre (limit ~65535)
  for (let i = 0; i < liste.length; i += PARCA) {
    const grup = liste.slice(i, i + PARCA);
    const deger: unknown[] = [];
    const satir = grup.map((x, j) => {
      const b = j * KOLON;
      deger.push(x.gun, x.istasyonKod, x.tankNo, x.urunId, x.cariTip, x.litre, x.tutar, x.fisSayisi);
      return `(${Array.from({ length: KOLON }, (_, k) => `$${b + k + 1}`).join(',')})`;
    });
    await p.query(
      `INSERT INTO satis_ozet (gun, istasyon_kod, tank_no, urun_id, cari_tip, litre, tutar, fis_sayisi)
       VALUES ${satir.join(',')}
       ON CONFLICT (gun, istasyon_kod, tank_no, urun_id, cari_tip) DO UPDATE SET
         litre = EXCLUDED.litre, tutar = EXCLUDED.tutar,
         fis_sayisi = EXCLUDED.fis_sayisi, guncelleme = now()`,
      deger,
    );
  }
}

/** Tank seviye GÜN ÖZETİ upsert (mutabakatın A/D kalemi).
 *
 *  ⚠️ 30 dk grid = günde 31.559 ham ölçüm; yalnız gün açılış/kapanışı saklanır
 *  (~669 satır/gün, 47 kat sıkışma). Bkz. araclar/seviyeCek.ts.
 *
 *  `olcum_sayisi` bilerek saklanıyor: 48 beklenir, az olması o tankın gün boyu
 *  veri göndermediğini gösterir → mutabakatta "eksik veri" ile "gerçek sapma"
 *  ayrımı bu alandan yapılır. */
export async function seviyeGunKaydet(
  liste: { gun: string; istasyonKod: string; tankNo: string; urun: string;
           acilisLt: number | null; kapanisLt: number | null;
           acilisZaman: string | null; kapanisZaman: string | null; olcumSayisi: number }[],
): Promise<void> {
  if (liste.length === 0) return;
  const p = pool();
  const KOLON = 9;
  const PARCA = 700; // 700×9 = 6300 parametre
  for (let i = 0; i < liste.length; i += PARCA) {
    const grup = liste.slice(i, i + PARCA);
    const deger: unknown[] = [];
    const satir = grup.map((x, j) => {
      const b = j * KOLON;
      deger.push(x.gun, x.istasyonKod, x.tankNo, x.urun, x.acilisLt, x.kapanisLt,
                 x.acilisZaman, x.kapanisZaman, x.olcumSayisi);
      return `(${Array.from({ length: KOLON }, (_, k) => `$${b + k + 1}`).join(',')})`;
    });
    await p.query(
      `INSERT INTO tank_seviye_gun (gun, istasyon_kod, tank_no, urun, acilis_lt, kapanis_lt,
         acilis_zaman, kapanis_zaman, olcum_sayisi)
       VALUES ${satir.join(',')}
       ON CONFLICT (gun, istasyon_kod, tank_no) DO UPDATE SET
         urun = EXCLUDED.urun, acilis_lt = EXCLUDED.acilis_lt, kapanis_lt = EXCLUDED.kapanis_lt,
         acilis_zaman = EXCLUDED.acilis_zaman, kapanis_zaman = EXCLUDED.kapanis_zaman,
         olcum_sayisi = EXCLUDED.olcum_sayisi, guncelleme = now()`,
      deger,
    );
  }
}

/** Hedef günden ÖNCEKİ en son kapanış seviyeleri → hedef günün açılışı.
 *
 *  ⚠️ NEDEN "EN SON MEVCUT GÜN", KESİN OLARAK "BİR GÜN ÖNCE" DEĞİL (2026-08-04):
 *  İlk sürüm `gun = hedef - 1` arıyordu. Cron bir gün atlayınca (GH Actions
 *  ücretsiz planda oluyor) zincir kopuyor ve `acilis_lt` bir daha DOLMUYOR.
 *  Canlıda yaşandı: 1 ve 3 Ağustos snapshot'ı var, 2 Ağustos yok → 3 Ağustos'un
 *  669 tankında açılış değeri 0 kaldı.
 *
 *  Artık her tank için o tankın EN SON kapanışı alınır (hedef günden önceki).
 *  `atlananGun` alanı, açılışın kaç gün öncesinden geldiğini söyler — mutabakat
 *  hesabı bunu görüp "bu aralık kesintili" diyebilir, sessizce yanlış hesaplamaz.
 *
 *  Döner: "istasyonKod|tankNo" → { lt, kaynakGun } */
export async function oncekiGunKapanis(
  hedefGun: string,
): Promise<Map<string, { lt: number; kaynakGun: string }>> {
  // Her tank için hedef günden önceki EN SON kapanış (DISTINCT ON = tank başına 1 satır)
  const r = await pool().query<{
    istasyon_kod: string; tank_no: string; kapanis_lt: string; gun: string;
  }>(
    `SELECT DISTINCT ON (istasyon_kod, tank_no)
            istasyon_kod, tank_no, kapanis_lt, gun::text
     FROM tank_seviye_gun
     WHERE gun < $1 AND kapanis_lt IS NOT NULL
     ORDER BY istasyon_kod, tank_no, gun DESC`,
    [hedefGun],
  );
  return new Map(
    r.rows.map((x) => [
      `${x.istasyon_kod}|${x.tank_no}`,
      { lt: Number(x.kapanis_lt), kaynakGun: x.gun },
    ]),
  );
}

/** "Gün kapanışı sayılabilir" ölçüm penceresi (TR saati).
 *
 *  ⚠️ EŞİK GERÇEK CRON DAVRANIŞINDAN ÖLÇÜLDÜ (2026-08-04): cron 21:00 UTC'ye
 *  kurulu (TR 00:00) ama GH Actions ücretsiz planda geciktiriyor — 3 Ağustos
 *  koşusu 21:56 UTC'de başladı, ölçüm TR **03:30**'a düştü. İlk yazdığım ≤02:00
 *  eşiği bu yüzden hiçbir gerçek kaydı yakalamıyordu (0/669). Pencere gecikmeyi
 *  kapsayacak kadar geniş, ama gün ortasını dışlayacak kadar dar olmalı. */
export const KAPANIS_PENCERE_BAS = 22; // TR 22:00'dan sonrası
export const KAPANIS_PENCERE_BIT = 6; //  TR 06:00'a kadar

/** O gün için gün kapanışı sayılabilecek (TR ≥22:00 veya ≤06:00) bir seviye
 *  kaydı var mı? Varsa ölçüm zamanını okunur biçimde döndürür, yoksa null.
 *
 *  ⚠️ NİYE: snapshot ANLIK — kayda giren ölçüm saati = aracın koştuğu saat.
 *  Gün ortasında koşan bir çekim gece kapanışını ezerse mutabakat aralığının
 *  ucu kayar ve o gün kullanılamaz olur (2026-08-04'te elle tetiklediğim iki
 *  test koşusu 4 Ağustos'u tam böyle bozdu). seviyeCek.ts bunu kontrol eder. */
export async function gunBasiKaydiVar(gun: string): Promise<string | null> {
  const r = await pool().query<{ z: string }>(
    `SELECT to_char(max(kapanis_zaman) AT TIME ZONE 'Europe/Istanbul',
                    'YYYY-MM-DD HH24:MI') z
     FROM tank_seviye_gun
     WHERE gun = $1 AND kapanis_zaman IS NOT NULL
       -- ⚠️ OR parantez İÇİNDE: parantezsiz OR, gun filtresini de kapsayıp
       --    tüm tabloyu tarardı (SQL'de AND, OR'dan önce bağlar).
       AND ((kapanis_zaman AT TIME ZONE 'Europe/Istanbul')::time <= make_time($3, 0, 0)
         OR (kapanis_zaman AT TIME ZONE 'Europe/Istanbul')::time >= make_time($2, 0, 0))`,
    [gun, KAPANIS_PENCERE_BAS, KAPANIS_PENCERE_BIT],
  );
  return r.rows[0]?.z ?? null;
}

/** Son N günde `satis_ozet`'te EKSİK olan günleri döndür (bugün hariç — henüz
 *  tamamlanmadı). Cron kaçırdığı günü telafi etsin diye.
 *
 *  ⚠️ TR günü kullanılır: cron 21:00 UTC'de koşuyor ve gecikme UTC gününü
 *  değiştirebiliyor (bkz. satisCek.ts). */
export async function eksikSatisGunleri(gunSayi = 7): Promise<string[]> {
  const r = await pool().query<{ gun: string }>(
    `WITH tr AS (SELECT (now() + interval '3 hours')::date bugun),
     seri AS (
       SELECT (SELECT bugun FROM tr) - g AS gun
       FROM generate_series(1, $1) g)
     SELECT s.gun::text FROM seri s
     LEFT JOIN (SELECT DISTINCT gun FROM satis_ozet) o ON o.gun = s.gun
     WHERE o.gun IS NULL
     ORDER BY s.gun`,
    [gunSayi],
  );
  return r.rows.map((x) => x.gun);
}

/** Açılışı boş kalmış tank-günleri onar: her biri için o günden önceki en son
 *  kapanışı açılış olarak yazar. Serinin ilk günü ATLANIR (öncesi yok).
 *
 *  ⚠️ NEDEN: snapshot geriye dönük çekilemez (anlık veri) ama açılış DB'den
 *  türetilebilir. Cron bir gün atlayıp zincir koptuğunda (2026-08-04) bu onarır.
 *  Döner: doldurulan satır sayısı. */
export async function acilisZinciriOnar(): Promise<number> {
  const r = await pool().query(
    `WITH ilk AS (SELECT min(gun) g FROM tank_seviye_gun),
     onceki AS (
       SELECT DISTINCT ON (t.gun, t.istasyon_kod, t.tank_no)
              t.gun, t.istasyon_kod, t.tank_no, k.kapanis_lt
       FROM tank_seviye_gun t
       JOIN tank_seviye_gun k
         ON k.istasyon_kod = t.istasyon_kod AND k.tank_no = t.tank_no
        AND k.gun < t.gun AND k.kapanis_lt IS NOT NULL
       WHERE t.acilis_lt IS NULL AND t.gun > (SELECT g FROM ilk)
       ORDER BY t.gun, t.istasyon_kod, t.tank_no, k.gun DESC)
     UPDATE tank_seviye_gun t SET acilis_lt = o.kapanis_lt, guncelleme = now()
     FROM onceki o
     WHERE t.gun = o.gun AND t.istasyon_kod = o.istasyon_kod AND t.tank_no = o.tank_no
       AND t.acilis_lt IS NULL`,
  );
  return r.rowCount ?? 0;
}

// --- Sistem ayar (cursor) oku/yaz ---
export async function ayarOku(anahtar: string): Promise<string | null> {
  const r = await pool().query<{ deger: string }>('SELECT deger FROM sistem_ayar WHERE anahtar=$1', [anahtar]);
  return r.rows[0]?.deger ?? null;
}
export async function ayarYaz(anahtar: string, deger: string): Promise<void> {
  await pool().query(
    `INSERT INTO sistem_ayar (anahtar, deger, guncelleme) VALUES ($1,$2, now())
     ON CONFLICT (anahtar) DO UPDATE SET deger=EXCLUDED.deger, guncelleme=now()`,
    [anahtar, deger],
  );
}

// --- Bayi iletişim okuma (ÇOKLU: telefonlar/epostalar dizileri) ---
export interface Iletisim {
  ad: string | null;
  telefonlar: string[]; // tüm cepler
  epostalar: string[]; // tüm normal mailler (KEP hariç)
}

/** Tüm bayi_iletisim (POL Excel kaynağı) → EPDK no haritası. Job'ın BFF(Logo) haritasını
 *  tamamlamak için (telefon Logo'da %0, POL'de %100). Çoklu telefon/mail dizileriyle. */
export async function iletisimHaritasiTumu(): Promise<Map<string, Iletisim>> {
  const r = await pool().query<{ epdk_no: string; ad: string | null; telefonlar: string[]; epostalar: string[] }>(
    'SELECT epdk_no, ad, telefonlar, epostalar FROM bayi_iletisim',
  );
  return new Map(
    r.rows.map((x) => [
      x.epdk_no,
      { ad: x.ad, telefonlar: x.telefonlar ?? [], epostalar: x.epostalar ?? [] },
    ]),
  );
}

// --- Alarm işlemleri ---
export interface AcikAlarm {
  id: string;
  anahtar: string;
  acildi: Date;
  son_bildirim: Date | null;
  bildirim_sayisi: number;
}

export async function acikAlarmlar(): Promise<Map<string, AcikAlarm>> {
  const r = await pool().query<AcikAlarm>(
    // acildi: kronik alarmda tekrar-bildirim aralığını kademeli açmak için
    // gerekli (bkz. job/index.ts bildirimGerekli).
    'SELECT id::text, anahtar, acildi, son_bildirim, bildirim_sayisi FROM alarmlar WHERE kapandi IS NULL',
  );
  return new Map(r.rows.map((a) => [a.anahtar, a]));
}

export async function alarmAc(a: {
  tip: AlarmTipi;
  istasyonKod: string;
  tankNo: string | null;
  anahtar: string;
  istasyonAd: string;
  epdkNo: string | null;
  mesaj: string;
}): Promise<string> {
  // Partial unique index (ux_alarm_acik) eşzamanlı çift açılışı engeller. Çakışmayı
  // sessizce yut; sonra mevcut açık kaydın id'sini döndür.
  try {
    const r = await pool().query<{ id: string }>(
      `INSERT INTO alarmlar (tip, istasyon_kod, tank_no, anahtar, istasyon_ad, epdk_no, mesaj)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id::text`,
      [a.tip, a.istasyonKod, a.tankNo, a.anahtar, a.istasyonAd, a.epdkNo, a.mesaj],
    );
    return r.rows[0].id;
  } catch (e: any) {
    if (e?.code !== '23505') throw e; // 23505 = unique_violation
    const mevcut = await pool().query<{ id: string }>(
      'SELECT id::text FROM alarmlar WHERE anahtar=$1 AND kapandi IS NULL',
      [a.anahtar],
    );
    return mevcut.rows[0].id;
  }
}

export async function alarmBildirimIsaretle(id: string): Promise<void> {
  await pool().query(
    'UPDATE alarmlar SET son_bildirim=now(), bildirim_sayisi=bildirim_sayisi+1 WHERE id=$1',
    [id],
  );
}

/** Verilen anahtarlar DIŞINDA kalan açık alarmları kapatır (durum düzeldi). */
export async function duzelenleriKapat(acikKalanAnahtarlar: Set<string>): Promise<string[]> {
  const acik = await acikAlarmlar();
  const kapatilacak = [...acik.values()].filter((a) => !acikKalanAnahtarlar.has(a.anahtar));
  const kapananAnahtarlar: string[] = [];
  for (const a of kapatilacak) {
    await pool().query('UPDATE alarmlar SET kapandi=now() WHERE id=$1', [a.id]);
    kapananAnahtarlar.push(a.anahtar);
  }
  return kapananAnahtarlar;
}

// ─────────────────────── PİYASA İSTİHBARAT (EPDK) ───────────────────────
import type { EpdkDagitici, EpdkBayi } from './epdkClient.js';

/** Bir tarih string'ini (ISO) DATE'e indir; null güvenli. */
function gun(s: string | null): string | null {
  return s ? s.slice(0, 10) : null;
}

export async function dagiticilariKaydet(liste: EpdkDagitici[]): Promise<void> {
  const p = pool();
  for (const d of liste) {
    if (!d.lisansNo) continue; // iptal/iade edilmiş bazı dağıtıcılarda lisansNo boş → atla (PK null olamaz)
    await p.query(
      `INSERT INTO dagiticilar (lisans_no, unvan, vergi_no, il, ilce, adres, baslangic, bitis, durum, markalar, yakit_turleri, guncelleme)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (lisans_no) DO UPDATE SET
         unvan=EXCLUDED.unvan, vergi_no=EXCLUDED.vergi_no, il=EXCLUDED.il, ilce=EXCLUDED.ilce,
         adres=EXCLUDED.adres, baslangic=EXCLUDED.baslangic, bitis=EXCLUDED.bitis, durum=EXCLUDED.durum,
         markalar=EXCLUDED.markalar, yakit_turleri=EXCLUDED.yakit_turleri, guncelleme=now()`,
      [d.lisansNo, d.unvan, d.vergiNo, d.il, d.ilce, d.adres, gun(d.baslangic), gun(d.bitis), d.durum, d.markalar, d.yakitTurleri],
    );
  }
}

/** Bayileri GÜNCEL tabloya upsert + o günün snapshot'ına yaz. dagiticiLisansNo = sorguda kullanılan. */
/** @param kapsam 'tum' | 'onaylandi' — snapshot'a yazılır; transfer karşılaştırmasında
 *  iki günün kapsamı EŞİT olmalı, yoksa binlerce hayalet kayıt üretir. */
export async function bayileriKaydet(
  bayiler: EpdkBayi[],
  dagiticiLisansNo: string,
  snapshotGun: string,
  kapsam: 'tum' | 'onaylandi' = 'tum',
): Promise<void> {
  const p = pool();
  for (const b of bayiler) {
    if (!b.bayiLisansNo) continue; // iptal/sonlanmış bazı bayilerde lisansNo boş → atla (PK null olamaz)
    await p.query(
      `INSERT INTO bayiler_epdk (bayi_lisans_no, lisans_sahibi, dagitim_sirketi, dagitici_lisans_no, il, ilce,
         tesis_adresi, vergi_no, kategori, alt_baslik, lisans_durumu, kacakcilik_iptal, lisans_baslangic,
         lisans_bitis, sozlesme_baslangic, sozlesme_bitis, iptal_tarihi, iptal_aciklama, guncelleme)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
       ON CONFLICT (bayi_lisans_no) DO UPDATE SET
         lisans_sahibi=EXCLUDED.lisans_sahibi, dagitim_sirketi=EXCLUDED.dagitim_sirketi,
         dagitici_lisans_no=EXCLUDED.dagitici_lisans_no, il=EXCLUDED.il, ilce=EXCLUDED.ilce,
         tesis_adresi=EXCLUDED.tesis_adresi, vergi_no=EXCLUDED.vergi_no, kategori=EXCLUDED.kategori,
         alt_baslik=EXCLUDED.alt_baslik, lisans_durumu=EXCLUDED.lisans_durumu,
         kacakcilik_iptal=EXCLUDED.kacakcilik_iptal, lisans_baslangic=EXCLUDED.lisans_baslangic,
         lisans_bitis=EXCLUDED.lisans_bitis, sozlesme_baslangic=EXCLUDED.sozlesme_baslangic,
         sozlesme_bitis=EXCLUDED.sozlesme_bitis, iptal_tarihi=EXCLUDED.iptal_tarihi,
         iptal_aciklama=EXCLUDED.iptal_aciklama, guncelleme=now()`,
      [b.bayiLisansNo, b.lisansSahibi, b.dagitimSirketi, dagiticiLisansNo, b.il, b.ilce, b.tesisAdresi,
       b.vergiNo, b.kategori, b.altBaslik, b.lisansDurumu, b.kacakcilikIptal, gun(b.lisansBaslangic),
       gun(b.lisansBitis), gun(b.sozlesmeBaslangic), gun(b.sozlesmeBitis), gun(b.iptalTarihi), b.iptalAciklama],
    );
    await p.query(
      `INSERT INTO bayi_snapshot (snapshot_gun, bayi_lisans_no, dagitim_sirketi, lisans_durumu, il, kapsam)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (snapshot_gun, bayi_lisans_no) DO UPDATE SET
         dagitim_sirketi=EXCLUDED.dagitim_sirketi, lisans_durumu=EXCLUDED.lisans_durumu,
         il=EXCLUDED.il, kapsam=EXCLUDED.kapsam`,
      [snapshotGun, b.bayiLisansNo, b.dagitimSirketi, b.lisansDurumu, b.il, kapsam],
    );
  }
}

/** Snapshot bütünlük eşiği: yeni snapshot, önceki günün bu oranının altında
 *  kalırsa YARIM kabul edilir ve karşılaştırma yapılmaz. */
const SNAPSHOT_BUTUNLUK_ORANI = 0.9;

/**
 * Transfer tespiti: bugünün snapshot'ını en son ÖNCEKİ snapshot günüyle karşılaştırır.
 * Dağıtıcı değişen (transfer), yeni görülen (yeni_bayi), kaybolan (ayrildi), durum değişen
 * (durum_degisti) bayileri `transferler` tablosuna yazar. İki ayrı gün snapshot yoksa no-op.
 * Döner: eklenen transfer sayısı (yarım snapshot'ta -1).
 *
 * ⚠️ BÜTÜNLÜK KONTROLÜ ZORUNLU (canlıda yandı, 2026-07-25):
 * EPDK çekimi yarıda kesilip 6/32 dağıtıcının bayisi yazıldığında, o kısmi
 * snapshot tam snapshot'la karşılaştırıldı ve **17.866 hayalet "yeni_bayi"**
 * üretti — eksik listede olmayan her bayi "yeni" göründü. Sahte kayıtlar ve
 * kısmi snapshot elle silinmek zorunda kaldı.
 *
 * Kural: transfer tespiti yalnız İKİ TAM snapshot arasında geçerlidir. Bir
 * günün bayi sayısı öncekinin %90'ının altındaysa çekim yarım kabul edilir;
 * karşılaştırma ATLANIR ve uyarı loglanır. (Gerçek piyasada bir günde bayi
 * sayısının %10 düşmesi mümkün değil — böyle bir düşüş her zaman veri
 * toplama arızasıdır, piyasa olayı değil.)
 */
/**
 * Bir günün snapshot'ını sil. Yarım kalan çekimi temizlemek için.
 *
 * ⚠️ Yarım snapshot ZARARLIDIR: bütünlük kontrolünü geçerse binlerce hayalet
 * "ayrildi" kaydı üretir (2026-07-30: 27.484/30.307 = %90,7, eşik %90 → kıl payı
 * geçiyordu). Bu yüzden çekim yarıda kesilirse snapshot BIRAKILMAZ, silinir.
 *
 * Döner: silinen satır sayısı.
 */
export async function snapshotSil(gun: string): Promise<number> {
  const r = await pool().query('DELETE FROM bayi_snapshot WHERE snapshot_gun = $1', [gun]);
  return r.rowCount ?? 0;
}

/**
 * Snapshot SAKLAMA PENCERESİ — belirtilen gün sayısından eski snapshot günlerini siler.
 *
 * NEDEN (2026-08-26 ölçümü): `bayi_snapshot` her gün EPDK bayi kütüğünün TAM kopyasını
 * yazıyor (~30.370 satır / ~6,8 MB). 29 günde 197 MB olmuştu — 257 MB'lık DB'nin %77'si.
 * Supabase ücretsiz planı 500 MB; bu hızla ~35 gün sonra (≈29.09.2026) dolacak ve DB
 * dolduğunda YAZMA DURUR: izleme, alarm ve mutabakat işlerinin hepsi kırılır.
 *
 * NEDEN GÜVENLİ — silinen veri türetilmiş sonucu BOZMAZ:
 *  · `transferler` tablosu kendi kalıcı kaydını tutar (eski_deger/yeni_deger/tespit_gun).
 *    Snapshot silinince geçmiş transferler DURUR, yeniden hesaplanmaz.
 *  · Transfer tespiti yalnız SON İKİ günü karşılaştırır (bugün ⟷ bir önceki snapshot günü),
 *    dolayısıyla 10 günlük pencere fazlasıyla yeter — bir cron kaçsa bile pay kalır.
 *  · `bayi_snapshot`'a FK ile bağlı tablo YOK (doğrulandı).
 *
 * ⚠️ ÇAĞRI SIRASI: transfer tespitinden SONRA çağrılmalı. Önce silinirse o günün
 * karşılaştırma çifti bozulur ve transfer üretilemez.
 *
 * Bugünün günü asla silinmez (pencere ne olursa olsun) — koşu sırasında kendini silmesin.
 *
 * Döner: silinen satır sayısı.
 */
export async function snapshotPencereUygula(gunSayisi = 10): Promise<number> {
  // En yeni `gunSayisi` snapshot GÜNÜ korunur; kalanlar silinir. Gün sayısı esas alınır,
  // takvim aralığı değil: cron kaçan günlerde takvim penceresi yanlışlıkla veri silerdi.
  const r = await pool().query(
    `DELETE FROM bayi_snapshot
      WHERE snapshot_gun NOT IN (
        SELECT snapshot_gun FROM (
          SELECT DISTINCT snapshot_gun FROM bayi_snapshot
           ORDER BY snapshot_gun DESC LIMIT $1
        ) k
      )`,
    [gunSayisi],
  );
  return r.rowCount ?? 0;
}

export async function transferleriTespitEt(bugun: string): Promise<number> {
  const p = pool();
  // Bir önceki snapshot günü (bugünden önceki en yakın)
  const oncekiR = await p.query<{ g: string }>(
    'SELECT DISTINCT snapshot_gun::text g FROM bayi_snapshot WHERE snapshot_gun < $1 ORDER BY g DESC LIMIT 1',
    [bugun],
  );
  const onceki = oncekiR.rows[0]?.g;
  if (!onceki) return 0; // karşılaştıracak önceki gün yok (ilk çalıştırma)

  // Bütünlük: iki günün satır sayısı VE kapsamı karşılaştırılır.
  const sayR = await p.query<{ gun: string; n: string; kapsamlar: string[] }>(
    `SELECT snapshot_gun::text gun, count(*) n,
            array_agg(DISTINCT COALESCE(kapsam,'bilinmiyor')) kapsamlar
     FROM bayi_snapshot WHERE snapshot_gun IN ($1,$2) GROUP BY snapshot_gun`,
    [onceki, bugun],
  );
  const say = new Map(sayR.rows.map((r) => [r.gun, Number(r.n)]));
  const kaps = new Map(sayR.rows.map((r) => [r.gun, r.kapsamlar.sort().join('+')]));
  const oncekiSayi = say.get(onceki) ?? 0;
  const bugunSayi = say.get(bugun) ?? 0;

  if (bugunSayi === 0) {
    console.warn(`⚠ Transfer tespiti ATLANDI: ${bugun} snapshot'ı boş.`);
    return -1;
  }

  // KAPSAM UYUŞMAZLIĞI: 'onaylandi' (~12.6bin) ile 'tum' (~30.3bin) karşılaştırılamaz.
  // Sayı kontrolü bunu zaten yakalıyor ama sebebi anlaşılmıyordu → açıkça söyle.
  const oncekiKapsam = kaps.get(onceki) ?? 'bilinmiyor';
  const bugunKapsam = kaps.get(bugun) ?? 'bilinmiyor';
  if (oncekiKapsam !== 'bilinmiyor' && bugunKapsam !== 'bilinmiyor' && oncekiKapsam !== bugunKapsam) {
    console.warn(
      `⚠ Transfer tespiti ATLANDI — KAPSAM UYUŞMAZLIĞI.\n` +
        `   ${bugun}: '${bugunKapsam}' · ${onceki}: '${oncekiKapsam}'\n` +
        `   Farklı kapsamdaki iki gün karşılaştırılamaz ('onaylandi' ~12.6bin, 'tum' ~30.3bin).\n` +
        `   Aynı kapsamla tekrar çek: npm run piyasa -- ${oncekiKapsam === 'tum' ? '--tum-durumlar' : '(bayrak yok)'}`,
    );
    return -1;
  }
  // DAĞITICI BÜTÜNLÜĞÜ — satır oranından ÖNCE kontrol edilir.
  //
  // ⚠️ NEDEN GEREKLİ (2026-07-30, canlıda yakalandı): sabahki çekim 27.484/30.307'de
  // yarıda kesildi. Oran %90,7 → satır kontrolünün %90 eşiğini KIL PAYI GEÇİYORDU ve
  // tespit çalışsaydı eksik 2.823 bayi hayalet "ayrildi" olarak yazılacaktı.
  // Satır oranı tek başına yetersiz: 32 dağıtıcıdan biri tamamen eksik olsa bile
  // (ör. küçük bir dağıtıcı) oran %90'ın üstünde kalabilir.
  // Dağıtıcı KÜMESİ karşılaştırmak bunu yakalar — eksik dağıtıcı = eksik çekim.
  const dagR = await p.query<{ gun: string; dagiticilar: string[] }>(
    `SELECT snapshot_gun::text gun, array_agg(DISTINCT dagitim_sirketi) dagiticilar
     FROM bayi_snapshot WHERE snapshot_gun IN ($1,$2) AND dagitim_sirketi IS NOT NULL
     GROUP BY snapshot_gun`,
    [onceki, bugun],
  );
  const dag = new Map(dagR.rows.map((r) => [r.gun, new Set(r.dagiticilar)]));
  const oncekiDag = dag.get(onceki) ?? new Set<string>();
  const bugunDag = dag.get(bugun) ?? new Set<string>();
  const eksikDag = [...oncekiDag].filter((d) => !bugunDag.has(d));
  if (oncekiDag.size > 0 && eksikDag.length > 0) {
    console.warn(
      `⚠ Transfer tespiti ATLANDI — ${eksikDag.length} DAĞITICI EKSİK (çekim yarıda kesilmiş).\n` +
        `   ${bugun}: ${bugunDag.size} dağıtıcı · ${onceki}: ${oncekiDag.size} dağıtıcı\n` +
        `   Eksik: ${eksikDag.slice(0, 5).join(', ')}${eksikDag.length > 5 ? ` … (+${eksikDag.length - 5})` : ''}\n` +
        `   Bu dağıtıcıların TÜM bayileri hayalet "ayrildi" olarak yazılırdı.\n` +
        `   Çekimi tamamla ya da bu günü sil: DELETE FROM bayi_snapshot WHERE snapshot_gun='${bugun}';`,
    );
    return -1;
  }

  if (oncekiSayi > 0 && bugunSayi < oncekiSayi * SNAPSHOT_BUTUNLUK_ORANI) {
    const yuzde = ((bugunSayi / oncekiSayi) * 100).toFixed(1);
    console.warn(
      `⚠ Transfer tespiti ATLANDI — snapshot YARIM görünüyor.\n` +
        `   ${bugun}: ${bugunSayi.toLocaleString('tr')} bayi · ${onceki}: ${oncekiSayi.toLocaleString('tr')} bayi (%${yuzde})\n` +
        `   Bir günde bayi sayısının %10+ düşmesi veri toplama arızasıdır, piyasa olayı değil.\n` +
        `   Karşılaştırmak binlerce hayalet "ayrildi" kaydı üretirdi. Çekimi tamamlayıp tekrar çalıştır\n` +
        `   ya da bu günün snapshot'ını sil: DELETE FROM bayi_snapshot WHERE snapshot_gun='${bugun}';`,
    );
    return -1;
  }

  // Tek sorguda: dün (o) FULL OUTER JOIN bugün (b) → değişimleri bul
  const r = await p.query(
    `WITH o AS (SELECT * FROM bayi_snapshot WHERE snapshot_gun=$1),
          b AS (SELECT * FROM bayi_snapshot WHERE snapshot_gun=$2)
     INSERT INTO transferler (bayi_lisans_no, lisans_sahibi, il, tip, eski_deger, yeni_deger, tespit_gun)
     SELECT COALESCE(b.bayi_lisans_no,o.bayi_lisans_no),
            be.lisans_sahibi, COALESCE(b.il,o.il),
            CASE
              WHEN o.bayi_lisans_no IS NULL THEN 'yeni_bayi'
              WHEN b.bayi_lisans_no IS NULL THEN 'ayrildi'
              WHEN o.dagitim_sirketi IS DISTINCT FROM b.dagitim_sirketi THEN 'dagitici_degisti'
              WHEN o.lisans_durumu IS DISTINCT FROM b.lisans_durumu THEN 'durum_degisti'
            END,
            CASE WHEN o.dagitim_sirketi IS DISTINCT FROM b.dagitim_sirketi THEN o.dagitim_sirketi ELSE o.lisans_durumu END,
            CASE WHEN o.dagitim_sirketi IS DISTINCT FROM b.dagitim_sirketi THEN b.dagitim_sirketi ELSE b.lisans_durumu END,
            $2::date
     FROM o FULL OUTER JOIN b ON o.bayi_lisans_no=b.bayi_lisans_no
     LEFT JOIN bayiler_epdk be ON be.bayi_lisans_no=COALESCE(b.bayi_lisans_no,o.bayi_lisans_no)
     WHERE o.bayi_lisans_no IS NULL
        OR b.bayi_lisans_no IS NULL
        OR o.dagitim_sirketi IS DISTINCT FROM b.dagitim_sirketi
        OR o.lisans_durumu IS DISTINCT FROM b.lisans_durumu`,
    [onceki, bugun],
  );
  return r.rowCount ?? 0;
}

// ══ HACİM: EPDK sektör raporu (hacim bazlı pazar payı) ═══════════════════
// Kaynak/tuzaklar: docs/bilgi/epdk-sektor-raporu-hacim.md · şema: schema_hacim.sql

/** Dağıtıcı × ürün grubu hacim + EPDK'nın kendi pazar payı yüzdesi (upsert). */
export async function hacimDagiticiKaydet(
  yil: number, ay: number, kaynak: string,
  liste: { unvan: string; urunGrubu: string; istasyon: number | null; koy: number | null;
           tarim: number | null; dis: number | null; toplam: number; pay: number | null }[],
): Promise<void> {
  if (liste.length === 0) return;
  const p = pool();
  const KOLON = 10;
  const PARCA = 600; // 600×10 = 6000 parametre (limit ~65535)
  for (let i = 0; i < liste.length; i += PARCA) {
    const grup = liste.slice(i, i + PARCA);
    // kaynak_rapor tüm satırlarda aynı → tek parametre, en sona konur ve
    // her satır aynı indeksi kullanır (grup.length * KOLON + 1).
    const kaynakIdx = grup.length * KOLON + 1;
    const deger: unknown[] = [];
    const satir = grup.map((x, j) => {
      const b = j * KOLON;
      deger.push(yil, ay, x.unvan, x.urunGrubu, x.istasyon, x.koy, x.tarim, x.dis, x.toplam, x.pay);
      return `(${Array.from({ length: KOLON }, (_, k) => `$${b + k + 1}`).join(',')},$${kaynakIdx})`;
    });
    deger.push(kaynak);
    await p.query(
      `INSERT INTO epdk_hacim_dagitici
         (donem_yil, donem_ay, unvan, urun_grubu, istasyon_litre, koy_litre,
          tarim_litre, dis_litre, toplam_litre, pazar_payi, kaynak_rapor)
       VALUES ${satir.join(',')}
       ON CONFLICT (donem_yil, donem_ay, unvan, urun_grubu) DO UPDATE SET
         istasyon_litre = EXCLUDED.istasyon_litre, koy_litre = EXCLUDED.koy_litre,
         tarim_litre = EXCLUDED.tarim_litre, dis_litre = EXCLUDED.dis_litre,
         toplam_litre = EXCLUDED.toplam_litre, pazar_payi = EXCLUDED.pazar_payi,
         kaynak_rapor = EXCLUDED.kaynak_rapor, guncelleme = now()`,
      deger,
    );
  }
}

/** İl × şirket hacmi (TON — litre tablolarıyla toplanmaz). */
export async function hacimIlKaydet(
  yil: number, ay: number, kumulatif: boolean,
  liste: { il: string; unvan: string; benzin: number | null; motorin: number | null; toplam: number | null }[],
): Promise<void> {
  if (liste.length === 0) return;
  const p = pool();
  const KOLON = 8;
  const PARCA = 700;
  for (let i = 0; i < liste.length; i += PARCA) {
    const grup = liste.slice(i, i + PARCA);
    const deger: unknown[] = [];
    const satir = grup.map((x, j) => {
      const b = j * KOLON;
      deger.push(yil, ay, kumulatif, x.il, x.unvan, x.benzin, x.motorin, x.toplam);
      return `(${Array.from({ length: KOLON }, (_, k) => `$${b + k + 1}`).join(',')})`;
    });
    await p.query(
      `INSERT INTO epdk_hacim_il
         (donem_yil, donem_ay, kumulatif, il, unvan, benzin_ton, motorin_ton, toplam_ton)
       VALUES ${satir.join(',')}
       ON CONFLICT (donem_yil, donem_ay, il, unvan) DO UPDATE SET
         kumulatif = EXCLUDED.kumulatif, benzin_ton = EXCLUDED.benzin_ton,
         motorin_ton = EXCLUDED.motorin_ton, toplam_ton = EXCLUDED.toplam_ton,
         guncelleme = now()`,
      deger,
    );
  }
}

/** Çekim koşusu kaydı — biçim kayması ve boş/bozuk yayın burada görünür. */
export async function hacimKosuKaydet(
  yil: number, ay: number, bicim: string,
  dagiticiSatir: number, ilSatir: number, dosyaBayt: number | null, hata: string | null,
): Promise<void> {
  await pool().query(
    `INSERT INTO epdk_hacim_kosu (donem_yil, donem_ay, bicim, dagitici_satir, il_satir, dosya_bayt, hata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (donem_yil, donem_ay) DO UPDATE SET
       bicim = EXCLUDED.bicim, dagitici_satir = EXCLUDED.dagitici_satir,
       il_satir = EXCLUDED.il_satir, dosya_bayt = EXCLUDED.dosya_bayt,
       hata = EXCLUDED.hata, kosu_zamani = now()`,
    [yil, ay, bicim, dagiticiSatir, ilSatir, dosyaBayt, hata],
  );
}

// ══ BİZİM SATIŞIMIZ: bayi × ürün grubu alımları (Yönetim sekmesi) ════════

/** BFF /dis/v1/mutabakat/fatura-satislari satırları → satis_fatura (upsert). */
export async function satisFaturaKaydet(
  liste: { faturaNo: string; tarih: string; cariKod: string; bayiAd: string | null;
           urunKod: string; urun: string | null; urunGrubu: string; litre: number;
           tutar: number | null; cikisTesisi: string | null; iptal: boolean }[],
): Promise<void> {
  if (liste.length === 0) return;
  const p = pool();
  const KOLON = 11;
  const PARCA = 500;
  for (let i = 0; i < liste.length; i += PARCA) {
    const grup = liste.slice(i, i + PARCA);
    const deger: unknown[] = [];
    const satir = grup.map((x, j) => {
      const b = j * KOLON;
      deger.push(x.faturaNo, x.tarih, x.cariKod, x.bayiAd, x.urunKod, x.urun,
                 x.urunGrubu, x.litre, x.tutar, x.cikisTesisi, x.iptal);
      return `(${Array.from({ length: KOLON }, (_, k) => `$${b + k + 1}`).join(',')})`;
    });
    await p.query(
      `INSERT INTO satis_fatura
         (fatura_no, tarih, cari_kod, bayi_ad, urun_kod, urun, urun_grubu,
          litre, tutar, cikis_tesisi, iptal)
       VALUES ${satir.join(',')}
       ON CONFLICT (fatura_no, urun_kod) DO UPDATE SET
         tarih = EXCLUDED.tarih, cari_kod = EXCLUDED.cari_kod, bayi_ad = EXCLUDED.bayi_ad,
         urun = EXCLUDED.urun, urun_grubu = EXCLUDED.urun_grubu, litre = EXCLUDED.litre,
         tutar = EXCLUDED.tutar, cikis_tesisi = EXCLUDED.cikis_tesisi,
         iptal = EXCLUDED.iptal, guncelleme = now()`,
      deger,
    );
  }
}

/** Satış çekim koşusu kaydı (dönem boşluğu tespiti). */
export async function satisFaturaKosuKaydet(
  bas: string, bit: string, satir: number, litre: number, tutar: number, hata: string | null,
): Promise<void> {
  await pool().query(
    `INSERT INTO satis_fatura_kosu (donem_bas, donem_bit, satir, litre, tutar, hata)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (donem_bas, donem_bit) DO UPDATE SET
       satir = EXCLUDED.satir, litre = EXCLUDED.litre, tutar = EXCLUDED.tutar,
       hata = EXCLUDED.hata, kosu_zamani = now()`,
    [bas, bit, satir, litre, tutar, hata],
  );
}
