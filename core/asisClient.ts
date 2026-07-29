// ASIS / PetechOnline (POL) SOAP istemcisi. SALT-OKUMA.
// Ana repodaki AsisPolIstemcisi.cs port'u + yeni IstasyonOnlineDurum.
// Tuzaklar (canlı doğrulanmış) korundu:
//   1) ASMX element SIRASINA duyarlı (özellikle GetTankLastLevel).
//   2) Tarihler Türkiye yerel saati, TZ taşımaz → Europe/Istanbul kabul edip UTC'ye çevir.
//   3) Code != 0/200 → hata fırlat (sessiz boş dönüş değil).

import { XMLParser } from 'fast-xml-parser';
import { config } from './config.js';
import type { AsisIstasyon, AsisOnlineDurum, AsisTank, AsisUrun, AsisDolum, AsisSatis, AsisSeviye } from './tipler.js';

export class AsisHatasi extends Error {}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // her şeyi string tut; sayıyı biz parse ederiz (kültür/nokta sorunu)
  trimValues: true,
});

/** SOAP çağrısı yapıp gövdeyi parse edilmiş obje olarak döner. */
async function cagir(metot: string, icGovde: string): Promise<any> {
  const zarf =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body>' +
    `<${metot} xmlns="${config.asis.namespace}">${icGovde}</${metot}>` +
    '</soap:Body></soap:Envelope>';

  const yanit = await fetch(config.asis.gateway, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `${config.asis.namespace.replace(/\/$/, '')}/${metot}`,
    },
    body: zarf,
  });

  if (!yanit.ok) {
    throw new AsisHatasi(`${metot} HTTP ${yanit.status} ${yanit.statusText}`);
  }
  const metin = await yanit.text();
  const doc = parser.parse(metin);
  return doc;
}

/** Parse edilmiş SOAP dokümanında, verilen isimli tüm elementleri (iç içe) toplar. */
function tumElementler(node: any, ad: string, sonuc: any[] = []): any[] {
  if (node == null || typeof node !== 'object') return sonuc;
  for (const [k, v] of Object.entries(node)) {
    if (k === ad || k.endsWith(`:${ad}`)) {
      if (Array.isArray(v)) sonuc.push(...v);
      else sonuc.push(v);
    }
    if (Array.isArray(v)) v.forEach((c) => tumElementler(c, ad, sonuc));
    else if (typeof v === 'object') tumElementler(v, ad, sonuc);
  }
  return sonuc;
}

/** Bir objede verilen alanı (namespace önekinden bağımsız) bulur. */
function alan(obj: any, ad: string): string | undefined {
  if (obj == null || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (k === ad || k.endsWith(`:${ad}`)) {
      return v == null ? undefined : String(v);
    }
  }
  return undefined;
}

function ondalik(s: string | undefined): number {
  if (s == null) return 0;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function ondalikNull(s: string | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function boolAlan(s: string | undefined): boolean {
  if (s == null) return false;
  const t = s.trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'online' || t === 'aktif';
}

// --- Tarih: ASIS değeri Türkiye yerel saati, TZ yok. Europe/Istanbul (UTC+3) → UTC. ---
// Türkiye 2016'dan beri sabit UTC+3 (DST yok) → sabit -3 saat kaydırma doğru ve basit.
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

function tarih(s: string | undefined): Date | null {
  if (!s) return null;
  // İki format: "23.07.2026 09:19:35" (TR) ve "2026-07-23T09:58:26.453" (ISO, TZ'siz).
  // İKİSİ DE bileşenlerine ayrılıp elle Date.UTC ile kurulur, sonra TR offset (-3sa)
  // çıkarılır. Date.parse KULLANMA — makine TZ'sine göre yorumlar → çift kayma olur
  // (canlı doğrulandı: ISO değeri Date.parse ile yanlış UTC veriyordu).
  const tr = s.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  let yerelMs: number;
  if (tr) {
    const [, gg, aa, yyyy, sa, dk, ss] = tr;
    yerelMs = Date.UTC(+yyyy, +aa - 1, +gg, +sa, +dk, ss ? +ss : 0);
  } else if (iso) {
    const [, yyyy, aa, gg, sa, dk, ss] = iso;
    yerelMs = Date.UTC(+yyyy, +aa - 1, +gg, +sa, +dk, ss ? +ss : 0);
  } else {
    return null;
  }
  return new Date(yerelMs - TR_OFFSET_MS);
}

/** ASIS yanıtındaki Code/Message hata kontrolü. 0/200/boş → OK. */
function hataKontrol(doc: any, metot: string): void {
  const codeList = tumElementler(doc, 'Code');
  if (codeList.length === 0) return;
  const code = String(codeList[0] ?? '').trim();
  if (code === '0' || code === '200' || code === '') return;
  const msgList = tumElementler(doc, 'Message');
  const mesaj = msgList.length ? String(msgList[0]) : '(mesaj yok)';
  throw new AsisHatasi(`${metot} başarısız (Code=${code}): ${mesaj}`);
}

/**
 * İstasyon birincil kimliği.
 *
 * ⚠️ CANLI BUG (2026-07-28 tespit): ASIS'te **5 istasyonun `IstasyonKod` alanı `0`**
 * (atanmamış). `istasyon_kod` PK olduğu için bunlar upsert'te birbirinin üzerine
 * yazıyordu → 269 istasyondan yalnız 265'i DB'ye giriyordu ve **4 gerçek bayi
 * (MERTAY, ASTEK, ÇAYIRPINAR ×2) izlemeden tamamen düşüyordu**: bağlantıları
 * kopsa kimse görmezdi.
 *
 * Çözüm: kod yok/`0` ise EPDK lisans no'sundan stabil bir yedek kimlik üret
 * (`E-{no}`). EPDK no her bayide tekil ve sabit — snapshot'lar arası tutarlı.
 * Son çare TIstasyonID. Hiçbiri yoksa boş döner ve kayıt atlanır (sessizce
 * ezmekten iyidir; job log'unda görünür).
 */
function istasyonKimlik(
  kod: string | null | undefined,
  epdk: string | null | undefined,
  tId: string | null | undefined,
): string {
  const k = (kod ?? '').trim();
  if (k && k !== '0') return k;
  const no = epdkNo(epdk);
  if (no) return `E-${no}`;
  const t = (tId ?? '').trim();
  return t && t !== '0' ? `T-${t}` : '';
}

const K = config.asis;

export const asis = {
  get gecerli() {
    return K.gecerli;
  },

  /** GetStationList → istasyon kütüğü (EPDK eşleme). */
  async istasyonlar(): Promise<AsisIstasyon[]> {
    const govde = `<DagiticiKod>${K.dagiticiKod}</DagiticiKod><guidKey>${K.guidKey}</guidKey>`;
    const doc = await cagir('GetStationList', govde);
    hataKontrol(doc, 'GetStationList');
    return tumElementler(doc, 'Station').map((s) => ({
      kod: istasyonKimlik(alan(s, 'IstasyonKod'), alan(s, 'EPDKKod'), alan(s, 'TIstasyonID')),
      tIstasyonId: alan(s, 'TIstasyonID') ?? '',
      ad: alan(s, 'IstasyonAd') ?? '',
      epdkKod: alan(s, 'EPDKKod') ?? '',
      sehir: alan(s, 'SehirAd') ?? '',
      bolge: alan(s, 'BolgeAdi') ?? null,
      mantika: alan(s, 'MantikaAd') ?? null,
      enlem: ondalikNull(alan(s, 'Enlem')),
      boylam: ondalikNull(alan(s, 'Boylam')),
      durum: boolAlan(alan(s, 'IstasyonDurum')),
      tip: alan(s, 'IstasyonTip') ?? null,
      sonTarih: tarih(alan(s, 'SonTarih')),
    }));
  },

  /**
   * Bağlantı durumları. IstasyonOnlineDurum SOAP metodu bu guidKey ile BOŞ dönüyor
   * (dağıtıcı seviyesinde yetki yok — 2026-07-23 canlı doğrulandı). Bunun yerine
   * GetStationList'in SonTarih alanı kullanılır (ekrandaki "Son Veri Gönderim Zamanı").
   * Tek çağrı — istasyon kütüğüyle aynı; kopukluk SonTarih eskiliğinden hesaplanır.
   *
   * ⚠️ `online` ARTIK `IstasyonDurum` DEĞİL (2026-07-28 düzeltmesi). O alan "kütükte
   * aktif mi" demek; 5 gün veri göndermeyen istasyonda da `true` dönüyor ve panel
   * "180 Online" gösterirken hepsinin son verisi 5 gün öncesiydi. Gerçek bağlantı
   * SonTarih tazeliğinden hesaplanır — eşik `config.esik.kopukSaat` (varsayılan 3 sa).
   */
  async onlineDurumlar(): Promise<AsisOnlineDurum[]> {
    const liste = await this.istasyonlar();
    const esikMs = config.esik.kopukSaat * 3_600_000;
    const simdi = Date.now();
    return liste.map((i) => ({
      istasyonKod: i.kod,
      epdkKod: i.epdkKod,
      online: i.sonTarih ? simdi - i.sonTarih.getTime() < esikMs : false,
      kayitliAktif: i.durum,
      sonVeriZamani: i.sonTarih,
      ip: null,
      tankVersiyon: null,
      pompaVersiyon: null,
    }));
  },

  /** GetTankLastLevel → bir istasyonun anlık tank durumları. Element SIRASI kritik. */
  async tankSonDurum(istasyonKod?: string): Promise<AsisTank[]> {
    const ik = istasyonKod
      ? `<IstasyonKod>${istasyonKod}</IstasyonKod>`
      : '<IstasyonKod xsi:nil="true" />';
    // WSDL sırası: guidKey, dagiticiKod, IstasyonKod (ters sıra boş döndürüyor).
    const govde = `<guidKey>${K.guidKey}</guidKey><dagiticiKod>${K.dagiticiKod}</dagiticiKod>${ik}`;
    const doc = await cagir('GetTankLastLevel', govde);
    hataKontrol(doc, 'GetTankLastLevel');
    // TankNo alanı olan tüm elemanları tank kabul et.
    return tumElementlerObje(doc, ['TankNo']).map((t) => ({
      istasyonKod: alan(t, 'IstasyonKod') ?? istasyonKod ?? '',
      tankNo: alan(t, 'TankNo') ?? '',
      urunAdi: alan(t, 'UrunAdi') ?? alan(t, 'UrunKisaAd') ?? '',
      kapasiteLt: ondalik(alan(t, 'Kapasite') ?? alan(t, 'Kapasitesi')),
      yakitLt: ondalik(alan(t, 'YakitSeviyeLT')),
      suLt: ondalik(alan(t, 'SuSeviyeLT')),
      durumZamani: tarih(alan(t, 'DurumTarihi')) ?? new Date(),
    }));
  },

  /** GetProductTypeList → ASIS ürün tanımları. */
  async urunler(): Promise<AsisUrun[]> {
    const govde = `<DagiticiKod>${K.dagiticiKod}</DagiticiKod><guidKey>${K.guidKey}</guidKey>`;
    const doc = await cagir('GetProductTypeList', govde);
    hataKontrol(doc, 'GetProductTypeList');
    return tumElementler(doc, 'Product').map((p) => ({
      tUrunId: alan(p, 'TUrunID') ?? '',
      ad: alan(p, 'UrunAdi') ?? '',
      kisaAd: alan(p, 'UrunKisaAd') ?? '',
    }));
  },

  /**
   * GetTankFillingList → tank dolumları (ARTIMLI, TTankDolumID cursor). kayitId = son çekilen
   * TTankDolumID; 0 → baştan. Parti ~10.000 kayıt döner; boş parti gelene kadar cursor ilerletilir.
   * İrsaliye no/litre/hacim farkı içerir → mutabakat kontrolünün ham verisi.
   * WSDL sırası: KayitID, dagiticiKod, guidKey.
   */
  async tankDolumlari(kayitId: number): Promise<AsisDolum[]> {
    const govde = `<KayitID>${kayitId}</KayitID><dagiticiKod>${K.dagiticiKod}</dagiticiKod><guidKey>${K.guidKey}</guidKey>`;
    const doc = await cagir('GetTankFillingList', govde);
    hataKontrol(doc, 'GetTankFillingList');
    return tumElementler(doc, 'TankFilling').map((d) => ({
      dolumId: Number(alan(d, 'TTankDolumID') ?? 0),
      istasyonKod: alan(d, 'IstasyonKod') ?? '',
      tankNo: alan(d, 'TankNo') ?? '',
      urunAdi: alan(d, 'UrunAdi') ?? alan(d, 'UrunKisaAd') ?? '',
      dolumBaslama: tarih(alan(d, 'DolumBaslamaZamani')) ?? new Date(),
      dolumBitim: tarih(alan(d, 'DolumBitimZamani')) ?? new Date(),
      dolumMiktari: ondalik(alan(d, 'DolumMiktari')),
      dolumMiktariNet: ondalik(alan(d, 'DolumMiktariNet')),
      // ⭐ MUTABAKAT: POL "Eşleşen Tank Dolum" = EslesmeMiktari (algılanan DEĞİL)
      eslesmeMiktari: ondalik(alan(d, 'EslesmeMiktari')),
      irsaliyeNo: alan(d, 'IrsaliyeNo') || null,
      irsaliyeLitre: ondalik(alan(d, 'IrsaliyeLitre')),
      irsaliyeMiktar: ondalik(alan(d, 'IrsaliyeMiktar')),
      irsaliyeHacimFark: ondalik(alan(d, 'IrsaliyeHacimFark')),
      irsaliyeMiktarFark: ondalik(alan(d, 'IrsaliyeMiktarFark')),
      irsaliyeBirimFiyat: ondalik(alan(d, 'IrsaliyeBirimfiyat')),
      // ⭐ Tank seviyesi dolum kaydında geliyor → GetTankLevelRecord'a gerek yok
      seviyeBaslangicLt: ondalik(alan(d, 'YakitDolumBaslamaMiktariLT')),
      seviyeBitisLt: ondalik(alan(d, 'YakitDolumBitisMiktariLT')),
      kalibrasyonYuzdesi: ondalik(alan(d, 'KalibrasyonYuzdesi')),
      dolumTipi: alan(d, 'DolumTipi') || null,
      tankerSicakligi: ondalik(alan(d, 'TankerSicakligi')),
      kapasiteLt: ondalik(alan(d, 'Kapasite')),
      tankerDolumTarihi: tarih(alan(d, 'TankerDolumTarihi')) ?? new Date(),
    }));
  },

  /** GetPumpSaleRecord → tarih aralığının başlangıç KayitID'si (o aya atlamak için).
   *  ASIS bazen geçici 0 dönüyor (servis hıçkırığı) → 0 asla kabul edilmez, 3 kez denenir.
   *  0 tüm arşivi tarattırır (felaket) — 0 dönerse hata fırlat, çağıran kararı versin. */
  async satisRecordId(bas: Date, bit: Date): Promise<number> {
    return recordDene('GetPumpSaleRecord', bas, bit);
  },

  /** GetTankLevelRecord → tarih aralığının başlangıç KayitID'si. Aynı 0-koruması. */
  async seviyeRecordId(bas: Date, bit: Date): Promise<number> {
    return recordDene('GetTankLevelRecord', bas, bit);
  },

  /** GetPumpSaleList → pompa satışları (artımlı, TPompaSatisID cursor). Mutabakat için litre. */
  async pompaSatislari(kayitId: number): Promise<AsisSatis[]> {
    const govde = `<KayitID>${kayitId}</KayitID><dagiticiKod>${K.dagiticiKod}</dagiticiKod><guidKey>${K.guidKey}</guidKey>`;
    const doc = await cagir('GetPumpSaleList', govde);
    hataKontrol(doc, 'GetPumpSaleList');
    return tumElementler(doc, 'PumpSale').map((s) => ({
      satisId: Number(alan(s, 'TPompaSatisID') ?? 0),
      tarih: tarih(alan(s, 'Tarih')) ?? new Date(),
      tIstasyonId: alan(s, 'TIstasyonID') ?? '',
      tankNo: alan(s, 'TankNo') ?? '',
      litre: ondalik(alan(s, 'Litre')),
    }));
  },

  /** GetTankLevelList → tank seviye geçmişi (artımlı, TTankDurumID cursor). Dönem başı/sonu stok. */
  async tankSeviyeleri(kayitId: number): Promise<AsisSeviye[]> {
    const govde = `<KayitID>${kayitId}</KayitID><dagiticiKod>${K.dagiticiKod}</dagiticiKod><guidKey>${K.guidKey}</guidKey>`;
    const doc = await cagir('GetTankLevelList', govde);
    hataKontrol(doc, 'GetTankLevelList');
    return tumElementler(doc, 'TankLevel').map((t) => ({
      durumId: Number(alan(t, 'TTankDurumID') ?? 0),
      istasyonKod: alan(t, 'IstasyonKod') ?? '',
      tankNo: alan(t, 'TankNo') ?? '',
      urunAdi: alan(t, 'UrunAdi') ?? '',
      durumZamani: tarih(alan(t, 'DurumTarihi')) ?? new Date(),
      yakitLt: ondalik(alan(t, 'YakitSeviyeLTNet') ?? alan(t, 'YakitSeviyeLT')),
      kapasiteLt: ondalik(alan(t, 'Kapasitesi')),
    }));
  },
};

/** Date → ASIS'in beklediği yerel ISO (TZ'siz, Türkiye saati). Record çağrıları için. */
function isoLocal(d: Date): string {
  // UTC değeri +3 saat kaydırıp TR yerel bileşenlerini üret (ASIS TZ'siz yerel bekliyor).
  const tr = new Date(d.getTime() + 3 * 3_600_000);
  return tr.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
}

/** Record çağrısı — 0 dönerse (ASIS geçici hıçkırığı) tekrar dener; 3 denemede de 0 ise hata.
 *  0 kabul edilirse cursor=0 → tüm arşiv taranır (felaket). O yüzden 0 asla dönmez. */
async function recordDene(metot: string, bas: Date, bit: Date): Promise<number> {
  const govde = `<DagiticiKod>${K.dagiticiKod}</DagiticiKod><guidKey>${K.guidKey}</guidKey>` +
    `<baslangic>${isoLocal(bas)}</baslangic><bitis>${isoLocal(bit)}</bitis>`;
  for (let deneme = 1; deneme <= 3; deneme++) {
    const doc = await cagir(metot, govde);
    hataKontrol(doc, metot);
    const id = Number(alan(doc, 'KayitID') ?? 0);
    if (id > 0) return id;
  }
  throw new AsisHatasi(`${metot} 3 denemede de KayitID=0 döndü (${isoLocal(bas)}–${isoLocal(bit)}). ` +
    `Bu aralıkta veri yok olabilir ya da ASIS servisi geçici sorunlu — arşiv taraması ENGELLENDİ.`);
}

/** Belirtilen alanlardan HERHANGİ birini içeren tüm objeleri toplar (kayıt tespiti). */
function tumElementlerObje(node: any, alanlar: string[], sonuc: any[] = []): any[] {
  if (node == null || typeof node !== 'object') return sonuc;
  const kendiAlanlari = Object.keys(node);
  const eslesir = alanlar.some((a) => kendiAlanlari.some((k) => k === a || k.endsWith(`:${a}`)));
  if (eslesir) sonuc.push(node);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((c) => tumElementlerObje(c, alanlar, sonuc));
    else if (typeof v === 'object') tumElementlerObje(v, alanlar, sonuc);
  }
  return sonuc;
}

/** 'BAY/939-82/47293' → '47293'. Bayi eşleme anahtarı. */
export function epdkNo(epdk: string | null | undefined): string | null {
  if (!epdk) return null;
  const son = epdk.trim().replace(/\/$/, '').split('/').pop();
  return son && son.trim() ? son.trim() : null;
}
