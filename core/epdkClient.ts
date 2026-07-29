// EPDK Petrol Piyasası resmi web servisi istemcisi (apigateway.epdk.gov.tr).
// PUBLIC (kimliksiz) ama THROTTLING var (429 "BLOCKED") → otomatik bekle+tekrar.
// GET + JSON body (spec dışı ama EPDK böyle istiyor). Node fetch GET+body kabul etmez →
// bu yüzden düşük seviye https.request kullanılır. Türkçe karakter (DAĞ/) body'de UTF-8 gider.

import { request } from 'node:https';

const BASE = 'apigateway.epdk.gov.tr';

export interface EpdkDagitici {
  lisansNo: string;
  unvan: string;
  vergiNo: string | null;
  il: string | null;
  ilce: string | null;
  adres: string | null;
  baslangic: string | null;
  bitis: string | null;
  durum: string | null;
  markalar: string[];
  yakitTurleri: string[];
}

/** petrolDepolamaLisansSorgula → depolama tesisi (terminal/ikmal noktası). */
export interface EpdkDepolama {
  lisansNo: string;
  unvan: string;
  vergiNo: string | null;
  il: string | null;
  ilce: string | null;
  adres: string | null;
  baslangic: string | null;
  bitis: string | null;
  durum: string | null;
  toplamKapasite: number;
  tankSayisi: number;
  antrepoKapasite: number;
  antrepoSayisi: number;
  gumrukluKapasite: number;
  gumrukluSayisi: number;
}

/** petrolTasimaLisansSorgula → taşıma lisansı (karayolu/demiryolu/denizyolu/boru hattı). */
export interface EpdkTasima {
  lisansNo: string;
  unvan: string;
  vergiNo: string | null;
  il: string | null;
  ilce: string | null;
  adres: string | null;
  baslangic: string | null;
  bitis: string | null;
  durum: string | null;
  /** "Demiryolu", "Karayolu" vb. — filo/lojistik kırılımı. */
  hizmetKapsami: string | null;
}

/** petrolBayiSatisFiyatBulten → EPDK resmi bayi satış fiyatı (ÜLKE GENELİ ortalama).
 *  ⚠️ Firma/il kırılımı YOK — canlı doğrulandı (2026-07-29). Günde 6 ürün satırı. */
export interface EpdkFiyat {
  tarih: string;
  yakit: string;
  olcuBirimi: string;
  fiyat: number;
}

export interface EpdkBayi {
  bayiLisansNo: string;
  lisansSahibi: string | null;
  dagitimSirketi: string | null;
  il: string | null;
  ilce: string | null;
  tesisAdresi: string | null;
  vergiNo: string | null;
  kategori: string | null;
  altBaslik: string | null;
  lisansDurumu: string | null;
  kacakcilikIptal: number;
  lisansBaslangic: string | null;
  lisansBitis: string | null;
  sozlesmeBaslangic: string | null;
  sozlesmeBitis: string | null;
  iptalTarihi: string | null;
  iptalAciklama: string | null;
}

const DURUMLAR = ['ONAYLANDI', 'SONLANDIRILDI', 'IPTAL_EDILDI', 'IADE_EDILDI', 'FAALIYETI_GECICI_DURDURULDU'];

/** GET + JSON body ham çağrı (Node https.request; fetch GET+body yasak). Throttle → bekle+tekrar. */
function cagir(path: string, body: object, denemeMax = 15): Promise<any> {
  const veri = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    let deneme = 0;
    const dene = () => {
      const req = request(
        { host: BASE, path, method: 'GET', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) } },
        (res) => {
          // Chunk'ları BUFFER olarak biriktir; sonda tek seferde UTF-8 decode et.
          // `d += chunk` çok-baytlık Türkçe karakteri chunk sınırında bozuyordu (ANON��M).
          const parcalar: Buffer[] = [];
          res.on('data', (c: Buffer) => parcalar.push(c));
          res.on('end', () => {
            const d = Buffer.concat(parcalar).toString('utf8');
            if (d.includes('Throttling') || d.includes('BLOCKED')) {
              if (++deneme >= denemeMax) return reject(new Error('EPDK throttle: max deneme aşıldı'));
              return setTimeout(dene, 9000); // throttle → 9 sn bekle
            }
            try {
              resolve(JSON.parse(d));
            } catch {
              reject(new Error(`EPDK yanıt parse hatası: ${d.slice(0, 120)}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(veri);
      req.end();
    };
    dene();
  });
}

export const epdk = {
  /** Tüm dağıtım firmaları (varsayılan ONAYLANDI; tumDurumlar=true → hepsi). */
  async dagiticilar(tumDurumlar = false): Promise<EpdkDagitici[]> {
    const durum = tumDurumlar ? DURUMLAR : ['ONAYLANDI'];
    const d = await cagir('/petrolDagiticiLisansSorgula/', { lisansDurumu: durum });
    if (!Array.isArray(d)) return [];
    return d.map((x: any) => ({
      lisansNo: x.lisansNo,
      unvan: x.lisansSahibiUnvani ?? '',
      vergiNo: x.vergiNo ?? null,
      il: x.il ?? null,
      ilce: x.ilce ?? null,
      adres: x.adres ?? null,
      baslangic: x.baslangicTarihi ?? null,
      bitis: x.bitisTarihi ?? null,
      durum: x.lisansDurumu ?? null,
      markalar: (x.markaTescilBelgesi ?? []).map((m: any) => m.markaAdi).filter(Boolean),
      yakitTurleri: x.satisiYapilacakYakitTurleri ?? [],
    }));
  },

  /** Bir dağıtıcının bayileri (lisansNo BİREBİR — Türkçe DAĞ/ karakteri korunmalı). */
  async bayiler(dagiticiLisansNo: string, tumDurumlar = false): Promise<EpdkBayi[]> {
    const durum = tumDurumlar ? DURUMLAR : ['ONAYLANDI'];
    const d = await cagir('/petrolBayilikLisansiSorgula/', { dagiticiLisansNo, lisansDurumu: durum });
    if (!Array.isArray(d)) return []; // null → o dağıtıcının bayisi yok / erişilemedi
    return d.map((x: any) => ({
      bayiLisansNo: x.lisansNo,
      lisansSahibi: x.lisansSahibi ?? null,
      dagitimSirketi: x.dagitimSirketi ?? null,
      il: x.il ?? null,
      ilce: x.ilce ?? null,
      tesisAdresi: x.tesisAdresi ?? null,
      vergiNo: x.vergiNo ?? null,
      kategori: x.kategorisi ?? null,
      altBaslik: x.altBasligi ?? null,
      lisansDurumu: x.lisansDurumu ?? null,
      kacakcilikIptal: x.kacakciliktanIptalEdildi ?? 0,
      lisansBaslangic: x.baslangicTarihi ?? null,
      lisansBitis: x.bitisTarihi ?? null,
      sozlesmeBaslangic: x.dagiticiIleYapilanSozlesmeBaslangicTarihi ?? null,
      sozlesmeBitis: x.dagiticiIleYapilanSozlesmeBitisTarihi ?? null,
      iptalTarihi: x.iptalSonaErdirmeTarihi || null,
      iptalAciklama: x.iptalSonaErdirmeAciklama || null,
    }));
  },

  /** Depolama tesisleri (94 aktif — 2026-07-29). Terminal/ikmal noktası + kapasite takibi. */
  async depolama(tumDurumlar = false): Promise<EpdkDepolama[]> {
    const durum = tumDurumlar ? DURUMLAR : ['ONAYLANDI'];
    const d = await cagir('/petrolDepolamaLisansSorgula/', { lisansDurumu: durum });
    if (!Array.isArray(d)) return [];
    return d.map((x: any) => ({
      lisansNo: x.lisansNo,
      unvan: x.lisansSahibiUnvani ?? '',
      vergiNo: x.vergiNo ?? null,
      il: x.il ?? null,
      ilce: x.ilce ?? null,
      adres: x.adres ?? null,
      baslangic: x.baslangicTarihi ?? null,
      bitis: x.bitisTarihi ?? null,
      durum: x.lisansDurumu ?? null,
      toplamKapasite: Number(x.toplamKapasite ?? 0),
      tankSayisi: Number(x.tankSayisi ?? 0),
      antrepoKapasite: Number(x.antrepoKapasite ?? 0),
      antrepoSayisi: Number(x.antrepoSayisi ?? 0),
      gumrukluKapasite: Number(x.gumrukluKapasite ?? 0),
      gumrukluSayisi: Number(x.gumrukluSayisi ?? 0),
    }));
  },

  /** Taşıma lisansları (83 aktif — 2026-07-29). Karayolu/demiryolu vb. lojistik kapasitesi. */
  async tasima(tumDurumlar = false): Promise<EpdkTasima[]> {
    const durum = tumDurumlar ? DURUMLAR : ['ONAYLANDI'];
    const d = await cagir('/petrolTasimaLisansSorgula/', { lisansDurumu: durum });
    if (!Array.isArray(d)) return [];
    return d.map((x: any) => ({
      lisansNo: x.lisansNo,
      unvan: x.lisansSahibiUnvani ?? '',
      vergiNo: x.vergiNo ?? null,
      il: x.il ?? null,
      ilce: x.ilce ?? null,
      adres: x.adres ?? null,
      baslangic: x.baslangicTarihi ?? null,
      bitis: x.bitisTarihi ?? null,
      durum: x.lisansDurumu ?? null,
      // ⚠️ EPDK bu anahtarı SONUNDA BOŞLUKLA gönderiyor: "petrolTasimaHizmetKapsami ".
      // Boşluksuz okumak 83/83 kayıtta sessizce null veriyordu (canlı doğrulandı
      // 2026-07-29). İki yazımı da dene — EPDK düzeltirse kod çalışmaya devam etsin.
      hizmetKapsami: x['petrolTasimaHizmetKapsami '] ?? x.petrolTasimaHizmetKapsami ?? null,
    }));
  },

  /**
   * EPDK resmi bayi satış fiyatı — belirli bir GÜN için.
   *
   * ⚠️ TUZAKLAR (canlı doğrulandı 2026-07-29):
   * 1. `raporTarihi` ZORUNLU ve biçim **dd.MM.yyyy** (ISO değil). Eksikse 400.
   * 2. Uç FAZLADAN ALAN KABUL ETMİYOR: gövdeye `il`/`dagiticiLisansNo` eklenirse
   *    zorunlu alanı bile görmezden gelip "raporTarihi alanı zorunludur" 400'ü döner.
   *    → Firma/il kırılımı YOK; bu uç yalnız ülke geneli ortalamayı verir.
   * 3. Yanıt dizi DEĞİL, zarf: `{statusCode, numRows, data[], errors[]}`.
   */
  async fiyatBulten(gun: Date): Promise<EpdkFiyat[]> {
    const g = String(gun.getDate()).padStart(2, '0');
    const a = String(gun.getMonth() + 1).padStart(2, '0');
    const raporTarihi = `${g}.${a}.${gun.getFullYear()}`;
    const d = await cagir('/petrolBayiSatisFiyatBulten/', { raporTarihi });
    // Zarf: statusCode 200 + data dizisi. Hata durumunda data yok/boş olabilir.
    if (!d || !Array.isArray(d.data)) return [];
    return d.data.map((x: any) => ({
      tarih: x['Tarih'] ?? '',
      yakit: x['Yakıt'] ?? '',
      olcuBirimi: x['Ölçü Birimi'] ?? '',
      fiyat: Number(x['Fiyat'] ?? 0),
    }));
  },
};
