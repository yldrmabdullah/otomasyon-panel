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
import { csvIndir, dugumMetni } from './disaAktar.js';

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
  /** CSV hücresi için düz metin. Verilmezse sırayla `ara` → `hucre`'den JSX
   *  metni çıkarılır. Yalnız gösterim ile aktarım farklı olacaksa doldurulur. */
  metin?: (satir: T) => string;
}

interface TabloProps<T> {
  /** localStorage anahtarı (kolon seçimi kalıcılığı). Verilmezse seçici çıkmaz. */
  anahtar?: string;
  kolonlar: TabloKolon<T>[];
  satirlar: T[];
  satirAnahtar: (satir: T, i: number) => string;
  satirSinif?: (satir: T) => string | undefined;
  /** Verilirse satır tıklanabilir olur (master-detail açma vb.). Satır butona
   *  dönüşmez ama cursor+hover+Enter/Space ile erişilebilir. */
  satirTikla?: (satir: T) => void;
  /** İlk yükleme sürüyor + satır yok → "Yükleniyor…" yerine İSKELET satırları
   *  (gri, animasyonlu placeholder). Boş metinden çok daha az donuk görünür. */
  yukleniyor?: boolean;
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
  /** Başlığın sağına ek kontrol (segment filtre vb.). */
  ustSag?: ReactNode;
  /** Tablo'nun kendi CSV butonunu GİZLE — çağıran kendi indirmesini (CSV+Excel,
   *  toplam satırlı vb.) `ustSag` ile koyuyorsa çift buton olmasın diye. */
  aktarGizle?: boolean;
  baslik: ReactNode;
  /** Başlığın ALTINA açıklama şeridi. Tablo'nun dışına konursa başlığın ÜSTÜNDE
   *  kalıp önceki bölüme aitmiş gibi görünüyor (canlıda görüldü). */
  aciklama?: ReactNode;
  /** SUNUCU TARAFLI mod — verilmezse tablo tamamen client-side çalışır (varsayılan,
   *  davranış bit-for-bit korunur).
   *
   *  Verilirse `satirlar` yalnızca GEÇERLİ SAYFAYI içerir; filtreleme, sıralama ve
   *  sayfalama sunucuda yapılır. Tablo bu modda:
   *   - client-side arama/sıralamayı ATLAR (aşağıdaki uyarıya bakın),
   *   - sayaçta `toplam`'ı kullanır (elindeki 50 satırı değil),
   *   - başlık tıklamasını `siralaDegis`'e iletir,
   *   - altta Önceki/Sonraki sayfalama çubuğu gösterir.
   *
   *  ⚠️ CLIENT-SIDE SIRALAMA NEDEN ATLANMALI: atlanmazsa sunucudan sıralı gelen
   *  50 satırlık sayfa KENDİ İÇİNDE yeniden sıralanır. Kullanıcı "A→Z" der, 1.
   *  sayfada A-C arası satırları kendi içinde doğru sıralı görür ve tablonun
   *  tamamının sıralı olduğunu sanır — oysa sunucu sırası bozulmuştur. Sessiz veri
   *  yanlışlığı; hata vermez, yalnız yanlış gösterir. */
  sunucu?: {
    /** Filtreyle eşleşen TOPLAM satır sayısı (yalnız bu sayfadaki değil). */
    toplam: number;
    /** Tüm veri kümesinin boyutu — sayaçta "eşleşen / tümü" göstermek için.
     *  Verilmezse yalnız eşleşen sayısı yazılır. */
    tumToplam?: number;
    sayfa: number;
    toplamSayfa: number;
    sayfaDegis: (sayfa: number) => void;
    /** Şu an sıralı kolonun id'si (TabloKolon.id ile aynı olmalı). */
    sirala: string | null;
    artan: boolean;
    /** Başlığa tıklandı — yön/alan kararını çağıran taraf verir (sunucuya gider). */
    siralaDegis: (kolonId: string) => void;
    /** Sayfa yükleniyor — boş gövdede "Yükleniyor…" gösterilir. */
    yukleniyor?: boolean;
    /** İlk yükleme henüz bitmedi (satırlar null) — sayaç "yükleniyor…" der. */
    ilkYukleme?: boolean;
    /** CSV'yi çağıran taraf üretir (tüm sayfaları sunucudan çeker).
     *  Verilmezse Tablo'nun kendi CSV'si ELİNDEKİ SAYFAYI indirir — sunucu modunda
     *  bu yarım dosya demektir, o yüzden bu alan doldurulmalı. */
    csvAktar?: () => void;
    /** CSV hazırlanıyor — butonu kilitler, ilerleme gösterir. */
    csvPmi?: boolean;
    csvIlerleme?: number;
  };
}

export function Tablo<T>({
  anahtar,
  kolonlar,
  satirlar,
  satirAnahtar,
  satirSinif,
  satirTikla,
  yukleniyor,
  bosMesaj = 'Kayıt yok.',
  aramaEtiket,
  kaydirmaEsigi = 25,
  ilkGosterim,
  adim,
  ustSag,
  aktarGizle,
  baslik,
  aciklama,
  sunucu,
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
  /** Başlık ↔ kaydırma bölgesi bağlantısı. Eskiden `basId` prop'uydu ve çağrı
   *  tarafında verilmesi UNUTULABİLİYORDU: Operasyon'un 5 tablosunda eksikti →
   *  `aria-labelledby` boş kalıp ISIMSIZ landmark region oluşuyordu (ekran okuyucu
   *  "region" der, hangi tablo olduğunu söylemez). Artık bileşen kendi üretiyor →
   *  kayma yapısal olarak imkânsız. */
  const basId = useId();
  const kol = useKolonlar(anahtar ?? gecici, kolonlar);

  const gorunur = useMemo(
    () => kolonlar.filter((k) => k.sabit || kol.gorunurMu(k.id)),
    [kolonlar, kol],
  );

  const filtreli = useMemo(() => {
    // Sunucu modunda filtreleme sunucuda yapıldı — elimizdeki sayfa zaten sonuç.
    if (sunucu) return satirlar;
    const q = aramaGecikmeli.trim().toLocaleLowerCase('tr');
    if (!q) return satirlar;
    const aranabilir = kolonlar.filter((k) => k.ara);
    if (!aranabilir.length) return satirlar;
    return satirlar.filter((s) =>
      aranabilir.some((k) => k.ara!(s).toLocaleLowerCase('tr').includes(q)),
    );
  }, [satirlar, aramaGecikmeli, kolonlar, sunucu]);

  const sirali = useMemo(() => {
    // ⚠️ Sunucu modunda ASLA yeniden sıralama — sunucudan gelen sayfa sırası
    // korunmalı. Aksi halde 50 satırlık sayfa kendi içinde sıralanır ve kullanıcı
    // tüm tablonun sıralı olduğunu sanar (sessiz veri yanlışlığı).
    if (sunucu) return filtreli;
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
  }, [filtreli, sirala, artan, kolonlar, sunucu]);

  /** CSV indir — KULLANICININ GÖRDÜĞÜ hali aktarılır:
   *  arama filtresi + sıralama (`sirali`) + kolon seçimi (`gorunur`) uygulanmış.
   *  Kademeli gösterim (`ilkGosterim`) UYGULANMAZ: "daha fazla"ya basmamış olsa da
   *  eşleşen TÜM satırlar iner — yarım dosya vermek sessiz veri kaybı olurdu. */
  function csvAktar() {
    const basliklar = gorunur.map((k) => k.ad);
    const satirMetni = sirali.map((satir) =>
      gorunur.map((k) => (k.metin ? k.metin(satir) : k.ara ? k.ara(satir) : dugumMetni(k.hucre(satir)))),
    );
    csvIndir(dugumMetni(baslik) || 'tablo', basliklar, satirMetni);
  }

  function basTikla(id: string) {
    // Sunucu modunda yön/alan kararı çağıran tarafta (sorgu reducer'ında) verilir.
    if (sunucu) {
      sunucu.siralaDegis(id);
      return;
    }
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

  // Sıralama göstergesi: sunucu modunda durum dışarıdan gelir.
  const aktifSirala = sunucu ? sunucu.sirala : sirala;
  const aktifArtan = sunucu ? sunucu.artan : artan;
  const yon = (id: string): 'ascending' | 'descending' | 'none' =>
    aktifSirala === id ? (aktifArtan ? 'ascending' : 'descending') : 'none';
  const ok = (id: string) => (aktifSirala === id ? (aktifArtan ? '▲' : '▼') : '');

  // Kademeli gösterim — dilimleme arama+sıralama SONRASI yapılır.
  const [limit, setLimit] = useState(ilkGosterim ?? Infinity);
  // Arama/sıralama değişince limiti sıfırla (yeni sonuç kümesinin başına dön).
  const [oncekiAnahtar, setOncekiAnahtar] = useState('');
  const suAnkiAnahtar = `${aramaGecikmeli}|${sirala}|${artan}|${satirlar.length}`;
  if (ilkGosterim && suAnkiAnahtar !== oncekiAnahtar) {
    setOncekiAnahtar(suAnkiAnahtar);
    setLimit(ilkGosterim);
  }
  // Sunucu modunda dilimleme YOK: sayfayı sunucu belirledi, "daha fazla" yerine
  // sayfalama çubuğu kullanılır.
  const gosterilen = useMemo(
    () => (sunucu || limit === Infinity ? sirali : sirali.slice(0, limit)),
    [sirali, limit, sunucu],
  );
  const kalan = sunucu ? 0 : sirali.length - gosterilen.length;

  const kaydirmali = gosterilen.length > kaydirmaEsigi;

  return (
    <>
      <div className="bolum-baslik">
        <h2 id={basId}>
          {baslik}{' '}
          {/* Sayaç DÜRÜST olmalı: arama süzdüyse "eşleşen / toplam",
              kademeli gösterim varsa "gösterilen / eşleşen" de görünür. */}
          <span className="sayi" role="status" aria-live="polite">
            {sunucu
              ? // Sunucu modu: elimizdeki sayfa değil, eşleşen TOPLAM yazılır.
                sunucu.ilkYukleme
                ? 'yükleniyor…'
                : sunucu.tumToplam !== undefined && sunucu.tumToplam !== sunucu.toplam
                  ? `${sunucu.toplam.toLocaleString('tr')} / ${sunucu.tumToplam.toLocaleString('tr')} kayıt`
                  : `${sunucu.toplam.toLocaleString('tr')} kayıt`
              : filtreli.length === satirlar.length
                ? `${satirlar.length.toLocaleString('tr')} kayıt`
                : `${filtreli.length.toLocaleString('tr')} / ${satirlar.length.toLocaleString('tr')} kayıt`}
            {kalan > 0 && ` · ${gosterilen.length.toLocaleString('tr')} gösteriliyor`}
          </span>
        </h2>
        <div className="bolum-araclar">
          {ustSag}
          {/* CSV: Excel doğrudan açıyor. Yazdırma/PDF için tarayıcının kendi
              diyaloğu kullanılır (Ctrl+P → "PDF olarak kaydet") — @media print
              stili sayfayı buna hazırlıyor. */}
          {!aktarGizle && (() => {
            // Sunucu modunda CSV'yi çağıran taraf üretir (tüm sayfaları çeker);
            // Tablo'nun kendi aktarımı yalnız eldeki sayfayı indirirdi = yarım dosya.
            const sunucuCsv = sunucu?.csvAktar;
            const adet = sunucu ? sunucu.toplam : sirali.length;
            const pmi = sunucu?.csvPmi ?? false;
            return (
              <button
                type="button"
                className="aktar-btn"
                onClick={sunucuCsv ?? csvAktar}
                disabled={adet === 0 || pmi}
                title={
                  adet === 0
                    ? 'Aktarılacak satır yok'
                    : `${adet.toLocaleString('tr')} satır CSV olarak inecek (Excel açar)`
                }
              >
                {pmi ? (
                  <span aria-live="polite">
                    {sunucu?.csvIlerleme
                      ? `${sunucu.csvIlerleme.toLocaleString('tr')} / ${adet.toLocaleString('tr')}…`
                      : 'Hazırlanıyor…'}
                  </span>
                ) : (
                  <>
                    <span aria-hidden="true">⭳ </span>CSV
                    <span className="sr-only"> olarak indir, {adet} satır</span>
                  </>
                )}
              </button>
            );
          })()}
          {anahtar && (
            <KolonSecici tanimlar={kolonlar} gorunurMu={kol.gorunurMu} degistir={kol.degistir} />
          )}
        </div>
      </div>

      {aciklama}

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
            {typeof baslik === 'string' ? baslik : 'Tablo'} —{' '}
            {sunucu
              ? `${sunucu.toplam} sonuç, sayfa ${sunucu.sayfa} / ${sunucu.toplamSayfa}.`
              : `${gosterilen.length} / ${sirali.length} kayıt.`}
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
              <tr
                key={satirAnahtar(s, i)}
                className={[satirSinif?.(s), satirTikla ? 'satir-tiklanir' : undefined].filter(Boolean).join(' ') || undefined}
                onClick={satirTikla ? () => satirTikla(s) : undefined}
                tabIndex={satirTikla ? 0 : undefined}
                role={satirTikla ? 'button' : undefined}
                onKeyDown={satirTikla ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); satirTikla(s); } } : undefined}
              >
                {gorunur.map((k, ki) => (
                  <td key={k.id} className={[k.sinif, k.hucreSinif?.(s)].filter(Boolean).join(' ') || undefined}>
                    {/* İlk kolon SABİT (position:sticky). Satır yüksekliğini kısan
                        line-clamp <td>'ye verilemez — sticky'yi bozuyor. Bu yüzden
                        kırpma iç sarmalayıcıda (.hucre-kirp, stil.css). */}
                    {ki === 0 ? <span className="hucre-kirp">{k.hucre(s)}</span> : k.hucre(s)}
                  </td>
                ))}
              </tr>
            ))}
            {/* İlk yükleme + satır yok → iskelet satırları (donuk metin yerine). */}
            {gosterilen.length === 0 && (yukleniyor || sunucu?.ilkYukleme) &&
              Array.from({ length: 6 }).map((_, r) => (
                <tr key={`iskelet-${r}`} className="iskelet-satir" aria-hidden="true">
                  {gorunur.map((k) => (
                    <td key={k.id} className={k.sinif}><span className="iskelet-cubuk" /></td>
                  ))}
                </tr>
              ))}
            {gosterilen.length === 0 && !yukleniyor && !sunucu?.ilkYukleme && (
              <tr>
                <td colSpan={gorunur.length} className="bos">
                  {sunucu
                    ? sunucu.yukleniyor
                      ? 'Yükleniyor…'
                      : bosMesaj
                    : aramaGecikmeli
                      ? `"${aramaGecikmeli}" ile eşleşen kayıt yok.`
                      : bosMesaj}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sunucu modu: sayfalama çubuğu (client modunda "daha fazla" butonu) */}
      {sunucu && sunucu.toplamSayfa > 1 && (
        <div className="sayfalama">
          <button
            type="button"
            onClick={() => sunucu.sayfaDegis(Math.max(1, sunucu.sayfa - 1))}
            disabled={sunucu.sayfa === 1}
          >
            <span aria-hidden="true">‹ </span>Önceki
          </button>
          <span className="sayfa-bilgi">
            Sayfa {sunucu.sayfa} / {sunucu.toplamSayfa}
          </span>
          <button
            type="button"
            onClick={() => sunucu.sayfaDegis(Math.min(sunucu.toplamSayfa, sunucu.sayfa + 1))}
            disabled={sunucu.sayfa === sunucu.toplamSayfa}
          >
            Sonraki<span aria-hidden="true"> ›</span>
          </button>
        </div>
      )}

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
