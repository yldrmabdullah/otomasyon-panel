import { useCallback, useMemo, useState } from 'react';
import type { Durum, Alarm, Istasyon, Baglanti } from './tipler.js';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Bos, ModulBar, useVeri, veriYok, zamanFark } from './ortak.js';
import { YiginSerit } from './Grafik.js';

// ASIS IstasyonTip — üç satış noktası modeli. Kısa etiket + rozet sınıfı.
// Hepsi gerçek bayi; tanker "dağıtıcı aracı" DEĞİL, köy tankeri satış noktası.
const TIP_ETIKET: Record<string, { kisa: string; sinif: string }> = {
  'İstasyonlu': { kisa: 'İstasyon', sinif: 'tip-istasyon' },
  'Köy pompası': { kisa: 'Köy pompası', sinif: 'tip-koy' },
  'Köy tankeri': { kisa: 'Köy tankeri', sinif: 'tip-tanker' },
  'Tanker': { kisa: 'Köy tankeri', sinif: 'tip-tanker' }, // ASIS bazı kayıtlarda kısa yazıyor
};
function tipEtiket(tip: string | null) {
  if (!tip) return null;
  return TIP_ETIKET[tip] ?? { kisa: tip, sinif: 'tip-diger' };
}

// Eskilik → aciliyet sınıfı. Renk TEK taşıyıcı olmasın diye ekran okuyucuya
// metin, görsele ▲/▲▲ işareti (CSS) eşlik ediyor.
// 'yok' = hiç veri gelmemiş (ASIS 1900 sentinel'i) → aciliyet değil, bilgi eksikliği:
// kırmızı ▲▲ ile göstermek "acil müdahale" sinyali veriyordu, yanlıştı.
function eskilikSinif(iso: string | null, esikSaat: number): 'iyi' | 'uyari' | 'krit' | 'yok' {
  if (veriYok(iso)) return 'yok';
  const sa = (Date.now() - new Date(iso!).getTime()) / 3_600_000;
  if (sa >= esikSaat) return 'krit';
  if (sa >= esikSaat / 2) return 'uyari';
  return 'iyi';
}
const ACILIYET_METIN: Record<string, string> = { krit: 'Kritik gecikme: ', uyari: 'Gecikmeli: ' };

type Sekme = 'hepsi' | 'online' | 'kopuk' | 'rakibe' | 'kapandi' | 'alarmli';

const SEKME_AD: Record<Sekme, string> = {
  hepsi: 'Tümü',
  online: 'Online',
  kopuk: 'Kopuk',
  rakibe: 'Rakibe',
  kapandi: 'Kapandı',
  alarmli: 'Alarmlı',
};

const KATEGORI_ETIKET: Record<string, { ad: string; sinif: string }> = {
  online: { ad: 'Online', sinif: 'iyi-r' },
  kopuk: { ad: 'Kopuk', sinif: 'krit' },
  rakibe: { ad: 'Rakibe Geçti', sinif: 'uyari' },
  kapandi: { ad: 'Kapandı', sinif: 'krit' },
  bilinmiyor: { ad: 'Bilinmiyor', sinif: 'uyari' },
};

// Sunucu şeması sessizce kayarsa anlaşılır hata ver — `as Durum` cast'ı sıfır
// garanti sağlıyordu ve eksik alan tabloyu TypeError ile çökertiyordu.
function durumDogrula(d: unknown): Durum {
  const x = d as Durum;
  if (!Array.isArray(x?.istasyonlar) || !Array.isArray(x?.baglanti) || !Array.isArray(x?.alarmlar))
    throw new Error('Panel verisi beklenen biçimde değil (sunucu şeması değişmiş olabilir).');
  return x;
}

export function Izleme() {
  const { veri: durum, hata, yukleniyor, yenile } = useVeri<Durum>('/api/durum', durumDogrula, 60_000);
  const [arama, setArama] = useState('');
  const [sekme, setSekme] = useState<Sekme>('hepsi');
  const [tipFiltre, setTipFiltre] = useState('');

  // Mevcut tipler + sayıları (dropdown'da "Köy pompası (2)" göstermek için).
  const tipler = useMemo(() => {
    const m = new Map<string, number>();
    durum?.istasyonlar.forEach((i) => {
      if (i.tip) m.set(i.tip, (m.get(i.tip) ?? 0) + 1);
    });
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [durum]);

  const baglantiByKod = useMemo(() => {
    const m = new Map<string, Baglanti>();
    durum?.baglanti.forEach((b) => m.set(b.istasyon_kod, b));
    return m;
  }, [durum]);

  // Alarmı olan istasyon kodları (tablo "alarmlı" filtresi + rozet için).
  const alarmliKodlar = useMemo(() => {
    const s = new Set<string>();
    durum?.alarmlar.filter((a) => !a.kapandi).forEach((a) => s.add(a.istasyon_kod));
    return s;
  }, [durum]);

  // İstasyon tablosu kolonları — hücre/sıralama/arama tek yerde tanımlı.
  // Komponent içinde çünkü baglantiByKod ve alarmliKodlar'a erişmesi gerekiyor.
  const IST_KOLONLARI = useMemo<TabloKolon<Istasyon>[]>(() => {
    const bag = (i: Istasyon) => baglantiByKod.get(i.istasyon_kod);
    return [
      {
        id: 'istasyon', ad: 'İstasyon', varsayilan: true, sabit: true, sinif: 'ad-hucre',
        sirala: (i) => i.ad,
        ara: (i) => `${i.ad} ${i.epdk_kod ?? ''}`,
        hucre: (i) => (
          <>
            {i.ad}
            {alarmliKodlar.has(i.istasyon_kod) && <span className="mini-rozet">alarm</span>}
          </>
        ),
      },
      {
        id: 'durum', ad: 'Durum', varsayilan: true,
        // Aciliyet sırasına göre: kopuk → rakibe → kapandı → online
        sirala: (i) => {
          const k = bag(i)?.kategori ?? 'bilinmiyor';
          return { kopuk: 0, rakibe: 1, kapandi: 2, bilinmiyor: 3, online: 4 }[k] ?? 5;
        },
        ara: (i) => KATEGORI_ETIKET[bag(i)?.kategori ?? 'bilinmiyor']?.ad ?? '',
        hucre: (i) => {
          const et = KATEGORI_ETIKET[bag(i)?.kategori ?? 'bilinmiyor'] ?? KATEGORI_ETIKET.bilinmiyor;
          return <span className={`durum-etiket ${et.sinif}`}>{et.ad}</span>;
        },
      },
      {
        id: 'tip', ad: 'Tip', varsayilan: true,
        sirala: (i) => i.tip ?? '',
        ara: (i) => tipEtiket(i.tip)?.kisa ?? '',
        hucre: (i) => {
          const tp = tipEtiket(i.tip);
          return tp ? <span className={`tip-rozet ${tp.sinif}`}>{tp.kisa}</span> : <Bos />;
        },
      },
      {
        id: 'sehir', ad: 'Şehir', varsayilan: true, sinif: 'soluk',
        sirala: (i) => i.sehir ?? '', ara: (i) => i.sehir ?? '',
        hucre: (i) => i.sehir ?? <Bos />,
      },
      {
        id: 'bolge', ad: 'Bölge', varsayilan: false, sinif: 'soluk',
        sirala: (i) => i.bolge ?? '', ara: (i) => i.bolge ?? '',
        hucre: (i) => i.bolge ?? <Bos />,
      },
      {
        id: 'epdk', ad: 'EPDK', varsayilan: false, sinif: 'mono soluk',
        sirala: (i) => i.epdk_kod ?? '',
        hucre: (i) => i.epdk_kod ?? <Bos />,
      },
      {
        id: 'not', ad: 'Not', varsayilan: true, sinif: 'soluk not-hucre',
        ara: (i) => `${bag(i)?.rakip ?? ''} ${bag(i)?.iptal_aciklama ?? ''}`,
        hucre: (i) => {
          const b = bag(i);
          const kat = b?.kategori ?? 'bilinmiyor';
          if (kat === 'rakibe' && b?.rakip)
            return (
              <>
                <span aria-hidden="true">→ </span>
                <span className="sr-only">Geçtiği dağıtıcı: </span>
                {b.rakip}
              </>
            );
          if (kat === 'kapandi' && b?.iptal_aciklama)
            return <span title={b.iptal_aciklama}>{b.iptal_aciklama}</span>;
          return <Bos />;
        },
      },
      {
        id: 'sonveri', ad: 'Son Veri', varsayilan: true, sinif: 'sag mono',
        // Aciliyet sınıfı <td>'ye gitmeli: CSS `td.krit`/`td.uyari` element-bağlı
        // seçiciler kullanıyor ve ▲/▲▲ işaretini ::after ile basıyor. İçteki
        // <span>'e vermek stili sessizce kaybettiriyordu (269 satırın 120'si).
        hucreSinif: (i) => eskilikSinif(bag(i)?.son_veri_zamani ?? null, 3),
        // Sıralama HAM zamana göre (metin "3.2 sa önce" alfabetik sıralanamaz).
        // Hiç veri gelmemiş olanlar en sona (Tablo null'ı sona atıyor).
        sirala: (i) => {
          const s = bag(i)?.son_veri_zamani ?? null;
          return veriYok(s) ? null : new Date(s!).getTime();
        },
        hucre: (i) => {
          const s = bag(i)?.son_veri_zamani ?? null;
          const yas = eskilikSinif(s, 3);
          return (
            <>
              {ACILIYET_METIN[yas] && <span className="sr-only">{ACILIYET_METIN[yas]}</span>}
              {yas === 'yok' ? 'hiç veri yok' : <time dateTime={s!}>{zamanFark(s)}</time>}
            </>
          );
        },
      },
    ];
  }, [baglantiByKod, alarmliKodlar]);

  const ozet = useMemo(() => {
    if (!durum) return null;
    const say = (k: string) => durum.baglanti.filter((b) => b.kategori === k).length;
    return {
      toplam: durum.baglanti.length,
      online: say('online'),
      kopuk: say('kopuk'),
      rakibe: say('rakibe'),
      kapandi: say('kapandi'),
      // Kart ↔ filtre BİREBİR: 'alarmli' sekmesi alarmliKodlar'ı filtreliyor, kart da onu sayar.
      // (Önceden kart yalnız tank alarmını sayıyordu ama filtre kopuk+tank getiriyordu → uyuşmazlık.)
      alarmliIstasyon: alarmliKodlar.size,
    };
  }, [durum, alarmliKodlar]);

  // Açık alarmları İSTASYON bazında grupla (ÖZON'un 8 tankı tek kart).
  const alarmGruplari = useMemo(() => {
    if (!durum) return [];
    const acik = durum.alarmlar.filter((a) => !a.kapandi);
    const grup = new Map<string, { ad: string; kod: string; epdk: string | null; kopuk?: Alarm; tanklar: Alarm[] }>();
    for (const a of acik) {
      const key = a.istasyon_kod;
      if (!grup.has(key))
        grup.set(key, { ad: a.istasyon_ad ?? a.istasyon_kod, kod: a.istasyon_kod, epdk: a.epdk_no, tanklar: [] });
      const g = grup.get(key)!;
      if (a.tip === 'baglanti_kopuk') g.kopuk = a;
      else g.tanklar.push(a);
    }
    // Tank sıralaması BURADA yapılır — render içinde .sort() memo'lanmış diziyi
    // yerinde mutasyona uğratıyordu.
    for (const g of grup.values())
      g.tanklar.sort((a, b) => (a.tank_no ?? '').localeCompare(b.tank_no ?? '', undefined, { numeric: true }));
    // Kopuk (kritik) önce, sonra çok tanklı olanlar.
    return [...grup.values()].sort((a, b) => {
      if (!!a.kopuk !== !!b.kopuk) return a.kopuk ? -1 : 1;
      return b.tanklar.length - a.tanklar.length;
    });
  }, [durum]);

  const aramaLower = arama.trim().toLocaleLowerCase('tr');
  const filtreliAlarmlar = useMemo(
    () => alarmGruplari.filter((g) => !aramaLower || g.ad.toLocaleLowerCase('tr').includes(aramaLower)),
    [alarmGruplari, aramaLower],
  );

  // Tabloya giden liste: kart/segment seçimi + tip filtresi.
  // Metin araması artık Tablo bileşeninin içinde (tüm kolonları tarar) —
  // buradaki üst arama yalnız ALARM KARTLARINI süzer, ikisi ayrı kapsam.
  const filtreliIstasyonlar = useMemo(() => {
    if (!durum) return [];
    return durum.istasyonlar.filter((i) => {
      if (tipFiltre && i.tip !== tipFiltre) return false;
      const b = baglantiByKod.get(i.istasyon_kod);
      if (sekme === 'alarmli') return alarmliKodlar.has(i.istasyon_kod);
      if (sekme === 'hepsi') return true;
      return b?.kategori === sekme; // online / kopuk / rakibe / kapandi
    });
  }, [durum, tipFiltre, sekme, baglantiByKod, alarmliKodlar]);

  const duyuru = useCallback(() => {
    if (!ozet) return '';
    return `Veriler güncellendi. ${ozet.kopuk} kopuk, ${ozet.alarmliIstasyon} alarmlı istasyon.`;
  }, [ozet]);

  return (
    <>
      <ModulBar
        alt="İstasyon bağlantı & tank izleme"
        taze={durum?.uretim ?? null}
        yukleniyor={yukleniyor}
        yenile={yenile}
        duyuru={duyuru()}
      />

      {hata && (
        <div className="hata" role="alert">
          <span aria-hidden="true">⚠ </span>
          {hata}
        </div>
      )}

      {ozet && (
        <section className="kartlar" aria-label="Özet — tabloyu filtrelemek için tıklayın">
          <button
            type="button"
            className={`kart ${sekme === 'hepsi' ? 'sec' : ''}`}
            aria-pressed={sekme === 'hepsi'}
            onClick={() => setSekme('hepsi')}
          >
            <div className="kart-deger">{ozet.toplam}</div>
            <div className="kart-baslik">Toplam İstasyon</div>
          </button>
          <button
            type="button"
            className={`kart iyi ${sekme === 'online' ? 'sec' : ''}`}
            aria-pressed={sekme === 'online'}
            onClick={() => setSekme('online')}
          >
            <div className="kart-deger">{ozet.online}</div>
            <div className="kart-baslik">Online</div>
          </button>
          <button
            type="button"
            className={`kart ${ozet.kopuk ? 'krit' : ''} ${sekme === 'kopuk' ? 'sec' : ''}`}
            aria-pressed={sekme === 'kopuk'}
            onClick={() => setSekme('kopuk')}
          >
            <div className="kart-deger">{ozet.kopuk}</div>
            <div className="kart-baslik">Kopuk (bizde, sessiz)</div>
          </button>
          <button
            type="button"
            className={`kart ${ozet.alarmliIstasyon ? 'uyari' : ''} ${sekme === 'alarmli' ? 'sec' : ''}`}
            aria-pressed={sekme === 'alarmli'}
            onClick={() => setSekme('alarmli')}
          >
            <div className="kart-deger">{ozet.alarmliIstasyon}</div>
            <div className="kart-baslik">Alarmlı İstasyon</div>
          </button>
          <button
            type="button"
            className={`kart uyari ${sekme === 'rakibe' ? 'sec' : ''}`}
            aria-pressed={sekme === 'rakibe'}
            onClick={() => setSekme('rakibe')}
          >
            <div className="kart-deger">{ozet.rakibe}</div>
            <div className="kart-baslik">Rakibe Geçti</div>
          </button>
          <button
            type="button"
            className={`kart ${sekme === 'kapandi' ? 'sec' : ''}`}
            aria-pressed={sekme === 'kapandi'}
            onClick={() => setSekme('kapandi')}
          >
            <div className="kart-deger">{ozet.kapandi}</div>
            <div className="kart-baslik">Kapandı</div>
          </button>
        </section>
      )}

      {/* Durum dağılımı — part-to-whole. Kartlar ham sayıyı verir, bu şerit
          ORANI gösterir: "269 noktanın ne kadarı bize veri gönderiyor?" */}
      {ozet && (
        <YiginSerit
          baslik="Satış Noktası Durum Dağılımı"
          altBaslik={`${ozet.toplam} nokta · ASIS bağlantısı ile EPDK kaydının kesişimi`}
          dilimler={[
            { ad: 'Online', deger: ozet.online, sinif: 'iyi' },
            { ad: 'Kopuk (bizde)', deger: ozet.kopuk, sinif: 'krit' },
            { ad: 'Rakibe geçti', deger: ozet.rakibe, sinif: 'uyari' },
            { ad: 'Kapandı', deger: ozet.kapandi, sinif: 'notr' },
          ]}
        />
      )}

      <div className="filtre-cubugu">
        {/* Bu arama ALARM KARTLARINI süzer. Tablonun kendi araması ayrı
            (tüm kolonlarda tarar) — kapsamlar bilinçli olarak farklı. */}
        <input
          className="arama"
          aria-label="Açık alarmlarda istasyon ara"
          placeholder="Açık alarmlarda ara…"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
        />
        {/* Satış noktası tipi — köy pompası/köy tankeri normal istasyondan ayrı
            iş modelleri; otomasyon ekibi bunları ayrı takip etmek istiyor. */}
        <select aria-label="Satış noktası tipi filtresi" value={tipFiltre} onChange={(e) => setTipFiltre(e.target.value)}>
          <option value="">Tüm tipler</option>
          {tipler.map(([t, n]) => (
            <option key={t} value={t}>
              {tipEtiket(t)?.kisa ?? t} ({n})
            </option>
          ))}
        </select>
        {/* role="tablist" DEĞİL: bu bir filtre grubu, ayrı panel açmıyor.
            Yarım tab pattern (role var, aria-selected/ok tuşu yok) ekran
            okuyucuda hangisinin seçili olduğunu HİÇ söylemiyordu. */}
        <div className="segment" role="group" aria-label="Durum filtresi">
          {(Object.keys(SEKME_AD) as Sekme[]).map((s) => (
            <button
              key={s}
              type="button"
              className={sekme === s ? 'akt' : ''}
              aria-pressed={sekme === s}
              onClick={() => setSekme(s)}
            >
              {SEKME_AD[s]}
            </button>
          ))}
        </div>
      </div>

      {/* AÇIK ALARMLAR — istasyon bazında gruplu, aksiyon odaklı */}
      {filtreliAlarmlar.length > 0 && (
        <section>
          <h2>
            Açık Alarmlar{' '}
            <span className="sayi" role="status" aria-live="polite">
              {filtreliAlarmlar.length} istasyon
            </span>
          </h2>
          <div className="alarm-liste">
            {filtreliAlarmlar.map((g) => (
              <div key={g.kod} className={`alarm-kart ${g.kopuk ? 'krit' : 'uyari'}`}>
                <div className="alarm-stripe" />
                <div className="alarm-govde">
                  <div className="alarm-ust">
                    <span className="alarm-ad">{g.ad}</span>
                    <span className="alarm-epdk">{g.epdk ? `EPDK ${g.epdk}` : g.kod}</span>
                  </div>
                  {g.kopuk && (
                    <div className="alarm-satir">
                      <span className="rozet krit">BAĞLANTI KOPUK</span>
                      <span className="alarm-mesaj">{g.kopuk.mesaj}</span>
                      <span className="alarm-zaman">
                        <time dateTime={g.kopuk.acildi}>{zamanFark(g.kopuk.acildi)}</time>
                      </span>
                    </div>
                  )}
                  {g.tanklar.length > 0 && (
                    <div className="alarm-satir">
                      <span className="rozet uyari">VERİ YOK</span>
                      <span className="tank-rozetler">
                        {g.tanklar.map((t) => (
                          <span key={t.id} className="tank-rozet" title={t.mesaj ?? ''}>
                            T{t.tank_no}
                          </span>
                        ))}
                      </span>
                      <span className="alarm-zaman">
                        {g.tanklar.length} tank ·{' '}
                        <time dateTime={g.tanklar[0].acildi}>{zamanFark(g.tanklar[0].acildi)}</time>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* İSTASYON TABLOSU — sıralama + arama + uzun listede dikey kaydırma */}
      {durum && (
        <section>
          <Tablo
            anahtar="istasyonlar"
            basId="ist-baslik"
            baslik="İstasyonlar"
            kolonlar={IST_KOLONLARI}
            satirlar={filtreliIstasyonlar}
            satirAnahtar={(i) => i.istasyon_kod}
            satirSinif={(i) => (alarmliKodlar.has(i.istasyon_kod) ? 'satir-alarmli' : undefined)}
            aramaEtiket="İstasyon, şehir, bölge veya not ara"
            bosMesaj="Eşleşen istasyon yok."
          />
        </section>
      )}
    </>
  );
}
