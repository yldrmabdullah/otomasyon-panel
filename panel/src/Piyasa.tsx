// Piyasa İstihbarat modülü — EPDK resmi verisiyle tüm Türkiye akaryakıt piyasası.
// Dağıtıcılar, bayi dağılımı, il dağılımı, bayi transferleri. Kaynak: /api/piyasa.
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useKolonlar } from './KolonSecici.js';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Sekmeler } from './Sekme.js';
import { CubukYatay, IsiIzgara } from './Grafik.js';
import { Harita } from './Harita.js';
import { Bos, ModulBar, TazelikSerit, trTarih, useVeri } from './ortak.js';
import { csvIndir } from './disaAktar.js';
import type { Tazelik } from './tipler.js';

/** Bayi tablosu kolon id'si → sunucunun beklediği sıralama alanı.
 *
 *  ⚠️ İKİSİ AYNI DEĞİL: kolon id'leri kısa ve localStorage'da kayıtlı ('bayi'),
 *  sunucu ise DB kolon adını bekliyor ('lisans_sahibi'). Kolon id'lerini sunucu
 *  adlarına çevirmek localStorage'daki mevcut kolon seçimlerini geçersiz kılardı
 *  (kullanıcı gizlediği kolonların geri geldiğini görürdü) → eşleme tabloyla ayrı. */
const BAYI_SIRA_ALANI: Record<string, SiralamaAlan> = {
  bayi: 'lisans_sahibi',
  dagitici: 'dagitim_sirketi',
  il: 'il',
  ilce: 'ilce',
  durum: 'lisans_durumu',
  kategori: 'kategori',
  epdk: 'bayi_lisans_no',
  sozlesmeBas: 'sozlesme_baslangic',
  sozlesme: 'sozlesme_bitis',
};
/** Ters yön — sunucudaki aktif sıralama alanını kolon id'sine çevirir (▲▼ göstergesi). */
const BAYI_SIRA_KOLONU: Record<string, string> = Object.fromEntries(
  Object.entries(BAYI_SIRA_ALANI).map(([id, alan]) => [alan, id]),
);

/** Bayi tablosu kolonları — TEK KAYNAK: hem ekran tablosu hem CSV aktarımı bunu
 *  kullanır. Ayrı listeler tutulursa CSV'ye yeni kolon eklemek unutulur ve dosya
 *  ekranda görünenden eksik iner (sessiz veri kaybı).
 *
 *  `sirala: () => 0` — sıralama SUNUCUDA yapılıyor; bu alan yalnız başlığın
 *  tıklanabilir olmasını sağlar. Tablo `sunucu` modunda dönen değeri kullanmaz. */
function bayiKolonlari(sadeceBiz: boolean): TabloKolon<Bayi>[] {
  return [
    {
      id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true,
      sinif: 'ad-hucre', sirala: () => 0,
      hucre: (b) => (
        <>
          {b.dagitim_sirketi === BIZ && <span className="sr-only">Parkoil bayisi: </span>}
          {b.lisans_sahibi ?? b.bayi_lisans_no}
        </>
      ),
      metin: (b) => b.lisans_sahibi ?? '',
    },
    {
      id: 'dagitici', ad: 'Dağıtıcı', varsayilan: true, sinif: 'soluk', sirala: () => 0,
      hucre: (b) => (b.dagitim_sirketi === BIZ ? 'Parkoil (Turgut)' : b.dagitim_sirketi ?? <Bos />),
      metin: (b) => b.dagitim_sirketi ?? '',
    },
    {
      id: 'il', ad: 'İl', varsayilan: true, sirala: () => 0,
      hucre: (b) => b.il ?? <Bos />, metin: (b) => b.il ?? '',
    },
    {
      id: 'ilce', ad: 'İlçe', varsayilan: false, sinif: 'soluk', sirala: () => 0,
      hucre: (b) => b.ilce ?? <Bos />, metin: (b) => b.ilce ?? '',
    },
    {
      id: 'durum', ad: 'Durum', varsayilan: true, sirala: () => 0,
      hucre: (b) => (
        <span className={`durum-etiket ${b.lisans_durumu === 'ONAYLANDI' ? 'iyi-r' : 'krit'}`}>
          {b.lisans_durumu === 'ONAYLANDI' ? 'Onaylı' : (b.lisans_durumu ?? '—')}
        </span>
      ),
      metin: (b) => b.lisans_durumu ?? '',
    },
    {
      id: 'kategori', ad: 'Kategori', varsayilan: false, sinif: 'soluk', sirala: () => 0,
      hucre: (b) => b.kategori ?? <Bos />, metin: (b) => b.kategori ?? '',
    },
    {
      id: 'epdk', ad: 'EPDK No', varsayilan: false, sinif: 'mono soluk', sirala: () => 0,
      hucre: (b) => b.bayi_lisans_no, metin: (b) => b.bayi_lisans_no,
    },
    {
      // "Bize geliş" = bayinin bizimle sözleşme imzaladığı gün (EPDK
      // dagiticiIleYapilanSozlesmeBaslangicTarihi). 167 aktif bayimizde %100 dolu.
      // ⚠️ RAKİP bayilerde bu tarih RAKİPLE yapılan sözleşmedir → "sadece Parkoil"
      // filtresi açıkken başlık netleşir, tüm piyasa görünümünde nötr kalır.
      id: 'sozlesmeBas', ad: sadeceBiz ? 'Bize Geliş' : 'Sözleşme Başl.',
      varsayilan: false, sinif: 'sag mono soluk', sirala: () => 0,
      hucre: (b) =>
        b.sozlesme_baslangic ? (
          <time dateTime={b.sozlesme_baslangic.slice(0, 10)}>{trTarih(b.sozlesme_baslangic)}</time>
        ) : (
          <Bos />
        ),
      metin: (b) => (b.sozlesme_baslangic ? trTarih(b.sozlesme_baslangic) : ''),
    },
    {
      id: 'sozlesme', ad: 'Sözleşme Bitiş', varsayilan: false, sinif: 'sag mono soluk',
      sirala: () => 0,
      hucre: (b) =>
        b.sozlesme_bitis ? (
          <time dateTime={b.sozlesme_bitis.slice(0, 10)}>{trTarih(b.sozlesme_bitis)}</time>
        ) : (
          <Bos />
        ),
      metin: (b) => (b.sozlesme_bitis ? trTarih(b.sozlesme_bitis) : ''),
    },
  ];
}

interface Ozet {
  dagitici_sayisi: number; toplam_bayi: number; aktif_bayi: number;
  aylik_transfer: number;
}
interface DagiticiBayi { dagitim_sirketi: string; n: string }
interface IlDagilim { il: string; n: string }
interface Transfer {
  bayi_lisans_no: string; lisans_sahibi: string | null; il: string | null;
  tip: string; eski_deger: string | null; yeni_deger: string | null; tespit_gun: string;
  /** yeni_bayi için: 'yeni_sozlesme' | 'lisans_yenilendi' | 'belirsiz'. Diğer tiplerde null. */
  alt_tip?: string | null;
  sozlesme_yas_gun?: number | null;
  lisans_yas_gun?: number | null;
  dagitim_sirketi?: string | null;
}
/** Sözleşme ve lisans tablolarının ortak alanları (kolon şablonu bunu ister). */
interface BitisSatiri {
  bayi_lisans_no: string; lisans_sahibi: string | null; dagitim_sirketi: string | null;
  il: string | null; ilce?: string | null; bizim: boolean;
}
/** DAĞITICI ile yapılan ticari sözleşme — ort. 4,4 yıl, sık yenilenir. */
interface SozlesmeBitecek extends BitisSatiri { sozlesme_bitis: string }
/** EPDK BAYİLİK LİSANSI — ort. 17,3 yıl. Bitince bayi faaliyeti durur. */
interface LisansBitecek extends BitisSatiri { lisans_bitis: string }
interface BolgeselSatir { il: string; toplam: string; bizim: string; pay: string }
interface BeyazAlan { il: string; toplam: string }
interface Kaybedilen {
  ad: string; epdk_kod: string; sehir: string | null; rakip: string; il: string | null;
  /** Ayrılış tarihi. Kaynak `tarih_kesin`'e göre değişir — bkz. panelSorgu ANALİZ 3. */
  ayrilis?: string | null;
  /** true → bizim tespit günümüz (kesin). false → rakiple sözleşme başlangıcı (alt sınır). */
  tarih_kesin?: boolean;
  sozlesme_baslangic?: string | null;
}

/** HACİM bazlı pazar payı (EPDK sektör raporu). Adet bazlı `bolgesel`den AYRI ölçü. */
interface HacimDagitici {
  urun_grubu: string; unvan: string; toplam_litre: string;
  pazar_payi: string | null; bizim: boolean;
}
interface HacimBizim {
  urun_grubu: string; toplam_litre: string; pazar_payi: string | null;
  istasyon_litre: string | null; koy_litre: string | null;
  tarim_litre: string | null; dis_litre: string | null;
  sira: string; toplam_dagitici: string;
}
interface HacimIl {
  il: string; il_ton: string; biz_ton: string;
  il_benzin: string | null; il_motorin: string | null;
  biz_benzin: string | null; biz_motorin: string | null; pay: string;
}
interface HacimVeri {
  donem: { yil: number; ay: number; etiket: string } | null;
  dagitici: HacimDagitici[]; bizim: HacimBizim[]; il: HacimIl[];
  trend: { yil: number; ay: number; urun_grubu: string; pazar_payi: string | null; toplam_litre: string }[];
}

interface PiyasaVeri {
  uretim: string; ozet: Ozet;
  dagiticiBayiDagilim: DagiticiBayi[]; ilDagilim: IlDagilim[]; transferler: Transfer[];
  sozlesmeBitecek: SozlesmeBitecek[]; bolgesel: BolgeselSatir[]; beyazAlan: BeyazAlan[];
  /** Eski sürüm API'den gelmeyebilir → opsiyonel. */
  lisansBitecek?: LisansBitecek[];
  /** Harita: TÜM 81 il (bolgesel yalnız bizim bayimiz olanları verir). */
  haritaIl?: { il: string; toplam: string; bizim: string }[];
  kaybedilen: Kaybedilen[];
  /** Eski sürüm API'den gelmeyebilir → opsiyonel. */
  tazelik?: Tazelik[];
  /** HACİM bazlı pazar payı — veri çekilmemişse donem=null. Eski API'de yok → opsiyonel. */
  hacim?: HacimVeri;
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

/** Etiket — `alt_tip` varsa o kazanır (yeni_bayi ikiye ayrılıyor). */
function transferEtiket(t: { tip: string; alt_tip?: string | null }) {
  if (t.alt_tip && ALT_TIP_ETIKET[t.alt_tip]) return ALT_TIP_ETIKET[t.alt_tip];
  return TRANSFER_ETIKET[t.tip] ?? { metin: t.tip, sinif: 'uyari' };
}

/** ⚠️ "yeni_bayi" İKİ AYRI OLAY (2026-08-04, kullanıcı ayırt etti):
 *  Kod yalnız "dün listede yoktu, bugün var" diyordu — lisans/sözleşme tarihine
 *  bakmıyordu. Ölçüm: COB 2 sözleşme 10 günlük (gerçek yeni bayi), SDT GRUP
 *  sözleşme 259 GÜNLÜK (8,5 aydır aynı dağıtıcıda, yalnız lisansı yenilenmiş). */
const ALT_TIP_ETIKET: Record<string, { metin: string; sinif: string }> = {
  yeni_sozlesme: { metin: 'YENİ SÖZLEŞME', sinif: 'iyi-r' },
  lisans_yenilendi: { metin: 'LİSANS YENİLENDİ', sinif: 'uyari' },
  belirsiz: { metin: 'YENİ KAYIT', sinif: 'uyari' },
};

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
  const { veri, hata, yukleniyor, yenile } = useVeri<PiyasaVeri>('/api/piyasa', piyasaDogrula, 600_000);


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
  // CSV aktarımı görünür kolonları bilmek zorunda (Tablo kendi içinde de aynı
  // anahtarla okuyor — localStorage tek kaynak, iki taraf aynı seçimi görür).
  const kol = useKolonlar('bayiler', bayiKolonlari(sorgu.sadeceBiz));

  // Filtre açılırları — tüm bayiyi indirmeden, ayrı hafif çağrı.
  const [secenekler, setSecenekler] = useState<{ iller: string[]; dagiticilar: string[]; toplamBayi: number }>(
    { iller: [], dagiticilar: [], toplamBayi: 0 },
  );

  // Sözleşme bölümü: kapsam filtresi + kademeli gösterim (sessiz kesme YOK)
  const [sozlesmeKapsam, setSozlesmeKapsam] = useState<'hepsi' | 'bizim' | 'rakip'>('hepsi');
  const [lisansKapsam, setLisansKapsam] = useState<'hepsi' | 'bizim' | 'rakip'>('hepsi');

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
      // Kolon metinleri tablo tanımından gelir (tek kaynak) — burada ayrı bir
      // switch tutulursa yeni kolon eklendiğinde CSV'ye yansıması unutulur.
      const tumKolon = bayiKolonlari(sorgu.sadeceBiz);
      const gorunurKolon = tumKolon.filter((k) => k.sabit || kol.gorunurMu(k.id));
      const basliklar = gorunurKolon.map((k) => k.ad);
      const satirlar = tumu.map((b) => gorunurKolon.map((k) => k.metin?.(b) ?? ''));
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

  // NOT: Buradaki `SiraBas`/`siraYon`/`siraOk` yardımcıları 2026-08-03'te KALDIRILDI.
  // Bayi tablosu ortak `Tablo`'ya (sunucu modu) geçince sıralanabilir başlık,
  // aria-sort ve ▲▼ göstergesi bileşenin kendi işi oldu; buradaki kopya ölü kaldı.

  // Sözleşme bitecekler: kapsama göre süz (bizim / rakip / tümü).
  // Kademeli gösterim ve arama Tablo bileşeninin içinde.
  const sozlesmeFiltreli = useMemo(() => {
    const liste = veri?.sozlesmeBitecek ?? [];
    if (sozlesmeKapsam === 'bizim') return liste.filter((s) => s.bizim);
    if (sozlesmeKapsam === 'rakip') return liste.filter((s) => !s.bizim);
    return liste;
  }, [veri, sozlesmeKapsam]);

  // Transferler üçe ayrılır: yeni sözleşme · lisans yenilendi · diğer hareketler.
  // Ayrım sunucuda (alt_tip); burada yalnız gruplanır.
  const yeniSozlesmeler = useMemo(
    () => (veri?.transferler ?? []).filter((t) => t.alt_tip === 'yeni_sozlesme'),
    [veri],
  );
  const lisansYenilenenler = useMemo(
    () => (veri?.transferler ?? []).filter((t) => t.alt_tip === 'lisans_yenilendi'),
    [veri],
  );
  // 'belirsiz' (sözleşme tarihi yok) da buraya düşer — gizlenmesin.
  const digerHareketler = useMemo(
    () =>
      (veri?.transferler ?? []).filter(
        (t) => t.alt_tip !== 'yeni_sozlesme' && t.alt_tip !== 'lisans_yenilendi',
      ),
    [veri],
  );

  // Lisans bitecekler — sözleşmeden AYRI liste, aynı süzme mantığı.
  const lisansFiltreli = useMemo(() => {
    const liste = veri?.lisansBitecek ?? [];
    if (lisansKapsam === 'bizim') return liste.filter((s) => s.bizim);
    if (lisansKapsam === 'rakip') return liste.filter((s) => !s.bizim);
    return liste;
  }, [veri, lisansKapsam]);

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
  // Yeni bayi tabloları (yeni sözleşme / lisans yenilendi): "Eski → Yeni"
  // kolonları anlamsız (eski değer hep boş). Onun yerine DAĞITICI ve iki tarih
  // yaşı gösterilir — ayrımın DAYANAĞI görünsün, kullanıcı kararı denetleyebilsin.
  const YENI_BAYI_KOLONLARI = useMemo<TabloKolon<Transfer>[]>(
    () => [
      {
        id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true, sinif: 'ad-hucre',
        sirala: (t) => t.lisans_sahibi ?? t.bayi_lisans_no,
        ara: (t) => `${t.lisans_sahibi ?? ''} ${t.bayi_lisans_no}`,
        hucre: (t) => (
          <>
            {t.lisans_sahibi ?? t.bayi_lisans_no}
            <div className="alt-satir mono">{t.bayi_lisans_no}</div>
          </>
        ),
        metin: (t) => `${t.lisans_sahibi ?? ''} (${t.bayi_lisans_no})`,
      },
      {
        id: 'dagitici', ad: 'Dağıtıcı', varsayilan: true, sinif: 'soluk',
        sirala: (t) => t.dagitim_sirketi ?? '',
        ara: (t) => t.dagitim_sirketi ?? '',
        hucre: (t) =>
          t.dagitim_sirketi === BIZ ? (
            <b>Parkoil (Turgut)</b>
          ) : (
            t.dagitim_sirketi ?? <Bos />
          ),
        metin: (t) => t.dagitim_sirketi ?? '',
      },
      {
        id: 'il', ad: 'İl', varsayilan: true, sinif: 'soluk',
        sirala: (t) => t.il ?? '', ara: (t) => t.il ?? '',
        hucre: (t) => t.il ?? <Bos />,
      },
      {
        id: 'sozYas', ad: 'Sözleşme yaşı', varsayilan: true, sinif: 'sag mono',
        sirala: (t) => t.sozlesme_yas_gun ?? -1,
        hucre: (t) =>
          t.sozlesme_yas_gun == null ? <Bos /> : <>{t.sozlesme_yas_gun} gün</>,
        metin: (t) => (t.sozlesme_yas_gun == null ? '' : `${t.sozlesme_yas_gun} gün`),
      },
      {
        id: 'lisYas', ad: 'Lisans yaşı', varsayilan: false, sinif: 'sag mono soluk',
        sirala: (t) => t.lisans_yas_gun ?? -1,
        hucre: (t) => (t.lisans_yas_gun == null ? <Bos /> : <>{t.lisans_yas_gun} gün</>),
        metin: (t) => (t.lisans_yas_gun == null ? '' : `${t.lisans_yas_gun} gün`),
      },
      {
        id: 'tarih', ad: 'Tespit', varsayilan: true, sinif: 'sag soluk',
        sirala: (t) => new Date(t.tespit_gun).getTime(),
        hucre: (t) => (
          <time dateTime={t.tespit_gun.slice(0, 10)}>{gunFark(t.tespit_gun)}</time>
        ),
        metin: (t) => trTarih(t.tespit_gun),
      },
    ],
    [],
  );

  const TRANSFER_KOLONLARI = useMemo<TabloKolon<Transfer>[]>(() => [
    {
      // ⚠️ EPDK LİSANS NO ŞART (2026-08-04, kullanıcı yakaladı): bir tüzel kişinin
      // BİRDEN ÇOK bayilik lisansı olabiliyor (ADEM ÖZDEMİR'de 4: farklı tesis,
      // farklı dağıtıcı, farklı tarihler). Yalnız unvan gösterilince aynı gün
      // iki lisansı durum değiştirdiğinde tabloda BİREBİR AYNI iki satır çıkıyor
      // ve hangisi olduğu ayırt edilemiyor. Lisans no tekil anahtar.
      id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      sirala: (t) => t.lisans_sahibi ?? t.bayi_lisans_no,
      ara: (t) => `${t.lisans_sahibi ?? ''} ${t.bayi_lisans_no}`,
      hucre: (t) => (
        <>
          {t.lisans_sahibi ?? t.bayi_lisans_no}
          <div className="alt-satir mono">{t.bayi_lisans_no}</div>
        </>
      ),
      metin: (t) => `${t.lisans_sahibi ?? ''} (${t.bayi_lisans_no})`,
    },
    {
      id: 'tip', ad: 'Tip', varsayilan: true,
      sirala: (t) => transferEtiket(t).metin,
      ara: (t) => transferEtiket(t).metin,
      hucre: (t) => {
        const e = transferEtiket(t);
        return <span className={`rozet ${e.sinif}`}>{e.metin}</span>;
      },
    },
    {
      id: 'il', ad: 'İl', varsayilan: true, sinif: 'soluk',
      sirala: (t) => t.il ?? '', ara: (t) => t.il ?? '',
      hucre: (t) => t.il ?? <Bos />,
    },
    {
      // Eski/Yeni DAĞITICI UNVANI taşıyor ("… AKARYAKIT DAĞITIM ANONİM ŞİRKETİ").
      // Sınıfsızken tek satırda 632px sürüyordu ve tabloyu 1874px'e çıkarıyordu
      // (ölçüldü 2026-08-13). ad-hucre tavan + ellipsis verir; tam ad title'da.
      id: 'eski', ad: 'Eski', varsayilan: true, sinif: 'soluk ad-hucre',
      sirala: (t) => t.eski_deger ?? '', ara: (t) => t.eski_deger ?? '',
      hucre: (t) => (t.eski_deger ? <span title={t.eski_deger}>{t.eski_deger}</span> : <Bos />),
    },
    {
      id: 'yeni', ad: 'Yeni', varsayilan: true, sinif: 'ad-hucre',
      sirala: (t) => t.yeni_deger ?? '', ara: (t) => t.yeni_deger ?? '',
      hucre: (t) => (t.yeni_deger ? <span title={t.yeni_deger}>{t.yeni_deger}</span> : <Bos />),
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
      /* ⭐ "Ne zaman gitti" (kullanıcı isteği). İki kaynak var ve karıştırılmamalı:
         kesin = bizim tespit günümüz · tahmini = rakiple sözleşme başlangıcı.
         Kaynak ayrımı başlıkta DEĞİL hücrede taşınır (satır satır farklı). */
      id: 'ayrilis', ad: 'Ayrılış', varsayilan: true,
      sirala: (k) => k.ayrilis ?? '',
      ara: (k) => k.ayrilis ?? '',
      // Aktarımda EKRANDAKİ biçim (25.08.2026) kullanılır — ham ISO değil. Excel
      // TR tarihini tarih olarak tanır; ISO metin olarak kalıyordu.
      metin: (k) => (k.ayrilis ? `${trTarih(k.ayrilis)}${k.tarih_kesin ? '' : ' (tahmini)'}` : ''),
      hucre: (k) =>
        k.ayrilis ? (
          <span title={k.tarih_kesin
            ? 'Bizim tespit ettiğimiz gün (EPDK kaydı değişti)'
            : 'Rakiple sözleşme başlangıcı — bizden ayrılış EN ERKEN bu tarih'}>
            <time dateTime={k.ayrilis}>{trTarih(k.ayrilis)}</time>
            {!k.tarih_kesin && <span className="soluk"> ~</span>}
          </span>
        ) : <Bos />,
    },
    {
      id: 'epdk', ad: 'EPDK', varsayilan: true, sinif: 'mono soluk',
      sirala: (k) => k.epdk_kod, ara: (k) => k.epdk_kod,
      hucre: (k) => k.epdk_kod,
    },
  ], []);

  // Sözleşme ve lisans tabloları AYNI kolon şablonunu kullanır — yalnız tarih
  // alanı ve başlığı değişir. Tek üretici fonksiyon: iki tablo asla ayrışmasın.
  const bitisKolonlari = useCallback(
    <T extends BitisSatiri>(bitis: (s: T) => string, baslik: string): TabloKolon<T>[] => [
      {
        // ⚠️ LİSANS NO GÖRÜNMELİ: bir tüzel kişinin birden çok lisansı olabiliyor
        // (ADEM ÖZDEMİR'de 4 — farklı tesis/dağıtıcı/tarih). Unvan tek başına
        // ayırt etmiyor; aynı isimli iki satır birebir aynı görünüyordu.
        id: 'bayi', ad: 'Bayi', varsayilan: true, sabit: true, sinif: 'ad-hucre',
        sirala: (s) => s.lisans_sahibi ?? s.bayi_lisans_no,
        ara: (s) => `${s.lisans_sahibi ?? ''} ${s.bayi_lisans_no}`,
        hucre: (s) => (
          <>
            {s.bizim && <span className="sr-only">Parkoil bayisi: </span>}
            {s.lisans_sahibi ?? s.bayi_lisans_no}
            <div className="alt-satir mono">
              {s.bayi_lisans_no}
              {s.ilce ? ` · ${s.ilce}` : ''}
            </div>
          </>
        ),
        metin: (s) => `${s.lisans_sahibi ?? ''} (${s.bayi_lisans_no})`,
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
        id: 'kalan', ad: 'Kalan', varsayilan: true, sinif: 'sag mono',
        sirala: (s) => new Date(bitis(s)).getTime(),
        hucre: (s) => {
          const gun = Math.round((new Date(bitis(s)).getTime() - Date.now()) / 86_400_000);
          return <span className={gun <= 30 ? 'rozet uyari' : undefined}>{gun} gün</span>;
        },
        metin: (s) => `${Math.round((new Date(bitis(s)).getTime() - Date.now()) / 86_400_000)} gün`,
      },
      {
        id: 'bitis', ad: baslik, varsayilan: true, sinif: 'sag mono',
        sirala: (s) => new Date(bitis(s)).getTime(),
        hucre: (s) => <time dateTime={bitis(s).slice(0, 10)}>{trTarih(bitis(s))}</time>,
      },
    ],
    [],
  );

  const SOZLESME_KOLONLARI = useMemo(
    () => bitisKolonlari<SozlesmeBitecek>((s) => s.sozlesme_bitis, 'Sözleşme Bitiş'),
    [bitisKolonlari],
  );
  const LISANS_KOLONLARI = useMemo(
    () => bitisKolonlari<LisansBitecek>((s) => s.lisans_bitis, 'Lisans Bitiş'),
    [bitisKolonlari],
  );

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
            <div className={`kart ${Number(veri.ozet.aylik_transfer) ? 'uyari' : ''}`}><div className="kart-deger">{veri.ozet.aylik_transfer}</div><div className="kart-baslik">30 Gün Transfer</div></div>
            {bizim && (
              <div className="kart vurgu-kart">
                <div className="kart-deger">{bizim.sayi}</div>
                <div className="kart-baslik">
                  <span className="marka-rozet"><span className="sr-only">Parkoil bayisi: </span>PARKOIL</span>
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
                // Mockup 3a: "harita ile tablo yan yana". Dört grafik alt alta
                // dizilince sayfa 4 ekran boyu oluyordu ve harita ile yanındaki
                // il listesi ASLA aynı anda görünmüyordu — oysa ikisi aynı soruyu
                // cevaplıyor ("nerede güçlüyüz"). Harita solda, il yoğunluğu sağda.
                icerik: () => (
                  <>
                    <div className="iki-sutun">
                      {(veri.haritaIl ?? veri.bolgesel).length > 0 && (
                        <Harita
                          veri={(veri.haritaIl ?? veri.bolgesel).map((b) => ({
                            il: b.il,
                            bizim: Number(b.bizim),
                            toplam: Number(b.toplam),
                          }))}
                          olcu="bizim"
                          baslik="Bayi Dağılımı — Harita"
                          altBaslik="Koyu renk = çok bayimiz · bir il üzerine gelin — tüm sayılar aşağıdaki tabloda"
                        />
                      )}

                      {/* Piyasa yoğunluğu ADET, aşağıdaki pazar payı YÜZDE. Aynı rampayı
                          paylaşıyorlar; ayrımı çubuk formu taşıyor (ısı ızgarası değil)
                          → "koyu kırmızı" iki farklı anlamda görünmüyor. */}
                      {veri.ilDagilim.length > 0 && (
                        <div className="yan-panel">
                          <CubukYatay
                            veri={veri.ilDagilim}
                            ad={(x) => x.il}
                            deger={(x) => Number(x.n)}
                            baslik="Piyasa Yoğunluğu"
                            altBaslik="En yoğun 12 il · tüm dağıtıcılar"
                            limit={12}
                          />
                        </div>
                      )}
                    </div>

                    <CubukYatay
                      veri={veri.dagiticiBayiDagilim}
                      ad={(d) => (d.dagitim_sirketi === BIZ ? 'Turgut Dağıtım' : d.dagitim_sirketi)}
                      deger={(d) => Number(d.n)}
                      vurgu={(d) => d.dagitim_sirketi === BIZ}
                      baslik="Dağıtıcı Bazında Bayi Sayısı"
                      altBaslik={`${veri.dagiticiBayiDagilim.length} aktif dağıtıcı · EPDK kütüğü`}
                      limit={12}
                    />

                    {veri.bolgesel.length > 0 && (
                      <IsiIzgara
                        veri={veri.bolgesel}
                        ad={(b) => b.il}
                        deger={(b) => Number(b.pay)}
                        altDeger={(b) => `${b.bizim}/${b.toplam} bayi`}
                        baslik="Parkoil'in İl Bazında Pazar Payı — BAYİ ADEDİ"
                        altBaslik={`Bayimizin bulunduğu ${veri.bolgesel.length} il · koyu = yüksek pay`}
                        birim="%"
                      />
                    )}
                  </>
                ),
              },
              {
                /* HACİM bazlı pay — ADET bazlı olandan AYRI sekme.
                   Aynı ekranda iki "pazar payı" ısı ızgarası yan yana dursa
                   kullanıcı hangisine baktığını karıştırır; üstelik biri litre
                   biri adet (ölçüldü: ISPARTA adet %2,7 / hacim %7,27).
                   Kaynak aylık ve KÜMÜLATİF → dönem etiketi her başlıkta. */
                id: 'hacim',
                ad: 'Hacim Payı',
                icerik: () => <HacimBolumu hacim={veri.hacim} />,
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
                            {' '}<b>Ayrılış</b> tarihi kesin değilse <span className="soluk">~</span>{' '}
                            ile işaretli: o satırda tarih, bayinin <b>rakiple sözleşme
                            başlangıcı</b>dır (bizden ayrılış en erken o tarih). İşaretsiz olanlar
                            bizim kendi tespit günümüz.
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
                // ⚠️ SÖZLEŞMEDEN AYRI SEKME (2026-08-04, kullanıcı ayırt etti):
                // EPDK'da iki farklı tarih çifti var ve karıştırılırsa yanlış iş
                // yapılır. Lisans = faaliyet izni (ort. 17,3 yıl, bitince bayi
                // DURUR — hukuki). Sözleşme = dağıtıcıyla ticari ilişki (ort. 4,4
                // yıl, 13 kat sık yenilenir). Ölçüm: 180 günde lisans 130 · sözleşme 1.661.
                id: 'lisans',
                ad: 'Lisans Bitişi',
                sayi: veri.lisansBitecek?.length ?? 0,
                icerik: () =>
                  (veri.lisansBitecek?.length ?? 0) > 0 ? (
                    <Tablo
                      aciklama={
                        <div className="analiz-not">
                          <b>Bayilik lisansı</b> EPDK'nın verdiği faaliyet iznidir — sözleşmeden
                          ayrıdır. Bitince bayi <b>faaliyeti durur</b>; yenilenmesi bayinin
                          sorumluluğunda ama takibi bizim işimize doğrudan etki eder.
                        </div>
                      }
                      anahtar="lisansBitecek"
                      baslik="Bayilik Lisansı Bitecekler (6 ay)"
                      kolonlar={LISANS_KOLONLARI}
                      satirlar={lisansFiltreli}
                      ilkGosterim={50}
                      adim={100}
                      satirAnahtar={(s) => s.bayi_lisans_no}
                      satirSinif={(s) => (s.bizim ? 'satir-biz' : undefined)}
                      aramaEtiket="Bayi, lisans no, dağıtıcı veya il ara"
                      ustSag={
                        <div className="segment" role="group" aria-label="Lisans kapsamı">
                          {([
                            ['hepsi', 'Tümü'],
                            ['bizim', 'Parkoil'],
                            ['rakip', 'Rakip'],
                          ] as const).map(([id, ad]) => (
                            <button
                              key={id}
                              type="button"
                              className={lisansKapsam === id ? 'akt' : ''}
                              aria-pressed={lisansKapsam === id}
                              onClick={() => setLisansKapsam(id)}
                            >
                              {ad}
                            </button>
                          ))}
                        </div>
                      }
                    />
                  ) : (
                    <div className="takvim-bos">
                      Önümüzdeki 6 ayda bayilik lisansı bitecek bayi yok.
                    </div>
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
                    <>
                      {/* ⚠️ YENİ BAYİLER İKİ TABLOYA AYRILDI (2026-08-04, kullanıcı
                          isteği). Tek "YENİ BAYİ" etiketi iki farklı olayı
                          birleştiriyordu: gerçekten yeni ticari ilişki mi, yoksa
                          mevcut bayinin lisansı mı yenilendi. Ölçüm: COB 2 sözleşme
                          10 günlük (yeni), SDT GRUP 259 günlük (yalnız lisans). */}
                      {yeniSozlesmeler.length > 0 && (
                        <Tablo
                          aciklama={
                            <div className="analiz-not">
                              Bayinin dağıtıcıyla <b>sözleşmesi de yeni</b> (≤30 gün) —
                              gerçek anlamda yeni ticari ilişki.
                            </div>
                          }
                          anahtar="yeniSozlesme"
                          baslik="Yeni Dağıtıcı Sözleşmesi"
                          kolonlar={YENI_BAYI_KOLONLARI}
                          satirlar={yeniSozlesmeler}
                          satirAnahtar={(t) => `${t.bayi_lisans_no}-${t.tespit_gun}-ys`}
                          aramaEtiket="Bayi, il veya dağıtıcı ara"
                        />
                      )}
                      {lisansYenilenenler.length > 0 && (
                        <Tablo
                          aciklama={
                            <div className="analiz-not">
                              EPDK kaydı yeni göründü ama <b>sözleşme 30 günden eski</b> —
                              bayi zaten o dağıtıcıdaydı, yalnız bayilik lisansı yenilendi.
                              Yeni müşteri <b>değil</b>.
                            </div>
                          }
                          anahtar="lisansYenilendi"
                          baslik="Bayilik Lisansı Yenilendi"
                          kolonlar={YENI_BAYI_KOLONLARI}
                          satirlar={lisansYenilenenler}
                          satirAnahtar={(t) => `${t.bayi_lisans_no}-${t.tespit_gun}-ly`}
                          aramaEtiket="Bayi, il veya dağıtıcı ara"
                        />
                      )}
                      <Tablo
                        aciklama={
                          <div className="analiz-not">
                            Dağıtıcı değişikliği, lisans durumu değişikliği ve piyasadan
                            ayrılanlar.
                          </div>
                        }
                        anahtar="transferler"
                        baslik="Diğer Piyasa Hareketleri"
                        kolonlar={TRANSFER_KOLONLARI}
                        satirlar={digerHareketler}
                        satirAnahtar={(t) => `${t.bayi_lisans_no}-${t.tespit_gun}-${t.tip}`}
                        aramaEtiket="Bayi, il veya dağıtıcı ara"
                      />
                    </>
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

/* Tüm Bayiler bölümü — ortak `Tablo` bileşeni, SUNUCU TARAFLI modda.
 *
 * 2026-08-03: Eskiden burada elle yazılmış <table> vardı (30 bin satır client'a
 * inemediği için sunucu sayfalama şart). Ortak Tablo'ya `sunucu` prop grubu
 * eklendi → kolon/hücre eşlemesi tek listeden türüyor, CSV/kolon seçici/sticky
 * başlık davranışı panelin diğer 14 tablosuyla aynı.
 *
 * ⚠️ Tablo `sunucu` modunda client-side sıralama/filtreleme YAPMAZ — yaparsa
 * 50 satırlık sayfa kendi içinde sıralanıp sunucu sırasını bozardı. */
function TumBayiler(p: {
  sayfaliBayiler: Bayi[] | null; toplamEslesen: number; bayiHata: string | null;
  bayiYukleniyor: boolean; secenekler: { iller: string[]; dagiticilar: string[]; toplamBayi: number };
  sorgu: Sorgu; dispatch: (e: Eylem) => void; sayfa: number; toplamSayfa: number;
  /** CSV aktarımı Piyasa'da tanımlı (sunucudan sayfa sayfa çeker) → prop olarak gelir. */
  csvAktar: () => void; aktarPmi: boolean; aktarIlerleme: number;
}) {
  const { sayfaliBayiler, toplamEslesen, bayiHata, bayiYukleniyor, secenekler,
          sorgu, dispatch, sayfa, toplamSayfa, csvAktar, aktarPmi,
          aktarIlerleme } = p;

  const kolonlar = useMemo(() => bayiKolonlari(sorgu.sadeceBiz), [sorgu.sadeceBiz]);

  return (
    <section>
            {bayiHata && (
              <div className="hata" role="alert">
                <span aria-hidden="true">⚠ </span>
                {bayiHata}
              </div>
            )}
            {/* Arama + dropdown filtreleri: sunucuya gidiyor, bu yüzden Tablo'nun
                kendi arama kutusu (`aramaEtiket`) KULLANILMAZ — o client-side
                filtreler ve elimizdeki 50 satırı süzerdi. */}
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
            </div>

            <Tablo<Bayi>
              anahtar="bayiler"
              baslik="Tüm Bayiler"
              kolonlar={kolonlar}
              satirlar={sayfaliBayiler ?? []}
              satirAnahtar={(b) => b.bayi_lisans_no}
              satirSinif={(b) => (b.dagitim_sirketi === BIZ ? 'satir-biz' : undefined)}
              bosMesaj="Eşleşen bayi yok."
              // 50 satır sayfa boyutu ekranı taşırıyor → dikey kaydırma + sabit başlık.
              // Eşik 0: sayfa hep dolu geldiği için tablo her zaman kaydırmalı olsun.
              kaydirmaEsigi={0}
              sunucu={{
                toplam: toplamEslesen,
                tumToplam: secenekler.toplamBayi,
                sayfa,
                toplamSayfa,
                sayfaDegis: (s) => dispatch({ tip: 'sayfa', deger: s }),
                sirala: BAYI_SIRA_KOLONU[sorgu.sirala] ?? null,
                artan: sorgu.artan,
                siralaDegis: (kolonId) => {
                  const alan = BAYI_SIRA_ALANI[kolonId];
                  if (alan) dispatch({ tip: 'sirala', alan });
                },
                yukleniyor: bayiYukleniyor,
                ilkYukleme: sayfaliBayiler === null,
                csvAktar,
                csvPmi: aktarPmi,
                csvIlerleme: aktarIlerleme,
              }}
            />
    </section>
  );
}

/**
 * HACİM bazlı pazar payı bölümü — EPDK aylık sektör raporundan.
 *
 * NEDEN AYRI BİLEŞEN/SEKME: panelin diğer pazar payı ADET bazlı (kaç bayi).
 * Bu litre/ton bazlı. İkisi aynı soruya farklı cevap veriyor ve KARIŞTIRILMAMALI:
 * Parkoil bayi ADEDİNDE 15. sırada ama hacimde motorin %0,89 / benzin %0,14 —
 * yani motorin ağırlıklı bir dağıtıcı. Adet bazlı grafik bunu gizliyor.
 *
 * ⚠️ Veri KÜMÜLATİF (Ocak–ilgili ay) ve AYLIK yayınlanıyor (canlı değil) →
 *    dönem etiketi her başlıkta görünür, yoksa "bu ayın satışı" sanılır.
 * ⚠️ Dağıtıcı tablosu LİTRE, il tablosu TON — aynı grafikte toplanmaz.
 */
function HacimBolumu({ hacim }: { hacim?: HacimVeri }) {
  if (!hacim?.donem) {
    return (
      <div className="analiz-not">
        EPDK hacim verisi henüz çekilmemiş. <code>npm run hacim</code> ile
        aylık sektör raporundan doldurulur (public kaynak, kimlik gerekmez).
      </div>
    );
  }

  const donem = hacim.donem.etiket;
  const litre = (v: string | null) => Number(v ?? 0).toLocaleString('tr', { maximumFractionDigits: 0 });
  // Ürün grubu bazında ayrı sıralama — benzin ve motorin listesi farklı.
  const gruplar = [...new Set(hacim.dagitici.map((d) => d.urun_grubu))];

  return (
    <>
      {/* Bizim konumumuz — ürün grubu başına bir kart. */}
      <section className="kartlar">
        {hacim.bizim.map((b) => (
          <div className="kart vurgu-kart" key={b.urun_grubu}>
            <div className="kart-deger">%{Number(b.pazar_payi ?? 0).toFixed(3)}</div>
            <div className="kart-baslik">
              <span className="marka-rozet"><span className="sr-only">Parkoil bayisi: </span>PARKOIL</span>
              {b.urun_grubu === 'motorin' ? 'Motorin' : 'Benzin'} · {b.sira}/{b.toplam_dagitici}. sıra
            </div>
            <div className="kart-alt-not">{litre(b.toplam_litre)} litre</div>
          </div>
        ))}
      </section>

      <div className="analiz-not">
        Kaynak: <b>EPDK Petrol Piyasası Aylık Sektör Raporu</b> · dönem <b>{donem}</b>{' '}
        (kümülatif — bu ayın tek başına satışı değil). Pay yüzdeleri EPDK'nın kendi
        hesabıdır. Bu bölüm <b>satış hacmi</b> ölçer; "Rekabet Konumu" sekmesindeki
        pay ise <b>bayi adedi</b> ölçer — ikisi farklı sorulara cevap verir.
      </div>

      {gruplar.map((g) => {
        const satirlar = hacim.dagitici.filter((d) => d.urun_grubu === g);
        return (
          <CubukYatay
            key={g}
            veri={satirlar}
            ad={(d) => (d.bizim ? 'Turgut Dağıtım' : d.unvan)}
            deger={(d) => Number(d.pazar_payi ?? 0)}
            vurgu={(d) => d.bizim}
            baslik={`${g === 'motorin' ? 'Motorin' : 'Benzin'} Pazar Payı — HACİM`}
            altBaslik={`${satirlar.length} dağıtıcı · ${donem} kümülatif · bayi satış litresi`}
            birim="%"
            limit={12}
          />
        );
      })}

      {/* İl bazında hacim payı — adet bazlı ısı ızgarasının hacim karşılığı.
          Yalnız payımızın olduğu iller (pay 0 olan 81 ilin tamamı ızgarayı boğar). */}
      {hacim.il.some((x) => Number(x.pay) > 0) && (
        <IsiIzgara
          veri={hacim.il.filter((x) => Number(x.pay) > 0)}
          ad={(x) => x.il}
          deger={(x) => Number(x.pay)}
          altDeger={(x) => `${Number(x.biz_ton).toLocaleString('tr', { maximumFractionDigits: 0 })}/${Number(x.il_ton).toLocaleString('tr', { maximumFractionDigits: 0 })} ton`}
          baslik="İl Bazında Pazar Payı — HACİM (ton)"
          altBaslik={`${hacim.il.filter((x) => Number(x.pay) > 0).length} il · ${donem} · koyu = yüksek pay`}
          birim="%"
        />
      )}

      {/* Pay trendi — "payımız artıyor mu" sorusu. */}
      {hacim.trend.length > 0 && (
        <Tablo
          anahtar="hacimTrend"
          baslik="Pay Trendi (dönem dönem)"
          aciklama={
            <div className="analiz-not">
              Her satır o dönemin <b>kümülatif</b> değeri (Ocak–ilgili ay). Ardışık iki
              dönemin farkı tek ayın satışını verir.
            </div>
          }
          kolonlar={[
            { id: 'donem', ad: 'Dönem', varsayilan: true,
              hucre: (t: HacimVeri['trend'][number]) => `${t.yil}-${String(t.ay).padStart(2, '0')}`,
              sirala: (t: HacimVeri['trend'][number]) => `${t.yil}-${String(t.ay).padStart(2, '0')}`,
              ara: (t: HacimVeri['trend'][number]) => `${t.yil}-${String(t.ay).padStart(2, '0')}` },
            { id: 'grup', ad: 'Ürün', varsayilan: true,
              hucre: (t: HacimVeri['trend'][number]) => (t.urun_grubu === 'motorin' ? 'Motorin' : 'Benzin'),
              sirala: (t: HacimVeri['trend'][number]) => t.urun_grubu,
              ara: (t: HacimVeri['trend'][number]) => t.urun_grubu },
            { id: 'pay', ad: 'Pay', varsayilan: true, sinif: 'sag',
              hucre: (t: HacimVeri['trend'][number]) => `%${Number(t.pazar_payi ?? 0).toFixed(3)}`,
              sirala: (t: HacimVeri['trend'][number]) => Number(t.pazar_payi ?? 0) },
            { id: 'litre', ad: 'Litre', varsayilan: true, sinif: 'sag',
              hucre: (t: HacimVeri['trend'][number]) => Number(t.toplam_litre).toLocaleString('tr', { maximumFractionDigits: 0 }),
              sirala: (t: HacimVeri['trend'][number]) => Number(t.toplam_litre) },
          ]}
          satirlar={hacim.trend}
          satirAnahtar={(t) => `${t.yil}-${t.ay}-${t.urun_grubu}`}
          ilkGosterim={24}
          adim={24}
        />
      )}
    </>
  );
}
