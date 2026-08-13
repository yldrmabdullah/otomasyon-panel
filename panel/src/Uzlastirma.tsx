// Tank Uzlaştırma (EPDK stok mutabakatı) — Mevzuat modülü altında.
// POL Tank Uzlaştırma Raporu: bayi×ürün×tank bazında Fark=(A+B−C)−D, Oran=(E/C)*100.
// Kaynak: /api/uzlastirma. Salt-görüntüleme.
//
// Akış: tarih aralığı seç → BAYİ ÖZET tablosu (sorunlular üstte, sarı) → bir bayiye
// tıkla → o bayinin TANK DETAYI açılır (hangi tankta ne sapma, kalibrasyon durumu).
import { useMemo, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Bos, Kart, useVeri } from './ortak.js';
import { csvIndir, xlsIndir } from './disaAktar.js';

interface Aralik { bas: string; bit: string; ad: string | null; bayiSayisi: number; sorunluBayi: number; }
interface Ozet {
  bas: string; bit: string; ad: string | null; bayiSayisi: number; tankSayisi: number; sorunluBayi: number;
  toplamDolum: number; toplamSatis: number; cekimZamani: string;
}
interface Bayi {
  epdk: string; istasyon: string | null; bolge: string | null; mintika: string | null;
  aBasi: number; bDolum: number; cSatis: number; dSonu: number; eFark: number; fOran: number | null;
  disSatis: number;
  tankSayisi: number; asimTank: number; kalibTank: number; durum: string;
}
interface TankSatir {
  istKod: string; istasyon: string | null; urun: string; tankNo: string;
  aBasi: number; bDolum: number; cSatis: number; dSonu: number; eFark: number; fOran: number | null;
  kalibIlk: number | null; kalibSon: number | null; durum: string;
}
interface Veri {
  araliklar: Aralik[]; secili: { bas: string; bit: string } | null; ozet: Ozet | null;
  bayiler: Bayi[]; detay: { epdk: string; satirlar: TankSatir[] } | null;
}

const DURUM: Record<string, { ad: string; sinif: string }> = {
  uygun: { ad: 'Uygun', sinif: 'iyi' },
  oran_asim: { ad: '±%3 aşıldı', sinif: 'krit' },
  kalib_degisti: { ad: 'Kalibrasyon değişti', sinif: 'uyari' },
  satis_yok: { ad: 'Satış yok', sinif: 'soluk' },
  dis_satis_agirlikli: { ad: 'Dış satış ağırlıklı', sinif: 'uyari' },
};
const lt = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' lt';
/** Oran gösterimi — satış EPDK eşiğinin (288 lt) altındaysa oran matematiksel olarak
 *  anlamsız (9 lt satışta −9 lt fark = "%−101" gibi saçma değerler) → '—' gösterilir.
 *  Durum sınıflandırması zaten |fark|>288 şartı arıyor; bu yalnız GÖSTERİM düzeltmesi. */
const pct = (v: number | null | undefined, satis?: number) =>
  v == null || (satis != null && satis < 288) ? '—' : '%' + v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

export function Uzlastirma() {
  const [aralik, setAralik] = useState<{ bas: string; bit: string } | null>(null);
  const [acikBayi, setAcikBayi] = useState<string | null>(null);
  const qs = new URLSearchParams();
  if (aralik) { qs.set('bas', aralik.bas); qs.set('bit', aralik.bit); }
  if (acikBayi) qs.set('epdk', acikBayi);
  const { veri, yukleniyor, hata } = useVeri<Veri>(`/api/uzlastirma${qs.toString() ? '?' + qs : ''}`);

  const bayiKolon: TabloKolon<Bayi>[] = useMemo(() => [
    {
      // EPDK no adın ALTINDA: aramaya zaten dahildi ama hiçbir yerde GÖRÜNMÜYORDU
      // → kullanıcı arayabildiğini bilmiyordu. Uzun unvanlar kırpıldığı için
      // satırları ayırt eden değer de bu.
      id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      hucre: (b) => (
        <>
          {b.istasyon || b.epdk}
          {b.istasyon && <div className="alt-satir soluk mono">{b.epdk}</div>}
        </>
      ),
      ara: (b) => `${b.istasyon ?? ''} ${b.epdk}`,
      metin: (b) => `${b.istasyon ?? ''} (${b.epdk})`,
      sirala: (b) => b.istasyon ?? '',
    },
    { id: 'bolge', ad: 'Bölge', varsayilan: true, sinif: 'soluk', hucre: (b) => b.bolge || <Bos />, ara: (b) => b.bolge ?? '', sirala: (b) => b.bolge ?? '' },
    { id: 'mintika', ad: 'Mıntıka', varsayilan: false, sinif: 'soluk', hucre: (b) => b.mintika || <Bos />, ara: (b) => b.mintika ?? '' },
    { id: 'basi', ad: 'Açılış Stok', varsayilan: true, sinif: 'sag mono soluk', hucre: (b) => lt(b.aBasi), sirala: (b) => b.aBasi },
    { id: 'dolum', ad: 'Aldığı (Dolum)', varsayilan: true, sinif: 'sag mono', hucre: (b) => lt(b.bDolum), sirala: (b) => b.bDolum },
    { id: 'satis', ad: 'Sattığı (Pompa)', varsayilan: true, sinif: 'sag mono', hucre: (b) => lt(b.cSatis), sirala: (b) => b.cSatis },
    {
      id: 'dissatis', ad: 'Dış Satış', varsayilan: true, sinif: 'sag mono',
      hucre: (b) => b.disSatis > 0 ? lt(b.disSatis) : <Bos />, sirala: (b) => b.disSatis,
      hucreSinif: (b) => (b.durum === 'dis_satis_agirlikli' ? 'uyari-metin' : 'soluk'),
    },
    { id: 'sonu', ad: 'Kapanış Stok', varsayilan: true, sinif: 'sag mono', hucre: (b) => lt(b.dSonu), sirala: (b) => b.dSonu },
    {
      id: 'fark', ad: 'Fark', varsayilan: true, sinif: 'sag mono', sirala: (b) => Math.abs(b.eFark),
      hucre: (b) => (b.eFark > 0 ? '+' : '') + b.eFark.toLocaleString('tr-TR', { maximumFractionDigits: 0 }),
      hucreSinif: (b) => (b.durum === 'oran_asim' ? 'krit' : undefined),
    },
    {
      id: 'oran', ad: 'Oran', varsayilan: true, sinif: 'sag mono', sirala: (b) => Math.abs(b.fOran ?? 0),
      hucre: (b) => pct(b.fOran, b.cSatis), hucreSinif: (b) => (b.durum === 'oran_asim' ? 'krit' : undefined),
    },
    {
      id: 'durum', ad: 'Durum', varsayilan: true, sabit: true, sirala: (b) => (b.durum === 'oran_asim' ? 0 : 1),
      hucre: (b) => {
        const d = DURUM[b.durum] ?? { ad: b.durum, sinif: '' };
        return <span className={`durum-rozet ${d.sinif}`}>{b.asimTank > 0 ? `${b.asimTank} tank · ` : ''}{d.ad}</span>;
      },
      ara: (b) => DURUM[b.durum]?.ad ?? b.durum,
    },
  ], []);

  // Tank detay kolonları — bayi satırına tıklayınca açılan alt tablo.
  const tankKolon: TabloKolon<TankSatir>[] = useMemo(() => [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true, sinif: 'ad-hucre soluk',
      hucre: (t) => t.istasyon || <Bos />, ara: (t) => t.istasyon ?? '', sirala: (t) => t.istasyon ?? '',
    },
    { id: 'urun', ad: 'Ürün', varsayilan: true, hucre: (t) => t.urun, ara: (t) => t.urun, sirala: (t) => t.urun },
    { id: 'tank', ad: 'Tank', varsayilan: true, sinif: 'mono', hucre: (t) => t.tankNo, sirala: (t) => Number(t.tankNo) },
    { id: 'basi', ad: 'Başı Stok', varsayilan: true, sinif: 'sag mono', hucre: (t) => lt(t.aBasi), sirala: (t) => t.aBasi },
    { id: 'dolum', ad: 'Dolum', varsayilan: true, sinif: 'sag mono', hucre: (t) => lt(t.bDolum), sirala: (t) => t.bDolum },
    { id: 'satis', ad: 'Satış', varsayilan: true, sinif: 'sag mono', hucre: (t) => lt(t.cSatis), sirala: (t) => t.cSatis },
    { id: 'sonu', ad: 'Sonu Stok', varsayilan: true, sinif: 'sag mono', hucre: (t) => lt(t.dSonu), sirala: (t) => t.dSonu },
    {
      id: 'fark', ad: 'Fark', varsayilan: true, sinif: 'sag mono', sirala: (t) => Math.abs(t.eFark),
      hucre: (t) => `${t.eFark > 0 ? '+' : ''}${t.eFark.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`,
      hucreSinif: (t) => (t.durum === 'oran_asim' ? 'krit' : undefined),
    },
    {
      id: 'oran', ad: 'Oran', varsayilan: true, sinif: 'sag mono', sirala: (t) => Math.abs(t.fOran ?? 0),
      hucre: (t) => pct(t.fOran, t.cSatis),
      hucreSinif: (t) => (t.durum === 'oran_asim' ? 'krit' : undefined),
    },
    {
      id: 'kalib', ad: 'Kalib.', varsayilan: true, sinif: 'sag mono',
      hucre: (t) => (t.kalibIlk == null ? <Bos /> : `${t.kalibIlk}→${t.kalibSon}`),
      // Kalibrasyon DEĞİŞTİYSE vurgula — uzlaştırma sapmasının yaygın sebebi.
      hucreSinif: (t) =>
        t.kalibIlk != null && t.kalibSon != null && t.kalibIlk !== t.kalibSon ? 'uyari' : 'soluk',
    },
    {
      id: 'durum', ad: 'Durum', varsayilan: true, sirala: (t) => (t.durum === 'oran_asim' ? 0 : 1),
      ara: (t) => DURUM[t.durum]?.ad ?? t.durum,
      hucre: (t) => {
        const d = DURUM[t.durum] ?? { ad: t.durum, sinif: '' };
        return <span className={`durum-rozet ${d.sinif}`}>{d.ad}</span>;
      },
    },
  ], []);

  if (hata) return <div className="mevzuat-uyari"><b>Uzlaştırma verisi alınamadı.</b> {hata}</div>;
  if (!yukleniyor && (!veri || veri.araliklar.length === 0)) {
    return (
      <div className="mevzuat-uyari">
        <b>Henüz uzlaştırma çekimi yapılmadı.</b> POL Tank Uzlaştırma raporu bir tarih aralığı için
        çekildikten sonra burada listelenir. (Çekim aracı: <code>araclar/uzlasCek.mts</code>.)
      </div>
    );
  }
  const ozet = veri?.ozet;

  function disaAktar(xls: boolean) {
    const bayiler = veri?.bayiler ?? [];
    const baslik = ['Bayi', 'EPDK', 'Bölge', 'Açılış Stok lt', 'Aldığı (Dolum) lt', 'Sattığı (Pompa) lt', 'Dış Satış lt', 'Kapanış Stok lt', 'Fark lt', 'Oran %', 'Sorunlu Tank', 'Durum'];
    const satir = bayiler.map((b) => [
      b.istasyon ?? '', b.epdk, b.bolge ?? '', String(Math.round(b.aBasi)), String(Math.round(b.bDolum)), String(Math.round(b.cSatis)),
      String(Math.round(b.disSatis)), String(Math.round(b.dSonu)), String(Math.round(b.eFark)), b.fOran == null ? '' : String(b.fOran),
      String(b.asimTank), DURUM[b.durum]?.ad ?? b.durum,
    ]);
    const ad = `tank-uzlastirma-${ozet?.bas ?? 'aralik'}`;
    if (xls) xlsIndir(ad, baslik, satir); else csvIndir(ad, baslik, satir);
  }

  const detaySatir = veri?.detay?.satirlar ?? [];
  const acikBayiAd = veri?.bayiler.find((b) => b.epdk === acikBayi)?.istasyon ?? acikBayi;

  return (
    <div className="uzlastirma">
      {/* Aralık seçici + tazelik */}
      <div className="mutabakat-ust">
        <label className="mutabakat-donem-secim">
          <span>Dönem</span>
          <select
            value={ozet ? `${ozet.bas}|${ozet.bit}` : ''}
            onChange={(e) => { const [b, t] = e.target.value.split('|'); setAralik({ bas: b, bit: t }); setAcikBayi(null); }}
            disabled={yukleniyor || !veri?.araliklar.length}
          >
            {(veri?.araliklar ?? []).map((a) => (
              <option key={`${a.bas}|${a.bit}`} value={`${a.bas}|${a.bit}`}>
                {a.ad ?? `${a.bas} – ${a.bit}`}{a.sorunluBayi > 0 ? ` — ${a.sorunluBayi} sorunlu bayi` : ' — temiz'}
              </option>
            ))}
          </select>
        </label>
        {ozet && (
          <span className="taze">
            {new Date(ozet.cekimZamani).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })} çekildi
          </span>
        )}
      </div>

      {/* Özet kartlar */}
      {ozet && (
        <section className="kartlar" aria-label="Uzlaştırma özeti">
          <Kart ad="Bayi" deger={ozet.bayiSayisi} />
          <Kart ad="±%3 Aşan Bayi" deger={ozet.sorunluBayi} acil={ozet.sorunluBayi > 0} />
          <Kart ad="Toplam Dolum (aldığı)" deger={lt(ozet.toplamDolum)} />
          <Kart ad="Toplam Satış" deger={lt(ozet.toplamSatis)} />
        </section>
      )}

      {/* Bayi özet tablosu — satıra tıkla, tank detayı açılır */}
      <Tablo<Bayi>
        anahtar="uzlastirma"
        baslik={<>Bayi Uzlaştırma Özeti{ozet?.ad ? ` · ${ozet.ad}` : ''}</>}
        aciklama={<>Fark = (Dönem Başı + Dolum − Satış) − Dönem Sonu · Oran = Fark/Satış. EPDK limiti ±%3 (ve 288 lt).
          Satıra tıklayınca <b>tank detayı</b> açılır.</>}
        kolonlar={bayiKolon}
        satirlar={veri?.bayiler ?? []}
        satirAnahtar={(b) => b.epdk}
        satirSinif={(b) => (b.durum === 'oran_asim' ? 'satir-krit' : b.durum === 'dis_satis_agirlikli' ? 'satir-uyari' : undefined)}
        satirTikla={(b) => setAcikBayi(acikBayi === b.epdk ? null : b.epdk)}
        yukleniyor={yukleniyor && !veri?.bayiler.length}
        aramaEtiket="Bayi / EPDK / bölge ara…"
        kaydirmaEsigi={25}
        ilkGosterim={80}
        bosMesaj={yukleniyor ? 'Yükleniyor…' : 'Kayıt yok.'}
        aktarGizle
        ustSag={
          <div className="mutabakat-indir">
            <button type="button" className="temizle" disabled={!veri?.bayiler.length} onClick={() => disaAktar(false)}>⭳ CSV</button>
            <button type="button" className="temizle" disabled={!veri?.bayiler.length} onClick={() => disaAktar(true)}>⭳ Excel</button>
          </div>
        }
      />

      {/* Tank detayı — seçili bayi */}
      {acikBayi && (
        <section className="uzlas-detay" aria-label="Tank detayı">
          <div className="uzlas-detay-bas">
            <h3>Tank Detayı · {acikBayiAd}</h3>
            <button type="button" className="temizle" onClick={() => setAcikBayi(null)}>✕ Kapat</button>
          </div>
          {/* Elle <table> yerine ortak Tablo: panelin geri kalanında standart olan
              sıralama, arama, kolon seçici, CSV ve sticky başlık burada YOKTU. */}
          <Tablo<TankSatir>
            anahtar="uzlastirma-tank"
            baslik="Tanklar"
            kolonlar={tankKolon}
            satirlar={detaySatir}
            satirAnahtar={(t, i) => `${t.istKod}-${t.urun}-${t.tankNo}-${i}`}
            satirSinif={(t) => (t.durum === 'oran_asim' ? 'satir-krit' : undefined)}
            yukleniyor={yukleniyor && !detaySatir.length}
            kaydirmaEsigi={12}
            bosMesaj={yukleniyor ? 'Yükleniyor…' : 'Tank kaydı yok.'}
          />
        </section>
      )}
    </div>
  );
}
