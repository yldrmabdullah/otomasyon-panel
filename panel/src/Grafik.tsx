/* Grafik bileşenleri — saf SVG, bağımlılık yok.
 *
 * TASARIM KURALLARI (dataviz rehberi, doğrulanmış):
 *  · Nominal kategoriler (dağıtıcı, il) DEĞERİNE GÖRE renklendirilmez — çubuk
 *    uzunluğu büyüklüğü zaten gösteriyor; renge kimlik işi verilir. Bu yüzden
 *    tek renk + Parkoil'e "emphasis" (vurgu) kullanılır.
 *  · Sequential rampa iki modda AYRI doğrulandı (validate_palette --ordinal):
 *    koyu temada en açık uç zeminden ayrışmıyordu, adımlar buna göre seçildi.
 *  · Çubuk ≤24px, veri ucu 4px yuvarlak, tabanda köşeli. Izgara hairline.
 *  · Metin ASLA seri rengini taşımaz — değerler/etiketler metin token'ında.
 *  · 2+ seri varsa gösterge (legend) zorunlu; tek seride başlık yeterli.
 *  · Her grafiğin tablo karşılığı var (Tablo bileşeni) → renk tek kanal değil.
 */
import { useId, useState, type ReactNode } from 'react';

/* Sequential rampa — açık uçtan koyuya. İki mod için AYRI doğrulandı:
 *   koyu:  #8f2831 … #ffaab0  (en açık uç 2.04:1 — zeminden ayrışıyor)
 *   açık:  #f79aa2 … #661016  (en açık uç 2.08:1)
 * CSS değişkeni olarak veriliyor; tema değişince otomatik döner. */
const RAMPA_ADIM = 6;

/** Değeri 0..1 aralığından rampa adımına çevir. */
function rampaSinif(oran: number): string {
  const i = Math.min(RAMPA_ADIM - 1, Math.max(0, Math.floor(oran * RAMPA_ADIM)));
  return `r${i}`;
}

/* ── Yatay çubuk (emphasis) ───────────────────────────────────────────────
 * Uzun adlı kategoriler için yatay. Bir öğe vurgulanır (bizVurgu), gerisi
 * de-emphasis grisinde — "biz neredeyiz" sorusu tek bakışta cevaplanır. */
export function CubukYatay<T>({
  veri, ad, deger, vurgu, baslik, altBaslik, birim = '', limit = 12, tabloAlt,
}: {
  veri: T[];
  ad: (x: T) => string;
  deger: (x: T) => number;
  vurgu?: (x: T) => boolean;
  baslik: string;
  altBaslik?: string;
  birim?: string;
  limit?: number;
  tabloAlt?: ReactNode;
}) {
  const [hepsi, setHepsi] = useState(false);
  const enBuyuk = Math.max(1, ...veri.map(deger));
  // Vurgulanan öğe listenin dışında kalıyorsa yine göster — asıl soru "biz neredeyiz".
  const ilkN = veri.slice(0, limit);
  const vurguluIcerde = !vurgu || ilkN.some(vurgu);
  const vurgulu = vurgu ? veri.find(vurgu) : undefined;
  const gosterilen = hepsi
    ? veri
    : vurguluIcerde || !vurgulu
      ? ilkN
      : [...ilkN, vurgulu];
  const kalan = veri.length - gosterilen.length;

  return (
    <figure className="grafik">
      <figcaption>
        <span className="grafik-baslik">{baslik}</span>
        {altBaslik && <span className="grafik-alt">{altBaslik}</span>}
      </figcaption>

      <div className="cubuk-liste">
        {gosterilen.map((x, i) => {
          const d = deger(x);
          const oran = d / enBuyuk;
          const biz = vurgu?.(x) ?? false;
          const sira = veri.indexOf(x) + 1;
          // Sıra atlandıysa (vurgulu öğe sona eklendi) görsel olarak belli et
          const atlama = !hepsi && i === gosterilen.length - 1 && !vurguluIcerde && biz;
          return (
            <div key={ad(x)} className={atlama ? 'cubuk-satir atlamali' : 'cubuk-satir'}>
              <span className="cubuk-sira mono">{sira}</span>
              <span className={`cubuk-ad${biz ? ' biz' : ''}`} title={ad(x)}>
                {biz && <span className="marka-rozet"><span className="sr-only">Parkoil bayisi: </span>PARKOIL</span>}
                {ad(x)}
              </span>
              <div className="cubuk-yol">
                <div
                  className={`cubuk-dolu${biz ? ' biz' : ''}`}
                  style={{ width: `${Math.max(0.6, oran * 100)}%` }}
                />
              </div>
              <span className="cubuk-deger mono">{d.toLocaleString('tr')}{birim}</span>
            </div>
          );
        })}
      </div>

      {kalan > 0 && (
        <div className="dahasi">
          <button type="button" onClick={() => setHepsi(true)}>
            Tümünü göster ({kalan} kayıt daha)
          </button>
        </div>
      )}
      {hepsi && veri.length > limit && (
        <div className="dahasi">
          <button type="button" onClick={() => setHepsi(false)}>İlk {limit} kayda dön</button>
        </div>
      )}
      {tabloAlt}
    </figure>
  );
}

/* ── Isı ızgarası (sequential) ────────────────────────────────────────────
 * İl bazında büyüklük. Tek hue, koyu = daha çok. Değer her hücrede yazılı
 * (renk tek kanal değil) ve tooltip başlıkta. */
export function IsiIzgara<T>({
  veri, ad, deger, altDeger, baslik, altBaslik, birim = '',
}: {
  veri: T[];
  ad: (x: T) => string;
  deger: (x: T) => number;
  altDeger?: (x: T) => string;
  baslik: string;
  altBaslik?: string;
  birim?: string;
}) {
  const enBuyuk = Math.max(1, ...veri.map(deger));
  const enKucuk = Math.min(...veri.map(deger));
  return (
    <figure className="grafik">
      <figcaption>
        <span className="grafik-baslik">{baslik}</span>
        {altBaslik && <span className="grafik-alt">{altBaslik}</span>}
      </figcaption>

      <div className="isi-izgara">
        {veri.map((x) => {
          const d = deger(x);
          const oran = enBuyuk === enKucuk ? 1 : (d - enKucuk) / (enBuyuk - enKucuk);
          const s = rampaSinif(oran);
          return (
            <div key={ad(x)} className={`isi-hucre ${s}`} title={`${ad(x)}: ${d.toLocaleString('tr')}${birim}`}>
              <span className="isi-ad">{ad(x)}</span>
              <span className="isi-deger mono">{d.toLocaleString('tr')}{birim}</span>
              {altDeger && <span className="isi-alt mono">{altDeger(x)}</span>}
            </div>
          );
        })}
      </div>

      {/* Gösterge: rampa yönü — okuyucu koyunun ne demek olduğunu bilsin */}
      <div className="rampa-gosterge">
        <span className="soluk">{enKucuk.toLocaleString('tr')}{birim}</span>
        <div className="rampa-serit" aria-hidden="true">
          {Array.from({ length: RAMPA_ADIM }, (_, i) => <span key={i} className={`r${i}`} />)}
        </div>
        <span className="soluk">{enBuyuk.toLocaleString('tr')}{birim}</span>
      </div>
    </figure>
  );
}

/* ── Yığın şerit (part-to-whole) ──────────────────────────────────────────
 * Durum dağılımı. Segmentler arası 2px yüzey boşluğu; gösterge zorunlu
 * (2+ seri) ve her segment etiketli → renk tek kanal değil. */
export function YiginSerit({
  dilimler, baslik, altBaslik,
}: {
  dilimler: { ad: string; deger: number; sinif: string }[];
  baslik: string;
  altBaslik?: string;
}) {
  const toplam = dilimler.reduce((a, b) => a + b.deger, 0) || 1;
  const id = useId();
  return (
    <figure className="grafik">
      <figcaption>
        <span className="grafik-baslik">{baslik}</span>
        {altBaslik && <span className="grafik-alt">{altBaslik}</span>}
      </figcaption>

      <div className="yigin" role="img" aria-labelledby={id}>
        {dilimler.filter((d) => d.deger > 0).map((d) => (
          <div
            key={d.ad}
            className={`yigin-dilim ${d.sinif}`}
            style={{ flexBasis: `${(d.deger / toplam) * 100}%` }}
            title={`${d.ad}: ${d.deger} (%${((d.deger / toplam) * 100).toFixed(1)})`}
          />
        ))}
      </div>
      <span id={id} className="sr-only">
        {dilimler.map((d) => `${d.ad}: ${d.deger}`).join(', ')}
      </span>

      {/* Gösterge — 2+ seri olduğu için ZORUNLU */}
      <div className="yigin-gosterge">
        {dilimler.map((d) => (
          <span key={d.ad} className="gosterge-oge">
            <span className={`gosterge-nokta ${d.sinif}`} aria-hidden="true" />
            {d.ad} <b className="mono">{d.deger.toLocaleString('tr')}</b>
            <span className="soluk"> (%{((d.deger / toplam) * 100).toFixed(0)})</span>
          </span>
        ))}
      </div>
    </figure>
  );
}
