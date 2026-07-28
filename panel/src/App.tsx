import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Izleme } from './Izleme.js';
import { Mevzuat } from './Mevzuat.js';
import { Piyasa } from './Piyasa.js';
import { IkonIzleme, IkonMevzuat, IkonPiyasa } from './ikon.js';

type Modul = 'izleme' | 'mevzuat' | 'piyasa';
type Tema = 'sistem' | 'light' | 'dark';

const MODULLER: { id: Modul; ad: string; Ikon: () => ReactElement; alt: string }[] = [
  { id: 'izleme', ad: 'İzleme', Ikon: IkonIzleme, alt: 'Bağlantı & tank' },
  { id: 'mevzuat', ad: 'Mevzuat', Ikon: IkonMevzuat, alt: 'EPDK & mutabakat' },
  { id: 'piyasa', ad: 'Piyasa', Ikon: IkonPiyasa, alt: 'Dağıtıcı & bayi' },
];

const TEMA_AD: Record<Tema, string> = { sistem: 'Oto', light: 'Açık', dark: 'Koyu' };

export function App() {
  const [modul, setModul] = useState<Modul>('izleme');
  const aktif = MODULLER.find((m) => m.id === modul)!;
  const basRef = useRef<HTMLHeadingElement>(null);
  const ilkRef = useRef(true);

  // Tema seçimi bir erişilebilirlik kontrolü: CSS'te data-theme override'ları
  // vardı ama hiçbir yer set etmiyordu → kullanıcı OS ayarına mahkumdu.
  const [tema, setTema] = useState<Tema>(() => {
    const k = localStorage.getItem('tema');
    return k === 'light' || k === 'dark' ? k : 'sistem';
  });
  useEffect(() => {
    if (tema === 'sistem') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('tema', tema);
  }, [tema]);

  // Modül değişince başlığa odaklan → ekran okuyucu yeni bölümü duyurur.
  // İlk render'da odaklanma (sayfa açılışında focus zıplaması istenmez).
  useEffect(() => {
    if (ilkRef.current) {
      ilkRef.current = false;
      return;
    }
    basRef.current?.focus();
  }, [modul]);

  return (
    <div className="uygulama">
      <a href="#ana-icerik" className="atla">
        Ana içeriğe geç
      </a>
      <aside className="kenar" aria-label="Modül gezinme">
        <div className="marka">
          <img className="marka-logo-img logo-koyu" src="/marka/parkoil-beyaz.png" alt="Parkoil" />
          <img className="marka-logo-img logo-acik" src="/marka/parkoil-kirmizi.png" alt="Parkoil" />
          <div className="marka-yazi">
            <div className="marka-alt">Otomasyon Paneli</div>
          </div>
        </div>
        <nav className="kenar-nav" aria-label="Modüller">
          {MODULLER.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`kenar-oge ${modul === m.id ? 'akt' : ''}`}
              onClick={() => setModul(m.id)}
              aria-current={modul === m.id ? 'true' : undefined}
            >
              <span className="kenar-ikon">
                <m.Ikon />
              </span>
              <span className="kenar-metin">
                <span className="kenar-ad">{m.ad}</span>
                <span className="kenar-alt">{m.alt}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="tema-secim" role="group" aria-label="Renk teması">
          {(['sistem', 'light', 'dark'] as Tema[]).map((t) => (
            <button key={t} type="button" aria-pressed={tema === t} onClick={() => setTema(t)}>
              {TEMA_AD[t]}
            </button>
          ))}
        </div>
        <div className="kenar-dip">Turgut Dağıtım Enerji A.Ş.</div>
      </aside>

      <main className="icerik" id="ana-icerik">
        <div className="icerik-ic">
          <div className="baslik-satiri">
            <h1 ref={basRef} tabIndex={-1}>
              {aktif.ad}
            </h1>
          </div>
          {modul === 'izleme' ? <Izleme /> : modul === 'mevzuat' ? <Mevzuat /> : <Piyasa />}
        </div>
      </main>
    </div>
  );
}
