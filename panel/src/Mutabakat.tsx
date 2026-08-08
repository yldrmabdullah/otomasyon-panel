// A3 (ASIS POL) ↔ Logo mutabakatı sekmesi (Mevzuat modülü altında).
// POL'ün "A3 Aylık Satış Kontrol" raporunu Logo muhasebesiyle fatura bazında karşılaştırır.
// Kaynak: /api/mutabakat (core/panelSorgu.ts → mutabakat_a3). Salt-görüntüleme.
//
// Kıyas: fatura no anahtar; ürün / fatura satış litresi / çıkış tesisi uyuşuyor mu.
// Plaka/dorse KIYASA GİRMEZ (Logo'da tutulmuyor). Uyuşmayan satır sarı, iptal kırmızımsı.
import { useMemo, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Bos, useVeri } from './ortak.js';

interface DonemOzet {
  donem: string; ad: string | null; faturaSayisi: number; tamSayisi: number; sorunluSayisi: number;
  cekimZamani: string;
}
interface Ozet {
  donem: string; ad: string | null; faturaSayisi: number; tamSayisi: number; sorunluSayisi: number;
  a3ToplamLitre: number; logoToplamLitre: number; farkLitre: number; farkYuzde: number;
  epdkLimitAsim: boolean; cekimZamani: string;
}
interface Satir {
  faturaNo: string; irsaliyeNo: string | null; epdkKod: string | null; logoCariKod: string | null;
  istasyon: string | null;
  a3Urun: string | null; a3Litre: number | null; a3Tesis: string | null;
  logoUrun: string | null; logoLitre: number | null; logoTesis: string | null;
  logoIptal: boolean; durum: string; litreFark: number | null;
}
interface Veri { donemler: DonemOzet[]; secili: string | null; ozet: Ozet | null; satirlar: Satir[]; }

const DURUM_ETIKET: Record<string, { ad: string; sinif: string }> = {
  tam: { ad: 'Uyumlu', sinif: 'iyi' },
  litre_fark: { ad: 'Litre farkı', sinif: 'uyari' },
  urun_fark: { ad: 'Ürün farkı', sinif: 'uyari' },
  tesis_fark: { ad: 'Tesis farkı', sinif: 'uyari' },
  iptal: { ad: 'Logo\'da iptal', sinif: 'krit' },
  logoda_yok: { ad: 'Logo\'da yok', sinif: 'krit' },
};

const lt = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' lt';
const tesisKisa = (s: string | null) => (s ?? '').replace(/^DEP\/[^/]*\//, '').trim() || '—';

export function Mutabakat() {
  const [donem, setDonem] = useState<string | null>(null);
  const url = donem ? `/api/mutabakat?donem=${encodeURIComponent(donem)}` : '/api/mutabakat';
  const { veri, yukleniyor, hata } = useVeri<Veri>(url);
  // Sadece sorunluları göster filtresi.
  const [yalnizSorun, setYalnizSorun] = useState(false);

  const satirlar = useMemo(() => {
    const s = veri?.satirlar ?? [];
    return yalnizSorun ? s.filter((r) => r.durum !== 'tam') : s;
  }, [veri, yalnizSorun]);

  const kolonlar: TabloKolon<Satir>[] = useMemo(() => [
    {
      id: 'fatura', ad: 'Fatura No', varsayilan: true, sabit: true, sinif: 'mono',
      hucre: (r) => r.faturaNo, ara: (r) => r.faturaNo, sirala: (r) => r.faturaNo,
    },
    {
      id: 'irsaliye', ad: 'İrsaliye No', varsayilan: true, sinif: 'mono soluk',
      hucre: (r) => r.irsaliyeNo || <Bos />, ara: (r) => r.irsaliyeNo ?? '', sirala: (r) => r.irsaliyeNo ?? '',
    },
    {
      id: 'epdk', ad: 'EPDK Kodu', varsayilan: true, sinif: 'mono soluk',
      hucre: (r) => r.epdkKod || <Bos />, ara: (r) => r.epdkKod ?? '',
    },
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sinif: 'ad-hucre',
      hucre: (r) => r.istasyon || <Bos />, ara: (r) => r.istasyon ?? '', sirala: (r) => r.istasyon ?? '',
    },
    {
      id: 'a3urun', ad: 'A3 Ürün', varsayilan: true,
      hucre: (r) => r.a3Urun || <Bos />, ara: (r) => r.a3Urun ?? '',
    },
    {
      id: 'logourun', ad: 'Logo Ürün', varsayilan: true,
      hucre: (r) => r.logoUrun || <Bos />, ara: (r) => r.logoUrun ?? '',
      hucreSinif: (r) => (r.durum === 'urun_fark' ? 'uyari-metin' : undefined),
    },
    {
      id: 'a3litre', ad: 'A3 Litre', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => lt(r.a3Litre), sirala: (r) => r.a3Litre ?? 0,
    },
    {
      id: 'logolitre', ad: 'Logo Litre', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => lt(r.logoLitre), sirala: (r) => r.logoLitre ?? 0,
      hucreSinif: (r) => (r.durum === 'litre_fark' ? 'uyari-metin' : undefined),
    },
    {
      id: 'fark', ad: 'Fark', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => (r.litreFark == null || r.litreFark === 0 ? <Bos /> : (r.litreFark > 0 ? '+' : '') + r.litreFark.toLocaleString('tr-TR', { maximumFractionDigits: 0 })),
      sirala: (r) => Math.abs(r.litreFark ?? 0),
    },
    {
      id: 'a3tesis', ad: 'A3 Çıkış Tesisi', varsayilan: false, sinif: 'soluk',
      hucre: (r) => r.a3Tesis || <Bos />, ara: (r) => r.a3Tesis ?? '',
    },
    {
      id: 'logotesis', ad: 'Logo Çıkış Tesisi', varsayilan: true, sinif: 'soluk',
      hucre: (r) => tesisKisa(r.logoTesis), ara: (r) => r.logoTesis ?? '',
      hucreSinif: (r) => (r.durum === 'tesis_fark' ? 'uyari-metin' : undefined),
    },
    {
      id: 'durum', ad: 'Durum', varsayilan: true, sabit: true,
      hucre: (r) => {
        const d = DURUM_ETIKET[r.durum] ?? { ad: r.durum, sinif: '' };
        return <span className={`durum-rozet ${d.sinif}`}>{d.ad}</span>;
      },
      ara: (r) => DURUM_ETIKET[r.durum]?.ad ?? r.durum,
      sirala: (r) => (r.durum === 'tam' ? 1 : 0),
    },
  ], []);

  if (hata) return <div className="mevzuat-uyari"><b>Mutabakat verisi alınamadı.</b> {hata}</div>;

  if (!yukleniyor && (!veri || veri.donemler.length === 0)) {
    return (
      <div className="mevzuat-uyari">
        <b>Henüz mutabakat çekimi yapılmadı.</b> A3 raporu POL'den çekilip Logo ile karşılaştırıldıktan
        sonra dönemler burada listelenir. (Çekim aracı: <code>araclar/a3Kiyas.mts</code>.)
      </div>
    );
  }

  const ozet = veri?.ozet;

  return (
    <div className="mutabakat">
      {/* Dönem seçici + tazelik */}
      <div className="mutabakat-ust">
        <label className="mutabakat-donem-secim">
          <span>Dönem</span>
          <select
            value={ozet?.donem ?? ''}
            onChange={(e) => setDonem(e.target.value)}
            disabled={yukleniyor || !veri?.donemler.length}
          >
            {(veri?.donemler ?? []).map((d) => (
              <option key={d.donem} value={d.donem}>
                {d.ad ?? d.donem}{d.sorunluSayisi > 0 ? ` — ${d.sorunluSayisi} sorunlu` : ' — temiz'}
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

      {/* Özet kartlar — tıklanınca tabloyu filtreler */}
      {ozet && (
        <section className="kartlar" aria-label="Mutabakat özeti">
          <button
            type="button"
            className={`kart ${!yalnizSorun ? 'sec' : ''}`}
            aria-pressed={!yalnizSorun}
            onClick={() => setYalnizSorun(false)}
          >
            <div className="kart-deger">{ozet.faturaSayisi.toLocaleString('tr-TR')}</div>
            <div className="kart-baslik">Toplam Fatura</div>
          </button>
          <button
            type="button"
            className={`kart ${ozet.sorunluSayisi ? 'uyari' : 'iyi'} ${yalnizSorun ? 'sec' : ''}`}
            aria-pressed={yalnizSorun}
            onClick={() => setYalnizSorun(true)}
          >
            <div className="kart-deger">{ozet.sorunluSayisi.toLocaleString('tr-TR')}</div>
            <div className="kart-baslik">Uyuşmayan</div>
          </button>
          <div className="kart">
            <div className="kart-deger">
              %{(ozet.faturaSayisi ? (ozet.tamSayisi / ozet.faturaSayisi) * 100 : 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
            </div>
            <div className="kart-baslik">Uyum Oranı</div>
          </div>
          <div className={`kart ${ozet.epdkLimitAsim ? 'krit' : ''}`}>
            <div className="kart-deger">
              {ozet.farkLitre > 0 ? '+' : ''}{ozet.farkLitre.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
              <span className="kart-birim"> lt</span>
            </div>
            <div className="kart-baslik">
              Toplam Fark · %{ozet.farkYuzde.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
              {ozet.epdkLimitAsim && <span className="kart-alt-not krit-metin"> EPDK ±%3 aşıldı</span>}
            </div>
          </div>
        </section>
      )}

      {/* Kıyas tablosu — uyuşmayan satır sarı, iptal/eksik kırmızımsı */}
      <Tablo<Satir>
        anahtar="mutabakat"
        baslik={<>A3 ↔ Logo Fatura Kıyası{ozet?.ad ? ` · ${ozet.ad}` : ''}</>}
        aciklama={
          <>Fatura no eşleştirmesiyle; ürün, litre ve çıkış tesisi karşılaştırılır.{' '}
            <b>Plaka/dorse dahil değil</b> — Logo bu alanları tutmuyor.</>
        }
        kolonlar={kolonlar}
        satirlar={satirlar}
        satirAnahtar={(r) => r.faturaNo}
        satirSinif={(r) => (r.durum === 'tam' ? undefined : (r.durum === 'iptal' || r.durum === 'logoda_yok') ? 'satir-krit' : 'satir-uyari')}
        aramaEtiket="Fatura / istasyon / EPDK ara…"
        kaydirmaEsigi={20}
        ilkGosterim={60}
        bosMesaj={yukleniyor ? 'Yükleniyor…' : (yalnizSorun ? 'Bu dönemde uyuşmayan kayıt yok — hepsi tutuyor.' : 'Kayıt yok.')}
      />
    </div>
  );
}
