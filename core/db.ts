// Postgres erişim katmanı. Supabase/Neon connection string (DATABASE_URL).

import pg from 'pg';
import { config } from './config.js';
import type { AsisIstasyon, AsisOnlineDurum, AsisTank, AsisDolum, AlarmTipi } from './tipler.js';
import { epdkNo } from './asisClient.js';

const { Pool } = pg;

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
    _pool = new Pool({
      connectionString: url.toString(),
      ssl: sslIster ? { rejectUnauthorized: false } : undefined,
      max: 4,
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
  const KOLON = 13;
  const PARCA = 800; // 800×13 = 10400 parametre (limit ~65535, güvenli)
  for (let i = 0; i < dolumlar.length; i += PARCA) {
    const grup = dolumlar.slice(i, i + PARCA);
    const degerler: unknown[] = [];
    const satirlar = grup.map((d, j) => {
      const b = j * KOLON;
      degerler.push(
        d.dolumId, d.istasyonKod, d.tankNo, d.urunAdi, d.dolumBaslama, d.dolumBitim,
        d.dolumMiktari, d.dolumMiktariNet, d.irsaliyeNo, d.irsaliyeLitre, d.irsaliyeHacimFark,
        d.kapasiteLt, d.tankerDolumTarihi,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13})`;
    });
    await p.query(
      `INSERT INTO tank_dolum (dolum_id, istasyon_kod, tank_no, urun, dolum_baslama, dolum_bitim,
         dolum_miktari, dolum_miktari_net, irsaliye_no, irsaliye_litre, irsaliye_hacim_fark,
         kapasite_lt, tanker_dolum_tarihi)
       VALUES ${satirlar.join(',')}
       ON CONFLICT (dolum_id) DO NOTHING`,
      degerler,
    );
  }
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
  son_bildirim: Date | null;
  bildirim_sayisi: number;
}

export async function acikAlarmlar(): Promise<Map<string, AcikAlarm>> {
  const r = await pool().query<AcikAlarm>(
    'SELECT id::text, anahtar, son_bildirim, bildirim_sayisi FROM alarmlar WHERE kapandi IS NULL',
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
export async function bayileriKaydet(bayiler: EpdkBayi[], dagiticiLisansNo: string, snapshotGun: string): Promise<void> {
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
      `INSERT INTO bayi_snapshot (snapshot_gun, bayi_lisans_no, dagitim_sirketi, lisans_durumu, il)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (snapshot_gun, bayi_lisans_no) DO UPDATE SET
         dagitim_sirketi=EXCLUDED.dagitim_sirketi, lisans_durumu=EXCLUDED.lisans_durumu, il=EXCLUDED.il`,
      [snapshotGun, b.bayiLisansNo, b.dagitimSirketi, b.lisansDurumu, b.il],
    );
  }
}

/**
 * Transfer tespiti: bugünün snapshot'ını en son ÖNCEKİ snapshot günüyle karşılaştırır.
 * Dağıtıcı değişen (transfer), yeni görülen (yeni_bayi), kaybolan (ayrildi), durum değişen
 * (durum_degisti) bayileri `transferler` tablosuna yazar. İki ayrı gün snapshot yoksa no-op.
 * Döner: eklenen transfer sayısı.
 */
export async function transferleriTespitEt(bugun: string): Promise<number> {
  const p = pool();
  // Bir önceki snapshot günü (bugünden önceki en yakın)
  const oncekiR = await p.query<{ g: string }>(
    'SELECT DISTINCT snapshot_gun::text g FROM bayi_snapshot WHERE snapshot_gun < $1 ORDER BY g DESC LIMIT 1',
    [bugun],
  );
  const onceki = oncekiR.rows[0]?.g;
  if (!onceki) return 0; // karşılaştıracak önceki gün yok (ilk çalıştırma)

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
