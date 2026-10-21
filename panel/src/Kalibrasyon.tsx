// Kalibrasyon modülü — tank mm→litre cetveli. Kaynak: /api/kalibrasyon.
//
// Tank listesi (güven/çap/kapsam) + seçili tank detayı (eğri grafiği + 1cm tablo + Excel).
// Üstte kapsam dürüstlüğü şeridi ("N/M tank için cetvel hazır") — kısmi kapsam saklanmaz.
import { useMemo, useState } from 'react';
import { ModulBar, useVeri } from './ortak.js';
import { xlsIndir } from './disaAktar.js';

interface TankSatir {
  istasyon_kod: string; istasyon_ad: string | null; sehir: string | null;
  tank_no: string; urun: string; guven: string;
  cap_mm: string; kapsam_yuzde: string; uyum: string; fit_hatasi: string;
  nokta_sayisi: number; uretim_zamani: string;
}
interface KalibVeri {
  ozet: { cetvel_tank: number; veri_tank: number; olcum: number; a: number; b: number; c: number; d: number };
  tanklar: TankSatir[];
  kapsam: { veri_var: number; cetvel_var: number };
}
interface CetvelNokta { mm: number; litre: string; kaynak: string }
interface CetvelVeri {
  cetvel: CetvelNokta[];
  versiyon: {
    istasyon_ad: string | null; tank_no: string; urun: string; guven: string;
    cap_mm: string; kapsam_yuzde: string; uyum: string; pol_kapasite_lt: string;
    nokta_sayisi: number; fit_hatasi: string;
  } | null;
}

const GUVEN_AD: Record<string, string> = { A: 'Yüksek', B: 'İyi', C: 'Orta', D: 'Zayıf' };

/** Güven rozeti — NÖTR sınıflandırma (alarm değil). A/B yeşil, C amber, D soluk. */
function GuvenRozet({ g }: { g: string }) {
  const sinif = g === 'A' || g === 'B' ? 'iyi-r' : g === 'C' ? 'uyari' : 'notr';
  return <span className={`rozet ${sinif}`} title={`${GUVEN_AD[g] ?? g} güven`}>{g} · {GUVEN_AD[g] ?? g}</span>;
}

const KOLON_ACIKLAMA: { ad: string; metin: string }[] = [
  { ad: 'Güven', metin: 'Cetvelin ne kadar güvenilir olduğu. A·Yüksek = bol saha verisi + fit mükemmel. D·Zayıf = az veri, çoğu geometriyle tamamlandı (tahmin).' },
  { ad: 'Çap (mm)', metin: 'Tankın türetilen çapı — bayi beyanı DEĞİL, mm-litre ölçümlerinden hesaplandı.' },
  { ad: 'Kapsam', metin: 'Tank yüksekliğinin % kaçı gerçek saha verisiyle kaplı. %89 = tankın %89’u ölçülmüş, gerisi geometriyle tamamlandı. Düşükse tank hiç dolmamış.' },
  { ad: 'Kapasite uyumu', metin: 'Türetilen çaptan hesaplanan tam hacim ÷ POL kapasitesi. %95–120 iyi (birbirini doğruluyor). Uzaksa çap güvenilmez (az veri).' },
  { ad: 'Ölçüm', metin: 'Cetvelin kaç mm noktasından üretildiği. Ne kadar çok, o kadar sağlam.' },
];

export function Kalibrasyon() {
  const { veri, hata, yukleniyor, yenile } = useVeri<KalibVeri>('/api/kalibrasyon');
  const [secili, setSecili] = useState<{ istasyon: string; tank: string } | null>(null);
  const [aciklamaAcik, setAciklamaAcik] = useState(false);

  const [arama, setArama] = useState('');
  const tanklar = veri?.tanklar ?? [];

  // BAYİ GRUPLARI (2026-10-21, kullanıcı isteği): güvene göre düz liste aynı bayinin tanklarını
  // dağıtıyordu. Artık bayi adına göre alfabetik, her bayinin tankları altında tank no sırasıyla.
  const gruplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    const harita = new Map<string, { kod: string; ad: string; sehir: string | null; tanklar: TankSatir[] }>();
    for (const s of tanklar) {
      if (q && !`${s.istasyon_ad ?? ''} ${s.istasyon_kod} ${s.sehir ?? ''} ${s.urun}`.toLocaleLowerCase('tr').includes(q)) continue;
      const g = harita.get(s.istasyon_kod) ?? { kod: s.istasyon_kod, ad: s.istasyon_ad ?? s.istasyon_kod, sehir: s.sehir, tanklar: [] };
      g.tanklar.push(s);
      harita.set(s.istasyon_kod, g);
    }
    const liste = [...harita.values()];
    for (const g of liste) g.tanklar.sort((a, b) => Number(a.tank_no) - Number(b.tank_no) || a.tank_no.localeCompare(b.tank_no));
    return liste.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }, [tanklar, arama]);

  function listeIndir() {
    xlsIndir('Kalibrasyon_Tanklar', ['Bayi', 'Şehir', 'Tank', 'Ürün', 'Güven', 'Çap (mm)', 'Kapsam %', 'Kapasite uyumu %', 'Ölçüm'],
      gruplar.flatMap((g) => g.tanklar.map((s) => [
        g.ad, g.sehir ?? '', s.tank_no, s.urun, `${s.guven} · ${GUVEN_AD[s.guven] ?? ''}`,
        String(Math.round(Number(s.cap_mm))), String(Math.round(Number(s.kapsam_yuzde))),
        String(Math.round(Number(s.uyum))), String(s.nokta_sayisi),
      ])),
      { raporAdi: 'Tank Kalibrasyon — Cetvel Listesi', notlar: ['Çap POL mm-litre verisinden türetildi (bayi beyanı değildir).'] });
  }

  return (
    <div className="modul-govde">
      <ModulBar alt="Tank mm→litre kalibrasyon cetveli — POL verisinden türetildi (bayi beyanı değil)"
        taze={null} yukleniyor={yukleniyor} yenile={yenile} />

      {hata && <div className="hata-kart"><p>Veri alınamadı: {hata}</p></div>}

      {veri && (
        <>
          {/* Kapsam dürüstlüğü + güven dağılımı */}
          <div className="ozet-serit">
            <span className="ozet-oge"><strong>{veri.ozet.cetvel_tank}</strong> / {veri.ozet.veri_tank} tank için cetvel hazır</span>
            <span className="ozet-oge">
              <span className="rozet iyi-r">A·{veri.ozet.a}</span>{' '}
              <span className="rozet iyi-r">B·{veri.ozet.b}</span>{' '}
              <span className="rozet uyari">C·{veri.ozet.c}</span>{' '}
              <span className="rozet notr">D·{veri.ozet.d}</span>
            </span>
            <span className="ozet-oge soluk">{Number(veri.ozet.olcum).toLocaleString('tr')} mm ölçümü birikti</span>
            <button type="button" className="aciklama-btn" onClick={() => setAciklamaAcik((a) => !a)}
              aria-expanded={aciklamaAcik} title="Kolonlar ne anlama geliyor?">
              <span aria-hidden="true">ⓘ</span> Kolonlar ne demek?
            </button>
          </div>

          {aciklamaAcik && (
            <div className="kolon-aciklama">
              <dl>
                {KOLON_ACIKLAMA.map((k) => (
                  <div key={k.ad} className="aciklama-oge">
                    <dt>{k.ad}</dt>
                    <dd>{k.metin}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {veri.ozet.cetvel_tank === 0 ? (
            <div className="bos-kart">
              <p>Henüz yeterli mm verisi biriken tank yok — cetvel için her tankta en az birkaç gün ölçüm gerekir.
                 Veri saatlik biriktiriliyor; bu liste doldukça kendiliğinden güncellenir.</p>
            </div>
          ) : (
            <section className="kalib-liste">
              <div className="kalib-liste-bas">
                <h2>Bayiler — {gruplar.length} bayi · {gruplar.reduce((n, g) => n + g.tanklar.length, 0)} tank</h2>
                <button type="button" className="indir-dugme ikincil" onClick={listeIndir}>Excel indir</button>
              </div>
              <input className="kalib-arama" type="search" placeholder="Bayi / şehir / ürün ara…"
                value={arama} onChange={(e) => setArama(e.target.value)} aria-label="Bayi, şehir veya ürün ara" />

              {gruplar.length === 0 && <p className="soluk">Aramayla eşleşen bayi yok.</p>}

              {gruplar.map((g) => (
                <div key={g.kod} className="bayi-grup">
                  <div className="bayi-bas">
                    <h3 className="bayi-ad">{g.ad}</h3>
                    <span className="bayi-alt">{g.sehir ? <span className="sehir-cip">{g.sehir}</span> : null}{g.tanklar.length} tank</span>
                  </div>
                  {/* Tank KARTLARI (2026-10-21): tablo dar ekranda sığmıyordu; kartlar genişlikte yan
                      yana, telefonda alt alta dizilir. Tank no büyük rozet — ilk bakışta okunur. */}
                  <div className="tank-izgara">
                    {g.tanklar.map((s) => {
                      const acik = secili?.istasyon === s.istasyon_kod && secili?.tank === s.tank_no;
                      const kapsam = Math.max(0, Math.min(100, Math.round(Number(s.kapsam_yuzde))));
                      const uyum = Math.round(Number(s.uyum));
                      const uyumSapik = uyum < 80 || uyum > 125;
                      const sec = () => setSecili(acik ? null : { istasyon: s.istasyon_kod, tank: s.tank_no });
                      return (
                        <div key={s.tank_no} role="button" tabIndex={0} aria-expanded={acik}
                          aria-label={`Tank ${s.tank_no}, ${s.urun}, güven ${s.guven} — cetveli ${acik ? 'gizle' : 'göster'}`}
                          className={`tank-kart guven-${s.guven}${acik ? ' acik' : ''}`}
                          onClick={sec}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sec(); } }}>
                          <div className="tank-kart-ust">
                            <span className="tank-no" aria-hidden="true"><small>TANK</small>{s.tank_no}</span>
                            <span className="tank-kimlik">
                              <span className="tank-urun">{s.urun}</span>
                              <GuvenRozet g={s.guven} />
                            </span>
                          </div>
                          <div className="kapsam-cubuk" title={`Tank yüksekliğinin %${kapsam}'i gerçek ölçümle kaplı`}>
                            <span style={{ width: `${kapsam}%` }} />
                          </div>
                          <dl className="tank-metrik">
                            <div><dt>Çap</dt><dd>{Math.round(Number(s.cap_mm)).toLocaleString('tr')} mm</dd></div>
                            <div><dt>Kapsam</dt><dd>%{kapsam}</dd></div>
                            <div><dt>Kap. uyumu</dt><dd className={uyumSapik ? 'sapik' : undefined}>%{uyum}</dd></div>
                            <div><dt>Ölçüm</dt><dd>{s.nokta_sayisi.toLocaleString('tr')}</dd></div>
                          </dl>
                          <span className="tank-ac">{acik ? 'Cetveli gizle' : 'Cetveli göster'} <span aria-hidden="true">{acik ? '▴' : '▾'}</span></span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Seçili tankın cetveli kendi bayisinin hemen altında açılır */}
                  {secili?.istasyon === g.kod && (
                    <TankDetay key={`${secili.istasyon}|${secili.tank}`} istasyon={secili.istasyon} tank={secili.tank} />
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Seçili tankın cetveli: eğri grafiği + güven kartları + 1cm tablo + Excel indirme. */
function TankDetay({ istasyon, tank }: { istasyon: string; tank: string }) {
  const { veri, yukleniyor } = useVeri<CetvelVeri>(
    `/api/kalibrasyon?istasyon=${encodeURIComponent(istasyon)}&tank=${encodeURIComponent(tank)}`,
  );

  if (yukleniyor) return <div className="detay-kart"><p className="soluk">Cetvel yükleniyor…</p></div>;
  if (!veri || !veri.versiyon || veri.cetvel.length === 0) {
    return <div className="detay-kart"><p className="soluk">Bu tank için cetvel bulunamadı.</p></div>;
  }
  const v = veri.versiyon;
  const noktalar = veri.cetvel.map((c) => ({ mm: c.mm, litre: Number(c.litre), kaynak: c.kaynak }));

  function indir() {
    const basliklar = ['Seviye (cm)', 'Seviye (mm)', 'Kalibre Hacim (L)', 'Kaynak'];
    const satirlar = noktalar.map((n) => [
      String(n.mm / 10), String(n.mm), n.litre.toFixed(2),
      n.kaynak === 'saha' ? 'Saha verisi: interpolasyon' : 'Üst uç: geometri',
    ]);
    const ad = `${v.istasyon_ad ?? istasyon}_T${v.tank_no}_${v.urun}_Kalibrasyon`;
    xlsIndir(ad, basliklar, satirlar, {
      raporAdi: `Tank ${v.tank_no} ${v.urun} — Kalibrasyon Cetveli`,
      notlar: [
        `Türetilen çap: ${Math.round(Number(v.cap_mm))} mm · Güven: ${v.guven} (${GUVEN_AD[v.guven] ?? ''})`,
        `Kapsam: %${Math.round(Number(v.kapsam_yuzde))} · Kapasite uyumu: %${Math.round(Number(v.uyum))} · ${v.nokta_sayisi} ölçüm`,
        'Çap POL mm-litre verisinden türetildi (bayi beyanı değildir).',
      ],
    });
  }

  return (
    <section className="detay-kart">
      <div className="detay-bas">
        <h3><span className="detay-tank">Tank {v.tank_no}</span> {v.urun} <span className="soluk">— kalibrasyon cetveli</span></h3>
        <button type="button" className="indir-dugme" onClick={indir}>Excel indir</button>
      </div>

      {/* Güven + çap özeti */}
      <div className="kalib-mini-kartlar">
        <div className="mini-kart"><span className="mini-etiket">Güven</span><span className="mini-deger"><GuvenRozet g={v.guven} /></span></div>
        <div className="mini-kart"><span className="mini-etiket">Türetilen çap</span><span className="mini-deger mono">{Math.round(Number(v.cap_mm)).toLocaleString('tr')} mm</span></div>
        <div className="mini-kart"><span className="mini-etiket">Kapsam</span><span className="mini-deger mono">%{Math.round(Number(v.kapsam_yuzde))}</span></div>
        <div className="mini-kart"><span className="mini-etiket">Kapasite uyumu</span><span className="mini-deger mono">%{Math.round(Number(v.uyum))}</span></div>
      </div>

      <CetvelGrafik noktalar={noktalar} />

      {/* 1cm cetvel tablosu */}
      <div className="cetvel-tablo-sar">
        <table className="veri-tablo">
          <thead><tr><th>cm</th><th className="sag">mm</th><th className="sag">Litre</th><th>Kaynak</th></tr></thead>
          <tbody>
            {noktalar.map((n) => (
              <tr key={n.mm} className={n.kaynak === 'geometri' ? 'geom-satir' : undefined}>
                <td className="mono">{n.mm / 10}</td>
                <td className="sag mono">{n.mm}</td>
                <td className="sag mono">{n.litre.toLocaleString('tr', { maximumFractionDigits: 0 })}</td>
                <td className="soluk">{n.kaynak === 'saha' ? 'saha' : 'geometri'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * mm→litre eğrisi. Tam eğri soluk kesik (geometri dahil), saha kısmı marka rengi.
 * ⚠️ Eksen yazıları SVG DIŞINDA (HTML): SVG içindeki metin genişliğe göre ölçeklenip masaüstünde
 * dev, telefonda okunmaz oluyordu (2026-10-21 ekran görüntüsüyle görüldü). SVG sabit yükseklikte,
 * preserveAspectRatio="none" ile genişliğe yayılır; çizgiler non-scaling-stroke ile incelmez/kalınlaşmaz.
 */
function CetvelGrafik({ noktalar }: { noktalar: { mm: number; litre: number; kaynak: string }[] }) {
  if (noktalar.length < 2) return null;
  const W = 1000, H = 400;
  const maxMm = Math.max(...noktalar.map((n) => n.mm)) || 1;
  const maxLt = Math.max(...noktalar.map((n) => n.litre)) || 1;
  const x = (mm: number) => (W * mm) / maxMm;
  const y = (lt: number) => H - (H * lt) / maxLt;
  const saha = noktalar.filter((n) => n.kaynak === 'saha');
  const cizgi = (pts: typeof noktalar) => pts.map((n, i) => `${i ? 'L' : 'M'}${x(n.mm).toFixed(1)},${y(n.litre).toFixed(1)}`).join(' ');
  const ltEtiket = (f: number) => Math.round(maxLt * f).toLocaleString('tr');

  return (
    <figure className="cetvel-grafik-kap">
      <div className="cetvel-grafik-alan">
        <div className="eksen-y" aria-hidden="true">
          <span>{ltEtiket(1)} L</span><span>{ltEtiket(0.5)}</span><span>0</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" className="cetvel-grafik"
          aria-label={`Kalibrasyon eğrisi: 0–${Math.round(maxMm / 10)} cm seviye, 0–${ltEtiket(1)} litre`}>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} y1={H * f} x2={W} y2={H * f} className="grid" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={cizgi(noktalar)} className="egri-geom" fill="none" vectorEffect="non-scaling-stroke" />
          {saha.length >= 2 && <path d={cizgi(saha)} className="egri-saha" fill="none" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
      <div className="eksen-x" aria-hidden="true"><span>0 cm</span><span>Seviye</span><span>{Math.round(maxMm / 10)} cm</span></div>
      <figcaption className="grafik-lejant">
        <span><i className="lejant-saha" /> Saha ölçümü</span>
        <span><i className="lejant-geom" /> Geometriyle tamamlanan</span>
      </figcaption>
    </figure>
  );
}
