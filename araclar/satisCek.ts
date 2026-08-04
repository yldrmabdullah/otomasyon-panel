// Pompa satışı çekimi — ASIS `GetPumpSaleList` → `satis_ozet` (ÖZET yazılır).
//
// ⚠️ NEDEN ÖZET: ASIS günde 20.325 satış veriyor (yılda 7,4 milyon). Ölçüldü
// (2026-08-01): gün+istasyon+tank kırılımında 21 kat sıkışıyor → günde ~947 satır.
// Mutabakat ve A1a kriterleri için bu yeterli. Ham veri DB'ye YAZILMAZ, bellekte
// sayfa sayfa toplanır (10.000'lik sayfa ~4,9 MB — hepsini biriktirmek gereksiz).
//
// ⚠️ CURSOR ≠ ZAMAN FİLTRESİ (2026-07-30 dersi): `TPompaSatisID` merkeze VARIŞ
// sırasına göre artıyor, `Tarih` ise gerçek satış anı. Bir sayfada tarih 11 saate
// kadar geriye sıçrayabiliyor. Bu yüzden:
//   1) cursor hedeflenen günden GÜVENLİK PAYI kadar geriden başlatılır
//   2) satırlar `Tarih` alanına göre client-side gruplanır (cursor'a güvenilmez)
//
// ⚠️ `bitis` parametresinin SAAT KISMI YOK SAYILIYOR → ertesi günün 00:00'ı verilir.
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/satisCek.ts            (dün)
//   node --env-file=.env --import tsx araclar/satisCek.ts 2026-07-25 (belirli gün)
//   node --env-file=.env --import tsx araclar/satisCek.ts 2026-07-01 2026-07-31

import { config } from '../core/config.js';
import { satisOzetKaydet, eksikSatisGunleri, kapat } from '../core/db.js';

const K = config.asis;
/** ASIS sabit sayfa boyutu (ölçüldü: her zaman 10.000). */
const SAYFA = 10_000;
/** Cursor kaç GÜN geriden başlatılsın.
 *
 *  ⚠️ SAAT BAZINDA PAY İMKÂNSIZ: `GetPumpSaleRecord`'un `bitis` parametresi güne
 *  yuvarlanıyor (2026-07-30 dersi) → "12 saat geri" istesen bile bir TAM gün geri
 *  gidiyorsun. Ölçüldü: 29 Tem cursor'u 30 Tem'inkinden 20.589 kayıt geride.
 *
 *  Bu yüzden pay 0: hedef günün KENDİ cursor'u kullanılır. Cursor zaten "o günün
 *  ilk kaydından hemen önce" demek; gecikmeli gelen satışlar ID'ce sonra
 *  geldiği için ileri sayfalarda yakalanır (kod zaten Tarih'e göre filtreliyor). */
const GERI_PAY_GUN = 0;
/** Sonsuz döngü koruması: bir gün için azami sayfa (10.000 × 20 = 200 bin kayıt). */
const AZAMI_SAYFA = 20;

interface Ozet {
  gun: string; istasyonKod: string; tankNo: string; urunId: string; cariTip: string;
  litre: number; tutar: number; fisSayisi: number;
}

function xmlKacir(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function soap(metot: string, ic: string): Promise<string> {
  const govde = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body><${metot} xmlns="${K.namespace}">${ic}</${metot}></soap:Body></soap:Envelope>`;
  const r = await fetch(K.gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: K.namespace + metot },
    body: govde,
  });
  if (!r.ok) throw new Error(`${metot} HTTP ${r.status}`);
  return r.text();
}

/** Tarih → cursor. `bitis` ertesi gün 00:00 olmalı (saat kısmı yok sayılıyor). */
async function cursorBul(gun: Date): Promise<number> {
  const bas = new Date(gun);
  const bit = new Date(gun);
  bit.setDate(bit.getDate() + 1);
  const f = (d: Date) => d.toISOString().slice(0, 10) + 'T00:00:00';
  const x = await soap(
    'GetPumpSaleRecord',
    `<DagiticiKod>${K.dagiticiKod}</DagiticiKod><guidKey>${xmlKacir(K.guidKey)}</guidKey>` +
      `<baslangic>${f(bas)}</baslangic><bitis>${f(bit)}</bitis>`,
  );
  const kod = x.match(/<Code>(\d+)</)?.[1];
  const id = Number(x.match(/<KayitID>(\d+)</)?.[1] ?? 0);
  // KayitID 0 = "veri yok" dönüş değeri; cursor olarak KULLANILAMAZ (0'dan tüm arşiv taranır)
  if (id === 0) throw new Error(`Cursor alınamadı (Code=${kod}). bitis ertesi gün 00:00 mı?`);
  return id;
}

/** Bir günü çek ve özetle. Döner: yazılan özet satır sayısı. */
async function gunCek(gun: Date): Promise<{ ozet: number; ham: number }> {
  const hedefGun = gun.toISOString().slice(0, 10);

  const geriGun = new Date(gun);
  if (GERI_PAY_GUN > 0) geriGun.setUTCDate(geriGun.getUTCDate() - GERI_PAY_GUN);
  let cursor = await cursorBul(geriGun);

  const kova = new Map<string, Ozet>();
  let hamToplam = 0;
  let hedefGunKayit = 0;

  for (let sayfa = 0; sayfa < AZAMI_SAYFA; sayfa++) {
    const x = await soap(
      'GetPumpSaleList',
      `<KayitID>${cursor}</KayitID><dagiticiKod>${K.dagiticiKod}</dagiticiKod>` +
        `<guidKey>${xmlKacir(K.guidKey)}</guidKey>`,
    );

    let sayfaKayit = 0;
    let sonId = cursor;
    let gecti = false; // hedef günü aştık mı

    for (const m of x.matchAll(/<PumpSale>([\s\S]*?)<\/PumpSale>/g)) {
      const al = (t: string) => m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '';
      sayfaKayit++;
      hamToplam++;
      const id = Number(al('TPompaSatisID'));
      if (id > sonId) sonId = id;

      // ⚠️ Gruplama TARİH alanına göre — cursor sırası satış tarihiyle aynı DEĞİL
      const tarih = al('Tarih');
      const satirGun = tarih.slice(0, 10);
      if (satirGun > hedefGun) { gecti = true; continue; }
      if (satirGun !== hedefGun) continue; // önceki güne ait (geri pay yüzünden geldi)

      hedefGunKayit++;
      const anahtar = `${al('TIstasyonID')}|${al('TankNo')}|${al('TUrunID')}|${al('CariTip')}`;
      const v = kova.get(anahtar) ?? {
        gun: hedefGun, istasyonKod: al('TIstasyonID'), tankNo: al('TankNo'),
        urunId: al('TUrunID'), cariTip: al('CariTip'), litre: 0, tutar: 0, fisSayisi: 0,
      };
      v.litre += parseFloat(al('Litre')) || 0;
      v.tutar += parseFloat(al('Tutar')) || 0;
      v.fisSayisi++;
      kova.set(anahtar, v);
    }

    process.stdout.write(
      `\r  sayfa ${sayfa + 1}: ${hamToplam.toLocaleString('tr')} ham · ` +
        `${hedefGunKayit.toLocaleString('tr')} hedef gün · ${kova.size} özet   `,
    );

    // Sayfa dolmadıysa arşivin sonu; hedef günü tamamen geçtiysek durabiliriz
    if (sayfaKayit < SAYFA) break;
    if (gecti && hedefGunKayit > 0) break;
    if (sonId === cursor) break; // ilerleme yok → sonsuz döngü koruması
    cursor = sonId;
  }

  process.stdout.write('\n');
  const liste = [...kova.values()];
  if (liste.length) await satisOzetKaydet(liste);
  return { ozet: liste.length, ham: hedefGunKayit };
}

async function main() {
  // --telafi: son N günde DB'de EKSİK olan günleri bul ve doldur.
  //
  // ⚠️ NEDEN GEREKLİ (2026-08-04): cron kaçırdığı günü bir daha denemiyordu ve
  // eksik gün kalıcı oluyordu. Mutabakatta bir günün eksik olması açılış zincirini
  // kopardığı için (bkz. epdk-mutabakat.md) telafi ŞART. Her koşuda çalışırsa
  // kaçan gün ertesi gün otomatik kapanır — dış tetikleyiciye bağımlı değil.
  if (process.argv.includes('--telafi')) {
    const gunSayi = Number(process.argv[process.argv.indexOf('--telafi') + 1]) || 7;
    const eksik = await eksikSatisGunleri(gunSayi);
    if (eksik.length === 0) {
      console.log(`Telafi: son ${gunSayi} günde eksik gün yok ✓`);
      await kapat();
      return;
    }
    console.log(`Telafi: ${eksik.length} eksik gün bulundu → ${eksik.join(', ')}`);
    let t = 0;
    for (const g of eksik) {
      console.log(`
${g}:`);
      try {
        const r = await gunCek(new Date(g + 'T00:00:00Z'));
        console.log(`  ✔ ${r.ham.toLocaleString('tr')} satış → ${r.ozet} özet satır`);
        t += r.ozet;
      } catch (e) {
        console.error(`  ✗ HATA: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`
✔ Telafi bitti. ${t} özet satır yazıldı.`);
    await kapat();
    return;
  }

  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  let bas: Date;
  let bit: Date;
  if (arg1) {
    bas = new Date(arg1 + 'T00:00:00Z');
    bit = arg2 ? new Date(arg2 + 'T00:00:00Z') : new Date(bas);
  } else {
    // Varsayılan: DÜN (bugün henüz tamamlanmadı, yarım gün özet yanlış olur).
    //
    // ⚠️ TÜRKİYE günü (UTC+3), UTC DEĞİL: cron 21:00 UTC'ye kurulu ve GH Actions
    // schedule'ı en kötü 202 dk geciktiriyor → 00:22 UTC'de UTC günü değişmiş
    // olur ve "dün" bir gün kayar (aynı gün iki kez, sonraki gün hiç çekilmez).
    // ASIS tarihleri de TR yerel saati taşıyor (TZ'siz), bu yüzden TR günü doğru
    // referans. Bkz. seviyeCek.ts'teki aynı gerekçe.
    const trSimdi = new Date(Date.now() + 3 * 3_600_000);
    trSimdi.setUTCDate(trSimdi.getUTCDate() - 1);
    bas = new Date(trSimdi.toISOString().slice(0, 10) + 'T00:00:00Z');
    bit = new Date(bas);
  }
  if (Number.isNaN(bas.getTime()) || Number.isNaN(bit.getTime())) {
    console.error('Geçersiz tarih. Kullanım: satisCek.ts [YYYY-AA-GG] [YYYY-AA-GG]');
    process.exit(1);
  }

  console.log(`Satış çekimi: ${bas.toISOString().slice(0, 10)} → ${bit.toISOString().slice(0, 10)}`);
  let toplamOzet = 0;
  let toplamHam = 0;

  for (let g = new Date(bas); g <= bit; g.setUTCDate(g.getUTCDate() + 1)) {
    const gun = g.toISOString().slice(0, 10);
    console.log(`\n${gun}:`);
    try {
      const r = await gunCek(new Date(g));
      console.log(`  ✔ ${r.ham.toLocaleString('tr')} satış → ${r.ozet} özet satır`);
      toplamOzet += r.ozet;
      toplamHam += r.ham;
    } catch (e) {
      console.error(`  ✗ HATA: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(
    `\n✔ Bitti. ${toplamHam.toLocaleString('tr')} ham satış → ` +
      `${toplamOzet.toLocaleString('tr')} özet satır yazıldı.`,
  );
  await kapat();
}

main().catch(async (e) => {
  console.error('Çekim hatası:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
