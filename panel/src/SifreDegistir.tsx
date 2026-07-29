// Şifre değiştirme ekranı. İlk girişte ZORUNLU (sunucu `sifreDegistir: true` der),
// sonra Ayarlar'dan isteğe bağlı.
import { useState } from 'react';

export function SifreDegistir({
  zorunlu,
  bitti,
  iptal,
}: {
  zorunlu: boolean;
  bitti: () => void;
  iptal?: () => void;
}) {
  const [mevcut, setMevcut] = useState('');
  const [yeni, setYeni] = useState('');
  const [tekrar, setTekrar] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    if (yeni !== tekrar) {
      setHata('Yeni şifreler birbiriyle uyuşmuyor.');
      return;
    }
    setBekliyor(true);
    try {
      const r = await fetch('/api/giris', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mevcutSifre: mevcut, yeniSifre: yeni }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.hata ?? `Şifre değiştirilemedi (${r.status})`);
      bitti();
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <div className="giris-sar">
      <form className="giris-kart" onSubmit={gonder}>
        <div className="giris-marka">
          <img className="marka-logo-img logo-koyu" src="/marka/parkoil-beyaz.png" alt="Parkoil" />
          <img className="marka-logo-img logo-acik" src="/marka/parkoil-kirmizi.png" alt="Parkoil" />
          <div className="marka-alt">Otomasyon Paneli</div>
        </div>

        <h1 className="giris-baslik">Şifre Değiştir</h1>

        {zorunlu && (
          <div className="analiz-not">
            İlk giriş yaptın. Güvenlik için <b>kendi şifreni belirlemen</b> gerekiyor.
          </div>
        )}

        {hata && (
          <div className="hata" role="alert">
            <span aria-hidden="true">⚠ </span>
            {hata}
          </div>
        )}

        <label className="giris-alan">
          <span>Mevcut şifre</span>
          <input
            className="arama"
            type="password"
            autoComplete="current-password"
            required
            value={mevcut}
            onChange={(e) => setMevcut(e.target.value)}
          />
        </label>

        <label className="giris-alan">
          <span>Yeni şifre (en az 8 karakter, harf + rakam)</span>
          <input
            className="arama"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={yeni}
            onChange={(e) => setYeni(e.target.value)}
          />
        </label>

        <label className="giris-alan">
          <span>Yeni şifre (tekrar)</span>
          <input
            className="arama"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={tekrar}
            onChange={(e) => setTekrar(e.target.value)}
          />
        </label>

        <button className="giris-btn" type="submit" disabled={bekliyor || !mevcut || !yeni || !tekrar}>
          {bekliyor ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
        </button>

        {!zorunlu && iptal && (
          <button type="button" className="cikis-btn ortala" onClick={iptal}>
            Vazgeç
          </button>
        )}
      </form>
    </div>
  );
}
