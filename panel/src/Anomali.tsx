// Stok-Satış Anomali (A1b) — Mevzuat modülü altında.
//
// POL "Tablo A1b - Düzeltilmiş Otomasyon Sistemi" raporundan, pompa satışı
// olmasına rağmen tank stoğu değişmeyen/artan kayıtları gösterir.
// Kaynak: /api/a1b · Analiz: core/a1bKural.ts (deterministik, AI DEĞİL).
//
// ⚠️ DİL: buradaki bulgular "kaçak/usulsüzlük" DEĞİL, İNCELENMESİ GEREKEN
// anomalidir (teknik doküman 7.3). Şamandıra arızası, gece yarısı başlayan dolum,
// konsol haberleşme hatası hepsi masum sebepler. Panel "kontrol edilmeli" der.
import { useEffect, useMemo, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Bos, Kart, useVeri } from './ortak.js';
import { csvIndir, xlsIndir } from './disaAktar.js';

interface GunOzet { gun: string; kayit: number; alarm: number; kritik: number }
interface Ozet {
  gun: string; kayit: number; kritik: number; yuksek: number; incele: number;
  veriHatasi: number; aciklamali: number; cekim: string | null; esikSurum: string | null;
}
interface Satir {
  istKod: string; istasyon: string | null; epdk: string | null; tankNo: string;
  urun: string | null; bolge: string | null; mintika: string | null;
  gunBasi: number; dolum: number; satis: number; gunSonu: number; kapasite: number | null;
  beklenenSonu: number; gercekCikis: number; fark: number;
  yansimayan: number | null; kapasiteAsim: number | null;
  risk: string; nedenler: string[]; aciklama: string | null;
  duzenleyen: string | null; kriterKs: string | null;
}
interface Veri { gunler: GunOzet[]; secili: string | null; ozet: Ozet | null; satirlar: Satir[] }
interface Esikler {
  minSatis: number; ayniStok: number; kritikOran: number;
  yuksekOran: number; inceleOran: number; inceleFark: number; kapasiteTolerans: number;
}
/** core/a1bKural.ts VARSAYILAN_ESIK ile aynı — "Varsayılana dön" için. */
const VARSAYILAN: Esikler = {
  minSatis: 1, ayniStok: 5, kritikOran: 0.8, yuksekOran: 0.5,
  inceleOran: 0.2, inceleFark: 20, kapasiteTolerans: 50,
};

const RISK: Record<string, { ad: string; sinif: string; sira: number }> = {
  VERI_HATASI: { ad: 'Veri hatası', sinif: 'uyari', sira: 0 },
  KRITIK: { ad: 'Kritik', sinif: 'krit', sira: 1 },
  YUKSEK: { ad: 'Yüksek', sinif: 'krit', sira: 2 },
  INCELE: { ad: 'İncele', sinif: 'uyari', sira: 3 },
  NORMAL: { ad: 'Normal', sinif: 'iyi', sira: 4 },
};
const lt = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' lt';
const yuzde = (v: number | null) =>
  v == null ? '—' : '%' + (v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export function Anomali() {
  const [gun, setGun] = useState<string | null>(null);
  // Doküman 8: "Varsayılan ekran yalnızca NORMAL dışındaki kayıtları göstermelidir."
  const [yalnizAlarm, setYalnizAlarm] = useState(true);
  const [esikAcik, setEsikAcik] = useState(false);
  const [tazele, setTazele] = useState(0);
  const { veri, yukleniyor, hata } = useVeri<Veri>(
    `/api/a1b${gun ? `?gun=${encodeURIComponent(gun)}` : ''}${tazele ? `${gun ? '&' : '?'}t=${tazele}` : ''}`, undefined, 600_000,
  );

  const satirlar = useMemo(() => {
    const s = veri?.satirlar ?? [];
    return yalnizAlarm ? s.filter((r) => r.risk !== 'NORMAL') : s;
  }, [veri, yalnizAlarm]);

  const kolonlar: TabloKolon<Satir>[] = useMemo(() => [
    {
      id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true, sinif: 'ad-hucre',
      hucre: (r) => (
        <>
          {r.istasyon || r.istKod}
          <div className="alt-satir soluk mono">{r.istKod}{r.tankNo ? ` · tank ${r.tankNo}` : ''}</div>
        </>
      ),
      ara: (r) => `${r.istasyon ?? ''} ${r.istKod} ${r.epdk ?? ''}`,
      metin: (r) => `${r.istasyon ?? ''} (${r.istKod})`,
      sirala: (r) => r.istasyon ?? r.istKod,
    },
    { id: 'tank', ad: 'Tank', varsayilan: false, sinif: 'sag mono', hucre: (r) => r.tankNo, sirala: (r) => Number(r.tankNo) },
    { id: 'urun', ad: 'Ürün', varsayilan: true, hucre: (r) => r.urun || <Bos />, ara: (r) => r.urun ?? '', sirala: (r) => r.urun ?? '' },
    { id: 'gunbasi', ad: 'Gün Başı', varsayilan: true, sinif: 'sag mono soluk', hucre: (r) => lt(r.gunBasi), sirala: (r) => r.gunBasi },
    { id: 'dolum', ad: 'Dolum', varsayilan: true, sinif: 'sag mono', hucre: (r) => lt(r.dolum), sirala: (r) => r.dolum },
    { id: 'satis', ad: 'Pompa Satışı', varsayilan: true, sinif: 'sag mono', hucre: (r) => lt(r.satis), sirala: (r) => r.satis },
    { id: 'gunsonu', ad: 'Gün Sonu', varsayilan: true, sinif: 'sag mono', hucre: (r) => lt(r.gunSonu), sirala: (r) => r.gunSonu },
    {
      id: 'beklenen', ad: 'Beklenen Sonu', varsayilan: false, sinif: 'sag mono soluk',
      hucre: (r) => lt(r.beklenenSonu), sirala: (r) => r.beklenenSonu,
    },
    {
      // Asıl kanıt: satış olmasına rağmen stoktan ne kadar çıkmış?
      id: 'cikis', ad: 'Gerçek Çıkış', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => lt(r.gercekCikis), sirala: (r) => r.gercekCikis,
      hucreSinif: (r) => (r.gercekCikis < 0 ? 'krit' : undefined),
    },
    {
      id: 'fark', ad: 'Fark', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => (r.fark > 0 ? '+' : '') + r.fark.toLocaleString('tr-TR', { maximumFractionDigits: 0 }),
      sirala: (r) => Math.abs(r.fark),
      hucreSinif: (r) => (r.risk === 'KRITIK' ? 'krit' : r.risk === 'YUKSEK' ? 'uyari' : undefined),
    },
    {
      id: 'yansimayan', ad: 'Yansımayan', varsayilan: true, sinif: 'sag mono',
      hucre: (r) => yuzde(r.yansimayan), sirala: (r) => r.yansimayan ?? -1,
      hucreSinif: (r) => (r.yansimayan != null && r.yansimayan >= 0.8 ? 'krit' : undefined),
    },
    {
      id: 'kapasite', ad: 'Kapasite', varsayilan: false, sinif: 'sag mono soluk',
      hucre: (r) => lt(r.kapasite), sirala: (r) => r.kapasite ?? 0,
    },
    {
      id: 'risk', ad: 'Risk', varsayilan: true, sabit: true, sinif: 'rozet-hucre',
      // Neden rozetin ALTINDA: ayrı kolonda 74px'e sıkışıp okunmuyordu.
      hucre: (r) => {
        const d = RISK[r.risk] ?? { ad: r.risk, sinif: '' };
        return (
          <>
            <span className={`durum-rozet ${d.sinif}`}>{d.ad}</span>
            {r.nedenler.length > 0 && (
              <div className="alt-satir soluk" title={r.nedenler.join(' · ')}>{r.nedenler.join(' · ')}</div>
            )}
          </>
        );
      },
      ara: (r) => `${RISK[r.risk]?.ad ?? r.risk} ${r.nedenler.join(' ')}`,
      sirala: (r) => RISK[r.risk]?.sira ?? 9,
    },
    {
      id: 'neden', ad: 'Neden', varsayilan: false, sinif: 'soluk not-hucre',
      hucre: (r) => (r.nedenler.length ? <span className="metin-kirp" title={r.nedenler.join(' · ')}>{r.nedenler.join(' · ')}</span> : <Bos />),
      ara: (r) => r.nedenler.join(' '),
    },
    {
      // Doküman 7.2: açıklama alarmı KAPATMAZ, kök neden ihtimali olarak gösterilir.
      id: 'aciklama', ad: 'POL Açıklaması', varsayilan: true, sinif: 'soluk not-hucre',
      hucre: (r) => (r.aciklama ? <span className="metin-kirp" title={r.aciklama}>{r.aciklama}</span> : <Bos />),
      ara: (r) => r.aciklama ?? '',
    },
    {
      id: 'duzenleyen', ad: 'Düzenleyen', varsayilan: false, sinif: 'soluk',
      hucre: (r) => r.duzenleyen || <Bos />, ara: (r) => r.duzenleyen ?? '',
    },
    { id: 'bolge', ad: 'Bölge', varsayilan: false, sinif: 'soluk', hucre: (r) => r.bolge || <Bos />, ara: (r) => r.bolge ?? '' },
  ], []);

  if (hata) return <div className="mevzuat-uyari"><b>Anomali verisi alınamadı.</b> {hata}</div>;
  if (!yukleniyor && (!veri || veri.gunler.length === 0)) {
    return (
      <div className="mevzuat-uyari">
        <b>Henüz A1b çekimi yapılmadı.</b> POL "Tablo A1b" raporu çekildikten sonra burada
        listelenir. (Araç: <code>araclar/a1bCek.mts</code> — günlük cron.)
      </div>
    );
  }
  const ozet = veri?.ozet;
  const bugunMu = ozet?.gun === new Date().toISOString().slice(0, 10);

  function disaAktar(xls: boolean) {
    const baslik = ['İstasyon', 'İst. Kod', 'EPDK', 'Tank', 'Ürün', 'Gün Başı', 'Dolum', 'Pompa Satışı',
      'Gün Sonu', 'Beklenen Sonu', 'Gerçek Çıkış', 'Fark', 'Yansımayan %', 'Kapasite', 'Kapasite Aşımı',
      'Risk', 'Neden', 'POL Açıklaması', 'Düzenleyen'];
    const satir = satirlar.map((r) => [
      r.istasyon ?? '', r.istKod, r.epdk ?? '', r.tankNo, r.urun ?? '',
      String(Math.round(r.gunBasi)), String(Math.round(r.dolum)), String(Math.round(r.satis)),
      String(Math.round(r.gunSonu)), String(Math.round(r.beklenenSonu)), String(Math.round(r.gercekCikis)),
      String(Math.round(r.fark)), r.yansimayan == null ? '' : (r.yansimayan * 100).toFixed(1),
      r.kapasite == null ? '' : String(Math.round(r.kapasite)),
      r.kapasiteAsim == null ? '' : String(Math.round(r.kapasiteAsim)),
      RISK[r.risk]?.ad ?? r.risk, r.nedenler.join(' · '), r.aciklama ?? '', r.duzenleyen ?? '',
    ]);
    const ad = `stok-satis-anomali-${ozet?.gun ?? 'gun'}`;
    if (xls) xlsIndir(ad, baslik, satir); else csvIndir(ad, baslik, satir);
  }

  return (
    <div className="anomali">
      <div className="mutabakat-ust">
        <label className="mutabakat-donem-secim">
          <span>Gün</span>
          <select value={ozet?.gun ?? ''} onChange={(e) => setGun(e.target.value)} disabled={yukleniyor || !veri?.gunler.length}>
            {(veri?.gunler ?? []).map((g) => (
              <option key={g.gun} value={g.gun}>
                {new Date(g.gun).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                {g.kayit === 0 ? ' — çekim yok' : g.alarm > 0 ? ` — ${g.alarm} anomali` : ' — temiz'}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="temizle" onClick={() => setEsikAcik((a) => !a)}>
          {esikAcik ? 'Ayarları kapat' : '⚙ Eşik ayarları'}
        </button>
        {ozet?.cekim && (
          <span className="taze">
            {new Date(ozet.cekim).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })} çekildi
            {ozet.esikSurum ? ` · eşik ${ozet.esikSurum}` : ''}
          </span>
        )}
      </div>

      {esikAcik && <EsikAyar kapat={() => setEsikAcik(false)} kaydedildi={() => setTazele((n) => n + 1)} />}

      {/* Doküman 7.3: kesin hüküm verilmez, operasyonel dil kullanılır. */}
      <p className="analiz-not">
        Pompa satışı ile tank stok hareketi uyuşmayan kayıtlar. Hesap{' '}
        <b>deterministik kurallarla</b> yapılır (yapay zekâ değil): beklenen gün sonu ={' '}
        <b>gün başı + dolum − satış</b>. Bulgular <b>kontrol edilmesi gereken</b> kayıtlardır;
        şamandıra arızası, gece yarısı başlayan dolum veya konsol hatası masum sebeplerdir —
        otomasyon/servis kaydıyla doğrulanmalı.
      </p>

      {ozet && ozet.kayit === 0 && (
        <div className="analiz-not krit-not" role="status">
          <b>{new Date(ozet.gun).toLocaleDateString('tr-TR')}</b> için A1b çekimi yapılmamış.
          {bugunMu ? ' Günlük çekim her sabah koşuyor; henüz tamamlanmamış olabilir.' : ' O gün çekim koşmamış ya da POL veri vermemiş.'}{' '}
          Liste boş — bu <b>“anomali yok” demek değil</b>, ölçüm yok demek.
        </div>
      )}

      {ozet && ozet.kayit > 0 && (
        <section className="kartlar" aria-label="Anomali özeti">
          <Kart
            ad="Kritik" deger={ozet.kritik} acil={ozet.kritik > 0}
            alt="stok artmış / hiç değişmemiş"
            secili={yalnizAlarm} tikla={() => setYalnizAlarm(true)}
          />
          <Kart ad="Yüksek" deger={ozet.yuksek} uyari={ozet.yuksek > 0} alt="satışın %50+’si yansımıyor" />
          <Kart ad="İncele" deger={ozet.incele} alt="mutabakat farkı" />
          <Kart ad="Açıklamalı" deger={ozet.aciklamali} alt="POL notu var" />
          <Kart
            ad="Toplam Tank" deger={ozet.kayit} alt={`${ozet.veriHatasi} veri hatası`}
            secili={!yalnizAlarm} tikla={() => setYalnizAlarm(false)}
          />
        </section>
      )}

      <Tablo<Satir>
        anahtar="a1b-anomali"
        baslik={<>Stok-Satış Anomali{ozet?.gun ? ` · ${new Date(ozet.gun).toLocaleDateString('tr-TR')}` : ''}</>}
        aciklama={
          <>
            <b>Gerçek çıkış</b> = gün başı + dolum − gün sonu (stoktan fiilen ne çıkmış).{' '}
            <b>Fark</b> = gün sonu − beklenen. <b>Yansımayan</b> = satışın stok hareketine
            yansımayan oranı. Dolum denkleme dahildir — dolum yapılan tankta yanlış alarm üretilmez.
          </>
        }
        kolonlar={kolonlar}
        satirlar={satirlar}
        satirAnahtar={(r) => `${r.istKod}-${r.tankNo}`}
        satirSinif={(r) => (r.risk === 'KRITIK' ? 'satir-krit' : r.risk === 'YUKSEK' || r.risk === 'INCELE' ? 'satir-uyari' : undefined)}
        yukleniyor={yukleniyor && !satirlar.length}
        aramaEtiket="İstasyon / ürün / neden ara…"
        kaydirmaEsigi={20}
        ilkGosterim={60}
        bosMesaj={
          yukleniyor ? 'Yükleniyor…'
            : ozet?.kayit === 0 ? 'Bu gün için çekim yapılmamış — ölçüm yok.'
            : yalnizAlarm ? 'Bu günde anomali yok — tüm tanklar mutabık.'
            : 'Kayıt yok.'
        }
        aktarGizle
        ustSag={
          <div className="mutabakat-indir">
            <button type="button" className="temizle" disabled={!satirlar.length} onClick={() => disaAktar(false)}>⭳ CSV</button>
            <button type="button" className="temizle" disabled={!satirlar.length} onClick={() => disaAktar(true)}>⭳ Excel</button>
          </div>
        }
      />
    </div>
  );
}

/** Eşik alanı tanımı — etiket + açıklama + biçim. Tek yerde, hem form hem yardım. */
const ESIK_ALAN: { id: keyof Esikler; ad: string; aciklama: string; yuzde?: boolean; birim?: string }[] = [
  { id: 'ayniStok', ad: 'Stok "değişmedi" sınırı', birim: 'lt',
    aciklama: 'Stok hareketi bu değerin altındaysa "satış var ama stok değişmemiş" sayılır. Düşürürsen daha az alarm.' },
  { id: 'kritikOran', ad: 'Kritik oran', yuzde: true,
    aciklama: 'Satışın bu kadarı stokta görünmüyorsa KRİTİK.' },
  { id: 'yuksekOran', ad: 'Yüksek oran', yuzde: true,
    aciklama: 'Bu oranın üstü YÜKSEK.' },
  { id: 'inceleOran', ad: 'İncele oranı', yuzde: true,
    aciklama: 'Bu oranın üstü (ve aşağıdaki litre farkı sağlanırsa) İNCELE.' },
  { id: 'inceleFark', ad: 'İncele litre eşiği', birim: 'lt',
    aciklama: 'Küçük yüzdelerde gürültüyü keser: en az bu kadar litre fark olsun.' },
  { id: 'minSatis', ad: 'En az satış', birim: 'lt',
    aciklama: 'Bundan az satışta alarm üretilmez (ölçüm gürültüsü).' },
  { id: 'kapasiteTolerans', ad: 'Kapasite toleransı', birim: 'lt',
    aciklama: 'Gün sonu stok kapasiteyi bu kadar aşabilir; üstü KRİTİK.' },
];

/** Eşik ayar paneli — YALNIZ ADMIN. Kaydedince GEÇMİŞ de yeniden hesaplanır,
 *  böylece "5 yerine 10 yapsam kaç alarm kalır" anında görülür. */
function EsikAyar({ kapat, kaydedildi }: { kapat: () => void; kaydedildi: () => void }) {
  const [esik, setEsik] = useState<Esikler | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/a1b-esik')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Ayarlar alınamadı (${r.status})`))))
      .then((d) => setEsik(d.esik))
      .catch((e) => setHata(e.message));
  }, []);

  async function kaydet() {
    if (!esik) return;
    setBekliyor(true); setHata(null); setSonuc(null);
    try {
      const r = await fetch('/api/a1b-esik', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(esik),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.hata ?? 'Kaydedilemedi');
      setSonuc(`${d.guncellenen.toLocaleString('tr')} kayıt yeni eşiklerle yeniden değerlendirildi.`);
      kaydedildi();
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally { setBekliyor(false); }
  }

  if (hata && !esik) return <div className="ekle-form"><div className="hata" role="alert">{hata}</div></div>;
  if (!esik) return <div className="ekle-form"><span className="soluk">Ayarlar yükleniyor…</span></div>;

  return (
    <div className="ekle-form">
      <div className="yetki-bas">
        <div>
          <strong>Eşik Ayarları</strong>
          <div className="alt-satir soluk">
            Kaydedince <b>geçmiş kayıtlar da</b> yeni eşiklerle yeniden değerlendirilir —
            POL'e gidilmez, saklanan ham değerler kullanılır.
          </div>
        </div>
        <button type="button" className="cikis-btn" onClick={kapat}>✕ Kapat</button>
      </div>

      {hata && <div className="hata" role="alert"><span aria-hidden="true">⚠ </span>{hata}</div>}
      {sonuc && <div className="analiz-not" role="status">{sonuc}</div>}

      <div className="ekle-alanlar">
        {ESIK_ALAN.map((a) => (
          <label key={a.id} className="giris-alan">
            <span>{a.ad}{a.birim ? ` (${a.birim})` : a.yuzde ? ' (%)' : ''}</span>
            <input
              className="arama" type="number" min={0} step={a.yuzde ? 1 : 0.5}
              value={a.yuzde ? Math.round(esik[a.id] * 100) : esik[a.id]}
              onChange={(e) => {
                const v = Number(e.target.value);
                setEsik({ ...esik, [a.id]: a.yuzde ? v / 100 : v });
              }}
            />
            <span className="esik-not">{a.aciklama}</span>
          </label>
        ))}
      </div>

      <div className="yetki-islem">
        <button type="button" className="giris-btn" onClick={kaydet} disabled={bekliyor}>
          {bekliyor ? 'Hesaplanıyor…' : 'Kaydet ve yeniden hesapla'}
        </button>
        <button type="button" className="cikis-btn" onClick={() => setEsik(VARSAYILAN)}>
          Varsayılana dön
        </button>
      </div>
    </div>
  );
}
