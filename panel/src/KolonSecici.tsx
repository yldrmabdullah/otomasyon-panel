// Ortak kolon seçici (column picker) — hem İzleme hem Piyasa tablosunda kullanılır.
// "Kolonlar ▾" butonu → açılır menü, kolonları aç/kapa. localStorage'da kalıcı.
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface KolonTanim {
  id: string;
  ad: string;
  varsayilan: boolean; // başlangıçta görünür mü
  sabit?: boolean; // kapatılamaz (ör. ad kolonu)
}

/** Kolon görünürlük durumunu localStorage'da tutan hook. */
export function useKolonlar(anahtar: string, tanimlar: KolonTanim[]) {
  const [gorunur, setGorunur] = useState<Record<string, boolean>>(() => {
    try {
      const kayit = localStorage.getItem(`kolon:${anahtar}`);
      if (kayit) {
        const p = JSON.parse(kayit);
        // Kayıt doğrulaması: bozuk/eski biçim gelirse varsayılana dön.
        if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, boolean>;
      }
    } catch {
      /* yoksa varsayılan */
    }
    // Dar ekranda ilk kurulumda daha az kolon aç — 8 kolon 375px'de okunmaz.
    const dar = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
    if (dar) {
      let n = 0;
      return Object.fromEntries(
        tanimlar.map((t) => [t.id, Boolean(t.sabit || (t.varsayilan && n++ < 2))]),
      );
    }
    return Object.fromEntries(tanimlar.map((t) => [t.id, t.varsayilan]));
  });
  useEffect(() => {
    try {
      localStorage.setItem(`kolon:${anahtar}`, JSON.stringify(gorunur));
    } catch {
      /* localStorage yoksa yoksay */
    }
  }, [anahtar, gorunur]);

  const gorunurMu = (id: string) => {
    const t = tanimlar.find((x) => x.id === id);
    if (t?.sabit) return true; // sabit kolon HER ZAMAN görünür (colSpan tutarlılığı)
    return gorunur[id] ?? t?.varsayilan ?? false;
  };
  const degistir = (id: string) => setGorunur((g) => ({ ...g, [id]: !gorunurMu(id) }));
  // Görünür kolon sayısı — boş-durum satırının colSpan'ı buradan gelir.
  const gorunurSayi = useMemo(
    () => tanimlar.filter((t) => t.sabit || (gorunur[t.id] ?? t.varsayilan)).length,
    [tanimlar, gorunur],
  );
  return { gorunurMu, degistir, gorunurSayi };
}

/** "Kolonlar ▾" butonu + açılır seçim menüsü. */
export function KolonSecici({
  tanimlar,
  gorunurMu,
  degistir,
}: {
  tanimlar: KolonTanim[];
  gorunurMu: (id: string) => boolean;
  degistir: (id: string) => void;
}) {
  const [acik, setAcik] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!acik) return;
    const kapat = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAcik(false);
    };
    // Escape dinlenmiyordu → klavye kullanıcısı menüden Tab'la çıkmak zorundaydı.
    const tus = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setAcik(false);
      btnRef.current?.focus(); // focus body'ye düşmesin, tetikleyiciye dönsün
    };
    document.addEventListener('mousedown', kapat);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', kapat);
      document.removeEventListener('keydown', tus);
    };
  }, [acik]);

  useEffect(() => {
    if (acik) menuRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
  }, [acik]);

  // Menüden Tab'la çıkınca kapan (focus tuzağı değil, doğal kapanma)
  const blurKapat = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setAcik(false);
  };

  const acikSayi = tanimlar.filter((t) => gorunurMu(t.id)).length;

  return (
    <div className="kolon-secici" ref={ref} onBlur={blurKapat}>
      <button
        ref={btnRef}
        type="button"
        className="kolon-btn"
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        aria-haspopup="true"
        aria-controls={menuId}
      >
        Kolonlar <span className="kolon-sayi">{acikSayi}</span>
        <span aria-hidden="true">▾</span>
        <span className="sr-only">
          — {acikSayi} / {tanimlar.length} kolon görünür
        </span>
      </button>
      {acik && (
        // role="menu" DEĞİL: menu rolü yalnız menuitem* çocuk kabul eder,
        // label+checkbox geçersiz çocuktur ve ekran okuyucu checkbox'ları
        // hiç okumayabilir. Zaten doğru semantik olan group kullanılıyor.
        <div className="kolon-menu" id={menuId} ref={menuRef} role="group" aria-label="Görünür kolonlar">
          {tanimlar.map((t) => (
            <label key={t.id} className={`kolon-oge ${t.sabit ? 'sabit' : ''}`}>
              <input
                type="checkbox"
                checked={gorunurMu(t.id)}
                disabled={t.sabit}
                onChange={() => degistir(t.id)}
              />
              {t.ad}
              {t.sabit && <span className="kolon-sabit-not">sabit</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
