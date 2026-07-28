/* Ortak tablo bileşeni — bildirimsel kolon tanımından render eder.
 *
 * NEDEN: <th> ve <td> iki ayrı yerde elle eşleniyordu; kolon görünürlük koşulu
 * ikisinde ayrı yazıldığı için sessizce kayabiliyordu ve `colSpan` yanlış
 * çıkabiliyordu. Burada üçü de TEK listeden türetilir → kayma yapısal olarak
 * imkânsız.
 *
 * Ayrıca panelin 5 tablosundan yalnız birinde sıralama vardı; artık hepsinde
 * sıralama + arama + uzun listede dikey kaydırma (sticky başlık) var.
 */

import { useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import { KolonSecici, useKolonlar, type KolonTanim } from './KolonSecici.js';

/** Türkçe sıralama — collator SORT DIŞINDA bir kez kurulur (her karşılaştırmada
 *  opsiyon nesnesi vermek yeni Intl.Collator kurdurur; 30 bin öğede felaket). */
const COLLATOR = new Intl.Collator('tr', { numeric: true });

export interface TabloKolon<T> extends KolonTanim {
  /** Hücre içeriği. */
  hucre: (satir: T) => ReactNode;
  /** Hücre + başlık CSS sınıfı ('sag', 'mono soluk' …). */
  sinif?: string;
  /** Satıra göre EK hücre sınıfı — aciliyet gibi veriye bağlı stiller için.
   *  `hucre()` içindeki <span>'e sınıf vermek YETMEZ: CSS `td.krit` gibi
   *  element-bağlı seçiciler eşleşmez ve stil sessizce kaybolur. */
  hucreSinif?: (satir: T) => string | undefined;
  /** Verilirse başlık tıklanabilir olur; sıralama bu değere göre yapılır.
   *  Sayı döndürürse sayısal, string döndürürse Türkçe collator ile sıralanır. */
  sirala?: (satir: T) => string | number | null;
  /** Aramanın tarayacağı metin. Verilmezse bu kolon aramaya dahil olmaz. */
  ara?: (satir: T) => string;
}

interface TabloProps<T> {
  /** localStorage anahtarı (kolon seçimi kalıcılığı). Verilmezse seçici çıkmaz. */
  anahtar?: string;
  kolonlar: TabloKolon<T>[];
  satirlar: T[];
  satirAnahtar: (satir: T, i: number) => string;
  satirSinif?: (satir: T) => string | undefined;
  bosMesaj?: string;
  /** Arama kutusu göster. Kolonların `ara` fonksiyonlarını tarar. */
  aramaEtiket?: string;
  /** Bu satır sayısını geçerse tablo dikey kaydırılabilir olur (sticky başlık). */
  kaydirmaEsigi?: number;
  /** Kademeli gösterim: ilk N satır render edilir, altta "daha fazla" çıkar.
   *  ÖNEMLİ: arama/sıralama TAM liste üzerinde çalışır, sonra dilimlenir —
   *  aksi halde "kayıt yok" derken kayıt listenin görünmeyen kısmında olur. */
  ilkGosterim?: number;
  /** "Daha fazla" her tıkta kaç satır eklesin (varsayılan ilkGosterim). */
  adim?: number;
  /** Başlıkta gösterilecek sayaç için erişilebilir isim bağlantısı. */
  basId?: string;
  /** Başlığın sağına ek kontrol (segment filtre vb.). */
  ustSag?: ReactNode;
  baslik: ReactNode;
}

export function Tablo<T>({
  anahtar,
  kolonlar,
  satirlar,
  satirAnahtar,
  satirSinif,
  bosMesaj = 'Kayıt yok.',
  aramaEtiket,
  kaydirmaEsigi = 25,
  ilkGosterim,
  adim,
  basId,
  ustSag,
  baslik,
}: TabloProps<T>) {
  const [arama, setArama] = useState('');
  // Yazarken bloklamayı önle: input anlık, filtre bir tık geride.
  const aramaGecikmeli = useDeferredValue(arama);
  const [sirala, setSirala] = useState<string | null>(null);
  const [artan, setArtan] = useState(true);
  // anahtar yoksa kolon seçici gösterilmez ama hook koşulsuz çağrılmalı.
  // useId ile benzersizleştir: sabit bir '_gecici' anahtarı olsaydı iki
  // anahtarsız tablo aynı localStorage kaydını paylaşır ve kolon seçimleri
  // birbirine sızardı (seçici gizli olduğu için kullanıcı düzeltemez).
  const gecici = useId();
  const kol = useKolonlar(anahtar ?? gecici, kolonlar);

  const gorunur = useMemo(
    () => kolonlar.filter((k) => k.sabit || kol.gorunurMu(k.id)),
    [kolonlar, kol],
  );

  const filtreli = useMemo(() => {
    const q = aramaGecikmeli.trim().toLocaleLowerCase('tr');
    if (!q) return satirlar;
    const aranabilir = kolonlar.filter((k) => k.ara);
    if (!aranabilir.length) return satirlar;
    return satirlar.filter((s) =>
      aranabilir.some((k) => k.ara!(s).toLocaleLowerCase('tr').includes(q)),
    );
  }, [satirlar, aramaGecikmeli, kolonlar]);

  const sirali = useMemo(() => {
    if (!sirala) return filtreli;
    const k = kolonlar.find((x) => x.id === sirala);
    if (!k?.sirala) return filtreli;
    const al = k.sirala;
    return [...filtreli].sort((a, b) => {
      const av = al(a);
      const bv = al(b);
      // null/boş her zaman sona (artan/azalan fark etmez) — "veri yok" bir değer değil.
      if (av === null || av === '') return bv === null || bv === '' ? 0 : 1;
      if (bv === null || bv === '') return -1;
      const c =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : COLLATOR.compare(String(av), String(bv));
      return artan ? c : -c;
    });
  }, [filtreli, sirala, artan, kolonlar]);

  function basTikla(id: string) {
    if (sirala === id) {
      // 3. tıklama sıralamayı KALDIRIR (orijinal sıraya dön) — kullanıcı
      // "sıralamayı iptal et" yapamadığında sıkışmış hissediyor.
      if (!artan) {
        setSirala(null);
        setArtan(true);
      } else setArtan(false);
    } else {
      setSirala(id);
      setArtan(true);
    }
  }

  const yon = (id: string): 'ascending' | 'descending' | 'none' =>
    sirala === id ? (artan ? 'ascending' : 'descending') : 'none';
  const ok = (id: string) => (sirala === id ? (artan ? '▲' : '▼') : '');

  // Kademeli gösterim — dilimleme arama+sıralama SONRASI yapılır.
  const [limit, setLimit] = useState(ilkGosterim ?? Infinity);
  // Arama/sıralama değişince limiti sıfırla (yeni sonuç kümesinin başına dön).
  const [oncekiAnahtar, setOncekiAnahtar] = useState('');
  const suAnkiAnahtar = `${aramaGecikmeli}|${sirala}|${artan}|${satirlar.length}`;
  if (ilkGosterim && suAnkiAnahtar !== oncekiAnahtar) {
    setOncekiAnahtar(suAnkiAnahtar);
    setLimit(ilkGosterim);
  }
  const gosterilen = useMemo(
    () => (limit === Infinity ? sirali : sirali.slice(0, limit)),
    [sirali, limit],
  );
  const kalan = sirali.length - gosterilen.length;

  const kaydirmali = gosterilen.length > kaydirmaEsigi;

  return (
    <>
      <div className="bolum-baslik">
        <h2 id={basId}>
          {baslik}{' '}
          {/* Sayaç DÜRÜST olmalı: arama süzdüyse "eşleşen / toplam",
              kademeli gösterim varsa "gösterilen / eşleşen" de görünür. */}
          <span className="sayi" role="status" aria-live="polite">
            {filtreli.length === satirlar.length
              ? `${satirlar.length.toLocaleString('tr')} kayıt`
              : `${filtreli.length.toLocaleString('tr')} / ${satirlar.length.toLocaleString('tr')} kayıt`}
            {kalan > 0 && ` · ${gosterilen.length.toLocaleString('tr')} gösteriliyor`}
          </span>
        </h2>
        <div className="bolum-araclar">
          {ustSag}
          {anahtar && (
            <KolonSecici tanimlar={kolonlar} gorunurMu={kol.gorunurMu} degistir={kol.degistir} />
          )}
        </div>
      </div>

      {aramaEtiket && (
        <div className="filtre-cubugu">
          <input
            className="arama"
            aria-label={aramaEtiket}
            placeholder={`${aramaEtiket}…`}
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
          {arama && (
            <button type="button" className="temizle" onClick={() => setArama('')}>
              Temizle
            </button>
          )}
        </div>
      )}

      <div
        className={`tablo-sar ${kaydirmali ? 'kaydirmali' : ''}`}
        tabIndex={0}
        role="region"
        aria-labelledby={basId}
      >
        <table>
          <caption className="sr-only">
            {typeof baslik === 'string' ? baslik : 'Tablo'} — {gosterilen.length} / {sirali.length} kayıt.
            {kaydirmali ? ' Dikey ve yatay kaydırılabilir.' : ' Yatay kaydırılabilir.'}
          </caption>
          <thead>
            <tr>
              {gorunur.map((k) =>
                k.sirala ? (
                  <th
                    key={k.id}
                    scope="col"
                    className={`sirali ${k.sinif ?? ''}`}
                    aria-sort={yon(k.id)}
                  >
                    <button type="button" className="th-btn" onClick={() => basTikla(k.id)}>
                      {k.ad}
                      <span aria-hidden="true">{ok(k.id)}</span>
                    </button>
                  </th>
                ) : (
                  <th key={k.id} scope="col" className={k.sinif}>
                    {k.ad}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {gosterilen.map((s, i) => (
              <tr key={satirAnahtar(s, i)} className={satirSinif?.(s)}>
                {gorunur.map((k) => (
                  <td key={k.id} className={[k.sinif, k.hucreSinif?.(s)].filter(Boolean).join(' ') || undefined}>
                    {k.hucre(s)}
                  </td>
                ))}
              </tr>
            ))}
            {gosterilen.length === 0 && (
              <tr>
                <td colSpan={gorunur.length} className="bos">
                  {aramaGecikmeli ? `"${aramaGecikmeli}" ile eşleşen kayıt yok.` : bosMesaj}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Kalan kayıtlar SESSİZCE atılmaz — açık kontrolle erişilebilir */}
      {kalan > 0 && (
        <div className="dahasi">
          <button
            type="button"
            onClick={() => setLimit((n) => (n === Infinity ? n : n + (adim ?? ilkGosterim ?? 50)))}
          >
            Daha fazla göster ({kalan.toLocaleString('tr')} kayıt daha)
          </button>
        </div>
      )}
    </>
  );
}
