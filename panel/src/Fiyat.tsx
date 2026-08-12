// Bayi Fiyat Takibi — POL A5 (bayi pompa fiyatı) ↔ parkoil.com.tr (PO) il referansı.
// Bayimiz referansın ÜSTÜNDE satıyorsa "pahalı" (REKABET göstergesi; EPDK yasal tavan DEĞİL).
// Kaynak: /api/fiyat. Salt-görüntüleme.
import { useMemo, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Bos, useVeri } from './ortak.js';
import { csvIndir, xlsIndir } from './disaAktar.js';

interface GunOzet { gun: string; kayit: number; pahali: number; }
interface Ozet { gun: string; kayit: number; pahali: number; refGuncelleme: string | null; refYas: number | null; cekim: string; }
interface Satir {
  epdk: string; istKod: string | null; istasyon: string | null; bolge: string | null; il: string | null;
  urun: string; urunHam: string | null;
  bayiFiyat: number; refFiyat: number | null; fark: number | null; durum: string;
}
interface Veri { gunler: GunOzet[]; secili: string | null; ozet: Ozet | null; satirlar: Satir[]; }

const DURUM: Record<string, { ad: string; sinif: string }> = {
  uygun: { ad: 'Uygun', sinif: 'iyi' },
  pahali: { ad: 'Referans üstü', sinif: 'krit' },
  ref_yok: { ad: 'Referans yok', sinif: 'soluk' },
};
const URUN_AD: Record<string, string> = { benzin: 'Benzin', motorin: 'Motorin' };
const tl = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

export function Fiyat() {
  const [gun, setGun] = useState<string | null>(null);
  const [yalnizPahali, setYalnizPahali] = useState(false);
  const { veri, yukleniyor, hata } = useVeri<Veri>(`/api/fiyat${gun ? `?gun=${encodeURIComponent(gun)}` : ''}`);

  const satirlar = useMemo(() => {
    const s = veri?.satirlar ?? [];
    return yalnizPahali ? s.filter((r) => r.durum === 'pahali') : s;
  }, [veri, yalnizPahali]);

  const kolonlar: TabloKolon<Satir>[] = useMemo(() => [
    {
      id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      hucre: (r) => r.istasyon || r.epdk, ara: (r) => `${r.istasyon ?? ''} ${r.epdk}`, sirala: (r) => r.istasyon ?? '',
    },
    { id: 'il', ad: 'İl', varsayilan: true, hucre: (r) => r.il || <Bos />, ara: (r) => r.il ?? '', sirala: (r) => r.il ?? '' },
    { id: 'bolge', ad: 'Bölge', varsayilan: false, sinif: 'soluk', hucre: (r) => r.bolge || <Bos />, ara: (r) => r.bolge ?? '' },
    {
      id: 'urun', ad: 'Ürün', varsayilan: true, sirala: (r) => r.urun,
      hucre: (r) => URUN_AD[r.urun] ?? r.urun, ara: (r) => `${r.urun} ${r.urunHam ?? ''}`,
    },
    { id: 'bayifiyat', ad: 'Bayi Fiyatı', varsayilan: true, sinif: 'sag mono', hucre: (r) => tl(r.bayiFiyat), sirala: (r) => r.bayiFiyat },
    { id: 'reffiyat', ad: 'Referans (PO)', varsayilan: true, sinif: 'sag mono soluk', hucre: (r) => tl(r.refFiyat), sirala: (r) => r.refFiyat ?? 0 },
    {
      id: 'fark', ad: 'Fark', varsayilan: true, sinif: 'sag mono', sirala: (r) => r.fark ?? 0,
      hucre: (r) => r.fark == null ? <Bos /> : (r.fark > 0 ? '+' : '') + r.fark.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      hucreSinif: (r) => (r.durum === 'pahali' ? 'krit' : undefined),
    },
    {
      id: 'durum', ad: 'Durum', varsayilan: true, sabit: true, sirala: (r) => (r.durum === 'pahali' ? 0 : 1),
      hucre: (r) => { const d = DURUM[r.durum] ?? { ad: r.durum, sinif: '' }; return <span className={`durum-rozet ${d.sinif}`}>{d.ad}</span>; },
      ara: (r) => DURUM[r.durum]?.ad ?? r.durum,
    },
  ], []);

  if (hata) return <div className="mevzuat-uyari"><b>Fiyat verisi alınamadı.</b> {hata}</div>;
  if (!yukleniyor && (!veri || veri.gunler.length === 0)) {
    return (
      <div className="mevzuat-uyari">
        <b>Henüz fiyat çekimi yapılmadı.</b> POL A5 raporu çekilip parkoil.com.tr referans
        fiyatıyla karşılaştırıldıktan sonra burada listelenir. (Araç: <code>araclar/fiyatKiyas.mts</code>.)
      </div>
    );
  }
  const ozet = veri?.ozet;

  function disaAktar(xls: boolean) {
    const baslik = ['Bayi', 'EPDK', 'İl', 'Bölge', 'Ürün', 'Bayi Fiyatı', 'Referans (PO)', 'Fark', 'Durum'];
    const satir = satirlar.map((r) => [
      r.istasyon ?? '', r.epdk, r.il ?? '', r.bolge ?? '', URUN_AD[r.urun] ?? r.urun,
      r.bayiFiyat.toFixed(2), r.refFiyat == null ? '' : r.refFiyat.toFixed(2),
      r.fark == null ? '' : r.fark.toFixed(2), DURUM[r.durum]?.ad ?? r.durum,
    ]);
    const ad = `bayi-fiyat-${ozet?.gun ?? 'gun'}`;
    if (xls) xlsIndir(ad, baslik, satir); else csvIndir(ad, baslik, satir);
  }

  return (
    <div className="fiyat">
      <div className="mutabakat-ust">
        <label className="mutabakat-donem-secim">
          <span>Gün</span>
          <select value={ozet?.gun ?? ''} onChange={(e) => setGun(e.target.value)} disabled={yukleniyor || !veri?.gunler.length}>
            {(veri?.gunler ?? []).map((g) => (
              <option key={g.gun} value={g.gun}>
                {new Date(g.gun).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                {g.pahali > 0 ? ` — ${g.pahali} referans üstü` : ' — temiz'}
              </option>
            ))}
          </select>
        </label>
        {ozet?.refGuncelleme && (
          <span className={`taze ${ozet.refYas != null && ozet.refYas > 3 ? 'krit-metin' : ''}`}>
            Referans fiyat: {new Date(ozet.refGuncelleme).toLocaleDateString('tr-TR')}
            {ozet.refYas != null && ozet.refYas > 3 ? ` (${ozet.refYas} gün eski!)` : ''}
          </span>
        )}
      </div>

      {ozet && (
        <section className="kartlar" aria-label="Fiyat özeti">
          <button type="button" className={`kart ${!yalnizPahali ? 'sec' : ''}`} aria-pressed={!yalnizPahali} onClick={() => setYalnizPahali(false)}>
            <div className="kart-deger">{ozet.kayit}</div>
            <div className="kart-baslik">Fiyat Kaydı</div>
          </button>
          <button type="button" className={`kart ${ozet.pahali ? 'krit' : 'iyi'} ${yalnizPahali ? 'sec' : ''}`} aria-pressed={yalnizPahali} onClick={() => setYalnizPahali(true)}>
            <div className="kart-deger">{ozet.pahali}</div>
            <div className="kart-baslik">Referans Üstü</div>
          </button>
          <div className="kart">
            <div className="kart-deger">
              %{(ozet.kayit ? ((ozet.kayit - ozet.pahali) / ozet.kayit) * 100 : 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
            </div>
            <div className="kart-baslik">Uyum Oranı</div>
          </div>
        </section>
      )}

      <Tablo<Satir>
        anahtar="fiyat"
        baslik={<>Bayi Fiyat Takibi{ozet?.gun ? ` · ${new Date(ozet.gun).toLocaleDateString('tr-TR')}` : ''}</>}
        aciklama={<>Bayi pompa fiyatı (POL A5) ↔ <b>parkoil.com.tr</b> il referans fiyatı (Petrol Ofisi).
          Referansın <b>0,20 ₺</b> üstünde satan bayi işaretlenir — rekabet göstergesi, EPDK yasal tavan değil.</>}
        kolonlar={kolonlar}
        satirlar={satirlar}
        satirAnahtar={(r, i) => `${r.epdk}-${r.istKod}-${r.urun}-${i}`}
        satirSinif={(r) => (r.durum === 'pahali' ? 'satir-krit' : undefined)}
        yukleniyor={yukleniyor && !satirlar.length}
        aramaEtiket="Bayi / il / ürün ara…"
        kaydirmaEsigi={25}
        ilkGosterim={80}
        bosMesaj={yukleniyor ? 'Yükleniyor…' : (yalnizPahali ? 'Bu günde referans üstü satan bayi yok.' : 'Kayıt yok.')}
        aktarGizle
        ustSag={
          <div className="mutabakat-indir">
            <button type="button" className="temizle" disabled={!satirlar.length} onClick={() => disaAktar(false)}>⭳ CSV</button>
            <button type="button" className="temizle" disabled={!satirlar.length} onClick={() => disaAktar(true)}>⭳ Excel</button>
          </div>
        }
      />
    </div>
  );
}
