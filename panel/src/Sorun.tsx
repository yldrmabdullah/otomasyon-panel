// Sorun Tespiti modülü — POL/EPDK'nın yakaladığı anomalileri kendi verimizden bulur.
// Kaynak: /api/piyasa?tip=sorun (2026-09-03: Vercel Hobby 12-fonksiyon limiti için piyasa.ts
// ile birleştirildi, bkz api/piyasa.ts XML doc) · Ayrıntılı iş bilgisi: docs/bilgi/epdk-modulu-a-tablolari.md
//
// <span aria-hidden="true">⚠</span> DİL: buradaki hiçbir bulgu "kaçak" ya da "suç" DEĞİLDİR — İNCELENMESİ GEREKEN
// anomalidir. Çoğunun masum açıklaması olabilir (bir tanker iki bayiye boşaltmış,
// veri gecikmesi, sistem çift kaydı). Panel "şüpheli" der, "suçlu" demez.
import { useMemo } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Sekmeler, type SekmeTanim } from './Sekme.js';
import { Bos, Kart, ModulBar, TazelikSerit, useVeri, zamanFark } from './ortak.js';
import type { Tazelik } from './tipler.js';

interface UydurmaSatir {
  irsaliye_no: string; istasyon: number; satir: number; litre: number;
  son: string; istasyonlar: string | null;
}
interface MukerrerTankSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null;
  tank_no: string; urun: string; litre: number;
  dolum_baslama: string; onceki_zaman: string; dakika_ara: number;
  irsaliye_no: string | null; onceki_irsaliye: string | null;
}
interface HayaliSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null;
  tank_no: string; urun: string; litre: number;
  seviye_bas: number; seviye_bit: number; irsaliye_no: string | null; dolum_baslama: string;
}
interface KalibrasyonSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null;
  tank_no: string; urun: string; kalibrasyon_yuzdesi: string; dolum_baslama: string;
}
interface SorunVeri {
  uretim: string;
  tazelik?: Tazelik[];
  esik: {
    pencereGun: number; mukerrerSaat: number; toleransLt: number;
    seviyeKapsamYuzde: number; seviyeVar: number; dolumToplam: number;
  };
  ozet: {
    uydurma: number; mukerrerTesis: number; mukerrerTank: number;
    hayali: number; kalibrasyon: number;
  };
  uydurma: UydurmaSatir[];
  mukerrerTesis: UydurmaSatir[];
  mukerrerTank: MukerrerTankSatir[];
  hayali: HayaliSatir[];
  kalibrasyon: KalibrasyonSatir[];
}

const TR = 'tr-TR';
const sayi = (v: number | string | null | undefined): string =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString(TR);

function sorunDogrula(d: unknown): SorunVeri {
  const x = d as SorunVeri;
  if (!x?.ozet || !Array.isArray(x?.uydurma) || !x?.esik)
    throw new Error('Sorun verisi beklenen biçimde değil (sunucu şeması değişmiş olabilir).');
  return x;
}

function IstasyonHucre({ ad, kod, sehir }: { ad: string | null; kod: string; sehir: string | null }) {
  return (
    <>
      <strong>{ad ?? kod}</strong>
      <span className="soluk"> · {kod}</span>
      {sehir && <div className="alt-satir soluk">{sehir}</div>}
    </>
  );
}

export function Sorun() {
  const { veri, hata, yukleniyor, yenile } = useVeri<SorunVeri>(
    '/api/piyasa?tip=sorun',
    sorunDogrula,
    120_000
  );
  const esik = veri?.esik;

  const irsaliyeKolon: TabloKolon<UydurmaSatir>[] = [
    {
      id: 'irsaliye', ad: 'İrsaliye No', varsayilan: true, sabit: true, sinif: 'mono',
      hucre: (r) => <strong>{r.irsaliye_no}</strong>,
      sirala: (r) => r.irsaliye_no, ara: (r) => r.irsaliye_no,
    },
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sinif: 'sag',
      hucre: (r) => (r.istasyon > 1 ? <strong>{r.istasyon}</strong> : String(r.istasyon)),
      hucreSinif: (r) => (r.istasyon > 2 ? 'krit' : r.istasyon > 1 ? 'uyari' : ''),
      sirala: (r) => r.istasyon,
    },
    {
      id: 'litre', ad: 'Toplam (lt)', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => sayi(r.litre), sirala: (r) => r.litre,
    },
    {
      id: 'satir', ad: 'Dolum', varsayilan: false, sinif: 'sag',
      hucre: (r) => String(r.satir), sirala: (r) => r.satir,
    },
    {
      // <span aria-hidden="true">⚠</span> Bu hücre virgülle ayrılmış İSTASYON LİSTESİ — bir irsaliye 5 tesise
      // bölünmüşse 5 uzun unvan yan yana geliyor. `not-hucre` olmadan tek satırda
      // 2822px sürüyordu ve tabloyu 3279px'e çıkarıp diğer kolonları ekran dışına
      // itiyordu (ölçüldü 2026-08-13). not-hucre sarmalı + genişlik tavanı verir.
      id: 'nerede', ad: 'İstasyonlar', varsayilan: true, sinif: 'soluk not-hucre',
      hucre: (r) =>
        r.istasyonlar ? (
          <span className="metin-kirp" title={r.istasyonlar}>{r.istasyonlar}</span>
        ) : (
          <Bos />
        ),
      ara: (r) => r.istasyonlar ?? '',
    },
    {
      id: 'son', ad: 'Son dolum', varsayilan: true,
      hucre: (r) => <time dateTime={r.son}>{zamanFark(r.son)}</time>,
      sirala: (r) => r.son,
    },
  ];

  const mukerrerTankKolon: TabloKolon<MukerrerTankSatir>[] = [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true,
      hucre: (m) => <IstasyonHucre ad={m.istasyon_ad} kod={m.istasyon_kod} sehir={m.sehir} />,
      sirala: (m) => m.istasyon_ad ?? m.istasyon_kod,
      ara: (m) => `${m.istasyon_ad ?? ''} ${m.istasyon_kod} ${m.sehir ?? ''}`,
    },
    { id: 'tank', ad: 'Tank', varsayilan: true, sinif: 'sag', hucre: (m) => m.tank_no, sirala: (m) => Number(m.tank_no) },
    { id: 'urun', ad: 'Ürün', varsayilan: true, hucre: (m) => m.urun, sirala: (m) => m.urun, ara: (m) => m.urun },
    {
      id: 'litre', ad: 'Miktar (lt)', varsayilan: true, sinif: 'sag mono',
      hucre: (m) => sayi(m.litre), sirala: (m) => m.litre,
    },
    {
      id: 'ara', ad: 'Aralık', varsayilan: true, sinif: 'sag',
      // 0 dk = aynı saniyede iki kayıt → klasik çift kayıt izi
      hucre: (m) => <strong>{m.dakika_ara} dk</strong>,
      hucreSinif: (m) => (m.dakika_ara === 0 ? 'krit' : 'uyari'),
      sirala: (m) => m.dakika_ara,
    },
    {
      id: 'irsaliye', ad: 'İrsaliye', varsayilan: false, sinif: 'mono soluk',
      hucre: (m) => (m.irsaliye_no === m.onceki_irsaliye
        ? <span title="İkisi de AYNI irsaliye — çift kayıt olasılığı yüksek">{m.irsaliye_no ?? '—'} (aynı)</span>
        : <>{m.irsaliye_no ?? '—'} / {m.onceki_irsaliye ?? '—'}</>),
      ara: (m) => `${m.irsaliye_no ?? ''} ${m.onceki_irsaliye ?? ''}`,
    },
    {
      id: 'zaman', ad: 'Ne zaman', varsayilan: true,
      hucre: (m) => <time dateTime={m.dolum_baslama}>{zamanFark(m.dolum_baslama)}</time>,
      sirala: (m) => m.dolum_baslama,
    },
  ];

  const hayaliKolon: TabloKolon<HayaliSatir>[] = [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true,
      hucre: (h) => <IstasyonHucre ad={h.istasyon_ad} kod={h.istasyon_kod} sehir={h.sehir} />,
      sirala: (h) => h.istasyon_ad ?? h.istasyon_kod,
      ara: (h) => `${h.istasyon_ad ?? ''} ${h.istasyon_kod} ${h.sehir ?? ''}`,
    },
    { id: 'tank', ad: 'Tank', varsayilan: true, sinif: 'sag', hucre: (h) => h.tank_no, sirala: (h) => Number(h.tank_no) },
    { id: 'urun', ad: 'Ürün', varsayilan: false, hucre: (h) => h.urun, ara: (h) => h.urun },
    {
      id: 'litre', ad: 'Dolum (lt)', varsayilan: true, sinif: 'sag mono',
      hucre: (h) => <strong>{sayi(h.litre)}</strong>,
      hucreSinif: () => 'krit',
      sirala: (h) => h.litre,
    },
    {
      id: 'seviye', ad: 'Tank seviyesi', varsayilan: true, sinif: 'sag mono',
      // Dolum yapıldı ama seviye artmadı — asıl kanıt bu
      hucre: (h) => (
        <>
          {sayi(h.seviye_bas)} <span aria-hidden="true">→</span>{' '}
          <span className="sr-only">şuna düştü: </span>
          {sayi(h.seviye_bit)}
        </>
      ),
      sirala: (h) => h.seviye_bit - h.seviye_bas,
    },
    {
      id: 'irsaliye', ad: 'İrsaliye', varsayilan: false, sinif: 'mono soluk',
      hucre: (h) => h.irsaliye_no ?? <Bos />, ara: (h) => h.irsaliye_no ?? '',
    },
    {
      id: 'zaman', ad: 'Ne zaman', varsayilan: true,
      hucre: (h) => <time dateTime={h.dolum_baslama}>{zamanFark(h.dolum_baslama)}</time>,
      sirala: (h) => h.dolum_baslama,
    },
  ];

  const kalibrasyonKolon: TabloKolon<KalibrasyonSatir>[] = [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true,
      hucre: (k) => <IstasyonHucre ad={k.istasyon_ad} kod={k.istasyon_kod} sehir={k.sehir} />,
      sirala: (k) => k.istasyon_ad ?? k.istasyon_kod,
      ara: (k) => `${k.istasyon_ad ?? ''} ${k.istasyon_kod} ${k.sehir ?? ''}`,
    },
    { id: 'tank', ad: 'Tank', varsayilan: true, sinif: 'sag', hucre: (k) => k.tank_no, sirala: (k) => Number(k.tank_no) },
    { id: 'urun', ad: 'Ürün', varsayilan: true, hucre: (k) => k.urun, ara: (k) => k.urun },
    {
      id: 'yuzde', ad: 'Kalibrasyon %', varsayilan: true, sinif: 'sag mono',
      hucre: (k) => k.kalibrasyon_yuzdesi, sirala: (k) => Number(k.kalibrasyon_yuzdesi),
    },
    {
      id: 'zaman', ad: 'Ne zaman', varsayilan: true,
      hucre: (k) => <time dateTime={k.dolum_baslama}>{zamanFark(k.dolum_baslama)}</time>,
      sirala: (k) => k.dolum_baslama,
    },
  ];

  const sekmeler: SekmeTanim[] = useMemo(() => {
    if (!veri || !esik) return [];
    return [
      {
        id: 'irsaliye',
        ad: 'İrsaliye anomalileri',
        sayi: veri.ozet.uydurma + veri.ozet.mukerrerTesis,
        acil: veri.ozet.uydurma > 0,
        icerik: () => (
          <>
            <Tablo
              anahtar="sorun-uydurma"
              kolonlar={irsaliyeKolon}
              satirlar={veri.uydurma}
              satirAnahtar={(r) => `u-${r.irsaliye_no}`}
              satirSinif={() => 'krit'}
              aramaEtiket="İrsaliye no veya istasyon ara"
              kaydirmaEsigi={20}
              ilkGosterim={30}
              baslik={`Kural dışı irsaliye numarası — ${veri.uydurma.length} adet`}
              aciklama={
                <>
                  Gerçek irsaliye formatı <strong>2-4 harf öneki + 10 haneli numara</strong>{' '}
                  (ör. <code>PIR2026000008671</code>). Buradakiler yalnız 1-6 rakamdan oluşuyor
                  (<code>1234</code>, <code>1111</code>…) — elle girilmiş görünüyor.
                  Son {esik.pencereGun} günde{' '}
                  <strong>{sayi(esik.dolumToplam)}</strong> dolumun içinden çıktı.
                </>
              }
              bosMesaj="Kural dışı irsaliye numarası yok."
            />
            <Tablo
              anahtar="sorun-muk-tesis"
              kolonlar={irsaliyeKolon}
              satirlar={veri.mukerrerTesis}
              satirAnahtar={(r) => `m-${r.irsaliye_no}`}
              satirSinif={(r) => (r.istasyon > 2 ? 'krit' : '')}
              aramaEtiket="İrsaliye no veya istasyon ara"
              kaydirmaEsigi={20}
              ilkGosterim={30}
              baslik={`Aynı irsaliye birden fazla istasyonda — ${veri.mukerrerTesis.length} adet`}
              aciklama={
                <>
                  <span aria-hidden="true">⚠</span> <strong>Tek başına sorun değil</strong>: bir tanker iki bayiye boşaltabilir.
                  İncelenmesi gereken <strong>3+ istasyona bölünmüş</strong> olanlar ve kural dışı
                  numarayla birleşenler.
                </>
              }
              bosMesaj="Çoklu istasyona bölünen irsaliye yok."
            />
          </>
        ),
      },
      {
        id: 'dolum',
        ad: 'Dolum anomalileri',
        sayi: veri.ozet.mukerrerTank + veri.ozet.hayali,
        acil: veri.ozet.hayali > 0,
        icerik: () => (
          <>
            <Tablo
              anahtar="sorun-muk-tank"
              kolonlar={mukerrerTankKolon}
              satirlar={veri.mukerrerTank}
              satirAnahtar={(m, i) => `${m.istasyon_kod}|${m.tank_no}|${i}`}
              satirSinif={(m) => (m.dakika_ara === 0 ? 'krit' : '')}
              aramaEtiket="İstasyon, şehir veya ürün ara"
              kaydirmaEsigi={20}
              ilkGosterim={30}
              baslik={`Mükerrer tank dolumu — ${veri.mukerrerTank.length} adet`}
              aciklama={
                <>
                  Aynı tanka <strong>{esik.mukerrerSaat} saat içinde</strong> farkı{' '}
                  {esik.toleransLt} litreden az iki dolum. <strong>0 dk</strong> olanlar aynı
                  saniyede kaydedilmiş — sistem çift kaydı olasılığı yüksek. Uzun aralıklılar
                  gerçek iki dolum olabilir.
                </>
              }
              bosMesaj="Mükerrer tank dolumu yok."
            />
            <Tablo
              anahtar="sorun-hayali"
              kolonlar={hayaliKolon}
              satirlar={veri.hayali}
              satirAnahtar={(h, i) => `${h.istasyon_kod}|${h.tank_no}|${i}`}
              satirSinif={() => 'krit'}
              aramaEtiket="İstasyon, şehir veya ürün ara"
              kaydirmaEsigi={20}
              ilkGosterim={30}
              baslik={`Dolum var, tank seviyesi artmamış — ${veri.hayali.length} adet`}
              aciklama={
                <>
                  Dolum kaydedilmiş ama tank seviyesi <strong>aynı kalmış ya da düşmüş</strong>.
                  <br />
                  <span aria-hidden="true">⚠</span> <strong>KAPSAM SINIRLI:</strong> bu kontrol yalnız seviye bilgisi olan
                  kayıtlarda yapılabiliyor — son {esik.pencereGun} günde{' '}
                  <strong>{sayi(esik.seviyeVar)} / {sayi(esik.dolumToplam)}</strong> dolum
                  (<strong>%{esik.seviyeKapsamYuzde}</strong>). Alan 29.07.2026'da eklendi,
                  ASIS geriye dönük vermiyor; kapsam her gün artıyor.
                </>
              }
              bosMesaj="Seviye artmayan dolum yok."
            />
          </>
        ),
      },
      {
        id: 'kalibrasyon',
        ad: 'Kalibrasyon',
        sayi: veri.ozet.kalibrasyon,
        icerik: () => (
          <Tablo
            anahtar="sorun-kalib"
            kolonlar={kalibrasyonKolon}
            satirlar={veri.kalibrasyon}
            satirAnahtar={(k, i) => `${k.istasyon_kod}|${k.tank_no}|${i}`}
            aramaEtiket="İstasyon, şehir veya ürün ara"
            kaydirmaEsigi={20}
            ilkGosterim={30}
            baslik={`Kalibrasyon değişimi — ${veri.kalibrasyon.length} kayıt`}
            aciklama={
              <>
                <strong>1240 sayılı Kurul Kararı</strong>: kalibrasyon değişiminde 24 saat içinde
                yedek alınması zorunlu. Son {esik.pencereGun} günün kayıtları.
              </>
            }
            bosMesaj="Kalibrasyon değişimi kaydı yok."
          />
        ),
      },
    ];
  }, [veri, esik]);

  return (
    <>
      <ModulBar
        alt="İrsaliye · dolum · kalibrasyon anomalileri"
        taze={veri?.uretim ?? null}
        yukleniyor={yukleniyor}
        yenile={yenile}
        duyuru={
          veri
            ? `Sorun tespiti güncellendi. ${veri.ozet.uydurma} kural dışı irsaliye, ${veri.ozet.hayali} seviye anomalisi.`
            : ''
        }
      />

      {hata && (
        <div className="hata" role="alert">
          <span aria-hidden="true">⚠ </span>
          {hata}
        </div>
      )}

      <TazelikSerit liste={veri?.tazelik} />

      {veri && esik && (
        <>
          {/* Dilin sınırı: bunlar şüphe, suçlama değil. Ekranın en üstünde durmalı. */}
          <p className="analiz-not">
            Bu ekran <strong>incelenmesi gereken anomalileri</strong> listeler — hiçbiri tek
            başına kaçak/suç kanıtı değildir. Çoğunun masum açıklaması olabilir (bir tanker iki
            bayiye boşaltmış, veri gecikmesi, sistem çift kaydı). Kaynak: son{' '}
            {esik.pencereGun} günün ASIS dolum verisi.
          </p>

          <section className="kartlar" aria-label="Sorun tespiti özeti">
            <Kart ad="Kural dışı irsaliye" deger={veri.ozet.uydurma} alt="1-6 rakamlı numara" acil={veri.ozet.uydurma > 0} />
            <Kart ad="Çoklu istasyon" deger={veri.ozet.mukerrerTesis} alt="aynı irsaliye" />
            <Kart ad="Mükerrer dolum" deger={veri.ozet.mukerrerTank} alt={`${esik.mukerrerSaat} saat içinde`} />
            <Kart ad="Seviye anomalisi" deger={veri.ozet.hayali} alt={`kapsam %${esik.seviyeKapsamYuzde}`} acil={veri.ozet.hayali > 0} />
            <Kart ad="Kalibrasyon" deger={veri.ozet.kalibrasyon} alt="1240 sayılı karar" />
          </section>

          <Sekmeler tanimlar={sekmeler} anahtar="sorun" />
        </>
      )}
    </>
  );
}

// Kart bileşeni ortak.tsx'e taşındı (Operasyon modülünde de birebir aynısı vardı).
