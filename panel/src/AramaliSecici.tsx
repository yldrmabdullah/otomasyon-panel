/* Aramalı seçici (searchable combobox).
 *
 * NEDEN: 149 istasyonluk düz `<select>` kullanılamıyordu — açılır liste ekranı
 * kaplıyor, aradığını bulmak için kaydırmak gerekiyor, uzun bayi unvanları
 * kesiliyor. Tarayıcının native select'i arama da desteklemiyor (yalnız ilk
 * harfe atlıyor, "ASLANLAR MALATYA" gibi son-kelime aramasında işe yaramaz).
 *
 * ARIA: `role="combobox"` + `aria-expanded` + `aria-activedescendant` ile gerçek
 * combobox deseni. Klavye: ↓/↑ gezinme, Enter seç, Escape kapat, yazınca filtre.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface SeciciOge {
  deger: string;
  ad: string;
  /** İkinci satır (kod, şehir…) — aramaya dahil edilir. */
  alt?: string;
}

export function AramaliSecici({
  ogeler,
  deger,
  degisti,
  tumuEtiket = 'Tümü',
  etiket,
  genislik = 260,
}: {
  ogeler: SeciciOge[];
  /** Boş string = "tümü" seçili. */
  deger: string;
  degisti: (d: string) => void;
  tumuEtiket?: string;
  etiket: string;
  genislik?: number;
}) {
  const [acik, setAcik] = useState(false);
  const [sorgu, setSorgu] = useState('');
  const [imlec, setImlec] = useState(0);
  const sarRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  const girisRef = useRef<HTMLInputElement>(null);
  const listeId = useId();

  const secili = ogeler.find((o) => o.deger === deger);
  const gosterilen = secili?.ad ?? tumuEtiket;

  // Filtre: ad VE alt satırda ara, Türkçe küçültme ile.
  const suzulmus = useMemo(() => {
    const q = sorgu.trim().toLocaleLowerCase('tr');
    const tam: SeciciOge[] = [{ deger: '', ad: tumuEtiket }, ...ogeler];
    if (!q) return tam;
    return tam.filter(
      (o) =>
        o.deger === '' ||
        o.ad.toLocaleLowerCase('tr').includes(q) ||
        (o.alt ?? '').toLocaleLowerCase('tr').includes(q),
    );
  }, [ogeler, sorgu, tumuEtiket]);

  // Açılınca aramaya odaklan; kapanınca sorguyu temizle.
  useEffect(() => {
    if (acik) {
      girisRef.current?.focus();
      setImlec(Math.max(0, suzulmus.findIndex((o) => o.deger === deger)));
    } else {
      setSorgu('');
    }
    // suzulmus/deger bilinçli dışarıda: yalnız açılış anında konumlanmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  // Dışına tıkla / Escape ile kapan (KolonSecici ile aynı desen; iOS için touchstart de).
  useEffect(() => {
    if (!acik) return;
    const kapat = (e: Event) => {
      if (sarRef.current && !sarRef.current.contains(e.target as Node)) setAcik(false);
    };
    document.addEventListener('mousedown', kapat);
    document.addEventListener('touchstart', kapat, { passive: true });
    return () => {
      document.removeEventListener('mousedown', kapat);
      document.removeEventListener('touchstart', kapat);
    };
  }, [acik]);

  // İmleç görünür kalsın (klavyeyle gezinirken liste kaysın).
  useEffect(() => {
    if (!acik) return;
    listeRef.current?.querySelector<HTMLElement>('[data-imlec="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [imlec, acik]);

  function sec(o: SeciciOge) {
    degisti(o.deger);
    setAcik(false);
  }

  function tus(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setAcik(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!acik) { setAcik(true); return; }
      setImlec((i) => {
        const y = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return Math.max(0, Math.min(suzulmus.length - 1, y));
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!acik) { setAcik(true); return; }
      const o = suzulmus[imlec];
      if (o) sec(o);
    }
  }

  return (
    <div className="ar-secici" ref={sarRef} style={{ ['--ar-en' as string]: `${genislik}px` }}>
      <button
        type="button"
        className={`ar-tetik ${deger ? 'dolu' : ''}`}
        onClick={() => setAcik((a) => !a)}
        onKeyDown={tus}
        aria-expanded={acik}
        aria-haspopup="listbox"
        aria-label={`${etiket}: ${gosterilen}`}
        title={gosterilen}
      >
        <span className="ar-deger">{gosterilen}</span>
        <span aria-hidden="true" className="ar-ok">▾</span>
      </button>

      {acik && (
        <div className="ar-menu">
          <input
            ref={girisRef}
            className="ar-ara"
            type="text"
            value={sorgu}
            onChange={(e) => { setSorgu(e.target.value); setImlec(0); }}
            onKeyDown={tus}
            placeholder="Ara…"
            aria-label={`${etiket} ara`}
            aria-controls={listeId}
            aria-expanded="true"
            role="combobox"
            aria-autocomplete="list"
          />
          <div className="ar-liste" id={listeId} role="listbox" ref={listeRef} aria-label={etiket}>
            {suzulmus.length === 0 && <div className="ar-bos">Eşleşen kayıt yok.</div>}
            {suzulmus.map((o, i) => (
              <button
                key={o.deger || '__tumu'}
                type="button"
                role="option"
                aria-selected={o.deger === deger}
                data-imlec={i === imlec ? '1' : undefined}
                className={`ar-oge ${i === imlec ? 'imlec' : ''} ${o.deger === deger ? 'sec' : ''}`}
                onClick={() => sec(o)}
                onMouseEnter={() => setImlec(i)}
              >
                <span className="ar-oge-ad">{o.ad}</span>
                {o.alt && <span className="ar-oge-alt">{o.alt}</span>}
              </button>
            ))}
          </div>
          {/* Kaç kayıt süzüldü — uzun listede "hepsi bu mu?" sorusunu keser. */}
          <div className="ar-dip">
            {sorgu ? `${suzulmus.length - 1} eşleşme` : `${ogeler.length} kayıt`}
          </div>
        </div>
      )}
    </div>
  );
}
