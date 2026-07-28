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
};
