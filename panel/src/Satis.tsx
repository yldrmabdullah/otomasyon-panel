// Satış & Tank — Operasyon modülü altında.
//
// İki soruyu BİRLİKTE cevaplar: "hangi istasyon ne kadar sattı" + "şu an
// tanklarında ne var". Kaynak: /api/satis (satis_ozet + tank_durum).
//
// ⚠️ KAPSAM: yalnız MOTORİN + KURŞUNSUZ 95 (kullanıcı kararı). LPG ve AdBlue hem
// satıştan hem tanktan dışlanır — kapsam core/panelSorgu.ts SATIS_URUN/TANK_URUN.
//
// POL karşılığı: "İstasyon Günlük Ürün Analizi" (Ürün Raporları) + "Tank Durum
// Raporu" (Tank Raporları). POL bunları AYRI ekranlarda ve ürünü SATIR bazında
// veriyor; burada ürün grupları KOLON, tank durumu aynı satırda özet.
import { useMemo, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Bos, Kart, useVeri, zamanFark } from './ortak.js';
import { CubukYatay } from './Grafik.js';
import { csvIndir, xlsIndir } from './disaAktar.js';
import { AramaliSecici, type SeciciOge } from './AramaliSecici.js';

interface Satir {
  istKod: string; ad: string; sehir: string | null; bolge: string | null;
  litre: number; tutar: number; fis: number; gunSayisi: number;
  motorin: number; benzin: number;
  tankMevcut: number | null; tankKapasite: number | null; tankSayisi: number;
}
interface Tank {
  tankNo: string; urun: string | null; kapasite: number | null;
  mevcut: number | null; su: number | null; sonOlcum: string | null;
}
interface Veri {
  aralik: { bas: string; bit: string };
  /** Satış verisinin en son bulunduğu gün — "bugün neden boş" uyarısı için. */
  sonVeriGun: string | null;
  istasyon: string | null;
  gunler: string[];
  ozet: { litre: number; tutar: number; fis: number; istasyon: number; gun: number };
  urunKirilim: { urunId: string; ad: string; litre: number; tutar: number }[];
  trend: { gun: string; litre: number; tutar: number }[];
  satirlar: Satir[];
  tanklar: Tank[];
}

const lt = (v: number | null | undefined) =>
  v == null || v === 0 ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const tl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺';
/** Kart için KISA tutar: 322.009.115 ₺ tek satıra sığmıyordu, ₺ alta kayıyordu.
 *  Milyon/milyar kısaltması hem sığar hem büyüklüğü daha hızlı okutur. */
const tlKisa = (v: number): string => {
  if (v >= 1e9) return (v / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' milyar ₺';
  if (v >= 1e6) return (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' milyon ₺';
  return tl(v);
};
/** Doluluk yüzdesi — tank kapasitesine göre. */
const doluluk = (m: number | null, k: number | null) =>
  m == null || k == null || k <= 0 ? null : m / k;

export function Satis() {
  // Varsayılan aralık: son 7 gün. Tek gün istenirse iki tarih aynı seçilir.
  const bugun = new Date().toISOString().slice(0, 10);
  const haftaOnce = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const ayOnce = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const [bas, setBas] = useState(haftaOnce);
  const [bit, setBit] = useState(bugun);
  const [istasyon, setIstasyon] = useState('');

  const qs = new URLSearchParams({ bas, bit });
  if (istasyon) qs.set('istasyon', istasyon);
  const { veri, yukleniyor, hata } = useVeri<Veri>(`/api/satis?${qs}`, undefined, 600_000);

  const satirlar = veri?.satirlar ?? [];
  /** Seçici için istasyon listesi — ada göre sıralı, alt satırda kod + şehir.
   *  Seçili istasyon bu aralıkta satış yapmadıysa listede olmaz → kaybolmasın
   *  diye ayrıca eklenir (yoksa filtre "Tümü"ne düşmüş gibi görünür). */
  const istOgeler = useMemo<SeciciOge[]>(() => {
    const l = [...satirlar]
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
      .map((x) => ({ deger: x.istKod, ad: x.ad, alt: [x.istKod, x.sehir].filter(Boolean).join(' · ') }));
    if (istasyon && !l.some((x) => x.deger === istasyon))
      l.unshift({ deger: istasyon, ad: istasyon, alt: 'bu aralıkta satış yok' });
    return l;
  }, [satirlar, istasyon]);
  const secili = useMemo(
    () => (istasyon ? satirlar.find((s) => s.istKod === istasyon) ?? null : null),
    [istasyon, satirlar],
  );

  const kolonlar: TabloKolon<Satir>[] = useMemo(() => [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      hucre: (r) => (
        <>
          {r.ad}
          <div className="alt-satir soluk mono">
            {r.istKod}{r.sehir ? ` · ${r.sehir}` : ''}
          </div>
        </>
      ),
      ara: (r) => `${r.ad} ${r.istKod} ${r.sehir ?? ''} ${r.bolge ?? ''}`,
      metin: (r) => `${r.ad} (${r.istKod})`,
      sirala: (r) => r.ad,
    },
    // ── ÜRÜN GRUPLARI KOLON OLARAK (kullanıcı isteği; POL satır bazlı veriyor) ──
    {
      id: 'motorin', ad: 'Motorin', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => lt(r.motorin), sirala: (r) => r.motorin,
    },
    {
      id: 'benzin', ad: 'Kurşunsuz 95', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => lt(r.benzin), sirala: (r) => r.benzin,
    },
    {
      id: 'litre', ad: 'Toplam (lt)', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => <strong>{lt(r.litre)}</strong>, sirala: (r) => r.litre,
    },
    {
      id: 'tutar', ad: 'Tutar', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => tl(r.tutar), sirala: (r) => r.tutar,
    },
    {
      id: 'fis', ad: 'Fiş', varsayilan: false, sinif: 'sag mono soluk',
      hucre: (r) => r.fis.toLocaleString('tr-TR'), sirala: (r) => r.fis,
    },
    {
      // Günlük ortalama — aralık uzun olduğunda "ne kadar hızlı satıyor" sorusu.
      id: 'gunluk', ad: 'Günlük ort.', varsayilan: false, sinif: 'sag mono soluk',
      hucre: (r) => (r.gunSayisi > 0 ? lt(r.litre / r.gunSayisi) : <Bos />),
      sirala: (r) => (r.gunSayisi > 0 ? r.litre / r.gunSayisi : 0),
    },
    // ── TANK SON DURUM (anlık — seçili aralıktan bağımsız) ──
    {
      id: 'tank', ad: 'Tank Son Durum', varsayilan: true, sinif: 'sag',
      sirala: (r) => doluluk(r.tankMevcut, r.tankKapasite) ?? -1,
      ara: (r) => `${r.tankSayisi} tank`,
      metin: (r) => (r.tankMevcut == null ? '' : `${Math.round(r.tankMevcut)}/${Math.round(r.tankKapasite ?? 0)}`),
      hucre: (r) => {
        const d = doluluk(r.tankMevcut, r.tankKapasite);
        if (d === null) return <Bos />;
        return (
          <>
            <span className="mono">
              {lt(r.tankMevcut)} / {lt(r.tankKapasite)}
            </span>
            <div className="alt-satir soluk">
              {r.tankSayisi} tank · %{(d * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} dolu
            </div>
          </>
        );
      },
      // Kritik doluluk: %15 altı kırmızı (yakında bitecek), %90 üstü de dikkat.
      hucreSinif: (r) => {
        const d = doluluk(r.tankMevcut, r.tankKapasite);
        return d === null ? undefined : d < 0.15 ? 'krit' : d > 0.9 ? 'uyari' : undefined;
      },
    },
    { id: 'bolge', ad: 'Bölge', varsayilan: false, sinif: 'soluk', hucre: (r) => r.bolge || <Bos />, ara: (r) => r.bolge ?? '' },
  ], []);

  function disaAktar(xls: boolean) {
    const baslik = ['İstasyon', 'İst. Kod', 'Şehir', 'Bölge', 'Motorin lt', 'Kurşunsuz 95 lt',
      'Toplam lt', 'Tutar TL', 'Fiş', 'Tank Mevcut lt', 'Tank Kapasite lt', 'Tank Sayısı'];
    const satir = satirlar.map((r) => [
      r.ad, r.istKod, r.sehir ?? '', r.bolge ?? '',
      String(Math.round(r.motorin)), String(Math.round(r.benzin)),
      String(Math.round(r.litre)), String(Math.round(r.tutar)),
      String(r.fis), r.tankMevcut == null ? '' : String(Math.round(r.tankMevcut)),
      r.tankKapasite == null ? '' : String(Math.round(r.tankKapasite)), String(r.tankSayisi),
    ]);
    const ad = `satis-tank-${bas}_${bit}`;
    if (xls) xlsIndir(ad, baslik, satir); else csvIndir(ad, baslik, satir);
  }

  const o = veri?.ozet;
  const tekGun = bas === bit;

  return (
    <>
      {/* ⚠️ ModulBar YOK: Operasyon modülü kendi ModulBar'ını üstte çiziyor,
          sekme içinde ikinci "Yenile" butonu çıkıyordu. Tazeleme üstteki
          düğmeden ya da 10 dk polling ile oluyor. */}
      {hata && <div className="hata" role="alert"><span aria-hidden="true">⚠ </span>{hata}</div>}

      {/* FİLTRE ÇUBUĞU — POL'deki gibi tarih aralığı + bayi seçimi.
          Gruplar görsel olarak ayrık: [tarih] [hızlı aralık] [istasyon].
          Native <select> 149 istasyonda kullanılamıyordu → AramaliSecici. */}
      <div className="satis-filtre">
        <div className="sf-grup">
          <label className="sf-alan">
            <span>Başlangıç</span>
            <input className="sf-tarih" type="date" value={bas} max={bit}
              onChange={(e) => setBas(e.target.value)} />
          </label>
          <label className="sf-alan">
            <span>Bitiş</span>
            <input className="sf-tarih" type="date" value={bit} min={bas} max={bugun}
              onChange={(e) => setBit(e.target.value)} />
          </label>
        </div>

        {/* Hızlı aralıklar — en sık kullanılan üç seçim tek tıkla. */}
        <div className="segment" role="group" aria-label="Hızlı tarih aralığı">
          <button type="button" className={tekGun && bit === bugun ? 'akt' : ''}
            onClick={() => { setBas(bugun); setBit(bugun); }}>Bugün</button>
          <button type="button" className={bas === haftaOnce && bit === bugun ? 'akt' : ''}
            onClick={() => { setBas(haftaOnce); setBit(bugun); }}>7 gün</button>
          <button type="button" className={bas === ayOnce && bit === bugun ? 'akt' : ''}
            onClick={() => { setBas(ayOnce); setBit(bugun); }}>30 gün</button>
        </div>

        <div className="sf-grup">
          <span className="sf-etiket">İstasyon</span>
          <AramaliSecici
            etiket="İstasyon" tumuEtiket="Tüm istasyonlar"
            ogeler={istOgeler} deger={istasyon} degisti={setIstasyon}
          />
          {istasyon && (
            <button type="button" className="temizle" onClick={() => setIstasyon('')}>
              ✕ Temizle
            </button>
          )}
        </div>
      </div>

      {/* Seçilen aralık verinin bittiği günü aşıyorsa sebebi yaz — boş tablo
          "satış olmadı" izlenimi verirdi. Gün-içi çekim 3 saatte bir koşuyor
          (.github/workflows/satis-gun-ici.yml), gün sonu kesin değeri gece
          mutabakat koşusunda yazılır. */}
      {veri?.sonVeriGun && bit > veri.sonVeriGun && (
        <div className="analiz-not" role="status">
          <b>{new Date(bit).toLocaleDateString('tr-TR')}</b> için henüz satış kaydı yok.
          Gün-içi çekim <b>3 saatte bir</b> koşuyor; en güncel veri{' '}
          <b>{new Date(veri.sonVeriGun).toLocaleDateString('tr-TR')}</b>.{' '}
          <button type="button" className="ic-baglanti"
            onClick={() => { setBas(veri.sonVeriGun!); setBit(veri.sonVeriGun!); }}>
            O günü göster
          </button>
        </div>
      )}

      {/* BUGÜN seçiliyse: veri var ama GÜN SÜRÜYOR. "Yarım gün" olduğunu
          söylemezsek kullanıcı düşük rakamı gerileme sanır (bugün 434 bin lt
          görünüyor, tam gün ~880 bin). */}
      {o && o.litre > 0 && bit === bugun && (
        <div className="analiz-not" role="status">
          <b>Gün sürüyor.</b> Bugünün rakamı <b>şu ana kadarki</b> satıştır — gün
          sonu değeri değil. Gün-içi çekim 3 saatte bir tazeleniyor; kesin gün
          kapanışı gece yazılır.
        </div>
      )}

      {o && o.litre > 0 && (
        <section className="kartlar" aria-label="Satış özeti">
          <Kart ad="Toplam Satış" deger={`${lt(o.litre)} lt`} alt={`${o.gun} gün · ${o.istasyon} istasyon`} />
          <Kart ad="Tutar" deger={tlKisa(o.tutar)} alt={tl(o.tutar)} />
          <Kart ad="Fiş" deger={o.fis.toLocaleString('tr-TR')}
            alt={o.fis > 0 ? `ort. ${(o.litre / o.fis).toFixed(1)} lt/fiş` : undefined} />
          {veri?.urunKirilim.slice(0, 3).map((u) => (
            <Kart key={u.urunId} ad={u.ad} deger={`${lt(u.litre)} lt`}
              alt={o.litre > 0 ? `%${((u.litre / o.litre) * 100).toFixed(0)} pay` : undefined} />
          ))}
        </section>
      )}

      {/* Tek istasyon seçiliyse TANK DETAYI — POL "Tank Durum Raporu" karşılığı */}
      {istasyon && veri && veri.tanklar.length > 0 && (
        <section className="uzlas-detay" aria-label="Tank son durumu">
          <div className="uzlas-detay-bas">
            <h3>Tank Son Durumu · {secili?.ad ?? istasyon}</h3>
            <span className="taze">
              {veri.tanklar[0].sonOlcum ? `ölçüm ${zamanFark(veri.tanklar[0].sonOlcum)}` : ''}
            </span>
          </div>
          <div className="tank-izgara">
            {veri.tanklar.map((t) => {
              const d = doluluk(t.mevcut, t.kapasite);
              const y = d === null ? 0 : Math.round(d * 100);
              return (
                <div key={t.tankNo} className={`tank-kart ${d !== null && d < 0.15 ? 'krit' : ''}`}>
                  <div className="tank-ust">
                    <span className="tank-no">Tank {t.tankNo}</span>
                    <span className="tank-urun">{t.urun ?? '—'}</span>
                  </div>
                  <div className="tank-deger mono">{lt(t.mevcut)} <span>/ {lt(t.kapasite)} lt</span></div>
                  {/* Doluluk çubuğu: renk TEK taşıyıcı değil, yüzde metni de var */}
                  <div className="tank-yol" role="img" aria-label={`%${y} dolu`}>
                    <div className={`tank-dolu ${d !== null && d < 0.15 ? 'krit' : ''}`} style={{ width: `${Math.min(100, y)}%` }} />
                  </div>
                  <div className="tank-alt">
                    %{y} dolu
                    {t.su != null && t.su > 0 && <span className="tank-su"> · su {lt(t.su)} lt</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Trend — aralık 2+ gün ise günlük satış eğrisi anlamlı */}
      {veri && veri.trend.length > 1 && (
        <CubukYatay
          veri={veri.trend}
          ad={(t) => new Date(t.gun).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
          deger={(t) => t.litre}
          baslik="Günlük satış"
          altBaslik={`${veri.aralik.bas} – ${veri.aralik.bit} · litre`}
          birim=" lt"
          limit={31}
        />
      )}

      <Tablo<Satir>
        anahtar="satis-tank"
        baslik={<>İstasyon Satışları{tekGun ? ` · ${new Date(bit).toLocaleDateString('tr-TR')}` : ''}</>}
        aciklama={
          <>
            Yalnız <b>motorin ve kurşunsuz 95</b> (LPG/AdBlue dahil değil — satışta
            da tankta da). Ürün grupları kolon olarak, litre. <b>Tank Son Durum</b>
            anlık doluluktur — seçili tarih aralığından bağımsız, en son ölçüm.
            Bir istasyon seçerseniz tank tank detay açılır.
          </>
        }
        kolonlar={kolonlar}
        satirlar={satirlar}
        satirAnahtar={(r) => r.istKod}
        satirTikla={(r) => setIstasyon(r.istKod === istasyon ? '' : r.istKod)}
        yukleniyor={yukleniyor && !satirlar.length}
        aramaEtiket="İstasyon / şehir / bölge ara…"
        kaydirmaEsigi={25}
        ilkGosterim={60}
        bosMesaj={yukleniyor ? 'Yükleniyor…' : 'Bu aralıkta satış kaydı yok.'}
        aktarGizle
        ustSag={
          <div className="mutabakat-indir">
            <button type="button" className="temizle" disabled={!satirlar.length} onClick={() => disaAktar(false)}>⭳ CSV</button>
            <button type="button" className="temizle" disabled={!satirlar.length} onClick={() => disaAktar(true)}>⭳ Excel</button>
          </div>
        }
      />
    </>
  );
}
