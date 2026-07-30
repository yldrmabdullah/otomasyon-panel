// Kullanıcı yönetimi modülü — YALNIZ admin görür (App.tsx rol kontrolü yapar).
// Ekleme, silme, rol değiştirme, şifre sıfırlama.
//
// Üretilen şifre BİR KEZ gösterilir (sunucu hash'ini saklar, düz halini tutmaz).
// Bu yüzden ekranda kalıcı bir "şifre kartı" gösterilir; kapatılınca kaybolur.
import { useCallback, useEffect, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { trTarih, zamanFark } from './ortak.js';

interface Kullanici {
  kullanici_ad: string;
  rol: 'admin' | 'izleyici';
  ad_soyad: string | null;
  sifre_degistir: boolean;
  son_giris: string | null;
  olusturan: string | null;
  olusturma: string;
}

export function Kullanicilar({ benKim }: { benKim: string }) {
  const [liste, setListe] = useState<Kullanici[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  // Yeni üretilen şifre — bir kez gösterilir, admin kopyalayıp iletir.
  const [yeniSifre, setYeniSifre] = useState<{ ad: string; sifre: string } | null>(null);

  // Ekleme formu
  const [ekleAcik, setEkleAcik] = useState(false);
  const [ad, setAd] = useState('');
  const [adSoyad, setAdSoyad] = useState('');
  const [rol, setRol] = useState<'admin' | 'izleyici'>('izleyici');
  const [kendiSifre, setKendiSifre] = useState(''); // boş → otomatik üret
  const [bekliyor, setBekliyor] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const r = await fetch('/api/kullanicilar');
      if (r.status === 401) return location.reload();
      const d = await r.json();
      if (!r.ok) throw new Error(d?.hata ?? `Liste alınamadı (${r.status})`);
      setListe(d.kullanicilar);
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
      setListe([]);
    }
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    setMesaj(null);
    setBekliyor(true);
    try {
      const r = await fetch('/api/kullanicilar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad,
          rol,
          adSoyad: adSoyad || undefined,
          sifre: kendiSifre || undefined, // boşsa sunucu üretir
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.hata ?? `Kullanıcı eklenemedi (${r.status})`);
      setYeniSifre({ ad: d.kullanici.kullanici_ad, sifre: d.sifre });
      setAd(''); setAdSoyad(''); setKendiSifre(''); setRol('izleyici'); setEkleAcik(false);
      await yukle();
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setBekliyor(false);
    }
  }

  async function sifreSifirla(k: Kullanici) {
    if (!confirm(`${k.kullanici_ad} kullanıcısının şifresi sıfırlanacak. Yeni şifre üretilecek — devam?`)) return;
    setHata(null);
    try {
      const r = await fetch('/api/kullanicilar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad: k.kullanici_ad, sifreSifirla: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.hata ?? 'Şifre sıfırlanamadı.');
      setYeniSifre({ ad: k.kullanici_ad, sifre: d.sifre });
      await yukle();
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    }
  }

  async function rolDegistir(k: Kullanici) {
    const yeni = k.rol === 'admin' ? 'izleyici' : 'admin';
    if (!confirm(`${k.kullanici_ad} → ${yeni === 'admin' ? 'YÖNETİCİ' : 'izleyici'} olacak. Devam?`)) return;
    setHata(null);
    try {
      const r = await fetch('/api/kullanicilar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad: k.kullanici_ad, rol: yeni }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.hata ?? 'Rol değiştirilemedi.');
      setMesaj(`${k.kullanici_ad} artık ${yeni === 'admin' ? 'yönetici' : 'izleyici'}.`);
      await yukle();
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    }
  }

  async function sil(k: Kullanici) {
    if (!confirm(`${k.kullanici_ad} kullanıcısı SİLİNECEK. Bu geri alınamaz — devam?`)) return;
    setHata(null);
    try {
      const r = await fetch(`/api/kullanicilar?ad=${encodeURIComponent(k.kullanici_ad)}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.hata ?? 'Kullanıcı silinemedi.');
      setMesaj(`${k.kullanici_ad} silindi.`);
      await yukle();
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    }
  }

  const KOLONLAR: TabloKolon<Kullanici>[] = [
    {
      id: 'ad', ad: 'Kullanıcı', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      sirala: (k) => k.kullanici_ad,
      ara: (k) => `${k.kullanici_ad} ${k.ad_soyad ?? ''}`,
      hucre: (k) => (
        <>
          {k.kullanici_ad}
          {k.kullanici_ad === benKim && <span className="mini-rozet">sen</span>}
          {k.ad_soyad && <div className="alt-satir">{k.ad_soyad}</div>}
        </>
      ),
    },
    {
      id: 'rol', ad: 'Rol', varsayilan: true,
      sirala: (k) => k.rol, ara: (k) => k.rol,
      hucre: (k) => (
        <span className={`durum-etiket ${k.rol === 'admin' ? 'iyi-r' : ''}`}>
          {k.rol === 'admin' ? 'Yönetici' : 'İzleyici'}
        </span>
      ),
    },
    {
      id: 'songiris', ad: 'Son Giriş', varsayilan: true, sinif: 'soluk',
      sirala: (k) => (k.son_giris ? new Date(k.son_giris).getTime() : null),
      hucre: (k) => (k.son_giris ? zamanFark(k.son_giris) : 'hiç girmedi'),
    },
    {
      id: 'durum', ad: 'Durum', varsayilan: true,
      hucre: (k) => (k.sifre_degistir ? <span className="rozet uyari">ŞİFRE BEKLİYOR</span> : <span className="soluk">—</span>),
    },
    {
      id: 'olusturma', ad: 'Eklendi', varsayilan: false, sinif: 'soluk',
      sirala: (k) => new Date(k.olusturma).getTime(),
      hucre: (k) => `${trTarih(k.olusturma)}${k.olusturan ? ` · ${k.olusturan}` : ''}`,
    },
    {
      id: 'islem', ad: 'İşlem', varsayilan: true, sinif: 'sag',
      hucre: (k) => (
        <div className="satir-islem">
          <button type="button" className="cikis-btn" onClick={() => sifreSifirla(k)}>
            Şifre sıfırla
          </button>
          <button type="button" className="cikis-btn" onClick={() => rolDegistir(k)}>
            {k.rol === 'admin' ? 'İzleyici yap' : 'Yönetici yap'}
          </button>
          {k.kullanici_ad !== benKim && (
            <button type="button" className="cikis-btn tehlike" onClick={() => sil(k)}>
              Sil
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="modul-bar">
        <span className="modul-alt">Panel kullanıcıları &amp; yetkiler</span>
        <div className="ust-sag">
          <button className="yenile" type="button" onClick={() => setEkleAcik((a) => !a)}>
            {ekleAcik ? 'Vazgeç' : '+ Yeni kullanıcı'}
          </button>
        </div>
      </div>

      {hata && <div className="hata" role="alert"><span aria-hidden="true">⚠ </span>{hata}</div>}
      {mesaj && <div className="analiz-not">{mesaj}</div>}

      {/* Üretilen şifre — BİR KEZ gösterilir */}
      {yeniSifre && (
        <div className="sifre-karti">
          <div className="sifre-baslik">
            <b>{yeniSifre.ad}</b> için şifre — bu şifre bir daha gösterilmez
          </div>
          <div className="sifre-deger mono">{yeniSifre.sifre}</div>
          <div className="sifre-not">
            Kullanıcıya ilet. İlk girişte kendi şifresini belirlemesi istenecek.
          </div>
          <button
            type="button"
            className="cikis-btn"
            onClick={() => {
              navigator.clipboard?.writeText(yeniSifre.sifre).catch(() => {});
              setMesaj('Şifre kopyalandı.');
            }}
          >
            Kopyala
          </button>
          <button type="button" className="cikis-btn" onClick={() => setYeniSifre(null)}>
            Kapat
          </button>
        </div>
      )}

      {ekleAcik && (
        <form className="ekle-form" onSubmit={ekle}>
          <div className="ekle-alanlar">
            <label className="giris-alan">
              <span>Kullanıcı adı *</span>
              <input
                className="arama" required value={ad} autoCapitalize="none" spellCheck={false}
                placeholder="ör. mehmet"
                onChange={(e) => setAd(e.target.value)}
              />
            </label>
            <label className="giris-alan">
              <span>Ad soyad</span>
              <input className="arama" value={adSoyad} placeholder="ör. Mehmet Yılmaz"
                onChange={(e) => setAdSoyad(e.target.value)} />
            </label>
            <label className="giris-alan">
              <span>Rol</span>
              <select value={rol} onChange={(e) => setRol(e.target.value as 'admin' | 'izleyici')}>
                <option value="izleyici">İzleyici (yalnız panel)</option>
                <option value="admin">Yönetici (kullanıcı yönetebilir)</option>
              </select>
            </label>
            <label className="giris-alan">
              <span>Şifre (boş bırak → otomatik üret)</span>
              <input
                className="arama" type="text" value={kendiSifre} autoComplete="new-password"
                placeholder="otomatik üretilecek"
                onChange={(e) => setKendiSifre(e.target.value)}
              />
            </label>
          </div>
          <button className="giris-btn" type="submit" disabled={bekliyor || !ad}>
            {bekliyor ? 'Ekleniyor…' : 'Kullanıcıyı ekle'}
          </button>
        </form>
      )}

      <Tablo
        anahtar="kullanicilar"
        baslik="Kullanıcılar"
        kolonlar={KOLONLAR}
        satirlar={liste ?? []}
        satirAnahtar={(k) => k.kullanici_ad}
        bosMesaj={liste === null ? 'Yükleniyor…' : 'Kullanıcı yok.'}
        aramaEtiket="Kullanıcı ara"
      />
    </>
  );
}
