// A3 (ASIS POL) ↔ Logo mutabakatı sekmesi (Mevzuat modülü altında).
// POL'ün "A3 Aylık Satış Kontrol" raporunu Logo muhasebesiyle fatura bazında karşılaştırır.
// Kaynak: /api/mutabakat (core/panelSorgu.ts → mutabakat_a3). Salt-görüntüleme.
//
// Kıyas: fatura no anahtar; ürün / fatura satış litresi / çıkış tesisi uyuşuyor mu.
// Plaka/dorse KIYASA GİRMEZ (Logo'da tutulmuyor). Uyuşmayan satır sarı, iptal kırmızımsı.
import { useMemo, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Bos, useVeri } from './ortak.js';
import { csvIndir, xlsIndir } from './disaAktar.js';

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

// Ürün grubu kanonik (a3Kiyas ile aynı mantık) — özet toplamları için.
const URUN_AD: Record<string, string> = {
  benzin: 'Kurşunsuz Benzin', motorin: 'Motorin', fueloil: 'Fuel Oil',
  gazyagi: 'Gazyağı', kalorifer: 'Kalorifer', belirsiz: 'Diğer',
};
function urunKanon(s: string | null | undefined): string {
  const t = String(s ?? '').toLocaleLowerCase('tr');
  if (/benzin|95\s*oktan|kur[şs]unsuz/.test(t)) return 'benzin';
  if (/motorin|mazot|d[ií]zel/.test(t)) return 'motorin';
  if (/fuel\s*oil|f\.?oil/.test(t)) return 'fueloil';
  if (/gaz\s*ya[ğg]/.test(t)) return 'gazyagi';
  if (/kalorifer|kalyak/.test(t)) return 'kalorifer';
  return 'belirsiz';
}
const litreTam = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

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

  // Ürün grubu kırılımında toplam (A3 litre / Logo litre / fark) — TÜM dönem satırları
  // üzerinden (filtreden bağımsız; mutabakat toplamı hep tam evren olmalı).
  const urunToplam = useMemo(() => {
    const tum = veri?.satirlar ?? [];
    const grup = new Map<string, { a3: number; logo: number }>();
    for (const r of tum) {
      const k = urunKanon(r.a3Urun ?? r.logoUrun);
      const g = grup.get(k) ?? { a3: 0, logo: 0 };
      g.a3 += r.a3Litre ?? 0;
      g.logo += r.logoLitre ?? 0;
      grup.set(k, g);
    }
    const satir = [...grup.entries()]
      .map(([k, g]) => ({ ad: URUN_AD[k] ?? k, a3: g.a3, logo: g.logo, fark: g.logo - g.a3 }))
      .sort((a, b) => b.a3 - a.a3);
    const genel = satir.reduce((a, x) => ({ a3: a.a3 + x.a3, logo: a.logo + x.logo }), { a3: 0, logo: 0 });
    return { satir, genel: { ...genel, fark: genel.logo - genel.a3 } };
  }, [veri]);

  const disaAktarSatir = () =>
    satirlar.map((r) => [
      r.faturaNo, r.irsaliyeNo ?? '', r.epdkKod ?? '', r.istasyon ?? '',
      r.a3Urun ?? '', r.logoUrun ?? '', litreTam(r.a3Litre ?? 0), r.logoLitre == null ? '' : litreTam(r.logoLitre),
      r.litreFark == null ? '' : litreTam(r.litreFark), r.a3Tesis ?? '', r.logoTesis ?? '',
      DURUM_ETIKET[r.durum]?.ad ?? r.durum,
    ]);
  const disaAktarBaslik = ['Fatura No', 'İrsaliye No', 'EPDK Kodu', 'İstasyon', 'A3 Ürün', 'Logo Ürün', 'A3 Litre', 'Logo Litre', 'Fark', 'A3 Tesis', 'Logo Tesis', 'Durum'];
  // İndirmeye ürün grubu toplamlarını da ekle (alt özet).
  const disaAktarOzet = () => [
    ...urunToplam.satir.map((g) => [`TOPLAM · ${g.ad}`, '', '', '', '', '', litreTam(g.a3), litreTam(g.logo), litreTam(g.fark), '', '', '']),
    ['GENEL TOPLAM', '', '', '', '', '', litreTam(urunToplam.genel.a3), litreTam(urunToplam.genel.logo), litreTam(urunToplam.genel.fark), '', '', ''],
  ];
  const dosyaAd = `a3-logo-mutabakat-${veri?.ozet?.donem ?? 'donem'}`;

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
        aktarGizle
        ustSag={
          <div className="mutabakat-indir">
            <button type="button" className="cikis-btn" disabled={!satirlar.length}
              onClick={() => csvIndir(dosyaAd, disaAktarBaslik, [...disaAktarSatir(), [], ...disaAktarOzet()])}>
              CSV
            </button>
            <button type="button" className="cikis-btn" disabled={!satirlar.length}
              onClick={() => xlsIndir(dosyaAd, disaAktarBaslik, disaAktarSatir(), disaAktarOzet())}>
              Excel
            </button>
          </div>
        }
      />

      {/* Ürün grubu kırılımında toplam — tablonun altında (footer yerine ayrı blok) */}
      {ozet && urunToplam.satir.length > 0 && (
        <section className="urun-toplam" aria-label="Ürün grubu toplamları">
          <h3 className="urun-toplam-baslik">Ürün Grubu Toplamları · {ozet.ad}</h3>
          <table className="urun-toplam-tablo">
            <thead>
              <tr>
                <th>Ürün Grubu</th>
                <th className="sag">A3 (ASIS) Litre</th>
                <th className="sag">Logo Litre</th>
                <th className="sag">Fark</th>
                <th className="sag">Fark %</th>
              </tr>
            </thead>
            <tbody>
              {urunToplam.satir.map((g) => {
                const pct = g.a3 ? (g.fark / g.a3) * 100 : 0;
                const asim = Math.abs(pct) > 3;
                return (
                  <tr key={g.ad}>
                    <td>{g.ad}</td>
                    <td className="sag mono">{litreTam(g.a3)}</td>
                    <td className="sag mono">{litreTam(g.logo)}</td>
                    <td className={`sag mono ${g.fark !== 0 ? 'uyari-metin' : ''}`}>{g.fark > 0 ? '+' : ''}{litreTam(g.fark)}</td>
                    <td className={`sag mono ${asim ? 'krit-metin' : ''}`}>%{pct.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="urun-toplam-genel">
                <td>GENEL TOPLAM</td>
                <td className="sag mono">{litreTam(urunToplam.genel.a3)}</td>
                <td className="sag mono">{litreTam(urunToplam.genel.logo)}</td>
                <td className="sag mono">{urunToplam.genel.fark > 0 ? '+' : ''}{litreTam(urunToplam.genel.fark)}</td>
                <td className="sag mono">
                  %{(urunToplam.genel.a3 ? (urunToplam.genel.fark / urunToplam.genel.a3) * 100 : 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </div>
  );
}
