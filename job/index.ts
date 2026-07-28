// Otomasyon job — GH Actions cron entry.
// Akış: ASIS'ten çek → DB'ye yaz → kural motoru → alarm aç/kapa → debounce'lu bildir.
//
// Tek seferlik çalışır (stateless). Durum Postgres'te. DRY_RUN=1 → bildirim atmadan test.

import { config } from '../core/config.js';
import { asis, epdkNo } from '../core/asisClient.js';
import * as db from '../core/db.js';
import { baglantiKopuklari, tankVeriYoklari, anahtar, tespitEpdkNo } from '../core/kurallar.js';
import { bildir } from '../core/bildirim/index.js';
import { iletisimHaritasiGetir, type BayiIletisim } from '../core/bffIletisim.js';
import type { AsisIstasyon, AsisTank, Tespit } from '../core/tipler.js';

// Job boyunca sabit iletişim haritaları (başta bir kez çekilir).
// bffHarita: canlı Logo (telefon %0, mail %52). polHarita: POL Excel (telefon %100, mail %90).
// gonder() ikisini birleştirir: alan bazında BFF öncelik, eksikse POL tamamlar.
let bffHarita = new Map<string, BayiIletisim>();
let polHarita = new Map<string, db.Iletisim>();

/** Bir EPDK no için birleşik iletişim: BFF + POL TÜM telefon/mailleri birleştir, tekilleştir.
 *  Bildirim hepsine gider (kullanıcı kararı: çoklu iletişim → hepsi). */
function iletisimCoz(no: string | null): { epostalar: string[]; telefonlar: string[] } {
  if (!no) return { epostalar: [], telefonlar: [] };
  const b = bffHarita.get(no);
  const p = polHarita.get(no);
  const telefonlar = [b?.cepTelefon, b?.telefon, ...(p?.telefonlar ?? [])];
  const epostalar = [b?.eposta, ...(p?.epostalar ?? [])];
  return {
    telefonlar: [...new Set(telefonlar.filter((x): x is string => !!x))],
    epostalar: [...new Set(epostalar.filter((x): x is string => !!x))],
  };
}

function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a);
}

async function main() {
  const simdi = new Date();
  log('Job başladı.', config.dryRun ? '(DRY_RUN)' : '(CANLI bildirim)');

  if (!asis.gecerli) throw new Error('ASIS yapılandırması eksik (ASIS_GUID_KEY?).');
  if (!config.db.url) throw new Error('DATABASE_URL eksik.');

  // 0) Bayi iletişim — iki kaynak: BFF(canlı Logo) + POL Excel (bayi_iletisim). Alarm hedefi
  //    için EPDK no ile eşlenir; gonder() alan bazında birleştirir (telefon POL'de, mail her ikisinde).
  bffHarita = await iletisimHaritasiGetir();
  polHarita = await db.iletisimHaritasiTumu();
  log(`Bayi iletişim: BFF ${bffHarita.size} + POL ${polHarita.size} bayi.`);

  // 1) İstasyon kütüğü
  const istasyonlar = await asis.istasyonlar();
  log(`İstasyon: ${istasyonlar.length} çekildi.`);
  await db.istasyonlariKaydet(istasyonlar);

  const istByKod = new Map<string, AsisIstasyon>(istasyonlar.map((i) => [i.kod, i]));
  const istKodByEpdk = new Map<string, string>();
  for (const i of istasyonlar) {
    const no = epdkNo(i.epdkKod);
    if (no) istKodByEpdk.set(no, i.kod);
  }

  // 2) Bağlantı durumları
  const durumlar = await asis.onlineDurumlar();
  log(`Bağlantı durumu: ${durumlar.length} kayıt.`);
  await db.baglantiKaydet(durumlar, istKodByEpdk);

  // 3) Bağlantı kopuk tespitleri
  const kopukTespitler = baglantiKopuklari(durumlar, istByKod, simdi);
  const kopukKodlar = new Set(kopukTespitler.map((t) => t.istasyonKod));
  log(`Kopuk istasyon: ${kopukTespitler.length}.`);

  // 4) Tank durumları — TEK çağrı: GetTankLastLevel parametresiz TÜM tankları döndürür
  //    (canlı doğrulandı: 666 tank / 175 istasyon tek çağrıda). İstasyona göre grupla.
  const tanklarByIst = new Map<string, AsisTank[]>();
  const tumTanklar = await asis.tankSonDurum();
  for (const t of tumTanklar) {
    const arr = tanklarByIst.get(t.istasyonKod) ?? [];
    arr.push(t);
    tanklarByIst.set(t.istasyonKod, arr);
  }
  // Kopuk istasyonların tankını kaydetme/değerlendirme (bağlantı alarmı zaten var).
  for (const [kod, tanklar] of tanklarByIst) {
    if (kopukKodlar.has(kod)) continue;
    await db.tanklariKaydet(kod, tanklar);
  }
  log(`Tank verisi: ${tumTanklar.length} tank / ${tanklarByIst.size} istasyon.`);

  // 5) Tank veri-yok tespitleri
  const tankTespitler = tankVeriYoklari(tanklarByIst, kopukKodlar, istByKod, simdi);
  log(`Veri göndermeyen tank: ${tankTespitler.length}.`);

  // 6) Alarm senkronu: açık kalması gerekenler + düzelenleri kapat
  const tumTespitler = [...kopukTespitler, ...tankTespitler];
  const acikKalan = new Set(tumTespitler.map(anahtar));
  const kapananlar = await db.duzelenleriKapat(acikKalan);
  if (kapananlar.length) log(`Kapanan (düzelen) alarm: ${kapananlar.length}.`);

  // 7) Her tespit için alarm aç/güncelle + debounce'lu bildir
  const acik = await db.acikAlarmlar();
  let bildirilen = 0;
  for (const t of tumTespitler) {
    const ah = anahtar(t);
    const mevcut = acik.get(ah);
    const id = await db.alarmAc({
      tip: t.tip,
      istasyonKod: t.istasyonKod,
      tankNo: t.tankNo,
      anahtar: ah,
      istasyonAd: t.istasyonAd,
      epdkNo: tespitEpdkNo(t),
      mesaj: t.mesaj,
    });

    // Debounce: yeni alarm mı, yoksa tekrar-bildirim aralığı geçti mi?
    const gerek = bildirimGerekli(mevcut?.son_bildirim ?? null, simdi);
    if (!gerek) continue;

    await gonder(t, !mevcut);
    await db.alarmBildirimIsaretle(id);
    bildirilen++;
  }
  log(`Bildirim gönderilen alarm: ${bildirilen}.`);

  // 8) Tank dolumları (artımlı) — mutabakat için. Alarm akışını bloklamaz.
  await dolumSyncEt();

  await db.kapat();
  log('Job bitti.');
}

const DOLUM_CURSOR = 'asis.son_dolum_id';

/** GetTankFillingList artımlı sync. Cursor sistem_ayar'da. İlk çalıştırma büyük (arşiv),
 *  sonrakiler sadece yeni dolumları çeker. Boş parti gelene kadar sayfalar. */
async function dolumSyncEt(): Promise<void> {
  const baslangic = Number((await db.ayarOku(DOLUM_CURSOR)) ?? '0');
  let cursor = baslangic;
  let toplam = 0;
  const MaksTur = 60; // güvenlik (parti ~10k → 600k kayıt yeter)
  for (let tur = 0; tur < MaksTur; tur++) {
    const dolumlar = await asis.tankDolumlari(cursor);
    if (dolumlar.length === 0) break;
    await db.dolumlariKaydet(dolumlar);
    const partiEnYuksek = Math.max(...dolumlar.map((d) => d.dolumId));
    toplam += dolumlar.length;
    if (partiEnYuksek <= cursor) break; // ilerlemiyor → dur
    cursor = partiEnYuksek;
    await db.ayarYaz(DOLUM_CURSOR, String(cursor)); // her partide kalıcılaştır
  }
  if (toplam > 0) log(`Dolum sync: ${toplam} yeni kayıt (cursor ${baslangic}→${cursor}).`);
  else log('Dolum sync: yeni kayıt yok.');
}

function bildirimGerekli(sonBildirim: Date | null, simdi: Date): boolean {
  if (!sonBildirim) return true; // hiç bildirilmemiş (yeni alarm)
  const saatGecti = (simdi.getTime() - new Date(sonBildirim).getTime()) / 3_600_000;
  return saatGecti >= config.esik.tekrarBildirimSaat;
}

async function gonder(t: Tespit, yeni: boolean): Promise<void> {
  const no = tespitEpdkNo(t);
  const iletisim = iletisimCoz(no); // BFF + POL birleşik
  const baslik = t.tip === 'baglanti_kopuk' ? 'Bağlantı Kopuk' : 'Tank Veri Yok';
  const konu = `[Parkoil Otomasyon] ${baslik} — ${t.istasyonAd}`;
  const durum = yeni ? 'YENİ' : 'DEVAM EDEN';

  const mailGovde = `
    <p><b>${baslik}</b> (${durum})</p>
    <p>İstasyon: <b>${t.istasyonAd}</b> (${t.istasyonKod})</p>
    <p>EPDK: ${t.epdkKod || '-'}</p>
    ${t.tankNo ? `<p>Tank: ${t.tankNo}</p>` : ''}
    <p>${t.mesaj}</p>
    <p>Son veri: ${t.sonVeriZamani ? t.sonVeriZamani.toLocaleString('tr-TR') : 'yok'}</p>
    <hr><small>Parkoil Otomasyon Paneli — otomatik bildirim.</small>
  `;
  const smsMetin = `Parkoil Otomasyon: ${t.istasyonAd} - ${t.mesaj}`;

  const sonuc = await bildir(konu, mailGovde, smsMetin, {
    epostalar: iletisim.epostalar,
    telefonlar: iletisim.telefonlar,
  });
  if (sonuc.hatalar.length) {
    log(`  bildirim hatası (${t.istasyonAd}): ${sonuc.hatalar.join(' | ')}`);
  }
}

main().catch(async (e) => {
  console.error('JOB HATASI:', e);
  await db.kapat().catch(() => {});
  process.exit(1);
});
