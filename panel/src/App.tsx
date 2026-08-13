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
import { TemaSecici, useTema } from './ortak.js';

type Modul = 'izleme' | 'operasyon' | 'sorun' | 'mevzuat' | 'piyasa' | 'kullanicilar';

interface Oturum {
  kullanici: string;
  rol: 'admin' | 'izleyici';
  adSoyad: string | null;
  sifreDegistir: boolean;
  /** Sunucunun çözdüğü görünür ekran listesi. Panel kendi yetki hesabı YAPMAZ. */
  ekranlar: string[];
}

const MODULLER: { id: Modul; ad: string; Ikon: () => ReactElement; alt: string; adminMi?: boolean }[] = [
  { id: 'izleme', ad: 'İzleme', Ikon: IkonIzleme, alt: 'Bağlantı & tank' },
  { id: 'operasyon', ad: 'Operasyon', Ikon: IkonOperasyon, alt: 'Stok & alarm & kalite' },
  { id: 'sorun', ad: 'Sorun Tespiti', Ikon: IkonSorun, alt: 'İrsaliye & dolum anomalisi' },
  { id: 'mevzuat', ad: 'Mevzuat', Ikon: IkonMevzuat, alt: 'EPDK & mutabakat' },
  { id: 'piyasa', ad: 'Piyasa', Ikon: IkonPiyasa, alt: 'Dağıtıcı & bayi' },
  { id: 'kullanicilar', ad: 'Kullanıcılar', Ikon: IkonKullanici, alt: 'Yetki yönetimi', adminMi: true },
];

/** Ad-soyaddan baş harfler (ray altındaki avatar). "Ahmet Yıldırım" → "AY". */
function basHarfler(adSoyad: string | null, kullanici: string): string {
  const kaynak = (adSoyad ?? kullanici).trim();
  const p = kaynak.split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  const h = p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0];
  return h.toLocaleUpperCase('tr');
}

export function App() {
  const [modul, setModul] = useState<Modul>('izleme');
  const basRef = useRef<HTMLHeadingElement>(null);
  const ilkRef = useRef(true);
  // Kullanıcı menüsü (avatara tıkla → çıkış / şifre değiştir).
  const [kulMenu, setKulMenu] = useState(false);
  const kulRef = useRef<HTMLDivElement>(null);

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
          ? {
              kullanici: d.kullanici,
              rol: d.rol ?? 'izleyici',
              adSoyad: d.adSoyad ?? null,
              sifreDegistir: !!d.sifreDegistir,
              // Eski sunucu sürümü bu alanı göndermezse (deploy sırası) hiçbir modül
              // kaybolmasın → boş dizi değil, "hepsi" varsayılır.
              ekranlar: Array.isArray(d.ekranlar)
                ? d.ekranlar
                : MODULLER.filter((m) => !m.adminMi).map((m) => m.id),
            }
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

  // Tema seçimi bir erişilebilirlik kontrolü. Mantık ortak.tsx'te — giriş ekranı
  // da aynı hook'u kullanıyor (kullanıcı girmeden önce de temayı değiştirebilsin).
  const { tema, setTema } = useTema();

  // Modül değişince başlığa odaklan → ekran okuyucu yeni bölümü duyurur.
  useEffect(() => {
    if (ilkRef.current) { ilkRef.current = false; return; }
    basRef.current?.focus();
  }, [modul]);

  // Kullanıcı menüsü: dışına tıkla/Escape ile kapan (KolonSecici ile aynı desen).
  useEffect(() => {
    if (!kulMenu) return;
    const kapat = (e: Event) => {
      if (kulRef.current && !kulRef.current.contains(e.target as Node)) setKulMenu(false);
    };
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setKulMenu(false); };
    document.addEventListener('mousedown', kapat);
    document.addEventListener('touchstart', kapat, { passive: true });
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', kapat);
      document.removeEventListener('touchstart', kapat);
      document.removeEventListener('keydown', tus);
    };
  }, [kulMenu]);

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
  // Kullanıcılar modülü role bağlı, diğerleri ekran yetkisine.
  const gorunurModuller = MODULLER.filter((m) =>
    m.adminMi ? oturum.rol === 'admin' : oturum.ekranlar.includes(m.id),
  );
  const aktif = gorunurModuller.find((m) => m.id === modul) ?? gorunurModuller[0];

  // Hiç ekran yetkisi yoksa panel boş kalır — sessiz beyaz ekran yerine açıklama.
  if (!aktif)
    return (
      <div className="giris-sar">
        <div className="giris-kart">
          <div className="giris-marka">
            <img className="marka-logo-img logo-koyu" src="/marka/parkoil-beyaz.png" alt="Parkoil" />
            <img className="marka-logo-img logo-acik" src="/marka/parkoil-kirmizi.png" alt="Parkoil" />
            <div className="marka-alt">Otomasyon Paneli</div>
          </div>
          <h1 className="giris-baslik">Yetki yok</h1>
          <p className="giris-not">
            <b>{oturum.adSoyad || oturum.kullanici}</b> hesabına henüz hiçbir ekran yetkisi
            tanımlanmamış. Yöneticinizden yetki isteyin.
          </p>
          <button type="button" className="giris-btn" onClick={cikis}>Çıkış yap</button>
        </div>
      </div>
    );

  return (
    <div className="uygulama">
      <a href="#ana-icerik" className="atla">Ana içeriğe geç</a>

      {/* ── İKON RAYI ───────────────────────────────────────────────────────
          Komuta ekranı dili: modül gezinme dar bir raya iner, ekranın tamamı
          veriye kalır. Ad `title` + `aria-label`'da; ray daralınca bilgi kaybı yok. */}
      <nav className="ray" aria-label="Modüller">
        <div className="ray-marka" title="Parkoil Otomasyon Paneli">
          <img className="ray-logo logo-koyu" src="/marka/parkoil-beyaz.png" alt="Parkoil" />
          <img className="ray-logo logo-acik" src="/marka/parkoil-kirmizi.png" alt="Parkoil" />
        </div>

        <div className="ray-nav">
          {gorunurModuller.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`ray-oge ${aktif.id === m.id ? 'akt' : ''}`}
              onClick={() => setModul(m.id)}
              aria-current={aktif.id === m.id ? 'page' : undefined}
              aria-label={`${m.ad} — ${m.alt}`}
              title={`${m.ad} · ${m.alt}`}
            >
              <span className="ray-ikon"><m.Ikon /></span>
              <span className="ray-ad">{m.ad}</span>
            </button>
          ))}
        </div>

        {/* Kullanıcı: avatar + menü (tema, şifre, çıkış). Ray dibinde sabit. */}
        <div className="ray-dip" ref={kulRef}>
          <button
            type="button"
            className="ray-avatar"
            onClick={() => setKulMenu((a) => !a)}
            aria-expanded={kulMenu}
            aria-haspopup="true"
            title={`${oturum.adSoyad || oturum.kullanici}${oturum.rol === 'admin' ? ' (yönetici)' : ''}`}
          >
            {basHarfler(oturum.adSoyad, oturum.kullanici)}
            <span className="sr-only">
              {oturum.adSoyad || oturum.kullanici} — hesap menüsü
            </span>
          </button>

          {kulMenu && (
            <div className="kul-menu" role="group" aria-label="Hesap">
              <div className="kul-menu-bas">
                <strong>{oturum.adSoyad || oturum.kullanici}</strong>
                <span className="kul-menu-rol">
                  {oturum.rol === 'admin' ? 'Yönetici' : 'İzleyici'}
                </span>
              </div>

              <TemaSecici tema={tema} setTema={setTema} sinif="kul-menu-tema" />

              <button
                type="button"
                className="kul-menu-oge"
                onClick={() => { setKulMenu(false); setSifreEkrani(true); }}
              >
                Şifremi değiştir
              </button>
              <button type="button" className="kul-menu-oge tehlike" onClick={cikis}>
                Çıkış yap
              </button>
              <span className="kul-menu-dip">Turgut Dağıtım Enerji A.Ş.</span>
            </div>
          )}
        </div>
      </nav>

      <main className="icerik" id="ana-icerik">
        <div className="icerik-ic">
          {/* Başlık şeridi: modül adı + şirket. Modül kendi ModulBar'ını altına koyar. */}
          <div className="baslik-satiri">
            <h1 ref={basRef} tabIndex={-1}>{aktif.ad}</h1>
            <span className="baslik-sirket">Turgut Dağıtım Enerji A.Ş.</span>
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
