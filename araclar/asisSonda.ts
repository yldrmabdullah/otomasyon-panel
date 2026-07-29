// ASIS SOAP metot sondası — TEK metodu çağırıp yanıtını ANALİZ eder.
//
// AMAÇ: WSDL'de yazılı olan ile GERÇEK dönen veri farklı olabiliyor (bugün birkaç
// kez bu tuzağa düştük: IstasyonOnlineDurum parametre adı, GetPumpSaleRecord'un
// KayitID=0 dönmesi, IrsaliyeLitre'nin %45 boş gelmesi). Bu araç her metodu canlı
// çağırıp "gerçekte ne geliyor"u raporlar.
//
// GÜVENLİK: SALT-OKUMA. ASIS'e hiçbir şey yazılmaz. Çağrılar SIRAYLA yapılır,
// küçük örnek alınır (POL canlı sistem — yük bindirmemek için).
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/asisSonda.ts <MetotAdi> [param=deger ...]
// Örnek:
//   node --env-file=.env --import tsx araclar/asisSonda.ts CheckKey
//   node --env-file=.env --import tsx araclar/asisSonda.ts TankSonDurum kirilim=1 kirilimAdi=
//   node --env-file=.env --import tsx araclar/asisSonda.ts SonBirimFiyat trhBaslangic=2026-07-28 trhBitis=2026-07-29 istasyonErpKod=

import { config } from '../core/config.js';

const K = config.asis;
/** Yanıtın tamamı yerine bu kadar karakter gösterilir (log şişmesin). */
const OZET_UZUNLUK = 700;

/** Bilinen metot girdileri — SIRA ÖNEMLİ (ASMX pozisyonel çalışıyor).
 *  `%GK%` guidKey, `%DK%` dagiticiKod ile değiştirilir. */
const GIRDI: Record<string, string[]> = {
  CheckKey: ['key=%GK%'],
  GetStationList: ['DagiticiKod=%DK%', 'guidKey=%GK%'],
  IstasyonOnlineDurum: ['Key=%GK%'],
  GetTankLastLevel: ['guidKey=%GK%', 'dagiticiKod=%DK%', 'IstasyonKod=@nil'],
  GetProductTypeList: ['DagiticiKod=%DK%', 'guidKey=%GK%'],
  GetSaleTypeList: [],
  GetTankFillingList: ['KayitID=0', 'dagiticiKod=%DK%', 'guidKey=%GK%'],
  GetPumpSaleList: ['KayitID=0', 'dagiticiKod=%DK%', 'guidKey=%GK%'],
  // ⚠️ guidKey DEĞİL, ayrı GirisAd/Sifre ister — elimizde bu kimlik yok, boş gider.
  GetPumpSaleListDetail: ['baslangic=2026-07-28T00:00:00', 'Bitis=2026-07-29T00:00:00', 'dagiticiKod=%DK%', 'GirisAd=', 'Sifre='],
  GetSalesByPompaSatisID: ['KayitID=0', 'key=%GK%', 'dagiticiKod=%DK%'],
  GetPumpSaleListTransfer: ['KayitID=0', 'dagiticiKod=%DK%', 'guidKey=%GK%'],
  GetTankLevelList: ['KayitID=0', 'dagiticiKod=%DK%', 'guidKey=%GK%'],
  GetSales: ['KayitID=0', 'key=%GK%', 'dagiticiKod=%DK%'],
  TankSonDurum: ['guidKey=%GK%', 'kirilim=0', 'kirilimAdi='],
  IstasyonStokTankKapasite: ['guidKey=%GK%'],
  PompaSatisToplam: ['guidKey=%GK%', 'satisTipEkle=false', 'trhBaslangic=2026-07-28T00:00:00', 'trhBitis=2026-07-29T00:00:00', 'kirilim=0', 'kirilimAdi='],
  IstasyonUrunLitre: ['guidKey=%GK%', 'BeginDate=2026-07-28T00:00:00', 'EndDate=2026-07-29T00:00:00'],
  IstasyonUrunLitreTip: ['guidKey=%GK%', 'BeginDate=2026-07-28T00:00:00', 'EndDate=2026-07-29T00:00:00'],
  SonBirimFiyat: ['guidKey=%GK%', 'trhBaslangic=2026-07-28T00:00:00', 'trhBitis=2026-07-29T00:00:00', 'istasyonErpKod='],
  GetDiscountData: ['DagiticiKod=%DK%', 'guidKey=%GK%'],
  GetExtraDiscountData: ['DagiticiKod=%DK%', 'guidKey=%GK%'],
  GetTankFillingRecord: ['DagiticiKod=%DK%', 'guidKey=%GK%', 'baslangic=2026-07-28T00:00:00', 'bitis=2026-07-29T00:00:00'],
  GetPumpSaleRecord: ['DagiticiKod=%DK%', 'guidKey=%GK%', 'baslangic=2026-07-28T00:00:00', 'bitis=2026-07-29T00:00:00'],
  GetTankLevelRecord: ['DagiticiKod=%DK%', 'guidKey=%GK%', 'baslangic=2026-07-28T00:00:00', 'bitis=2026-07-29T00:00:00'],
};

function xmlKacir(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function govdeKur(metot: string, parametreler: string[]): string {
  const ic = parametreler
    .map((p) => {
      const [ad, ...kalan] = p.split('=');
      const ham = kalan.join('=');
      if (ham === '@nil') return `<${ad} xsi:nil="true" />`;
      const deger = ham.replace('%GK%', K.guidKey).replace('%DK%', String(K.dagiticiKod));
      return `<${ad}>${xmlKacir(deger)}</${ad}>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body><${metot} xmlns="${K.namespace}">${ic}</${metot}></soap:Body></soap:Envelope>`;
}

/** Yanıttaki tekrar eden kayıt bloğunu bul (en çok tekrar eden etiket). */
function kayitBlogu(xml: string): { etiket: string; sayi: number } | null {
  const say = new Map<string, number>();
  for (const m of xml.matchAll(/<(\w+)>\s*<\w+>/g)) {
    // Alt elemanı olan etiketler aday
    say.set(m[1], (say.get(m[1]) ?? 0) + 1);
  }
  let enIyi: { etiket: string; sayi: number } | null = null;
  for (const [e, n] of say) {
    if (n < 2) continue;
    if (!enIyi || n > enIyi.sayi) enIyi = { etiket: e, sayi: n };
  }
  return enIyi;
}

async function main() {
  const [metot, ...ekstra] = process.argv.slice(2);
  if (!metot) {
    console.log('Kullanım: asisSonda.ts <MetotAdi> [param=deger ...]');
    console.log('\nBilinen metotlar:');
    for (const m of Object.keys(GIRDI)) console.log(`  ${m}`);
    process.exit(1);
  }

  // Ekstra parametreler bilinen girdiyi EZER (aynı ad varsa) ya da ekler
  const temel = GIRDI[metot] ?? [];
  const harita = new Map(temel.map((p) => [p.split('=')[0], p]));
  for (const e of ekstra) harita.set(e.split('=')[0], e);
  const parametreler = [...harita.values()];

  const govde = govdeKur(metot, parametreler);
  // Parametreleri göster ama guidKey'i MASKELE (log'a sır yazılmaz)
  const gorunur = parametreler.map((p) =>
    p.includes('%GK%') ? `${p.split('=')[0]}=<guidKey>` : p,
  );
  console.log(`METOT      ${metot}`);
  console.log(`PARAMETRE  ${gorunur.join(' · ') || '(yok)'}`);

  const t0 = Date.now();
  let yanit: Response;
  try {
    yanit = await fetch(K.gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${K.namespace}${metot}` },
      body: govde,
    });
  } catch (e) {
    console.log(`SONUÇ      AĞ HATASI: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const sure = Date.now() - t0;
  const xml = await yanit.text();

  console.log(`HTTP       ${yanit.status} · ${sure} ms · ${(xml.length / 1024).toFixed(1)} KB`);

  // SOAP Fault?
  const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1];
  if (fault) {
    console.log(`SONUÇ      ✗ SOAP FAULT: ${fault.slice(0, 200)}`);
    process.exit(3);
  }

  // Code/Message (ASIS kendi hata protokolü)
  const kod = xml.match(/<Code>([\s\S]*?)<\/Code>/)?.[1];
  const mesaj = xml.match(/<Message>([\s\S]*?)<\/Message>/)?.[1];
  if (kod !== undefined) console.log(`ASIS Code  ${kod}${mesaj ? ` · ${mesaj}` : ''}`);

  const blok = kayitBlogu(xml);
  if (blok) {
    console.log(`KAYIT      ${blok.sayi} × <${blok.etiket}>`);
    // İlk kaydın alanlarını listele — DOLU/BOŞ ayrımıyla
    const ilk = xml.match(new RegExp(`<${blok.etiket}>([\\s\\S]*?)</${blok.etiket}>`))?.[1] ?? '';
    const alanlar = [...ilk.matchAll(/<(\w+)([^>]*)>([^<]*)<\/\1>|<(\w+)([^>]*)\/>/g)].map((m) => {
      const ad = m[1] ?? m[4];
      const deger = (m[3] ?? '').trim();
      const nil = (m[2] ?? m[5] ?? '').includes('nil="true"');
      return { ad, deger, bos: nil || deger === '' || deger === '0' || deger === '0.00' || deger === '0.0000' };
    });
    console.log(`ALAN       ${alanlar.length} tane (${alanlar.filter((a) => !a.bos).length} dolu, ${alanlar.filter((a) => a.bos).length} boş/sıfır)`);
    for (const a of alanlar) {
      console.log(`  ${a.bos ? '·' : '✓'} ${a.ad.padEnd(30)} ${a.deger.slice(0, 40)}`);
    }
  } else {
    // Tek değer dönen metotlar (CheckKey vb.)
    const sonuc = xml.match(new RegExp(`<${metot}Result>([\\s\\S]*?)</${metot}Result>`))?.[1];
    if (sonuc !== undefined) console.log(`SONUÇ      "${sonuc.slice(0, 200)}"`);
    else {
      console.log(`SONUÇ      (kayıt bloğu bulunamadı) — yanıt özeti:`);
      // Body içeriğini kısaltarak göster
      const body = xml.match(/<soap:Body>([\s\S]*?)<\/soap:Body>/)?.[1] ?? xml;
      console.log(`  ${body.slice(0, OZET_UZUNLUK).replace(/\s+/g, ' ')}`);
    }
  }
}

main().catch((e) => {
  console.error('Sonda hatası:', e instanceof Error ? e.message : e);
  process.exit(1);
});
