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

  // 7a) Alarm senkronu — TANK BAZINDA (panelde her tank tek tek görünmeli).
  //     Bildirim ayrı adımda ve İSTASYON BAZINDA gruplanır (7b).
  const acik = await db.acikAlarmlar();
  const alarmIdler = new Map<string, string>(); // anahtar → alarm id
  for (const t of tumTespitler) {
    const ah = anahtar(t);
    const id = await db.alarmAc({
      tip: t.tip,
      istasyonKod: t.istasyonKod,
      tankNo: t.tankNo,
      anahtar: ah,
      istasyonAd: t.istasyonAd,
      epdkNo: tespitEpdkNo(t),
      mesaj: t.mesaj,
    });
    alarmIdler.set(ah, id);
  }

  // 7b) BİLDİRİM — istasyon bazında gruplu.
  //
  // ⭐ NEDEN GRUPLU (2026-08-04, kullanıcı yakaladı): İNCİRLİK istasyonunun
  // 4 tankı da aynı anda sessizdi ve 4 AYRI mail gitti. Aynı istasyon, aynı
  // dakika, aynı sebep — 4 kez okumak gereksiz. Üstelik teşhis de kayboluyor:
  // "tek tank sessiz" ile "istasyonun tamamı sessiz" FARKLI sorunlar
  // (tek tank → o tankın probu; hepsi → prob hattı/konsol/yazılım).
  //
  // Alarmlar tank bazında kalır (panel + DB tekilliği bozulmaz), yalnız MAİL
  // birleşir. Debounce/olgunluk kapısı grubun TAMAMINA uygulanır: grup içinde
  // en az bir tank bildirilmeye hazırsa mail gider ve o gruptaki tüm tanklar
  // işaretlenir — yoksa aynı istasyon için 15 dakika sonra tekrar mail giderdi.
  let bildirilen = 0;
  let gonderilenMail = 0;
  const gruplar = bildirimGruplari(tumTespitler);
  for (const g of gruplar) {
    // Gruptaki hangi tespitler bildirime hazır?
    const hazir = g.tespitler.filter((t) => {
      if (!bildirimOlgun(t, simdi)) return false;
      const m = acik.get(anahtar(t));
      return bildirimGerekli(m?.son_bildirim ?? null, simdi, m?.acildi ?? null);
    });
    if (!hazir.length) continue;

    // Mailde grubun TAMAMI gösterilir (hazır olmayanlar da bağlam olarak),
    // ama "yeni mi" kararı hazır olanlara göre verilir.
    const yeni = hazir.every((t) => !acik.has(anahtar(t)));
    const gitti = await gonderGrup(g, yeni, simdi, tanklarByIst, durumlar);
    if (!gitti) continue; // işaretleme yok → kanal düzelince tekrar denenir

    for (const t of hazir) {
      const id = alarmIdler.get(anahtar(t));
      if (id) {
        await db.alarmBildirimIsaretle(id);
        bildirilen++;
      }
    }
    gonderilenMail++;
  }
  const olgunOlmayan = tumTespitler.filter((t) => !bildirimOlgun(t, simdi)).length;
  log(
    `Bildirim: ${gonderilenMail} mail / ${bildirilen} alarm.` +
      (olgunOlmayan
        ? ` (${olgunOlmayan} alarm bildirim eşiğini —${config.esik.bildirimTankSaat} sa— henüz geçmedi, panelde görünür)`
        : ''),
  );

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

/** Tekrar bildirim zamanı geldi mi? Kronik alarmlarda aralık kademeli açılır.
 *
 *  ⚠️ NEDEN KADEMELİ (2026-08-04, canlı ölçüm): sabit 6 saatlik aralık, günlerdir
 *  süren bir arızada işe yaramaz tekrar üretiyor — 210057 istasyonu 6 gündür
 *  kopuk ve alarmı **22 kez** bildirilmiş. Ekip ilk mailde öğrendi; 21'i gürültü.
 *  (Yaygın değil: 30 günde 1.963 alarmın hepsi ≤5 bildirim, ortalama 1,0 —
 *  yalnız kronikler patlıyor. O yüzden çözüm de yalnız kroniği hedefliyor.)
 *
 *  Kademeler: ilk gün 6 sa · 1-3 gün 12 sa · 3+ gün 24 sa.
 *  Alarm kapanmıyor, panelde açık kalıyor — yalnız hatırlatma seyreltiliyor. */
function bildirimGerekli(sonBildirim: Date | null, simdi: Date, acildi?: Date | null): boolean {
  if (!sonBildirim) return true; // hiç bildirilmemiş (yeni alarm)
  const saatGecti = (simdi.getTime() - new Date(sonBildirim).getTime()) / 3_600_000;

  let aralik = config.esik.tekrarBildirimSaat;
  if (acildi) {
    const yasSaat = (simdi.getTime() - new Date(acildi).getTime()) / 3_600_000;
    if (yasSaat >= 72) aralik = Math.max(aralik, 24);
    else if (yasSaat >= 24) aralik = Math.max(aralik, 12);
  }
  return saatGecti >= aralik;
}

/** Bu tespit bildirilecek kadar OLGUN mu? (bkz. config.esik.bildirimTankSaat)
 *
 *  Tank alarmı 35 dk'da açılır — panelde görünmesi doğru, ama mail atmak için
 *  fazla erken: %63'ü 30 dakikada kapanıyor. Bağlantı alarmı zaten 3 saat
 *  eşikle açıldığı için ek kapı UYGULANMAZ (iki kez gecikmesin).
 *
 *  ⚠️ sonVeriZamani YOKSA bildirilir: "veri hiç yok" gerçek bir durumdur ve
 *  sessizce yutulmamalı (tank ilk kez bağlanıyor ya da kayıt bozuk). */
function bildirimOlgun(t: Tespit, simdi: Date): boolean {
  if (t.tip !== 'tank_veri_yok') return true;
  if (!t.sonVeriZamani) return true;
  const saat = (simdi.getTime() - t.sonVeriZamani.getTime()) / 3_600_000;
  return saat >= config.esik.bildirimTankSaat;
}

/** Bildirim grubu — bir istasyonun aynı tipteki tespitleri tek maile girer. */
interface BildirimGrubu {
  tip: Tespit['tip'];
  istasyonKod: string;
  istasyonAd: string;
  epdkKod: string;
  tespitler: Tespit[];
}

/** Tespitleri istasyon+tip bazında grupla.
 *
 *  ⚠️ NEDEN (2026-08-04): İNCİRLİK'in 4 tankı aynı anda sessizken 4 ayrı mail
 *  gidiyordu. Aynı istasyon + aynı tip = tek mail. Bağlantı alarmı doğası
 *  gereği istasyon başına tek zaten (tankNo null), gruplama onu bozmaz. */
function bildirimGruplari(tespitler: Tespit[]): BildirimGrubu[] {
  const m = new Map<string, BildirimGrubu>();
  for (const t of tespitler) {
    const k = `${t.tip}|${t.istasyonKod}`;
    const g = m.get(k);
    if (g) g.tespitler.push(t);
    else
      m.set(k, {
        tip: t.tip,
        istasyonKod: t.istasyonKod,
        istasyonAd: t.istasyonAd,
        epdkKod: t.epdkKod,
        tespitler: [t],
      });
  }
  // Tank numaralarını sayısal sırala (mailde "1,2,10" değil "1,2,10" doğru sırada)
  for (const g of m.values()) {
    g.tespitler.sort((a, b) => Number(a.tankNo ?? 0) - Number(b.tankNo ?? 0));
  }
  return [...m.values()];
}

const SAAT_METNI = (dk: number): string =>
  dk < 60 ? `${Math.round(dk)} dk` : `${(dk / 60).toFixed(1)} saat`;

/** Bir grubu tek mail olarak gönderir. Döner: GERÇEKTEN gitti mi?
 *  false dönerse alarm "bildirildi" işaretlenmez (bkz. çağrı yerindeki not). */
async function gonderGrup(
  g: BildirimGrubu,
  yeni: boolean,
  simdi: Date,
  tanklarByIst: Map<string, AsisTank[]>,
  durumlar: Awaited<ReturnType<typeof asis.onlineDurumlar>>,
): Promise<boolean> {
  const no = epdkNo(g.epdkKod);
  const iletisim = iletisimCoz(no); // BFF + POL birleşik
  const durum = yeni ? 'YENİ' : 'DEVAM EDEN';

  let baslik: string;
  let konu: string;
  let govde: string;
  let sms: string;

  if (g.tip === 'baglanti_kopuk') {
    // Bağlantı alarmı istasyon başına tek — eski biçim korunur.
    const t = g.tespitler[0];
    baslik = 'Bağlantı Kopuk';
    konu = `[Parkoil Otomasyon] ${baslik} — ${g.istasyonAd}`;
    govde = `
      <p><b>${baslik}</b> (${durum})</p>
      <p>İstasyon: <b>${g.istasyonAd}</b> (${g.istasyonKod})</p>
      <p>EPDK: ${g.epdkKod || '-'}</p>
      <p>${t.mesaj}</p>
      <p>Son veri: ${t.sonVeriZamani ? t.sonVeriZamani.toLocaleString('tr-TR') : 'yok'}</p>`;
    sms = `Parkoil Otomasyon: ${g.istasyonAd} - ${t.mesaj}`;
  } else {
    // ── TANK VERİ YOK — gruplu + TEŞHİS BAĞLAMI ──────────────────────────
    //
    // ⭐ "Kaçı sessiz" ve "bağlantı ne durumda" bilgisi teşhisin kendisidir:
    // İNCİRLİK örneğinde 4 tankın 4'ü sessizdi AMA bağlantı çalışıyordu
    // (6 dk önce veri gelmiş) → istasyon kopuk değil, prob tarafı arızalı.
    // Bu satır olmadan ekip "istasyon mu gitti?" diye boşa bakıyor.
    const toplamTank = tanklarByIst.get(g.istasyonKod)?.length ?? g.tespitler.length;
    const sessiz = g.tespitler.length;
    const hepsi = sessiz >= toplamTank && toplamTank > 0;

    const bag = durumlar.find((d) => d.istasyonKod === g.istasyonKod);
    const bagDk = bag?.sonVeriZamani
      ? (simdi.getTime() - new Date(bag.sonVeriZamani).getTime()) / 60_000
      : null;

    baslik = hepsi
      ? `Tüm tanklar veri göndermiyor (${sessiz}/${toplamTank})`
      : `Tank veri yok (${sessiz}/${toplamTank})`;
    konu = `[Parkoil Otomasyon] ${baslik} — ${g.istasyonAd}`;

    const satirlar = g.tespitler
      .map((t) => {
        const dk = t.sonVeriZamani ? (simdi.getTime() - t.sonVeriZamani.getTime()) / 60_000 : null;
        const urun = /\(([^)]+)\)/.exec(t.mesaj)?.[1] ?? '';
        return (
          `<tr><td style="padding:4px 10px 4px 0"><b>Tank ${t.tankNo}</b></td>` +
          `<td style="padding:4px 10px 4px 0">${urun}</td>` +
          `<td style="padding:4px 0">${dk === null ? 'veri yok' : SAAT_METNI(dk) + ' önce'}</td></tr>`
        );
      })
      .join('');

    govde = `
      <p><b>${baslik}</b> (${durum})</p>
      <p>İstasyon: <b>${g.istasyonAd}</b> (${g.istasyonKod})</p>
      <p>EPDK: ${g.epdkKod || '-'}</p>
      <table style="border-collapse:collapse;font-size:14px;margin:10px 0">
        <tr><th style="text-align:left;padding:0 10px 4px 0;border-bottom:1px solid #ccc">Tank</th>
            <th style="text-align:left;padding:0 10px 4px 0;border-bottom:1px solid #ccc">Ürün</th>
            <th style="text-align:left;padding:0 0 4px;border-bottom:1px solid #ccc">Son ölçüm</th></tr>
        ${satirlar}
      </table>
      <p style="background:#f5f5f5;padding:8px;border-left:4px solid #888">
        <b>Bağlantı:</b> ${
          bagDk === null
            ? 'durum bilinmiyor'
            : bagDk < 35
              ? `✅ çalışıyor — ${SAAT_METNI(bagDk)} önce veri geldi`
              : `⚠️ ${SAAT_METNI(bagDk)} önce veri geldi`
        }
        ${
          hepsi && bagDk !== null && bagDk < 35
            ? '<br><b>Muhtemel sebep:</b> istasyon bağlı ve veri gönderiyor ama tankların ' +
              'hiçbirinden ölçüm gelmiyor → prob hattı / konsol tarafı incelenmeli ' +
              '(tek tank olsaydı o tankın probu denirdi).'
            : hepsi
              ? '<br>Bağlantı da gecikmeli — istasyon tarafı komple kontrol edilmeli.'
              : ''
        }
      </p>`;
    sms =
      `Parkoil Otomasyon: ${g.istasyonAd} - ${sessiz}/${toplamTank} tank veri gondermiyor` +
      (bagDk !== null && bagDk < 35 ? ' (baglanti calisiyor)' : '');
  }

  const sonuc = await bildir(
    konu,
    govde + `<hr><small>Parkoil Otomasyon Paneli — otomatik bildirim.</small>`,
    sms,
    { epostalar: iletisim.epostalar, telefonlar: iletisim.telefonlar },
  );
  if (sonuc.hatalar.length) {
    log(`  bildirim hatası (${g.istasyonAd}): ${sonuc.hatalar.join(' | ')}`);
  }

  // ⚠️ DRY_RUN'da "bildirildi" İŞARETLENMEZ (2026-08-04, canlıda görüldü).
  //
  // Önce "akış test edilebilsin" diye true dönüyordum. Yan etkisi canlıya
  // geçince ortaya çıktı: DRY_RUN döneminde işaretlenmiş alarmlar (son_bildirim
  // dolu, bildirim_sayisi=1) hiç mail almamış olmalarına rağmen "bildirilmiş"
  // sayılıyor, debounce devreye giriyor ve İLK GERÇEK MAİLİ KAÇIRIYORLAR.
  // Test modunun canlı durumu kirletmemesi gerekir — DRY_RUN sadece "gönderme"
  // demek, "gönderilmiş say" demek değil.
  if (config.dryRun) return false;

  const gitti = sonuc.mailDenendi > 0 || sonuc.smsDenendi > 0;
  if (!gitti) {
    // Kanal yok/yapılandırılmamış: sessiz kalmasın, işaretleme de yapılmasın.
    log(
      `  ⚠ bildirim GİTMEDİ (${g.istasyonAd}) — ` +
        `mail ${config.mail.gecerli ? 'hazır' : 'YAPILANDIRILMAMIŞ'}, ` +
        `sms ${config.sms.gecerli ? 'hazır' : 'yapılandırılmamış'}, ` +
        `hedef ${config.mail.ekip.length} ekip adresi. Alarm bildirilmemiş sayılıyor.`,
    );
  }
  return gitti;
}

main().catch(async (e) => {
  console.error('JOB HATASI:', e);
  await db.kapat().catch(() => {});
  process.exit(1);
});
