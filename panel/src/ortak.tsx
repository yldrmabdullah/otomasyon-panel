/* Paylaşılan veri yükleme + kabuk parçaları.
   Izleme ve Piyasa aynı fetch/hata/polling desenini birebir kopyalıyordu;
   burada tek yere alındı ve iki gerçek bug kapatıldı:
     1) AbortController yoktu → modül değişince uçuşta olan istek dönüp
        setState çağırıyordu; daha kötüsü bayat yanıt taze veriyi eziyordu.
     2) Hata gövdesi tip birleşimi olarak modellenmemişti → `(d as any).hata`. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tazelik } from './tipler';
import { IkonSpinner } from './ikon.js';

export type ApiYanit<T> = T | { hata: string };

/* ── TEMA ───────────────────────────────────────────────────────────────────
   Tema seçimi App.tsx içinde gömülüydü ve kontrolü YALNIZ hesap menüsündeydi →
   giriş ekranında hiç erişilemiyordu: kullanıcı henüz girmemişken temayı
   değiştiremiyor, OS ayarına mahkum kalıyordu. Mantık buraya alındı, kontrol
   hem girişte hem panelde kullanılıyor. Seçim localStorage'da, oturumdan bağımsız. */

export type Tema = 'sistem' | 'light' | 'dark';
export const TEMA_AD: Record<Tema, string> = { sistem: 'Oto', light: 'Açık', dark: 'Koyu' };
/** Ekran okuyucu için tam ad — "Oto"/"Açık" tek başına ne olduğunu söylemiyor. */
const TEMA_TAM: Record<Tema, string> = {
  sistem: 'Sistem ayarını kullan',
  light: 'Açık tema',
  dark: 'Koyu tema',
};

function temaOku(): Tema {
  try {
    const k = localStorage.getItem('tema');
    return k === 'light' || k === 'dark' ? k : 'sistem';
  } catch {
    return 'sistem'; // localStorage kapalıysa (gizli sekme kısıtı) çökmesin
  }
}

/** Temayı <html data-theme> özniteliğine uygular ve localStorage'a yazar. */
export function useTema() {
  const [tema, setTema] = useState<Tema>(temaOku);
  useEffect(() => {
    if (tema === 'sistem') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', tema);
    try {
      localStorage.setItem('tema', tema);
    } catch {
      /* yoksay */
    }
  }, [tema]);
  return { tema, setTema };
}

/** Üç durumlu tema düğmesi (Oto / Açık / Koyu). `sinif` ile bağlama uyarlanır. */
export function TemaSecici({
  tema,
  setTema,
  sinif = 'tema-secim',
}: {
  tema: Tema;
  setTema: (t: Tema) => void;
  sinif?: string;
}) {
  return (
    <div className={sinif} role="group" aria-label="Renk teması">
      {(['sistem', 'light', 'dark'] as Tema[]).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={tema === t}
          onClick={() => setTema(t)}
          title={TEMA_TAM[t]}
        >
          {TEMA_AD[t]}
          <span className="sr-only"> — {TEMA_TAM[t]}</span>
        </button>
      ))}
    </div>
  );
}

export function hataMi<T>(d: ApiYanit<T>): d is { hata: string } {
  return typeof d === 'object' && d !== null && 'hata' in d;
}

export function useVeri<T>(url: string, dogrula?: (d: unknown) => T, aralikMs?: number) {
  const [veri, setVeri] = useState<T | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  // Yarış koşulu koruması: yalnız EN SON isteğin sonucu state'e yazılır.
  const sonRef = useRef(0);
  /** Son başarılı çekim anı — sekmeye dönünce "bayat mı" kararı buna bakar. */
  const sonYukleme = useRef(0);

  const yukle = useCallback(
    async (sinyal?: AbortSignal) => {
      const benim = ++sonRef.current;
      try {
        setYukleniyor(true);
        const r = await fetch(url, { signal: sinyal });
        // Oturum düştü (12 sa ömür) → sayfayı yenile, App giriş ekranını gösterir.
        // Yoksa panel "Veri alınamadı (401)" ile donup kalırdı.
        if (r.status === 401) {
          location.reload();
          return;
        }
        if (!r.ok) throw new Error(`Veri alınamadı (${r.status} ${r.statusText})`);
        const d: ApiYanit<T> = await r.json();
        if (hataMi(d)) throw new Error(d.hata);
        const temiz = dogrula ? dogrula(d) : (d as T);
        if (benim !== sonRef.current) return; // bayat yanıt — yut
        setVeri(temiz);
        setHata(null);
        sonYukleme.current = Date.now();
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        if (benim !== sonRef.current) return;
        setHata(e instanceof Error ? e.message : String(e));
      } finally {
        if (benim === sonRef.current) setYukleniyor(false);
      }
    },
    [url, dogrula],
  );

  useEffect(() => {
    const ac = new AbortController();
    yukle(ac.signal);

    // ── SEKMEYE GERİ DÖNÜNCE TAZELE ────────────────────────────────────────
    // Panel gün boyu açık bir sekmede duruyor. Polling'i olan modüller kendi
    // aralığında yenileniyordu ama polling'i OLMAYANLAR (Piyasa, Fiyat,
    // Mutabakat, Uzlaştırma) ilk yüklemede kalıyordu: kullanıcı öğleden sonra
    // sekmeye dönüp sabahki veriye bakıyor ve güncel sanıyordu.
    // Arka plandayken ağ yorulmaz; yalnız GÖRÜNÜR olunca ve veri bayatsa çekilir.
    const BAYAT_MS = 60_000;
    const gorunurlukDegisti = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - sonYukleme.current >= BAYAT_MS) yukle();
    };
    document.addEventListener('visibilitychange', gorunurlukDegisti);

    if (!aralikMs) {
      return () => {
        ac.abort();
        document.removeEventListener('visibilitychange', gorunurlukDegisti);
      };
    }
    const t = setInterval(() => {
      // Sekme arka plandaysa ağı yorma (günde ~164 MB gereksiz trafik).
      if (document.visibilityState === 'visible') yukle();
    }, aralikMs);
    return () => {
      ac.abort();
      clearInterval(t);
      document.removeEventListener('visibilitychange', gorunurlukDegisti);
    };
  }, [yukle, aralikMs]);

  return { veri, hata, yukleniyor, yenile: useCallback(() => yukle(), [yukle]) };
}

/** ASIS "hiç veri göndermemiş" için 1900-12-31 sentinel tarihi döndürüyor.
 *  Ham göstermek "45865 gün önce" gibi anlamsız çıktı veriyordu. Makul bir
 *  eşiğin (10 yıl) ötesindeki her tarih sentinel kabul edilir. */
const SENTINEL_GUN = 3650;

/** Göreli zaman ("3.2 sa önce"). null/sentinel → 'hiç veri yok'. */
export function zamanFark(iso: string | null): string {
  if (!iso) return 'hiç veri yok';
  const dk = (Date.now() - new Date(iso).getTime()) / 60000;
  if (Number.isNaN(dk)) return 'hiç veri yok';
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${Math.round(dk)} dk önce`;
  const sa = dk / 60;
  if (sa < 24) return `${sa.toFixed(1)} sa önce`;
  const gun = Math.round(sa / 24);
  if (gun > SENTINEL_GUN) return 'hiç veri yok';
  return `${gun} gün önce`;
}

/** Sentinel/boş tarih mi (hiç veri gelmemiş)? Renk/aciliyet kararlarında kullanılır. */
export function veriYok(iso: string | null): boolean {
  if (!iso) return true;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return true;
  return (Date.now() - ms) / 86_400_000 > SENTINEL_GUN;
}

/** TR tarih (gg.aa.yyyy). ISO 'yyyy-mm-dd' ekran okuyucuda rakam çorbası. */
export function trTarih(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Boş hücre göstergesi — '—' ekran okuyucuda "kısa çizgi" diye okunuyordu. */
export function Bos() {
  return <span aria-label="veri yok">—</span>;
}

/**
 * Kaynak bazlı tazelik şeridi.
 *
 * NEDEN: ModulBar'ın "Güncelleme" değeri API YANITININ üretim zamanı — her zaman
 * "az önce" görünür, çünkü isteği o an attık. Kullanıcının bilmesi gereken ise
 * ARKADAKİ verinin yaşı: EPDK piyasa çekimi 2026-07-29'a kadar elle yapılıyordu ve
 * panel 2 günlük snapshot'ı sessizce "canlı" gibi gösteriyordu.
 *
 * Bayat olan kaynak vurgulanır; hepsi tazeyse şerit tek satırda sessiz kalır.
 */
export function TazelikSerit({ liste }: { liste?: Tazelik[] }) {
  if (!liste?.length) return null;
  const bayatlar = liste.filter((t) => t.bayat);

  return (
    <div className="tazelik-serit">
      {/* Bayat varsa önce onlar — göz ilk oraya gitsin */}
      {bayatlar.length > 0 && (
        <p className="tazelik-uyari" role="status">
          <span aria-hidden="true">▲ </span>
          {bayatlar.length === 1
            ? `${bayatlar[0].ad} güncel değil (${zamanFark(bayatlar[0].son)})`
            : `${bayatlar.length} veri kaynağı güncel değil`}
        </p>
      )}
      <dl className="tazelik-liste">
        {liste.map((t) => (
          <div key={t.anahtar} className={t.bayat ? 'tazelik-oge bayat' : 'tazelik-oge'}>
            <dt>{t.ad}</dt>
            <dd>
              {t.son ? (
                <time dateTime={t.son}>{zamanFark(t.son)}</time>
              ) : (
                <span>hiç çekilmemiş</span>
              )}
              {/* Renk tek taşıyıcı olmasın: bayat olan ayrıca metinle işaretli */}
              {t.bayat && <span className="sr-only"> — güncel değil</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Özet kartı (KPI). Operasyon ve Sorun modüllerinde neredeyse birebir aynı bileşen
 * ayrı ayrı tanımlıydı (biri `deger: ReactNode`, diğeri `deger: number`), Mutabakat
 * ve Uzlaştırma ise kartları elle JSX yazıyordu → dört ayrı gerçek.
 *
 * TIKLANABİLİRLİK GÖRÜNÜR OLMALI: İzleme/Mutabakat'ta kartlar filtre butonu,
 * Operasyon/Sorun'da salt gösterim — ama ikisi de AYNI görünüyordu. Tek fark
 * hover'da 2px kalkmaktı ve dokunmatikte hover yok. Kullanıcı tıklayıp tepki
 * alamayınca panel bozuk sanıyordu. Artık tıklanabilir kart <button> olur, imleç
 * ve odak halkası alır, `aria-pressed` ile durumunu söyler; salt gösterim <div>.
 */
export function Kart({
  ad,
  deger,
  alt,
  acil,
  uyari,
  secili,
  tikla,
}: {
  ad: string;
  deger: ReactNode;
  alt?: ReactNode;
  /** Kritik durum — kırmızı şerit + ▲ işareti (renk tek taşıyıcı değil). */
  acil?: boolean;
  /** Uyarı durumu — amber şerit. `acil` verilmişse o kazanır. */
  uyari?: boolean;
  /** Filtre kartlarında seçili hâl (yalnız `tikla` ile anlamlı). */
  secili?: boolean;
  /** Verilirse kart bir filtre butonuna dönüşür. */
  tikla?: () => void;
}) {
  const sinif = [
    'kart',
    acil ? 'krit' : uyari ? 'uyari' : '',
    tikla ? 'tiklanir' : '',
    secili ? 'sec' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const govde = (
    <>
      <div className="kart-deger">
        {acil && <span aria-hidden="true">▲ </span>}
        {deger}
      </div>
      <div className="kart-baslik">{ad}</div>
      {alt && <div className="kart-alt-not">{alt}</div>}
    </>
  );

  if (!tikla) return <div className={sinif}>{govde}</div>;
  return (
    <button type="button" className={sinif} aria-pressed={!!secili} onClick={tikla}>
      {govde}
    </button>
  );
}

/** Modül üst çubuğu: açıklama + tazelik + Yenile. İki modülde birebir aynıydı. */
export function ModulBar({
  alt,
  taze,
  yukleniyor,
  yenile,
  duyuru,
}: {
  alt: string;
  taze?: string | null;
  yukleniyor: boolean;
  yenile: () => void;
  duyuru?: ReactNode;
}) {
  return (
    <div className="modul-bar">
      <span className="modul-alt">{alt}</span>
      <div className="ust-sag">
        {taze && (
          <span className="taze">
            Güncelleme: <time dateTime={taze}>{zamanFark(taze)}</time>
          </span>
        )}
        <button className="yenile" type="button" onClick={yenile} disabled={yukleniyor}>
          {yukleniyor ? (
            <span className="yenile-yukle"><IkonSpinner boyut={14} />Yükleniyor…</span>
          ) : (
            <>
              <span aria-hidden="true">↻ </span>Yenile
            </>
          )}
        </button>
      </div>
      {/* Otomatik yenileme sessizdi — ekran okuyucu artık haberdar */}
      <div className="sr-only" role="status" aria-live="polite">
        {yukleniyor ? 'Veriler yükleniyor' : duyuru}
      </div>
    </div>
  );
}
