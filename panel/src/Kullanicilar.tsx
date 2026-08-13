// Kullanıcı yönetimi modülü — YALNIZ admin görür (App.tsx rol kontrolü yapar).
// Ekleme, silme, rol değiştirme, şifre sıfırlama, EKRAN YETKİSİ.
//
// Üretilen şifre BİR KEZ gösterilir (sunucu hash'ini saklar, düz halini tutmaz).
// Bu yüzden ekranda kalıcı bir "şifre kartı" gösterilir; kapatılınca kaybolur.
//
// YETKİ MODELİ (bkz. core/ekranlar.ts): rol ve ekran yetkisi İKİ AYRI eksen.
//  · rol      → yönetici kullanıcı açabilir/silebilir; izleyici açamaz.
//  · ekranlar → hangi modülleri görebilir. Yönetici her zaman hepsini görür.
// Yani "her ekranı gören ama kullanıcı yönetemeyen" kişi mümkün ve yaygın olan bu.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { trTarih, zamanFark } from './ortak.js';

/** Ekran listesi sunucudan gelir (GET /api/kullanicilar → tumEkranlar); burada
 *  yalnız GÖSTERİM adları var. Liste ikiye bölünmez — sunucu neyi kabul ediyorsa
 *  kutular ondan çizilir, uydurma ekran adı gönderilemez. */
const EKRAN_AD: Record<string, string> = {
  izleme: 'İzleme',
  operasyon: 'Operasyon',
  sorun: 'Sorun Tespiti',
  mevzuat: 'Mevzuat',
  piyasa: 'Piyasa',
};
const ekranAdi = (id: string) => EKRAN_AD[id] ?? id;

interface Kullanici {
  kullanici_ad: string;
  rol: 'admin' | 'izleyici';
  ad_soyad: string | null;
  sifre_degistir: boolean;
  son_giris: string | null;
  olusturan: string | null;
  olusturma: string;
  /** null = hepsi (sınırlandırılmamış), [] = hiçbiri. */
  ekranlar: string[] | null;
}

export function Kullanicilar({ benKim }: { benKim: string }) {
  const [liste, setListe] = useState<Kullanici[] | null>(null);
  const [tumEkranlar, setTumEkranlar] = useState<string[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  // Yeni üretilen şifre — bir kez gösterilir, admin kopyalayıp iletir.
  const [yeniSifre, setYeniSifre] = useState<{ ad: string; sifre: string } | null>(null);
  // Yetki düzenlenen kullanıcı (satır menüsünden açılır).
  const [yetkiHedef, setYetkiHedef] = useState<Kullanici | null>(null);

  // Ekleme formu
  const [ekleAcik, setEkleAcik] = useState(false);
  const [ad, setAd] = useState('');
  const [adSoyad, setAdSoyad] = useState('');
  const [rol, setRol] = useState<'admin' | 'izleyici'>('izleyici');
  const [kendiSifre, setKendiSifre] = useState(''); // boş → otomatik üret
  const [yeniEkranlar, setYeniEkranlar] = useState<string[]>([]);
  const [bekliyor, setBekliyor] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const r = await fetch('/api/kullanicilar');
      if (r.status === 401) return location.reload();
      const d = await r.json();
      if (!r.ok) throw new Error(d?.hata ?? `Liste alınamadı (${r.status})`);
      setListe(d.kullanicilar);
      if (Array.isArray(d.tumEkranlar)) setTumEkranlar(d.tumEkranlar);
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
      setListe([]);
    }
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  // Yeni kullanıcı formu açılınca varsayılan olarak TÜM ekranlar işaretli gelir —
  // en yaygın durum bu; kısıtlama isteyen kutuları kaldırır.
  useEffect(() => {
    if (ekleAcik) setYeniEkranlar(tumEkranlar);
  }, [ekleAcik, tumEkranlar]);

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
          // Hepsi seçiliyse null gönder ("sınırlama yok") — ileride yeni bir modül
          // eklendiğinde bu kullanıcı onu da görür. Liste gönderilseydi yeni modül
          // sessizce gizli kalırdı.
          ekranlar: yeniEkranlar.length === tumEkranlar.length ? null : yeniEkranlar,
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

  /** Ekran yetkilerini kaydet. Hepsi seçiliyse null → "sınırlama yok". */
  async function yetkiKaydet(k: Kullanici, secilenler: string[]) {
    setHata(null);
    try {
      const r = await fetch('/api/kullanicilar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad: k.kullanici_ad,
          ekranlar: secilenler.length === tumEkranlar.length ? null : secilenler,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.hata ?? 'Yetkiler kaydedilemedi.');
      setMesaj(
        secilenler.length === tumEkranlar.length
          ? `${k.kullanici_ad} artık tüm ekranları görebilir.`
          : secilenler.length === 0
            ? `${k.kullanici_ad} hiçbir ekranı göremiyor.`
            : `${k.kullanici_ad}: ${secilenler.map(ekranAdi).join(', ')}.`,
      );
      setYetkiHedef(null);
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
      // Ekran yetkisi — modülün ASIL yeni bilgisi, tabloda görünür olmalı.
      // "Yönetici hepsini görür" bilgisi rozete yazılır: yöneticide ekran listesi
      // tutulsa bile OKUNMAZ, kafa karıştırmasın.
      id: 'ekranlar', ad: 'Ekranlar', varsayilan: true,
      ara: (k) => (k.ekranlar ?? []).map(ekranAdi).join(' '),
      sirala: (k) => (k.rol === 'admin' ? -1 : k.ekranlar === null ? tumEkranlar.length : k.ekranlar.length),
      hucre: (k) => {
        if (k.rol === 'admin') return <span className="rozet iyi-r">TÜMÜ · yönetici</span>;
        if (k.ekranlar === null) return <span className="rozet iyi-r">TÜMÜ</span>;
        if (k.ekranlar.length === 0) return <span className="rozet krit">YETKİ YOK</span>;
        return (
          <span className="yetki-rozetler">
            {k.ekranlar.map((e) => (
              <span key={e} className="tip-rozet tip-istasyon">{ekranAdi(e)}</span>
            ))}
          </span>
        );
      },
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
      // Satır işlemleri MENÜDE (mockup 3d): üç buton yan yana satırı şişiriyor ve
      // "Sil" yanlışlıkla tıklanacak kadar yakın duruyordu.
      id: 'islem', ad: 'İşlem', varsayilan: true, sinif: 'sag',
      hucre: (k) => (
        <SatirMenu
          k={k}
          benKim={benKim}
          yetki={() => setYetkiHedef(k)}
          sifre={() => sifreSifirla(k)}
          rol={() => rolDegistir(k)}
          sil={() => sil(k)}
        />
      ),
    },
  ];

  return (
    <>
      <div className="modul-bar">
        <span className="modul-alt">Panel kullanıcıları &amp; ekran yetkileri</span>
        <div className="ust-sag">
          <button className="yenile" type="button" onClick={() => setEkleAcik((a) => !a)}>
            {ekleAcik ? 'Vazgeç' : '+ Yeni kullanıcı'}
          </button>
        </div>
      </div>

      {hata && <div className="hata" role="alert"><span aria-hidden="true">⚠ </span>{hata}</div>}
      {mesaj && <div className="analiz-not" role="status">{mesaj}</div>}

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

          {/* Ekran yetkileri — yöneticide anlamsız (hepsini görür), o yüzden gizlenir. */}
          {rol === 'izleyici' && (
            <EkranSecici
              tumu={tumEkranlar}
              secili={yeniEkranlar}
              degistir={setYeniEkranlar}
              baslik="Görebileceği ekranlar"
            />
          )}

          <button className="giris-btn" type="submit" disabled={bekliyor || !ad}>
            {bekliyor ? 'Ekleniyor…' : 'Kullanıcıyı ekle'}
          </button>
        </form>
      )}

      {/* Yetki düzenleme — satır menüsünden açılır */}
      {yetkiHedef && (
        <YetkiDuzenle
          k={yetkiHedef}
          tumu={tumEkranlar}
          kapat={() => setYetkiHedef(null)}
          kaydet={(s) => yetkiKaydet(yetkiHedef, s)}
        />
      )}

      <Tablo
        anahtar="kullanicilar"
        baslik="Kullanıcılar"
        kolonlar={KOLONLAR}
        satirlar={liste ?? []}
        satirAnahtar={(k) => k.kullanici_ad}
        yukleniyor={liste === null}
        bosMesaj="Kullanıcı yok."
        aramaEtiket="Kullanıcı ara"
        aciklama={
          <p className="analiz-not">
            <b>Rol</b> kullanıcı yönetme yetkisidir; <b>Ekranlar</b> hangi modülleri
            görebileceğidir — ikisi ayrıdır. Yönetici her ekranı görür. Ekran yetkisi
            sunucuda da kontrol edilir: yetkisiz kullanıcı o modülün verisini
            adresten de çekemez.
          </p>
        }
      />
    </>
  );
}

/** Satır işlem menüsü — üç nokta, dışına tıkla/Escape ile kapanır. */
function SatirMenu({
  k, benKim, yetki, sifre, rol, sil,
}: {
  k: Kullanici; benKim: string;
  yetki: () => void; sifre: () => void; rol: () => void; sil: () => void;
}) {
  const [acik, setAcik] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!acik) return;
    const kapat = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAcik(false);
    };
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') setAcik(false); };
    document.addEventListener('mousedown', kapat);
    document.addEventListener('touchstart', kapat, { passive: true });
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', kapat);
      document.removeEventListener('touchstart', kapat);
      document.removeEventListener('keydown', tus);
    };
  }, [acik]);

  const calistir = (f: () => void) => { setAcik(false); f(); };

  return (
    <div className="satir-menu" ref={ref}>
      <button
        type="button"
        className="satir-menu-btn"
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        aria-haspopup="true"
        aria-label={`${k.kullanici_ad} için işlemler`}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {acik && (
        <div className="satir-menu-liste" role="group" aria-label={`${k.kullanici_ad} işlemleri`}>
          {/* Yöneticide ekran yetkisi okunmuyor → menüde de çıkmaz. */}
          {k.rol !== 'admin' && (
            <button type="button" onClick={() => calistir(yetki)}>Ekran yetkileri…</button>
          )}
          <button type="button" onClick={() => calistir(sifre)}>Şifre sıfırla</button>
          <button type="button" onClick={() => calistir(rol)}>
            {k.rol === 'admin' ? 'İzleyici yap' : 'Yönetici yap'}
          </button>
          {k.kullanici_ad !== benKim && (
            <button type="button" className="tehlike" onClick={() => calistir(sil)}>Sil</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Ekran onay kutuları — ekleme formunda ve yetki düzenlemede aynı bileşen. */
function EkranSecici({
  tumu, secili, degistir, baslik,
}: {
  tumu: string[]; secili: string[]; degistir: (s: string[]) => void; baslik: string;
}) {
  const cevir = (id: string) =>
    degistir(secili.includes(id) ? secili.filter((x) => x !== id) : [...secili, id]);
  const hepsi = secili.length === tumu.length;

  return (
    <fieldset className="ekran-secici">
      <legend>
        {baslik}
        <button
          type="button"
          className="ekran-tumu"
          onClick={() => degistir(hepsi ? [] : tumu)}
        >
          {hepsi ? 'Hiçbiri' : 'Tümü'}
        </button>
      </legend>
      <div className="ekran-kutular">
        {tumu.map((id) => (
          <label key={id} className="ekran-kutu">
            <input type="checkbox" checked={secili.includes(id)} onChange={() => cevir(id)} />
            {ekranAdi(id)}
          </label>
        ))}
      </div>
      {secili.length === 0 && (
        <p className="ekran-uyari">
          <span aria-hidden="true">▲ </span>
          Hiçbir ekran seçili değil — bu kullanıcı giriş yapabilir ama hiçbir modül göremez.
        </p>
      )}
    </fieldset>
  );
}

/** Yetki düzenleme kartı (satır menüsünden açılır). */
function YetkiDuzenle({
  k, tumu, kapat, kaydet,
}: {
  k: Kullanici; tumu: string[]; kapat: () => void; kaydet: (s: string[]) => void;
}) {
  // null = "hepsi" → kutular dolu başlar.
  const [secili, setSecili] = useState<string[]>(k.ekranlar ?? tumu);

  return (
    <div className="ekle-form">
      <div className="yetki-bas">
        <div>
          <strong>{k.ad_soyad || k.kullanici_ad}</strong> — ekran yetkileri
          <div className="alt-satir soluk">
            Değişiklik anında geçerli olur; kullanıcının yeniden giriş yapmasına gerek yok.
          </div>
        </div>
        <button type="button" className="cikis-btn" onClick={kapat}>✕ Kapat</button>
      </div>

      <EkranSecici tumu={tumu} secili={secili} degistir={setSecili} baslik="Görebileceği ekranlar" />

      <div className="yetki-islem">
        <button type="button" className="giris-btn" onClick={() => kaydet(secili)}>
          Yetkileri kaydet
        </button>
        <button type="button" className="cikis-btn" onClick={kapat}>Vazgeç</button>
      </div>
    </div>
  );
}
