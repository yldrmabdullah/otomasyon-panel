// Giriş ekranı. Şifre asla localStorage'a yazılmaz — sunucu HttpOnly çerez kurar,
// JS onu okuyamaz (XSS'te oturum çalınamaz). Oturum durumu /api/giris'ten sorulur.
import { useState } from 'react';
import { TemaSecici, useTema } from './ortak.js';

export function Giris({ girisOldu }: { girisOldu: (kullanici: string) => void }) {
  const [kullanici, setKullanici] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  // Tema kontrolü giriş ekranında da olmalı: kullanıcı henüz girmemişken
  // (ve hesap menüsüne erişemezken) OS ayarına mahkum kalmasın.
  const { tema, setTema } = useTema();

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    setBekliyor(true);
    try {
      const r = await fetch('/api/giris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kullanici, sifre }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.hata ?? `Giriş başarısız (${r.status})`);
      girisOldu(d.kullanici ?? kullanici);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
      setSifre(''); // başarısız denemede şifre alanını temizle
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <div className="giris-sar">
      {/* Sağ üstte, formun dışında: giriş akışını bölmez ama erişilebilir. */}
      <TemaSecici tema={tema} setTema={setTema} sinif="giris-tema" />

      <form className="giris-kart" onSubmit={gonder}>
        <div className="giris-marka">
          <img className="marka-logo-img logo-koyu" src="/marka/parkoil-beyaz.png" alt="Parkoil" />
          <img className="marka-logo-img logo-acik" src="/marka/parkoil-kirmizi.png" alt="Parkoil" />
          <div className="marka-alt">Otomasyon Paneli</div>
        </div>

        <h1 className="giris-baslik">Giriş</h1>

        {hata && (
          <div className="hata" role="alert">
            <span aria-hidden="true">⚠ </span>
            {hata}
          </div>
        )}

        <label className="giris-alan">
          <span>Kullanıcı adı</span>
          <input
            className="arama"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={kullanici}
            onChange={(e) => setKullanici(e.target.value)}
          />
        </label>

        <label className="giris-alan">
          <span>Şifre</span>
          <input
            className="arama"
            type="password"
            autoComplete="current-password"
            required
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
          />
        </label>

        <button className="giris-btn" type="submit" disabled={bekliyor || !kullanici || !sifre}>
          {bekliyor ? 'Kontrol ediliyor…' : 'Giriş yap'}
        </button>

        <p className="giris-not">
          Bu panel Parkoil iç kullanımına özeldir. Erişim bilgisi için otomasyon ekibine başvurun.
        </p>
      </form>
    </div>
  );
}
