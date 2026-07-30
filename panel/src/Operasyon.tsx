// Operasyon modülü — otomasyon ekibinin ELLE takip ettiği işler. Kaynak: /api/operasyon.
//
// Üç ana iş, üç sekme: Stok (yakıt kaç gün yeter) · Alarm geçmişi · Veri kalitesi.
// Hepsi MEVCUT veriden hesaplanır, yeni ASIS çağrısı yok.
import { useMemo, type ReactNode } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Sekmeler, type SekmeTanim } from './Sekme.js';
import { CubukYatay } from './Grafik.js';
import { Bos, ModulBar, TazelikSerit, useVeri, zamanFark } from './ortak.js';
import type { Tazelik } from './tipler.js';

interface StokSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null; urun: string;
  tank: string; mevcut_lt: string; kapasite_lt: string; gunluk_tuketim: string;
  kalan_gun: string; son_olcum: string | null;
}
interface AlarmOzet {
  tip: string; toplam: number; acik: number; ort_saat: string; en_uzun_saat: string;
}
interface KronikSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null;
  alarm_sayisi: number; acik: number; ort_dk: string; en_uzun_saat: string;
  yanip_sonme: boolean; son_alarm: string;
}
interface IrsaliyeSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null;
  dolum: number; irsaliyesiz: number; yuzde: string;
}
interface KalibrasyonSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null;
  tank_no: string; urun: string; kalibrasyon_yuzdesi: string; dolum_baslama: string;
}
interface SuSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null;
  tank_no: string; urun: string; su_lt: string; mevcut_lt: string;
  son_olcum_zamani: string | null;
}
interface OperasyonVeri {
  uretim: string;
  tazelik?: Tazelik[];
  esik: { acilGun: number; uyariGun: number; pencereGun: number; suLt: number };
  ozet: {
    stokAcil: number; stokUyari: number; alarmAcik: number; alarmToplam: number;
    kronikIstasyon: number; yanipSonen: number; gercekKronik: number;
    irsaliyesiz: number; irsaliyesizYuzde: number; dolumToplam: number;
    kalibrasyon: number; suluTank: number;
  };
  stok: StokSatir[];
  alarmOzet: AlarmOzet[];
  kronik: KronikSatir[];
  irsaliyeIstasyon: IrsaliyeSatir[];
  kalibrasyon: KalibrasyonSatir[];
  su: SuSatir[];
}

const ALARM_AD: Record<string, string> = {
  baglanti_kopuk: 'Bağlantı kopuk',
  tank_veri_yok: 'Tank verisi yok',
};

/** Panel genelinde TEK locale. Operasyon 'tr-TR', geri kalan 'tr' kullanıyordu;
 *  çıktı aynı ama iki yazım vardı — tek sabit üzerinden hizalandı. */
const TR = 'tr-TR';

const sayi = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString(TR);

function operasyonDogrula(d: unknown): OperasyonVeri {
  const x = d as OperasyonVeri;
  if (!x?.ozet || !Array.isArray(x?.stok) || !Array.isArray(x?.kronik))
    throw new Error('Operasyon verisi beklenen biçimde değil (sunucu şeması değişmiş olabilir).');
  return x;
}

/** İstasyon adı + kod + şehir — dört tabloda aynı gösterim. */
function IstasyonHucre({ ad, kod, sehir }: { ad: string | null; kod: string; sehir: string | null }) {
  return (
    <>
      <strong>{ad ?? kod}</strong>
      <span className="soluk"> · {kod}</span>
      {sehir && <div className="alt-satir soluk">{sehir}</div>}
    </>
  );
}

export function Operasyon() {
  // 60 sn polling: stok ve alarm operasyonel veri, tazeliği önemli.
  const { veri, hata, yukleniyor, yenile } = useVeri<OperasyonVeri>(
    '/api/operasyon', operasyonDogrula, 60_000,
  );

  const esik = veri?.esik ?? { acilGun: 1, uyariGun: 2, pencereGun: 30, suLt: 50 };

  /** Kalan güne göre aciliyet sınıfı — CSS td.krit eşleşmesi için hucreSinif'ta kullanılır. */
  const stokSinif = (s: StokSatir): string => {
    const g = Number(s.kalan_gun);
    if (g < esik.acilGun) return 'krit';
    if (g < esik.uyariGun) return 'uyari';
    return '';
  };

  const stokKolon: TabloKolon<StokSatir>[] = [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true,
      hucre: (s) => <IstasyonHucre ad={s.istasyon_ad} kod={s.istasyon_kod} sehir={s.sehir} />,
      sirala: (s) => s.istasyon_ad ?? s.istasyon_kod,
      ara: (s) => `${s.istasyon_ad ?? ''} ${s.istasyon_kod} ${s.sehir ?? ''}`,
    },
    {
      id: 'urun', ad: 'Ürün', varsayilan: true,
      hucre: (s) => s.urun, sirala: (s) => s.urun, ara: (s) => s.urun,
    },
    {
      id: 'kalan', ad: 'Kalan gün', varsayilan: true, sinif: 'sag',
      // Renk tek taşıyıcı DEĞİL — ama görünür işareti CSS basıyor:
      // `td.krit::after { content: ' ▲▲' }` / `td.uyari::after { ' ▲' }` (stil.css).
      // ⚠️ Burada JSX'te ayrıca ▲ eklemek ÇİFT işaret üretiyordu: "▲ 0,5▲▲"
      // (2026-07-30'da canlıda görüldü). İzleme.tsx'in deseni doğrudur: görünür
      // işaret CSS'te, JSX yalnız ekran okuyucu metnini ekler.
      hucre: (s) => {
        const g = Number(s.kalan_gun);
        return (
          <strong>
            {g < esik.acilGun && <span className="sr-only">Acil: </span>}
            {g.toLocaleString(TR, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </strong>
        );
      },
      hucreSinif: stokSinif,
      sirala: (s) => Number(s.kalan_gun),
    },
    {
      id: 'mevcut', ad: 'Mevcut (lt)', varsayilan: true, sinif: 'sag mono',
      hucre: (s) => sayi(s.mevcut_lt), sirala: (s) => Number(s.mevcut_lt),
    },
    {
      id: 'gunluk', ad: `Günlük tüketim (${esik.pencereGun}g ort.)`, varsayilan: true, sinif: 'sag mono',
      hucre: (s) => sayi(s.gunluk_tuketim), sirala: (s) => Number(s.gunluk_tuketim),
    },
    {
      id: 'kapasite', ad: 'Kapasite (lt)', varsayilan: false, sinif: 'sag mono',
      hucre: (s) => sayi(s.kapasite_lt), sirala: (s) => Number(s.kapasite_lt),
    },
    {
      id: 'tank', ad: 'Tank', varsayilan: false, sinif: 'sag',
      hucre: (s) => s.tank, sirala: (s) => Number(s.tank),
    },
    {
      id: 'olcum', ad: 'Son ölçüm', varsayilan: false,
      hucre: (s) => (s.son_olcum ? <time dateTime={s.son_olcum}>{zamanFark(s.son_olcum)}</time> : <Bos />),
      sirala: (s) => s.son_olcum ?? '',
    },
  ];

  const kronikKolon: TabloKolon<KronikSatir>[] = [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true,
      hucre: (k) => <IstasyonHucre ad={k.istasyon_ad} kod={k.istasyon_kod} sehir={k.sehir} />,
      sirala: (k) => k.istasyon_ad ?? k.istasyon_kod,
      ara: (k) => `${k.istasyon_ad ?? ''} ${k.istasyon_kod} ${k.sehir ?? ''}`,
    },
    {
      id: 'tip', ad: 'Değerlendirme', varsayilan: true,
      // ⚠️ Bu kolon modülün en önemli bilgisi: "66 alarm" diye üstte duran istasyon
      // aslında eşik ayarı sorunu olabilir. Ayrım yapılmazsa ekip boşa saha gezer.
      hucre: (k) =>
        k.yanip_sonme ? (
          <span className="rozet uyari">Eşik ayarı</span>
        ) : (
          <span className="rozet krit">Gerçek arıza</span>
        ),
      sirala: (k) => (k.yanip_sonme ? 1 : 0),
      ara: (k) => (k.yanip_sonme ? 'eşik ayarı yanıp sönme' : 'gerçek arıza'),
    },
    {
      id: 'sayi', ad: 'Alarm', varsayilan: true, sinif: 'sag',
      hucre: (k) => <strong>{k.alarm_sayisi}</strong>, sirala: (k) => k.alarm_sayisi,
    },
    {
      id: 'acik', ad: 'Açık', varsayilan: true, sinif: 'sag',
      hucre: (k) => (k.acik > 0 ? <strong>{k.acik}</strong> : <span className="soluk">0</span>),
      hucreSinif: (k) => (k.acik > 0 ? 'krit' : ''),
      sirala: (k) => k.acik,
    },
    {
      id: 'ortdk', ad: 'Ort. süre', varsayilan: true, sinif: 'sag mono',
      hucre: (k) => `${sayi(k.ort_dk)} dk`, sirala: (k) => Number(k.ort_dk),
    },
    {
      id: 'enuzun', ad: 'En uzun', varsayilan: false, sinif: 'sag mono',
      hucre: (k) => `${k.en_uzun_saat} sa`, sirala: (k) => Number(k.en_uzun_saat),
    },
    {
      id: 'son', ad: 'Son alarm', varsayilan: true,
      hucre: (k) => <time dateTime={k.son_alarm}>{zamanFark(k.son_alarm)}</time>,
      sirala: (k) => k.son_alarm,
    },
  ];

  const irsaliyeKolon: TabloKolon<IrsaliyeSatir>[] = [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true,
      hucre: (r) => <IstasyonHucre ad={r.istasyon_ad} kod={r.istasyon_kod} sehir={r.sehir} />,
      sirala: (r) => r.istasyon_ad ?? r.istasyon_kod,
      ara: (r) => `${r.istasyon_ad ?? ''} ${r.istasyon_kod} ${r.sehir ?? ''}`,
    },
    {
      id: 'yuzde', ad: 'Eksik %', varsayilan: true, sinif: 'sag',
      hucre: (r) => <strong>%{r.yuzde}</strong>,  // TR yazımı: % önde
      hucreSinif: (r) => (Number(r.yuzde) >= 100 ? 'krit' : Number(r.yuzde) >= 50 ? 'uyari' : ''),
      sirala: (r) => Number(r.yuzde),
    },
    {
      id: 'eksik', ad: 'İrsaliyesiz', varsayilan: true, sinif: 'sag',
      hucre: (r) => sayi(r.irsaliyesiz), sirala: (r) => r.irsaliyesiz,
    },
    {
      id: 'dolum', ad: 'Toplam dolum', varsayilan: true, sinif: 'sag',
      hucre: (r) => sayi(r.dolum), sirala: (r) => r.dolum,
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
    { id: 'urun', ad: 'Ürün', varsayilan: true, hucre: (k) => k.urun, sirala: (k) => k.urun, ara: (k) => k.urun },
    {
      id: 'yuzde', ad: 'Kalibrasyon %', varsayilan: true, sinif: 'sag mono',
      hucre: (k) => k.kalibrasyon_yuzdesi, sirala: (k) => Number(k.kalibrasyon_yuzdesi),
    },
    {
      id: 'tarih', ad: 'Dolum', varsayilan: true,
      hucre: (k) => <time dateTime={k.dolum_baslama}>{zamanFark(k.dolum_baslama)}</time>,
      sirala: (k) => k.dolum_baslama,
    },
  ];

  const suKolon: TabloKolon<SuSatir>[] = [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true,
      hucre: (s) => <IstasyonHucre ad={s.istasyon_ad} kod={s.istasyon_kod} sehir={s.sehir} />,
      sirala: (s) => s.istasyon_ad ?? s.istasyon_kod,
      ara: (s) => `${s.istasyon_ad ?? ''} ${s.istasyon_kod} ${s.sehir ?? ''}`,
    },
    { id: 'tank', ad: 'Tank', varsayilan: true, sinif: 'sag', hucre: (s) => s.tank_no, sirala: (s) => Number(s.tank_no) },
    { id: 'urun', ad: 'Ürün', varsayilan: true, hucre: (s) => s.urun, sirala: (s) => s.urun, ara: (s) => s.urun },
    {
      id: 'su', ad: 'Su (lt)', varsayilan: true, sinif: 'sag mono',
      hucre: (s) => <strong>{sayi(s.su_lt)}</strong>,
      hucreSinif: (s) => (Number(s.su_lt) > 200 ? 'krit' : 'uyari'),
      sirala: (s) => Number(s.su_lt),
    },
    {
      id: 'mevcut', ad: 'Yakıt (lt)', varsayilan: true, sinif: 'sag mono',
      hucre: (s) => sayi(s.mevcut_lt), sirala: (s) => Number(s.mevcut_lt),
    },
    {
      id: 'olcum', ad: 'Son ölçüm', varsayilan: false,
      hucre: (s) => (s.son_olcum_zamani ? <time dateTime={s.son_olcum_zamani}>{zamanFark(s.son_olcum_zamani)}</time> : <Bos />),
      sirala: (s) => s.son_olcum_zamani ?? '',
    },
  ];

  const sekmeler: SekmeTanim[] = useMemo(() => {
    if (!veri) return [];
    const o = veri.ozet;
    return [
      {
        id: 'stok',
        ad: 'Stok durumu',
        sayi: o.stokAcil + o.stokUyari,
        acil: o.stokAcil > 0,
        icerik: () => (
          <>
            <Tablo
              anahtar="op-stok"
              kolonlar={stokKolon}
              satirlar={veri.stok}
              satirAnahtar={(s) => `${s.istasyon_kod}|${s.urun}`}
              satirSinif={(s) => stokSinif(s)}
              aramaEtiket="İstasyon / şehir / ürün ara"
              kaydirmaEsigi={20}
              ilkGosterim={40}
              baslik={`Yakıt kaç gün yeter — ${veri.stok.length} istasyon-ürün`}
              aciklama={
                <>
                  Kalan gün = mevcut stok ÷ günlük tüketim. Tüketim son{' '}
                  <strong>{esik.pencereGun} günün dolum ortalaması</strong>ndan hesaplanır
                  (pompa satışı DB'ye çekilmiyor, dolum vekil olarak kullanılıyor) → rakam{' '}
                  <strong>tahmindir</strong>. 7 günden fazlası listelenmez.
                </>
              }
              bosMesaj="7 günden az stoğu olan istasyon yok."
            />
            {veri.stok.length > 0 && (
              <CubukYatay
                veri={veri.stok.slice(0, 12)}
                ad={(s) => `${(s.istasyon_ad ?? s.istasyon_kod).slice(0, 22)} · ${s.urun}`}
                deger={(s) => Number(s.kalan_gun)}
                vurgu={(s) => Number(s.kalan_gun) < esik.acilGun}
                baslik="En az günü kalanlar"
                altBaslik={`Kırmızı: ${esik.acilGun} günden az`}
                birim=" gün"
              />
            )}
          </>
        ),
      },
      {
        id: 'alarm',
        ad: 'Alarm geçmişi',
        sayi: o.gercekKronik,
        acil: o.alarmAcik > 0,
        icerik: () => (
          <>
            <section className="kartlar" aria-label="Alarm tipine göre özet">
              {veri.alarmOzet.map((a) => (
                <Kart
                  key={a.tip}
                  ad={ALARM_AD[a.tip] ?? a.tip}
                  deger={sayi(a.toplam)}
                  alt={`${a.acik > 0 ? `${a.acik} açık` : 'hepsi kapandı'} · ort. ${a.ort_saat} sa · en uzun ${a.en_uzun_saat} sa`}
                  acil={a.acik > 0}
                />
              ))}
            </section>
            <Tablo
              anahtar="op-kronik"
              kolonlar={kronikKolon}
              satirlar={veri.kronik}
              satirAnahtar={(k) => k.istasyon_kod}
              aramaEtiket="İstasyon / şehir / değerlendirme ara"
              kaydirmaEsigi={20}
              ilkGosterim={30}
              baslik={`Tekrar eden alarmlar — ${veri.kronik.length} istasyon`}
              aciklama={
                <>
                  <strong>Eşik ayarı</strong>: alarm ortalama 45 dk'dan kısa sürüyor ve çok
                  tekrar ediyor. Tank verisi 30 dk periyotlu, eşik 35 dk → veri birkaç dakika
                  gecikince alarm açılıp sonraki veriyle kapanıyor. Bu <em>arıza değil</em>,
                  eşik ayarı işi. <strong>Gerçek arıza</strong>: alarm saatlerce açık kalıyor —
                  saha müdahalesi gerekir.
                </>
              }
              bosMesaj="Tekrar eden alarm yok."
            />
          </>
        ),
      },
      {
        id: 'kalite',
        ad: 'Veri kalitesi',
        sayi: veri.irsaliyeIstasyon.length + veri.su.length,
        icerik: () => (
          <>
            <Tablo
              anahtar="op-irsaliye"
              kolonlar={irsaliyeKolon}
              satirlar={veri.irsaliyeIstasyon}
              satirAnahtar={(r) => r.istasyon_kod}
              aramaEtiket="İstasyon / şehir ara"
              kaydirmaEsigi={20}
              ilkGosterim={30}
              baslik={`İrsaliyesiz dolum — ${veri.irsaliyeIstasyon.length} istasyon`}
              aciklama={
                <>
                  Son {esik.pencereGun} günde dolum kaydı var ama irsaliye numarası ASIS'e
                  akmamış. Genel oran: <strong>%{o.irsaliyesizYuzde}</strong> ({sayi(o.irsaliyesiz)} /{' '}
                  {sayi(o.dolumToplam)} dolum). Otomasyon arızası göstergesi.
                </>
              }
              bosMesaj="İrsaliyesiz dolum yok."
            />
            <Tablo
              anahtar="op-su"
              kolonlar={suKolon}
              satirlar={veri.su}
              satirAnahtar={(s) => `${s.istasyon_kod}|${s.tank_no}`}
              aramaEtiket="İstasyon / şehir / ürün ara"
              kaydirmaEsigi={20}
              ilkGosterim={30}
              baslik={`Tankta su — ${veri.su.length} tank`}
              aciklama={<>Su seviyesi {esik.suLt} litreden fazla. Yakıt kalitesi riski.</>}
              bosMesaj={`${esik.suLt} litreden fazla su olan tank yok.`}
            />
            <Tablo
              anahtar="op-kalibrasyon"
              kolonlar={kalibrasyonKolon}
              satirlar={veri.kalibrasyon}
              satirAnahtar={(k, i) => `${k.istasyon_kod}|${k.tank_no}|${i}`}
              aramaEtiket="İstasyon / şehir / ürün ara"
              kaydirmaEsigi={20}
              ilkGosterim={20}
              baslik={`Kalibrasyon değişimi — ${veri.kalibrasyon.length} kayıt`}
              aciklama={
                <>
                  Son {esik.pencereGun} günde kalibrasyon yüzdesi sıfırdan farklı olan dolumlar.
                  <strong> 1240 sayılı Kurul Kararı</strong>: kalibrasyon değişiminde 24 saat
                  içinde yedek alınması zorunlu.
                </>
              }
              bosMesaj="Kalibrasyon değişimi kaydı yok."
            />
          </>
        ),
      },
    ];
  }, [veri, esik]);

  const duyuru = (): string => {
    if (!veri) return '';
    const o = veri.ozet;
    return `Operasyon verisi güncellendi. ${o.stokAcil} acil stok, ${o.alarmAcik} açık alarm, ${o.gercekKronik} kronik istasyon.`;
  };

  return (
    <>
      <ModulBar
        alt="Stok tahmini · alarm geçmişi · veri kalitesi"
        taze={veri?.uretim ?? null}
        yukleniyor={yukleniyor}
        yenile={yenile}
        duyuru={duyuru()}
      />

      {hata && (
        <div className="hata" role="alert">
          <span aria-hidden="true">⚠ </span>
          {hata}
        </div>
      )}

      <TazelikSerit liste={veri?.tazelik} />

      {veri && (
        <>
          <section className="kartlar" aria-label="Operasyon özeti">
            <Kart
              ad="Acil stok"
              deger={veri.ozet.stokAcil}
              alt={`${esik.acilGun} günden az kalan`}
              acil={veri.ozet.stokAcil > 0}
            />
            <Kart
              ad="Yaklaşan stok"
              deger={veri.ozet.stokUyari}
              alt={`${esik.acilGun}-${esik.uyariGun} gün arası`}
            />
            <Kart
              ad="Açık alarm"
              deger={veri.ozet.alarmAcik}
              alt={`${sayi(veri.ozet.alarmToplam)} kayıt toplam`}
              acil={veri.ozet.alarmAcik > 0}
            />
            <Kart
              ad="Gerçek kronik"
              deger={veri.ozet.gercekKronik}
              alt={`+${veri.ozet.yanipSonen} eşik ayarı`}
            />
            <Kart
              ad="İrsaliyesiz"
              deger={`%${veri.ozet.irsaliyesizYuzde}`}
              alt={`${sayi(veri.ozet.irsaliyesiz)} dolum`}
            />
          </section>

          <Sekmeler tanimlar={sekmeler} anahtar="operasyon" />
        </>
      )}
    </>
  );
}

/** Özet kartı. Mevcut .kart/.kart-deger/.kart-baslik sınıflarını kullanır;
 *  aciliyet şeridi .kart.krit / .kart.uyari üzerinden gelir (stil.css'te tanımlı). */
function Kart({ ad, deger, alt, acil }: { ad: string; deger: ReactNode; alt: string; acil?: boolean }) {
  return (
    <div className={acil ? 'kart krit' : 'kart'}>
      <div className="kart-deger">
        {acil && <span aria-hidden="true">▲ </span>}
        {deger}
      </div>
      <div className="kart-baslik">{ad}</div>
      <div className="kart-alt-not">{alt}</div>
    </div>
  );
}
