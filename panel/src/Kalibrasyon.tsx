// Kalibrasyon modülü — tank mm→litre cetveli. Kaynak: /api/kalibrasyon.
//
// Tank listesi (güven/çap/kapsam) + seçili tank detayı (eğri grafiği + 1cm tablo + Excel).
// Üstte kapsam dürüstlüğü şeridi ("N/M tank için cetvel hazır") — kısmi kapsam saklanmaz.
import { useMemo, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
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

export function Kalibrasyon() {
  const { veri, hata, yukleniyor, yenile } = useVeri<KalibVeri>('/api/kalibrasyon');
  const [secili, setSecili] = useState<{ istasyon: string; tank: string } | null>(null);

  const tanklar = veri?.tanklar ?? [];

  const kolonlar: TabloKolon<TankSatir>[] = useMemo(() => [
    {
      id: 'tank', ad: 'Bayi / Tank', varsayilan: true, sabit: true,
      hucre: (s) => (
        <span className="ad-hucre">
          <strong>{s.istasyon_ad ?? s.istasyon_kod}</strong>
          <span className="alt-metin">T{s.tank_no} · {s.urun}{s.sehir ? ` · ${s.sehir}` : ''}</span>
        </span>
      ),
      sirala: (s) => s.istasyon_ad ?? s.istasyon_kod,
      ara: (s) => `${s.istasyon_ad ?? ''} ${s.istasyon_kod} ${s.sehir ?? ''} ${s.urun}`,
    },
    { id: 'guven', ad: 'Güven', varsayilan: true, hucre: (s) => <GuvenRozet g={s.guven} />, sirala: (s) => s.guven },
    { id: 'cap', ad: 'Çap (mm)', varsayilan: true, sinif: 'sag mono', hucre: (s) => Math.round(Number(s.cap_mm)).toLocaleString('tr'), sirala: (s) => Number(s.cap_mm) },
    { id: 'kapsam', ad: 'Kapsam', varsayilan: true, sinif: 'sag mono', hucre: (s) => `%${Math.round(Number(s.kapsam_yuzde))}`, sirala: (s) => Number(s.kapsam_yuzde) },
    { id: 'uyum', ad: 'Kapasite uyumu', varsayilan: true, sinif: 'sag mono', hucre: (s) => `%${Math.round(Number(s.uyum))}`, sirala: (s) => Number(s.uyum) },
    { id: 'olcum', ad: 'Ölçüm', varsayilan: true, sinif: 'sag mono soluk', hucre: (s) => String(s.nokta_sayisi), sirala: (s) => s.nokta_sayisi },
  ], []);

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
          </div>

          {veri.ozet.cetvel_tank === 0 ? (
            <div className="bos-kart">
              <p>Henüz yeterli mm verisi biriken tank yok — cetvel için her tankta en az birkaç gün ölçüm gerekir.
                 Veri saatlik biriktiriliyor; bu liste doldukça kendiliğinden güncellenir.</p>
            </div>
          ) : (
            <section>
              <Tablo
                anahtar="kalib-tanklar"
                baslik={`Tanklar — ${tanklar.length} cetvel`}
                kolonlar={kolonlar}
                satirlar={tanklar}
                satirAnahtar={(s) => `${s.istasyon_kod}|${s.tank_no}`}
                satirSinif={(s) => (secili?.istasyon === s.istasyon_kod && secili?.tank === s.tank_no ? 'secili-satir' : undefined)}
                satirTikla={(s) => setSecili({ istasyon: s.istasyon_kod, tank: s.tank_no })}
                aramaEtiket="Bayi / şehir / ürün ara"
                ilkGosterim={30}
              />
            </section>
          )}

          {secili && <TankDetay key={`${secili.istasyon}|${secili.tank}`} istasyon={secili.istasyon} tank={secili.tank} />}
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
        <h3>{v.istasyon_ad ?? istasyon} — Tank {v.tank_no} <span className="soluk">({v.urun})</span></h3>
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

/** mm→litre eğrisi (SVG). Tam eğri soluk, saha kısmı marka rengiyle vurgulu. */
function CetvelGrafik({ noktalar }: { noktalar: { mm: number; litre: number; kaynak: string }[] }) {
  if (noktalar.length < 2) return null;
  const W = 520, H = 220, P = 44;
  const maxMm = Math.max(...noktalar.map((n) => n.mm)) || 1;
  const maxLt = Math.max(...noktalar.map((n) => n.litre)) || 1;
  const x = (mm: number) => P + ((W - 2 * P) * mm) / maxMm;
  const y = (lt: number) => H - P - ((H - 2 * P) * lt) / maxLt;
  const saha = noktalar.filter((n) => n.kaynak === 'saha');
  const cizgi = (pts: typeof noktalar) => pts.map((n, i) => `${i ? 'L' : 'M'}${x(n.mm).toFixed(1)},${y(n.litre).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="Tank seviyesi (mm) ile litre arasındaki kalibrasyon eğrisi" className="cetvel-grafik">
      <line x1={P} y1={P - 8} x2={P} y2={H - P} className="eksen" />
      <line x1={P} y1={H - P} x2={W - P + 8} y2={H - P} className="eksen" />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={P} y1={H - P - (H - 2 * P) * f} x2={W - P} y2={H - P - (H - 2 * P) * f} className="grid" />
      ))}
      <path d={cizgi(noktalar)} className="egri-geom" fill="none" />
      {saha.length >= 2 && <path d={cizgi(saha)} className="egri-saha" fill="none" />}
      <text x={P} y={H - P + 15} className="eksen-yazi">0</text>
      <text x={W - P} y={H - P + 15} textAnchor="end" className="eksen-yazi">{Math.round(maxMm / 10)} cm</text>
      <text x={P - 6} y={P} textAnchor="end" className="eksen-yazi">{Math.round(maxLt).toLocaleString('tr')} L</text>
      <text x={P - 6} y={H - P} textAnchor="end" className="eksen-yazi">0</text>
    </svg>
  );
}
