import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Izleme } from './Izleme.js';
import { Mevzuat } from './Mevzuat.js';
import { Piyasa } from './Piyasa.js';
import { Operasyon } from './Operasyon.js';
import { Sorun } from './Sorun.js';
import { Giris } from './Giris.js';
import { SifreDegistir } from './SifreDegistir.js';
import { Kullanicilar } from './Kullanicilar.js';
import { IkonIzleme, IkonMevzuat, IkonPiyasa, IkonOperasyon, IkonSorun, IkonKullanici } from './ikon.js';

type Modul = 'izleme' | 'operasyon' | 'sorun' | 'mevzuat' | 'piyasa' | 'kullanicilar';
type Tema = 'sistem' | 'light' | 'dark';

interface Oturum {
  kullanici: string;
  rol: 'admin' | 'izleyici';
  adSoyad: string | null;
  sifreDegistir: boolean;
}

const MODULLER: { id: Modul; ad: string; Ikon: () => ReactElement; alt: string; adminMi?: boolean }[] = [
  { id: 'izleme', ad: 'İzleme', Ikon: IkonIzleme, alt: 'Bağlantı & tank' },
  { id: 'operasyon', ad: 'Operasyon', Ikon: IkonOperasyon, alt: 'Stok & alarm & kalite' },
  { id: 'sorun', ad: 'Sorun Tespiti', Ikon: IkonSorun, alt: 'İrsaliye & dolum anomalisi' },
  { id: 'mevzuat', ad: 'Mevzuat', Ikon: IkonMevzuat, alt: 'EPDK & mutabakat' },
  { id: 'piyasa', ad: 'Piyasa', Ikon: IkonPiyasa, alt: 'Dağıtıcı & bayi' },
  { id: 'kullanicilar', ad: 'Kullanıcılar', Ikon: IkonKullanici, alt: 'Yetki yönetimi', adminMi: true },
];

const TEMA_AD: Record<Tema, string> = { sistem: 'Oto', light: 'Açık', dark: 'Koyu' };

export function App() {
  const [modul, setModul] = useState<Modul>('izleme');
  const basRef = useRef<HTMLHeadingElement>(null);
  const ilkRef = useRef(true);

  // Oturum: undefined = henüz sorulmadı, null = giriş yok, nesne = girişli.
  // Şifre/jeton JS'te TUTULMAZ — sunucu HttpOnly çerez kuruyor.
  const [oturum, setOturum] = useState<Oturum | null | undefined>(undefined);
  // Kullanıcı Ayarlar'dan isteyerek şifre değiştirmek istediğinde.
  const [sifreEkrani, setSifreEkrani] = useState(false);

  const oturumSor = useCallback(async () => {
    try {
      const r = await fetch('/api/giris');
      const d = r.ok ? await r.json() : { girisli: false };
      setOturum(
        d?.girisli
          ? { kullanici: d.kullanici, rol: d.rol ?? 'izleyici', adSoyad: d.adSoyad ?? null, sifreDegistir: !!d.sifreDegistir }
          : null,
      );
    } catch {
      setOturum(null); // ağ hatası → giriş ekranı
    }
  }, []);

  useEffect(() => { oturumSor(); }, [oturumSor]);

  async function cikis() {
    await fetch('/api/giris', { method: 'DELETE' }).catch(() => {});
    setOturum(null);
  }

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
  useEffect(() => {
    if (ilkRef.current) { ilkRef.current = false; return; }
    basRef.current?.focus();
  }, [modul]);

  // Oturum sorgusu bitmeden panel çizilmez (korumalı veriye istek gitmesin).
  if (oturum === undefined) return <div className="giris-sar" aria-busy="true" />;
  if (oturum === null) return <Giris girisOldu={oturumSor} />;

  // İlk girişte şifre değiştirme ZORUNLU — panel açılmaz.
  if (oturum.sifreDegistir) return <SifreDegistir zorunlu bitti={oturumSor} />;
  if (sifreEkrani)
    return (
      <SifreDegistir
        zorunlu={false}
        bitti={() => { setSifreEkrani(false); oturumSor(); }}
        iptal={() => setSifreEkrani(false)}
      />
    );

  // Yetkisi olmayan modüller menüde görünmez; adres/state ile de açılamaz.
  const gorunurModuller = MODULLER.filter((m) => !m.adminMi || oturum.rol === 'admin');
  const aktif = gorunurModuller.find((m) => m.id === modul) ?? gorunurModuller[0];

  return (
    <div className="uygulama">
      <a href="#ana-icerik" className="atla">Ana içeriğe geç</a>
      <aside className="kenar" aria-label="Modül gezinme">
        <div className="marka">
          <img className="marka-logo-img logo-koyu" src="/marka/parkoil-beyaz.png" alt="Parkoil" />
          <img className="marka-logo-img logo-acik" src="/marka/parkoil-kirmizi.png" alt="Parkoil" />
          <div className="marka-yazi">
            <div className="marka-alt">Otomasyon Paneli</div>
          </div>
        </div>
        <nav className="kenar-nav" aria-label="Modüller">
          {gorunurModuller.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`kenar-oge ${aktif.id === m.id ? 'akt' : ''}`}
              onClick={() => setModul(m.id)}
              aria-current={aktif.id === m.id ? 'true' : undefined}
              // Mobilde (≤560px) modül ADI gizlenip yalnız ikon kalıyor (5 modül
              // 390px şeride sığmıyordu). aria-label olmadan ekran okuyucu butonu
              // adlandıramaz → ad her koşulda erişilebilir kalsın.
              aria-label={`${m.ad} — ${m.alt}`}
              title={m.ad}
            >
              <span className="kenar-ikon"><m.Ikon /></span>
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
        <div className="kenar-dip">
          <div className="kenar-kullanici">
            <span className="kenar-kul-ad" title={`${oturum.kullanici}${oturum.rol === 'admin' ? ' (yönetici)' : ''}`}>
              {oturum.adSoyad || oturum.kullanici}
            </span>
            {/* Mobilde metin CSS ile gizlenip ikona iniyor (şeride yer açmak için) →
                aria-label olmadan buton isimsiz kalır. */}
            <button type="button" className="cikis-btn" onClick={cikis} aria-label="Çıkış yap" title="Çıkış yap">
              Çıkış
            </button>
          </div>
          <button type="button" className="cikis-btn tam-genis" onClick={() => setSifreEkrani(true)}>
            Şifremi değiştir
          </button>
          <span className="kenar-sirket">Turgut Dağıtım Enerji A.Ş.</span>
        </div>
      </aside>

      <main className="icerik" id="ana-icerik">
        <div className="icerik-ic">
          <div className="baslik-satiri">
            <h1 ref={basRef} tabIndex={-1}>{aktif.ad}</h1>
          </div>
          {aktif.id === 'izleme' ? <Izleme />
            : aktif.id === 'operasyon' ? <Operasyon />
            : aktif.id === 'sorun' ? <Sorun />
            : aktif.id === 'mevzuat' ? <Mevzuat />
            : aktif.id === 'piyasa' ? <Piyasa />
            : <Kullanicilar benKim={oturum.kullanici} />}
        </div>
      </main>
    </div>
  );
}
