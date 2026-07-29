/* Paylaşılan veri yükleme + kabuk parçaları.
   Izleme ve Piyasa aynı fetch/hata/polling desenini birebir kopyalıyordu;
   burada tek yere alındı ve iki gerçek bug kapatıldı:
     1) AbortController yoktu → modül değişince uçuşta olan istek dönüp
        setState çağırıyordu; daha kötüsü bayat yanıt taze veriyi eziyordu.
     2) Hata gövdesi tip birleşimi olarak modellenmemişti → `(d as any).hata`. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tazelik } from './tipler';

export type ApiYanit<T> = T | { hata: string };

export function hataMi<T>(d: ApiYanit<T>): d is { hata: string } {
  return typeof d === 'object' && d !== null && 'hata' in d;
}

export function useVeri<T>(url: string, dogrula?: (d: unknown) => T, aralikMs?: number) {
  const [veri, setVeri] = useState<T | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  // Yarış koşulu koruması: yalnız EN SON isteğin sonucu state'e yazılır.
  const sonRef = useRef(0);

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
    if (!aralikMs) return () => ac.abort();
    const t = setInterval(() => {
      // Sekme arka plandaysa ağı yorma (günde ~164 MB gereksiz trafik).
      if (document.visibilityState === 'visible') yukle();
    }, aralikMs);
    return () => {
      ac.abort();
      clearInterval(t);
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
            'Yükleniyor…'
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
