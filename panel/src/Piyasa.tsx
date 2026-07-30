// Piyasa İstihbarat modülü — EPDK resmi verisiyle tüm Türkiye akaryakıt piyasası.
// Dağıtıcılar, bayi dağılımı, il dağılımı, bayi transferleri. Kaynak: /api/piyasa.
import { useEffect, useMemo, useReducer, useState, type ReactElement } from 'react';
import { KolonSecici, useKolonlar, type KolonTanim } from './KolonSecici.js';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Sekmeler } from './Sekme.js';
import { CubukYatay, IsiIzgara } from './Grafik.js';
import { Harita } from './Harita.js';
import { Bos, ModulBar, TazelikSerit, trTarih, useVeri } from './ortak.js';
import { csvIndir } from './disaAktar.js';
import type { Tazelik } from './tipler.js';

// Bayi tablosu kolonları — varsayılan görünür + seçilebilir gizli.
const BAYI_KOLONLARI: KolonTanim[] = [
  { id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true },
  { id: 'dagitici', ad: 'Dağıtıcı', varsayilan: true },
  { id: 'il', ad: 'İl', varsayilan: true },
  { id: 'ilce', ad: 'İlçe', varsayilan: false },
  { id: 'durum', ad: 'Durum', varsayilan: true },
  { id: 'kategori', ad: 'Kategori', varsayilan: false },
  { id: 'epdk', ad: 'EPDK No', varsayilan: false },
  // "Bize geliş" = bayinin bizimle sözleşme imzaladığı gün (EPDK
  // dagiticiIleYapilanSozlesmeBaslangicTarihi). 167 aktif bayimizde %100 dolu.
  // ⚠️ RAKİP bayilerde bu tarih RAKİPLE yapılan sözleşmedir — kolon adı bu yüzden
  // "Sözleşme Başl." (nötr); "Bize geliş" yalnız kendi bayilerimiz için doğru olur.
  { id: 'sozlesmeBas', ad: 'Sözleşme Başl.', varsayilan: false },
  { id: 'sozlesme', ad: 'Sözleşme Bitiş', varsayilan: false },
];

interface Ozet {
  dagitici_sayisi: number; toplam_bayi: number; aktif_bayi: number;
  snapshot_gun_sayisi: number; aylik_transfer: number;
}
interface DagiticiBayi { dagitim_sirketi: string; n: string }
interface IlDagilim { il: string; n: string }
interface Transfer {
  bayi_lisans_no: string; lisans_sahibi: string | null; il: string | null;
  tip: string; eski_deger: string | null; yeni_deger: string | null; tespit_gun: string;
}
interface SozlesmeBitecek {
  bayi_lisans_no: string; lisans_sahibi: string | null; dagitim_sirketi: string | null;
  il: string | null; sozlesme_bitis: string; bizim: boolean;
}
interface BolgeselSatir { il: string; toplam: string; bizim: string; pay: string }
interface BeyazAlan { il: string; toplam: string }
interface Kaybedilen { ad: string; epdk_kod: string; sehir: string | null; rakip: string; il: string | null }

interface PiyasaVeri {
  uretim: string; ozet: Ozet;
  dagiticiBayiDagilim: DagiticiBayi[]; ilDagilim: IlDagilim[]; transferler: Transfer[];
  sozlesmeBitecek: SozlesmeBitecek[]; bolgesel: BolgeselSatir[]; beyazAlan: BeyazAlan[];
  /** Harita: TÜM 81 il (bolgesel yalnız bizim bayimiz olanları verir). */
  haritaIl?: { il: string; toplam: string; bizim: string }[];
  kaybedilen: Kaybedilen[];
  /** Eski sürüm API'den gelmeyebilir → opsiyonel. */
  tazelik?: Tazelik[];
}

interface Bayi {
  bayi_lisans_no: string; lisans_sahibi: string | null; dagitim_sirketi: string | null;
  il: string | null; ilce: string | null; lisans_durumu: string | null;
  kategori: string | null; sozlesme_baslangic: string | null; sozlesme_bitis: string | null;
}
// Sıralanabilir alanlar. Sıralama/filtreleme/arama SUNUCUDA yapılır
// (core/panelSorgu.ts, whitelist'li ORDER BY) — client'ta 30 bin satır
// tutulmadığı için Intl.Collator ve _ara ön-normalizasyonuna gerek kalmadı.
type SiralamaAlan =
  | 'lisans_sahibi' | 'dagitim_sirketi' | 'il' | 'ilce'
  | 'lisans_durumu' | 'kategori' | 'bayi_lisans_no' | 'sozlesme_baslangic' | 'sozlesme_bitis';

function gunFark(iso: string): string {
  const g = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (g <= 0) return 'bugün';
  if (g === 1) return 'dün';
  return `${g} gün önce`;
}

// Parkoil'in EPDK'daki tüzel kimliği — "BİZ" perspektifi (bkz docs/bilgi/piyasa-istihbarat.md).
const BIZ = 'TURGUT DAĞITIM ENERJİ ANONİM ŞİRKETİ';

const TRANSFER_ETIKET: Record<string, { metin: string; sinif: string }> = {
  dagitici_degisti: { metin: 'TRANSFER', sinif: 'uyari' },
  yeni_bayi: { metin: 'YENİ BAYİ', sinif: 'iyi-r' },
  durum_degisti: { metin: 'DURUM', sinif: 'uyari' },
  ayrildi: { metin: 'AYRILDI', sinif: 'krit' },
};

const SAYFA_BOYUT = 50;

/** Bayi tablosu sorgusu — 8 ayrı useState yerine tek mantıksal birim.
 *  Filtre değişimi `sayfa: 1`'i AYNI dispatch'te sıfırlar; ayrı bir
 *  useEffect(setSayfa) ekstra render turu + tam yeniden sıralama tetikliyordu. */
interface Sorgu {
  q: string; il: string; dagitici: string; durum: string;
  sadeceBiz: boolean; sirala: SiralamaAlan; artan: boolean; sayfa: number;
}
type Eylem =
  | { tip: 'filtre'; deger: Partial<Sorgu> }
  | { tip: 'sirala'; alan: SiralamaAlan }
  | { tip: 'sayfa'; deger: number };

const SORGU_BAS: Sorgu = {
  q: '', il: '', dagitici: '', durum: '',
  sadeceBiz: false, sirala: 'lisans_sahibi', artan: true, sayfa: 1,
};

function sorguReducer(s: Sorgu, e: Eylem): Sorgu {
  switch (e.tip) {
    case 'filtre':
      return { ...s, ...e.deger, sayfa: 1 };
    case 'sirala':
      return s.sirala === e.alan
        ? { ...s, artan: !s.artan, sayfa: 1 }
        : { ...s, sirala: e.alan, artan: true, sayfa: 1 };
    case 'sayfa':
      return { ...s, sayfa: e.deger };
  }
}

/** Aramayı geciktir — debounce'suz her karakter tam tarama+sıralama tetikliyordu. */
function useGecikmeli<T>(deger: T, ms: number): T {
  const [g, setG] = useState(deger);
  useEffect(() => {
    const t = setTimeout(() => setG(deger), ms);
    return () => clearTimeout(t);
  }, [deger, ms]);
  return g;
}

function piyasaDogrula(d: unknown): PiyasaVeri {
  const x = d as PiyasaVeri;
  if (!x?.ozet || !Array.isArray(x?.dagiticiBayiDagilim))
    throw new Error('Piyasa verisi beklenen biçimde değil (sunucu şeması değişmiş olabilir).');
  return x;
}

export function Piyasa() {
  const { veri, hata, yukleniyor, yenile } = useVeri<PiyasaVeri>('/api/piyasa', piyasaDogrula);


  // Bayi tablosu — SUNUCU TARAFLI sayfalama.
  // Eskiden 30.303 satırın tamamı indirilip client'ta filtrelenip sıralanıyordu:
  // 8.88 MB ve sunucuda 26.5 sn (Vercel ücretsiz plan limiti 10 sn → timeout).
  // Artık her filtre/sıra/sayfa değişiminde 50 satır çekilir (~103 ms).
  const [sayfaliBayiler, setSayfaliBayiler] = useState<Bayi[] | null>(null);
  const [toplamEslesen, setToplamEslesen] = useState(0);
  const [bayiHata, setBayiHata] = useState<string | null>(null);
  const [bayiYukleniyor, setBayiYukleniyor] = useState(true);
  const [sorgu, dispatch] = useReducer(sorguReducer, SORGU_BAS);
  const q = useGecikmeli(sorgu.q, 300);
  const kol = useKolonlar('bayiler', BAYI_KOLONLARI);

  // Filtre açılırları — tüm bayiyi indirmeden, ayrı hafif çağrı.
  const [secenekler, setSecenekler] = useState<{ iller: string[]; dagiticilar: string[]; toplamBayi: number }>(
    { iller: [], dagiticilar: [], toplamBayi: 0 },
  );

  // Sözleşme bölümü: kapsam filtresi + kademeli gösterim (sessiz kesme YOK)
  const [sozlesmeKapsam, setSozlesmeKapsam] = useState<'hepsi' | 'bizim' | 'rakip'>('hepsi');

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/bayiler?secenekler=1', { signal: ac.signal })
      .then((r) => (r.status === 401 ? (location.reload(), null) : r.ok ? r.json() : null))
      .then((d) => { if (d) setSecenekler(d); })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  // CSV: bu tablo SUNUCU tarafli sayfalamali (client'ta yalnız 50 satır var).
  // Ortak Tablo'nun butonu burada kullanılamaz — yarım dosya inerdi.
  // Bu yüzden aktif filtreyle TÜM eşleşen satırlar sunucudan sayfa sayfa çekilir.
  const [aktarPmi, setAktarPmi] = useState(false);
  // 30.308 satır ~70 sn sürüyor (200'lük sayfalar). Sessiz bekleme kullanıcıyı
  // "takıldı mı?" diye düşündürüyordu → çekilen satır sayısı butonda gösterilir.
  const [aktarIlerleme, setAktarIlerleme] = useState(0);

  async function bayiCsvAktar() {
    setAktarPmi(true);
    try {
      const BOYUT = 200; // core/panelSorgu.ts'te üst sınır
      const tumu: Bayi[] = [];
      setAktarIlerleme(0);
      for (let sy = 1; ; sy++) {
        const p = new URLSearchParams({
          sirala: sorgu.sirala,
          artan: sorgu.artan ? '1' : '0',
          sayfa: String(sy),
          boyut: String(BOYUT),
        });
        if (q.trim()) p.set('q', q.trim());
        if (sorgu.il) p.set('il', sorgu.il);
        if (sorgu.dagitici) p.set('dagitici', sorgu.dagitici);
        if (sorgu.durum) p.set('durum', sorgu.durum);
        if (sorgu.sadeceBiz) p.set('sadeceBiz', '1');
        const r = await fetch(`/api/bayiler?${p}`);
        if (!r.ok) throw new Error(`Sunucu ${r.status}`);
        const d = await r.json();
        tumu.push(...(d.satirlar ?? []));
        setAktarIlerleme(tumu.length);
        // Son sayfa: dönen satır sayısı boyuttan az ya da toplam aşıldı
        if ((d.satirlar?.length ?? 0) < BOYUT || tumu.length >= (d.toplam ?? 0)) break;
        if (sy > 200) break; // güvenlik: 40.000 satır tavanı
      }
      const gorunurKolon = BAYI_KOLONLARI.filter((k) => kol.gorunurMu(k.id));
      const basliklar = gorunurKolon.map((k) => k.ad);
      const satirlar = tumu.map((b) =>
        gorunurKolon.map((k) => {
          switch (k.id) {
            case 'bayi': return b.lisans_sahibi ?? '';
            case 'dagitici': return b.dagitim_sirketi ?? '';
            case 'il': return b.il ?? '';
            case 'ilce': return b.ilce ?? '';
            case 'durum': return b.lisans_durumu ?? '';
            case 'kategori': return b.kategori ?? '';
            case 'epdk': return b.bayi_lisans_no;
            case 'sozlesmeBas': return b.sozlesme_baslangic ? trTarih(b.sozlesme_baslangic) : '';
            case 'sozlesme': return b.sozlesme_bitis ? trTarih(b.sozlesme_bitis) : '';
            default: return '';
          }
        }),
      );
      csvIndir(sorgu.sadeceBiz ? 'parkoil-bayileri' : 'tum-bayiler', basliklar, satirlar);
    } catch (e) {
      setBayiHata(`CSV aktarılamadı: ${e instanceof Error ? e.message : e}`);
    } finally {
      setAktarPmi(false);
      setAktarIlerleme(0);
    }
  }

  const toplamSayfa = Math.max(1, Math.ceil(toplamEslesen / SAYFA_BOYUT));
  const sayfa = Math.min(sorgu.sayfa, toplamSayfa);

  // Sorgu değişince sunucudan çek. Hata YUTULMAZ: "0 / 0" ile "sistem bozuk"
  // ayırt edilemiyordu — iç operasyon panelinde kabul edilemez.
  useEffect(() => {
    const ac = new AbortController();
    const p = new URLSearchParams({
      sirala: sorgu.sirala,
      artan: sorgu.artan ? '1' : '0',
      sayfa: String(sorgu.sayfa),
      boyut: String(SAYFA_BOYUT),
    });
    if (q.trim()) p.set('q', q.trim());
    if (sorgu.il) p.set('il', sorgu.il);
    if (sorgu.dagitici) p.set('dagitici', sorgu.dagitici);
    if (sorgu.durum) p.set('durum', sorgu.durum);
    if (sorgu.sadeceBiz) p.set('sadeceBiz', '1');

    setBayiYukleniyor(true);
    fetch(`/api/bayiler?${p}`, { signal: ac.signal })
      .then(async (r) => {
        if (r.status === 401) { location.reload(); return null; }
        if (!r.ok) throw new Error(`Bayi listesi alınamadı (${r.status} ${r.statusText})`);
        const d = await r.json();
        if (!Array.isArray(d?.satirlar)) throw new Error('Bayi listesi beklenen biçimde değil.');
        return d as { satirlar: Bayi[]; toplam: number };
      })
      .then((d) => {
        if (!d) return;
        setSayfaliBayiler(d.satirlar);
        setToplamEslesen(d.toplam);
        setBayiHata(null);
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === 'AbortError') return;
        setBayiHata(e instanceof Error ? e.message : String(e));
        setSayfaliBayiler([]);
        setToplamEslesen(0);
      })
      .finally(() => setBayiYukleniyor(false));
    return () => ac.abort();
  }, [q, sorgu.il, sorgu.dagitici, sorgu.durum, sorgu.sadeceBiz, sorgu.sirala, sorgu.artan, sorgu.sayfa]);

  const siraYon = (alan: SiralamaAlan): 'ascending' | 'descending' | 'none' =>
    sorgu.sirala === alan ? (sorgu.artan ? 'ascending' : 'descending') : 'none';
  const siraOk = (alan: SiralamaAlan) => (sorgu.sirala === alan ? (sorgu.artan ? '▲' : '▼') : '');

  /** Sıralanabilir başlık — gerçek buton, klavyeyle erişilebilir, aria-sort'lu.
   *  Önceden tıklanabilir <th> vardı: 30 bin satırlık tablo klavyeyle
   *  sıralanamıyordu ve yön yalnız ▲/▼ karakteriyle (görsel) belirtiliyordu. */
  /* ⚠️ JSX ELEMENTİ OLARAK DEĞİL, FONKSİYON ÇAĞRISI olarak kullanılır:
     `{SiraBas({...})}` — `<SiraBas .../>` DEĞİL.
     Sebebi: bileşen Piyasa gövdesinde tanımlı olduğu için her render'da yeni
     fonksiyon referansı oluyor; JSX elementi olarak kullanılınca React bunu
     YENİ BİR TİP sayıp 8 <th>'yi unmount/mount ediyor ve sıralama başlığına
     odaklanmış klavye kullanıcısı odağını kaybediyordu. Çağrı olarak
     kullanıldığında yeni tip oluşmaz, DOM korunur. */
  const SiraBas = ({ alan, ad, sag }: { alan: SiralamaAlan; ad: string; sag?: boolean }) => (
    <th key={alan} scope="col" className={`sirali ${sag ? 'sag' : ''}`} aria-sort={siraYon(alan)}>
      <button type="button" className="th-btn" onClick={() => dispatch({ tip: 'sirala', alan })}>
        {ad}
        <span aria-hidden="true">{siraOk(alan)}</span>
      </button>
    </th>
  );

  // Sözleşme bitecekler: kapsama göre süz (bizim / rakip / tümü).
  // Kademeli gösterim ve arama Tablo bileşeninin içinde.
  const sozlesmeFiltreli = useMemo(() => {
    const liste = veri?.sozlesmeBitecek ?? [];
    if (sozlesmeKapsam === 'bizim') return liste.filter((s) => s.bizim);
    if (sozlesmeKapsam === 'rakip') return liste.filter((s) => !s.bizim);
    return liste;
  }, [veri, sozlesmeKapsam]);

  // Ölçekleme ve dağıtıcı araması artık CubukYatay bileşeninin içinde
  // (enBuyukBayi / filtreliDagitici burada gereksizdi).
  const bizim = useMemo(() => {
    const i = veri?.dagiticiBayiDagilim.findIndex((d) => d.dagitim_sirketi === BIZ) ?? -1;
    if (i < 0) return null;
    return { sayi: Number(veri!.dagiticiBayiDagilim[i].n), sira: i + 1 };
  }, [veri]);

  // ── Tablo kolon tanımları (hücre + sıralama + arama tek yerde) ──────────────

  // İLK KOLON = ad kolonu (`ad-hucre`) olmak ZORUNDA: mobilde CSS
  // `th:first-child` + `td.ad-hucre` çiftini sabitliyor. Rozet kolonunu başa
  // koymak başlıkta "Tip", gövdede "Bayi" sabitleyip hizayı bozuyordu.
  const TRANSFER_KOLONLARI = useMemo<TabloKolon<Transfer>[]>(() => [
    {
      id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      sirala: (t) => t.lisans_sahibi ?? t.bayi_lisans_no,
      ara: (t) => `${t.lisans_sahibi ?? ''} ${t.bayi_lisans_no}`,
      hucre: (t) => t.lisans_sahibi ?? t.bayi_lisans_no,
    },
    {
      id: 'tip', ad: 'Tip', varsayilan: true,
      sirala: (t) => TRANSFER_ETIKET[t.tip]?.metin ?? t.tip,
      ara: (t) => TRANSFER_ETIKET[t.tip]?.metin ?? t.tip,
      hucre: (t) => {
        const e = TRANSFER_ETIKET[t.tip] ?? { metin: t.tip, sinif: 'uyari' };
        return <span className={`rozet ${e.sinif}`}>{e.metin}</span>;
      },
    },
    {
      id: 'il', ad: 'İl', varsayilan: true, sinif: 'soluk',
      sirala: (t) => t.il ?? '', ara: (t) => t.il ?? '',
      hucre: (t) => t.il ?? <Bos />,
    },
    {
      id: 'eski', ad: 'Eski', varsayilan: true, sinif: 'soluk',
      sirala: (t) => t.eski_deger ?? '', ara: (t) => t.eski_deger ?? '',
      hucre: (t) => t.eski_deger ?? <Bos />,
    },
    {
      id: 'yeni', ad: 'Yeni', varsayilan: true,
      sirala: (t) => t.yeni_deger ?? '', ara: (t) => t.yeni_deger ?? '',
      hucre: (t) => t.yeni_deger ?? <Bos />,
    },
    {
      id: 'tarih', ad: 'Tarih', varsayilan: true, sinif: 'sag soluk',
      sirala: (t) => new Date(t.tespit_gun).getTime(),
      hucre: (t) => <time dateTime={t.tespit_gun}>{gunFark(t.tespit_gun)}</time>,
    },
  ], []);

  const KAYIP_KOLONLARI = useMemo<TabloKolon<Kaybedilen>[]>(() => [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      sirala: (k) => k.ad, ara: (k) => k.ad,
      hucre: (k) => k.ad,
    },
    {
      id: 'il', ad: 'İl', varsayilan: true, sinif: 'soluk',
      sirala: (k) => k.sehir ?? k.il ?? '', ara: (k) => `${k.sehir ?? ''} ${k.il ?? ''}`,
      hucre: (k) => k.sehir ?? k.il ?? <Bos />,
    },
    {
      id: 'rakip', ad: 'Geçtiği Rakip', varsayilan: true,
      sirala: (k) => k.rakip, ara: (k) => k.rakip,
      hucre: (k) => <span className="rozet uyari">{k.rakip}</span>,
    },
    {
      id: 'epdk', ad: 'EPDK', varsayilan: true, sinif: 'mono soluk',
      sirala: (k) => k.epdk_kod, ara: (k) => k.epdk_kod,
      hucre: (k) => k.epdk_kod,
    },
  ], []);

  const SOZLESME_KOLONLARI = useMemo<TabloKolon<SozlesmeBitecek>[]>(() => [
    {
      id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      sirala: (s) => s.lisans_sahibi ?? s.bayi_lisans_no,
      ara: (s) => `${s.lisans_sahibi ?? ''} ${s.bayi_lisans_no}`,
      hucre: (s) => (
        <>
          {s.bizim && <span className="sr-only">Parkoil bayisi: </span>}
          {s.lisans_sahibi ?? s.bayi_lisans_no}
        </>
      ),
    },
    {
      id: 'dagitici', ad: 'Dağıtıcı', varsayilan: true, sinif: 'soluk',
      sirala: (s) => (s.bizim ? 'Parkoil' : s.dagitim_sirketi ?? ''),
      ara: (s) => (s.bizim ? 'Parkoil Turgut' : s.dagitim_sirketi ?? ''),
      hucre: (s) => (s.bizim ? 'Parkoil (Turgut)' : s.dagitim_sirketi ?? <Bos />),
    },
    {
      id: 'il', ad: 'İl', varsayilan: true,
      sirala: (s) => s.il ?? '', ara: (s) => s.il ?? '',
      hucre: (s) => s.il ?? <Bos />,
    },
    {
      id: 'bitis', ad: 'Sözleşme Bitiş', varsayilan: true, sinif: 'sag mono',
      sirala: (s) => new Date(s.sozlesme_bitis).getTime(),
      hucre: (s) => (
        <time dateTime={s.sozlesme_bitis.slice(0, 10)}>{trTarih(s.sozlesme_bitis)}</time>
      ),
    },
  ], []);

  return (
    <>
      <ModulBar
        alt="EPDK resmi piyasa verisi — tüm dağıtıcılar & bayiler"
        taze={veri?.uretim ?? null}
        yukleniyor={yukleniyor}
        yenile={yenile}
        duyuru={veri ? `Piyasa verisi güncellendi. ${veri.transferler.length} transfer kaydı.` : ''}
      />

      {hata && (
        <div className="hata" role="alert">
          <span aria-hidden="true">⚠ </span>
          {hata}
        </div>
      )}

      {/* Piyasa çekimi günde 1 kez → burada bayatlama en muhtemel, göstergeyi gizleme */}
      <TazelikSerit liste={veri?.tazelik} />

      {veri && (
        <>
          <section className="kartlar" aria-label="Piyasa özeti">
            <div className="kart"><div className="kart-deger">{veri.ozet.dagitici_sayisi}</div><div className="kart-baslik">Dağıtım Firması</div></div>
            <div className="kart"><div className="kart-deger">{Number(veri.ozet.toplam_bayi).toLocaleString('tr')}</div><div className="kart-baslik">Toplam Bayi</div></div>
            <div className="kart iyi"><div className="kart-deger">{Number(veri.ozet.aktif_bayi).toLocaleString('tr')}</div><div className="kart-baslik">Aktif Bayi</div></div>
            <div className="kart"><div className="kart-deger">{veri.ozet.snapshot_gun_sayisi}</div><div className="kart-baslik">Snapshot Günü</div></div>
            <div className={`kart ${Number(veri.ozet.aylik_transfer) ? 'uyari' : ''}`}><div className="kart-deger">{veri.ozet.aylik_transfer}</div><div className="kart-baslik">30 Gün Transfer</div></div>
            {bizim && (
              <div className="kart vurgu-kart">
                <div className="kart-deger">{bizim.sayi}</div>
                <div className="kart-baslik">
                  <span className="marka-rozet">PARKOIL</span>
                  {bizim.sira}. sıra
                </div>
              </div>
            )}
          </section>

          {/* Modül 7 bölüm içeriyordu (5 sekmeye toplandı) ve sayfa çok uzuyordu → sekmeler.
              Sıralama İŞE göre: önce rekabet konumu (nerede duruyoruz),
              sonra fırsat/kayıp (aksiyon alınacaklar), sonra ham liste. */}
          <Sekmeler
            anahtar="piyasa"
            tanimlar={[
              {
                id: 'konum',
                ad: 'Rekabet Konumu',
                icerik: () => (
                  <>
                    <CubukYatay
                      veri={veri.dagiticiBayiDagilim}
                      ad={(d) => (d.dagitim_sirketi === BIZ ? 'Turgut Dağıtım' : d.dagitim_sirketi)}
                      deger={(d) => Number(d.n)}
                      vurgu={(d) => d.dagitim_sirketi === BIZ}
                      baslik="Dağıtıcı Bazında Bayi Sayısı"
                      altBaslik={`${veri.dagiticiBayiDagilim.length} aktif dağıtıcı · EPDK kütüğü`}
                      limit={12}
                    />

                    {/* Coğrafi bakış — "hangi bölgede bayimiz var" sorusunun
                        doğrudan cevabı. Gerçek il sınırları (haritaYollari.ts), dış bağımlılık yok. */}
                    {(veri.haritaIl ?? veri.bolgesel).length > 0 && (
                      <Harita
                        veri={(veri.haritaIl ?? veri.bolgesel).map((b) => ({
                          il: b.il,
                          bizim: Number(b.bizim),
                          toplam: Number(b.toplam),
                        }))}
                        olcu="bizim"
                        baslik="Bayi Dağılımı — Harita"
                        altBaslik="Koyu renk = çok bayimiz · bir il üzerine gelin ya da Tab ile gezin"
                      />
                    )}

                    {veri.bolgesel.length > 0 && (
                      <IsiIzgara
                        veri={veri.bolgesel}
                        ad={(b) => b.il}
                        deger={(b) => Number(b.pay)}
                        altDeger={(b) => `${b.bizim}/${b.toplam} bayi`}
                        baslik="Parkoil'in İl Bazında Pazar Payı"
                        altBaslik={`Bayimizin bulunduğu ${veri.bolgesel.length} il · koyu = yüksek pay`}
                        birim="%"
                      />
                    )}

                    {/* Piyasa yoğunluğu ADET, üstteki pazar payı YÜZDE. Aynı rampayı
                        paylaşıyorlar; ayrımı çubuk formu taşıyor (ısı ızgarası değil)
                        → "koyu kırmızı" iki farklı anlamda görünmüyor. */}
                    {veri.ilDagilim.length > 0 && (
                      <CubukYatay
                        veri={veri.ilDagilim}
                        ad={(x) => x.il}
                        deger={(x) => Number(x.n)}
                        baslik="Piyasa Yoğunluğu — İl Bazında Toplam Bayi"
                        altBaslik="En yoğun 20 il (tüm dağıtıcılar, tüm markalar)"
                        limit={20}
                      />
                    )}
                  </>
                ),
              },
              {
                id: 'firsat',
                ad: 'Fırsat & Kayıp',
                /* Yalnız kaybedilen BAYİ sayısı. Önceden beyazAlan (İL sayısı) da
                   toplanıyordu — iki farklı birim; üstelik beyazAlan LIMIT 15 ile
                   kesik olduğu için toplam gerçeği yansıtmıyordu. */
                sayi: veri.kaybedilen.length,
                acil: veri.kaybedilen.length > 0,
                icerik: () => (
                  <>
                    {veri.kaybedilen.length > 0 && (
                      <Tablo
                        anahtar="kaybedilen"
                        baslik="Kaybedilen Bayiler"
                        kolonlar={KAYIP_KOLONLARI}
                        satirlar={veri.kaybedilen}
                        satirAnahtar={(k) => k.epdk_kod}
                        aramaEtiket="İstasyon, il veya rakip ara"
                        aciklama={
                          <div className="analiz-not krit-not">
                            Bu istasyonlar ASIS'te <b>bize veri göndermiyor</b> ama EPDK'da{' '}
                            <b>başka dağıtıcıda aktif</b> — yani Parkoil'den ayrılıp rakibe geçmişler.
                          </div>
                        }
                      />
                    )}

                    {veri.beyazAlan.length > 0 && (
                      <CubukYatay
                        veri={veri.beyazAlan}
                        ad={(b) => b.il}
                        deger={(b) => Number(b.toplam)}
                        baslik="Beyaz Alan — Hiç Bayimiz Olmayan Yoğun İller"
                        altBaslik="Piyasa büyük, bizim payımız sıfır · en yoğun 15 il"
                        limit={15}
                      />
                    )}
                  </>
                ),
              },
              {
                id: 'sozlesme',
                ad: 'Sözleşme Takibi',
                sayi: veri.sozlesmeBitecek.length,
                icerik: () => (
                  veri.sozlesmeBitecek.length > 0 ? (
                    <Tablo
                      aciklama={
                        <div className="analiz-not">
                          <b>Parkoil bayileri</b> = yenileme takibi (kaybetmemek için).{' '}
                          <b>Rakip bayiler</b> = kapma fırsatı (hedef liste).
                        </div>
                      }
                      anahtar="sozlesme"
                      baslik="Sözleşmesi Bitecek Bayiler (6 ay)"
                      kolonlar={SOZLESME_KOLONLARI}
                      /* TAM liste verilir — arama/sıralama tümünde çalışsın, dilimleme
                         Tablo'nun içinde sonradan yapılsın. Önceden dışarıda slice
                         edildiği için arama görünmeyen kayıtları atlıyor ve yanlışlıkla
                         "kayıt yok" diyordu. */
                      satirlar={sozlesmeFiltreli}
                      ilkGosterim={50}
                      adim={100}
                      satirAnahtar={(s) => s.bayi_lisans_no}
                      satirSinif={(s) => (s.bizim ? 'satir-biz' : undefined)}
                      aramaEtiket="Bayi, dağıtıcı veya il ara"
                      ustSag={
                        <div className="segment" role="group" aria-label="Sözleşme kapsamı">
                          {([
                            ['hepsi', 'Tümü'],
                            ['bizim', 'Parkoil'],
                            ['rakip', 'Rakip'],
                          ] as const).map(([id, ad]) => (
                            <button
                              key={id}
                              type="button"
                              className={sozlesmeKapsam === id ? 'akt' : ''}
                              aria-pressed={sozlesmeKapsam === id}
                              onClick={() => setSozlesmeKapsam(id)}
                            >
                              {ad}
                            </button>
                          ))}
                        </div>
                      }
                    />
                  ) : (
                    <div className="takvim-bos">Önümüzdeki 6 ayda sözleşmesi bitecek bayi yok.</div>
                  )
                ),
              },
              {
                id: 'transfer',
                ad: 'Transferler',
                sayi: veri.transferler.length,
                icerik: () => (
                  veri.transferler.length === 0 ? (
                    <div className="takvim-bos">
                      Henüz transfer tespiti yok. İlk snapshot alındı; <b>ikinci günden itibaren</b>{' '}
                      dağıtıcı değiştiren, yeni açılan veya ayrılan bayiler burada görünecek.
                      (Günlük snapshot karşılaştırması.)
                    </div>
                  ) : (
                    <Tablo
                      anahtar="transferler"
                      baslik="Bayi Transferleri"
                      kolonlar={TRANSFER_KOLONLARI}
                      satirlar={veri.transferler}
                      satirAnahtar={(t) => `${t.bayi_lisans_no}-${t.tespit_gun}-${t.tip}`}
                      aramaEtiket="Bayi, il veya dağıtıcı ara"
                    />
                  )
                ),
              },
              {
                id: 'bayiler',
                ad: 'Tüm Bayiler',
                sayi: secenekler.toplamBayi,
                icerik: () => (
                  <TumBayiler
                    sayfaliBayiler={sayfaliBayiler}
                    toplamEslesen={toplamEslesen}
                    bayiHata={bayiHata}
                    bayiYukleniyor={bayiYukleniyor}
                    secenekler={secenekler}
                    sorgu={sorgu}
                    dispatch={dispatch}
                    sayfa={sayfa}
                    toplamSayfa={toplamSayfa}
                    kol={kol}
                    SiraBas={SiraBas}
                    csvAktar={bayiCsvAktar}
                    aktarPmi={aktarPmi}
                    aktarIlerleme={aktarIlerleme}
                  />
                ),
              },
            ]}
          />
        </>
      )}
    </>
  );
}

/* Tüm Bayiler bölümü — kendi sayfalama + çoklu dropdown filtresi olduğu için
   ortak Tablo bileşenine geçmedi (30 bin satır, sunucu taraflı sayfalama). */
function TumBayiler(p: {
  sayfaliBayiler: Bayi[] | null; toplamEslesen: number; bayiHata: string | null;
  bayiYukleniyor: boolean; secenekler: { iller: string[]; dagiticilar: string[]; toplamBayi: number };
  sorgu: Sorgu; dispatch: (e: Eylem) => void; sayfa: number; toplamSayfa: number;
  kol: { gorunurMu: (id: string) => boolean; degistir: (id: string) => void; gorunurSayi: number };
  SiraBas: (o: { alan: SiralamaAlan; ad: string; sag?: boolean }) => ReactElement;
  /** CSV aktarımı Piyasa'da tanımlı (sunucudan sayfa sayfa çeker) → prop olarak gelir. */
  csvAktar: () => void; aktarPmi: boolean; aktarIlerleme: number;
}) {
  const { sayfaliBayiler, toplamEslesen, bayiHata, bayiYukleniyor, secenekler,
          sorgu, dispatch, sayfa, toplamSayfa, kol, SiraBas, csvAktar, aktarPmi,
          aktarIlerleme } = p;
  // Dinamik tablo: arama + çoklu filtre + sıralama + sunucu taraflı sayfalama
  return (
    <section>
            <div className="bolum-baslik">
              <h2 id="bayi-baslik">
                Tüm Bayiler{' '}
                <span className="sayi" role="status" aria-live="polite">
                  {sayfaliBayiler === null
                    ? 'yükleniyor…'
                    : `${toplamEslesen.toLocaleString('tr')} / ${secenekler.toplamBayi.toLocaleString('tr')} bayi`}
                </span>
              </h2>
            </div>
            {bayiHata && (
              <div className="hata" role="alert">
                <span aria-hidden="true">⚠ </span>
                {bayiHata}
              </div>
            )}
            <div className="filtre-cubugu">
              <input
                className="arama"
                aria-label="Bayi adı, lisans no veya ilçe ara"
                placeholder="Bayi adı, lisans no, ilçe ara…"
                value={sorgu.q}
                onChange={(e) => dispatch({ tip: 'filtre', deger: { q: e.target.value } })}
              />
              <select
                aria-label="İl filtresi"
                value={sorgu.il}
                onChange={(e) => dispatch({ tip: 'filtre', deger: { il: e.target.value } })}
              >
                <option value="">Tüm iller</option>
                {secenekler.iller.map((il: string) => <option key={il} value={il}>{il}</option>)}
              </select>
              <select
                aria-label="Dağıtıcı filtresi"
                value={sorgu.dagitici}
                onChange={(e) => dispatch({ tip: 'filtre', deger: { dagitici: e.target.value } })}
              >
                <option value="">Tüm dağıtıcılar</option>
                {secenekler.dagiticilar.map((d: string) => (
                  <option key={d} value={d}>
                    {d === BIZ ? 'Parkoil (Turgut)' : d.length > 34 ? d.slice(0, 34) + '…' : d}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lisans durumu filtresi"
                value={sorgu.durum}
                onChange={(e) => dispatch({ tip: 'filtre', deger: { durum: e.target.value } })}
              >
                <option value="">Tüm durumlar</option>
                <option value="ONAYLANDI">Onaylandı</option>
                <option value="SONLANDIRILDI">Sonlandırıldı</option>
                <option value="IPTAL_EDILDI">İptal Edildi</option>
              </select>
              <label className="biz-toggle">
                <input
                  type="checkbox"
                  checked={sorgu.sadeceBiz}
                  onChange={(e) => dispatch({ tip: 'filtre', deger: { sadeceBiz: e.target.checked } })}
                />
                Sadece Parkoil
              </label>
              <button
                type="button"
                className="aktar-btn"
                onClick={csvAktar}
                disabled={aktarPmi || toplamEslesen === 0}
                title={
                  toplamEslesen === 0
                    ? 'Aktarılacak satır yok'
                    : `${toplamEslesen.toLocaleString('tr')} satır sunucudan çekilip CSV inecek`
                }
              >
                {aktarPmi ? (
                  <span aria-live="polite">
                    {aktarIlerleme > 0
                      ? `${aktarIlerleme.toLocaleString('tr')} / ${toplamEslesen.toLocaleString('tr')}…`
                      : 'Hazırlanıyor…'}
                  </span>
                ) : (
                  <>
                    <span aria-hidden="true">⭳ </span>CSV
                    <span className="sr-only"> olarak indir, {toplamEslesen} satır</span>
                  </>
                )}
              </button>
              <KolonSecici tanimlar={BAYI_KOLONLARI} gorunurMu={kol.gorunurMu} degistir={kol.degistir} />
            </div>

            {/* 50 satır sayfa boyutu ekranı taşırıyor → dikey kaydırma + sabit başlık */}
            <div className="tablo-sar kaydirmali" tabIndex={0} role="region" aria-labelledby="bayi-baslik">
              <table>
                <caption className="sr-only">
                  Tüm bayiler — {toplamEslesen} sonuç, sayfa {sayfa} / {toplamSayfa}.
                  Dikey ve yatay kaydırılabilir.
                </caption>
                <thead>
                  <tr>
                    {SiraBas({ alan: 'lisans_sahibi', ad: 'Bayi' })}
                    {kol.gorunurMu('dagitici') && SiraBas({ alan: 'dagitim_sirketi', ad: 'Dağıtıcı' })}
                    {kol.gorunurMu('il') && SiraBas({ alan: 'il', ad: 'İl' })}
                    {kol.gorunurMu('ilce') && SiraBas({ alan: 'ilce', ad: 'İlçe' })}
                    {kol.gorunurMu('durum') && SiraBas({ alan: 'lisans_durumu', ad: 'Durum' })}
                    {kol.gorunurMu('kategori') && SiraBas({ alan: 'kategori', ad: 'Kategori' })}
                    {kol.gorunurMu('epdk') && SiraBas({ alan: 'bayi_lisans_no', ad: 'EPDK No' })}
                    {/* "Sadece bizim" filtresi açıkken bu tarih kesin olarak BİZE geliş
                        tarihidir → başlık netleşir. Tüm piyasa görünümünde rakiple
                        yapılan sözleşmeyi de kapsadığı için nötr kalır. */}
                    {kol.gorunurMu('sozlesmeBas') &&
                      SiraBas({
                        alan: 'sozlesme_baslangic',
                        ad: sorgu.sadeceBiz ? 'Bize Geliş' : 'Sözleşme Başl.',
                        sag: true,
                      })}
                    {kol.gorunurMu('sozlesme') && SiraBas({ alan: 'sozlesme_bitis', ad: 'Sözleşme Bitiş', sag: true })}
                  </tr>
                </thead>
                <tbody>
                  {(sayfaliBayiler ?? []).map((b) => {
                    const biz = b.dagitim_sirketi === BIZ;
                    return (
                      <tr key={b.bayi_lisans_no} className={biz ? 'satir-biz' : ''}>
                        <td className="ad-hucre">
                          {biz && <span className="sr-only">Parkoil bayisi: </span>}
                          {b.lisans_sahibi ?? b.bayi_lisans_no}
                        </td>
                        {kol.gorunurMu('dagitici') && <td className="soluk">{biz ? 'Parkoil (Turgut)' : b.dagitim_sirketi ?? <Bos />}</td>}
                        {kol.gorunurMu('il') && <td>{b.il ?? <Bos />}</td>}
                        {kol.gorunurMu('ilce') && <td className="soluk">{b.ilce ?? <Bos />}</td>}
                        {kol.gorunurMu('durum') && (
                          <td>
                            <span className={`durum-etiket ${b.lisans_durumu === 'ONAYLANDI' ? 'iyi-r' : 'krit'}`}>
                              {b.lisans_durumu === 'ONAYLANDI' ? 'Onaylı' : (b.lisans_durumu ?? '—')}
                            </span>
                          </td>
                        )}
                        {kol.gorunurMu('kategori') && <td className="soluk">{b.kategori ?? <Bos />}</td>}
                        {kol.gorunurMu('epdk') && <td className="mono soluk">{b.bayi_lisans_no}</td>}
                        {kol.gorunurMu('sozlesmeBas') && (
                          <td className="sag mono soluk">
                            {b.sozlesme_baslangic ? (
                              <time dateTime={b.sozlesme_baslangic.slice(0, 10)}>
                                {trTarih(b.sozlesme_baslangic)}
                              </time>
                            ) : (
                              <Bos />
                            )}
                          </td>
                        )}
                        {kol.gorunurMu('sozlesme') && (
                          <td className="sag mono soluk">
                            {b.sozlesme_bitis ? (
                              <time dateTime={b.sozlesme_bitis.slice(0, 10)}>{trTarih(b.sozlesme_bitis)}</time>
                            ) : (
                              <Bos />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {sayfaliBayiler !== null && sayfaliBayiler.length === 0 && (
                    <tr>
                      <td colSpan={kol.gorunurSayi} className="bos">
                        {bayiYukleniyor ? 'Yükleniyor…' : 'Eşleşen bayi yok.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {toplamSayfa > 1 && (
              <div className="sayfalama">
                <button
                  type="button"
                  onClick={() => dispatch({ tip: 'sayfa', deger: Math.max(1, sayfa - 1) })}
                  disabled={sayfa === 1}
                >
                  <span aria-hidden="true">‹ </span>Önceki
                </button>
                <span className="sayfa-bilgi">Sayfa {sayfa} / {toplamSayfa}</span>
                <button
                  type="button"
                  onClick={() => dispatch({ tip: 'sayfa', deger: Math.min(toplamSayfa, sayfa + 1) })}
                  disabled={sayfa === toplamSayfa}
                >
                  Sonraki<span aria-hidden="true"> ›</span>
                </button>
              </div>
            )}
    </section>
  );
}
