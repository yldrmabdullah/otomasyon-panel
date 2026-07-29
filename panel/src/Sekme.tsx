/* Sekme (tab) bileşeni — bir modülün içindeki bölümleri gruplar.
 *
 * Piyasa modülü 7 bölüm içeriyordu ve sayfa çok uzuyordu; kullanıcı aradığını
 * bulmak için kaydırmak zorundaydı. Sekmelere bölünüyor.
 *
 * ⚠️ BU GERÇEK BİR TAB PATTERN — İzleme'deki durum filtresi gibi "aslında filtre"
 * değil. Bu yüzden TAM ARIA uygulanır: role=tablist/tab/tabpanel, aria-selected,
 * aria-controls, ok tuşu gezinme (Home/End dahil). Yarım ARIA hiç ARIA'dan kötüdür.
 */
import { useId, useRef, useState, type ReactNode } from 'react';

export interface SekmeTanim {
  id: string;
  ad: string;
  /** Sekme başlığındaki sayaç (ör. kayıt sayısı). */
  sayi?: number;
  /** Dikkat çekmesi gereken sekme (ör. açık alarm var) → kırmızı sayaç. */
  acil?: boolean;
  icerik: () => ReactNode;
}

export function Sekmeler({
  tanimlar,
  anahtar,
}: {
  tanimlar: SekmeTanim[];
  /** localStorage anahtarı — kullanıcı hangi sekmedeydi hatırlanır. */
  anahtar?: string;
}) {
  const temelId = useId();
  const [aktif, setAktif] = useState<string>(() => {
    if (anahtar) {
      try {
        const k = localStorage.getItem(`sekme:${anahtar}`);
        if (k && tanimlar.some((t) => t.id === k)) return k;
      } catch { /* yoksay */ }
    }
    return tanimlar[0]?.id ?? '';
  });
  const btnRef = useRef<(HTMLButtonElement | null)[]>([]);

  function sec(id: string) {
    setAktif(id);
    if (anahtar) { try { localStorage.setItem(`sekme:${anahtar}`, id); } catch { /* yoksay */ } }
  }

  /** Ok tuşu gezinme — gerçek tab pattern'in zorunlu parçası. */
  function tus(e: React.KeyboardEvent, i: number) {
    const son = tanimlar.length - 1;
    let hedef = -1;
    if (e.key === 'ArrowRight') hedef = i === son ? 0 : i + 1;
    else if (e.key === 'ArrowLeft') hedef = i === 0 ? son : i - 1;
    else if (e.key === 'Home') hedef = 0;
    else if (e.key === 'End') hedef = son;
    if (hedef < 0) return;
    e.preventDefault();
    sec(tanimlar[hedef].id);
    btnRef.current[hedef]?.focus();
  }

  const aktifTanim = tanimlar.find((t) => t.id === aktif) ?? tanimlar[0];

  return (
    <>
      <div className="sekme-serit" role="tablist" aria-label="Bölümler">
        {tanimlar.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { btnRef.current[i] = el; }}
            type="button"
            role="tab"
            id={`${temelId}-t-${t.id}`}
            aria-selected={aktifTanim.id === t.id}
            aria-controls={`${temelId}-p-${t.id}`}
            // Sadece aktif sekme Tab sırasında; gezinme ok tuşlarıyla (ARIA gereği)
            tabIndex={aktifTanim.id === t.id ? 0 : -1}
            className={`sekme${aktifTanim.id === t.id ? ' akt' : ''}`}
            onClick={() => sec(t.id)}
            onKeyDown={(e) => tus(e, i)}
          >
            {t.ad}
            {t.sayi !== undefined && (
              <span className={`sekme-sayi${t.acil ? ' acil' : ''}`}>{t.sayi.toLocaleString('tr')}</span>
            )}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${temelId}-p-${aktifTanim.id}`}
        aria-labelledby={`${temelId}-t-${aktifTanim.id}`}
        tabIndex={0}
        className="sekme-panel"
      >
        {aktifTanim.icerik()}
      </div>
    </>
  );
}
