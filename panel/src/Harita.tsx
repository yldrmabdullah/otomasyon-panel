/* Türkiye il haritası — bayi dağılımı.
 *
 * NEDEN IZGARA, GERÇEK SINIR DEĞİL: gerçek il sınırı GeoJSON'u ~1-3 MB ve panelin
 * "kendi kendine yeten, dış bağımlılık yok" ilkesini bozar (Leaflet + tile sunucusu
 * internet bağımlılığı getirir). Bunun yerine 81 il, coğrafi konumlarına YAKLAŞIK
 * bir ızgaraya yerleştirilir: Türkiye'nin batı-doğu uzanımı ve komşuluklar korunur.
 * Amaç coğrafi hassasiyet değil, "hangi bölgede yoğunlaşmışız" sorusunu bir bakışta
 * yanıtlamak; hover'da tam sayı verilir.
 *
 * ⚠️ İL ADI EŞLEMESİ: EPDK verisi il adlarını BÜYÜK HARF + Türkçe karakterle
 * gönderiyor ("AFYONKARAHİSAR", "ŞANLIURFA"). Eşleme bu biçime göre yapılır;
 * `İ`/`I` ayrımı önemli (tr locale toUpperCase tuzağı) → sabit liste kullanılır,
 * çalışma anında dönüşüm yapılmaz.
 */
import { useMemo, useState, useId } from 'react';

/** [plaka, il adı (EPDK biçimi), ızgara sütun, ızgara satır].
 *  Sütun 0-17 (batı→doğu), satır 0-8 (kuzey→güney). Komşuluklar yaklaşık korunur. */
const ILLER: [number, string, number, number][] = [
  // Trakya + Marmara
  [22, 'EDİRNE', 0, 2], [59, 'TEKİRDAĞ', 1, 2], [39, 'KIRKLARELİ', 1, 1],
  [34, 'İSTANBUL', 2, 1], [41, 'KOCAELİ', 3, 2], [54, 'SAKARYA', 4, 2],
  [77, 'YALOVA', 2, 2], [16, 'BURSA', 2, 3], [10, 'BALIKESİR', 1, 3],
  [17, 'ÇANAKKALE', 0, 3], [11, 'BİLECİK', 3, 3],
  // Ege
  [35, 'İZMİR', 0, 4], [45, 'MANİSA', 1, 4], [43, 'KÜTAHYA', 2, 4],
  [26, 'ESKİŞEHİR', 3, 4], [9, 'AYDIN', 0, 5], [20, 'DENİZLİ', 1, 5],
  [64, 'UŞAK', 2, 5], [3, 'AFYONKARAHİSAR', 3, 5], [48, 'MUĞLA', 0, 6],
  [15, 'BURDUR', 2, 6], [32, 'ISPARTA', 3, 6],
  // Akdeniz
  [7, 'ANTALYA', 2, 7], [42, 'KONYA', 4, 6], [70, 'KARAMAN', 5, 7],
  [33, 'MERSİN', 6, 7], [1, 'ADANA', 7, 7], [31, 'HATAY', 8, 8],
  [46, 'KAHRAMANMARAŞ', 8, 6], [80, 'OSMANİYE', 8, 7],
  // İç Anadolu
  [6, 'ANKARA', 4, 4], [18, 'ÇANKIRI', 5, 3], [71, 'KIRIKKALE', 5, 4],
  [40, 'KIRŞEHİR', 5, 5], [68, 'AKSARAY', 6, 5], [51, 'NİĞDE', 6, 6],
  [50, 'NEVŞEHİR', 6, 4], [38, 'KAYSERİ', 7, 5], [66, 'YOZGAT', 6, 3],
  [58, 'SİVAS', 8, 4],
  // Batı Karadeniz
  [14, 'BOLU', 4, 3], [81, 'DÜZCE', 3, 1], [67, 'ZONGULDAK', 4, 1],
  [78, 'KARABÜK', 5, 2], [74, 'BARTIN', 5, 1], [37, 'KASTAMONU', 6, 1], [57, 'SİNOP', 7, 0],
  [55, 'SAMSUN', 8, 1], [19, 'ÇORUM', 6, 2], [60, 'TOKAT', 7, 3],
  [5, 'AMASYA', 7, 2],
  // Doğu Karadeniz
  [52, 'ORDU', 9, 1], [28, 'GİRESUN', 10, 1], [61, 'TRABZON', 11, 1],
  [53, 'RİZE', 12, 1], [8, 'ARTVİN', 13, 1], [29, 'GÜMÜŞHANE', 11, 2],
  [69, 'BAYBURT', 12, 2],
  // Doğu Anadolu
  [25, 'ERZURUM', 12, 3], [24, 'ERZİNCAN', 10, 3], [75, 'ARDAHAN', 14, 1],
  [36, 'KARS', 14, 2], [76, 'IĞDIR', 15, 3], [4, 'AĞRI', 14, 3],
  [65, 'VAN', 14, 5], [13, 'BİTLİS', 13, 5], [49, 'MUŞ', 12, 4],
  [12, 'BİNGÖL', 11, 4], [62, 'TUNCELİ', 10, 4], [23, 'ELAZIĞ', 10, 5],
  [44, 'MALATYA', 9, 5], [2, 'ADIYAMAN', 9, 6],
  // Güneydoğu
  [21, 'DİYARBAKIR', 11, 6], [72, 'BATMAN', 12, 6], [56, 'SİİRT', 13, 6],
  [47, 'MARDİN', 11, 7], [73, 'ŞIRNAK', 13, 7], [30, 'HAKKARİ', 15, 6],
  [63, 'ŞANLIURFA', 10, 7], [27, 'GAZİANTEP', 9, 7], [79, 'KİLİS', 9, 8],
];

const SUTUN = 18;
const SATIR = 9;
/** Hücre kenarı + aralık (px, SVG kullanıcı birimi). */
const H = 46;
const BOSLUK = 3;

export interface HaritaIl {
  il: string;
  /** O ildeki bizim bayi sayımız. */
  bizim: number;
  /** O ildeki toplam bayi (piyasa). */
  toplam: number;
}

/**
 * @param veri il bazında sayılar (EPDK büyük-harf il adıyla)
 * @param olcu 'bizim' → kendi bayimiz; 'pay' → o ildeki payımız (%)
 */
export function Harita({
  veri,
  olcu = 'bizim',
  baslik,
  altBaslik,
}: {
  veri: HaritaIl[];
  olcu?: 'bizim' | 'pay';
  baslik: string;
  altBaslik?: string;
}) {
  const basId = useId();
  const [secili, setSecili] = useState<string | null>(null);

  const harita = useMemo(() => {
    const m = new Map<string, HaritaIl>();
    for (const v of veri) m.set(v.il, v);
    return m;
  }, [veri]);

  const deger = (il: string): number => {
    const v = harita.get(il);
    if (!v) return 0;
    if (olcu === 'pay') return v.toplam > 0 ? (100 * v.bizim) / v.toplam : 0;
    return v.bizim;
  };

  const enBuyuk = useMemo(() => {
    let m = 0;
    for (const [, il] of ILLER.map((x) => [x[0], x[1]] as const)) {
      const d = deger(il);
      if (d > m) m = d;
    }
    return m || 1;
  }, [harita, olcu]);

  /** Sıralı ramp — 0 değer nötr kalır (yokluk, "az" değil).
   *  --r0..--r5 stil.css'te her iki tema için ayrı doğrulandı. */
  const kademe = (d: number): string => {
    if (d <= 0) return 'yok';
    const o = d / enBuyuk;
    if (o > 0.8) return 'k5';
    if (o > 0.6) return 'k4';
    if (o > 0.4) return 'k3';
    if (o > 0.2) return 'k2';
    return 'k1';
  };

  const seciliVeri = secili ? harita.get(secili) : null;
  const bizimIl = ILLER.filter(([, il]) => (harita.get(il)?.bizim ?? 0) > 0).length;

  return (
    <section className="harita-blok" aria-labelledby={basId}>
      <div className="harita-ust">
        <div>
          <h3 id={basId}>{baslik}</h3>
          {altBaslik && <p className="harita-alt">{altBaslik}</p>}
        </div>
        {/* Sıralı ölçek göstergesi — renk anlamını açıklar */}
        <div className="harita-olcek" aria-hidden="true">
          <span className="harita-olcek-ad">az</span>
          {['k1', 'k2', 'k3', 'k4', 'k5'].map((k) => (
            <i key={k} className={`harita-kutu ${k}`} />
          ))}
          <span className="harita-olcek-ad">çok</span>
        </div>
      </div>

      <div className="harita-sar">
        <svg
          viewBox={`0 0 ${SUTUN * H} ${SATIR * H}`}
          className="harita-svg"
          role="img"
          aria-label={`Türkiye il haritası. ${bizimIl} ilde bayimiz var. Ayrıntılı sayılar aşağıdaki tabloda.`}
        >
          {ILLER.map(([plaka, il, sx, sy]) => {
            const d = deger(il);
            const v = harita.get(il);
            const k = kademe(d);
            return (
              <g
                key={plaka}
                className={`harita-il ${k} ${secili === il ? 'sec' : ''}`}
                onMouseEnter={() => setSecili(il)}
                onMouseLeave={() => setSecili(null)}
                onFocus={() => setSecili(il)}
                onBlur={() => setSecili(null)}
                tabIndex={0}
                role="button"
                aria-label={
                  v
                    ? `${il}: ${v.bizim} bayimiz, ilde toplam ${v.toplam}`
                    : `${il}: bayimiz yok`
                }
              >
                <rect
                  x={sx * H + BOSLUK}
                  y={sy * H + BOSLUK}
                  width={H - BOSLUK * 2}
                  height={H - BOSLUK * 2}
                  rx={5}
                />
                {/* Plaka kodu — il adı bu ölçekte sığmaz, kod evrensel kısaltma */}
                <text x={sx * H + H / 2} y={sy * H + H / 2 - 3} className="harita-plaka">
                  {String(plaka).padStart(2, '0')}
                </text>
                {d > 0 && (
                  <text x={sx * H + H / 2} y={sy * H + H / 2 + 12} className="harita-sayi">
                    {olcu === 'pay' ? `${Math.round(d)}%` : d}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover/odak bilgisi — sabit yükseklikte, düzen zıplamaz.
          aria-live: klavye ile gezerken ekran okuyucu da duyar. */}
      <p className="harita-bilgi" role="status" aria-live="polite">
        {seciliVeri ? (
          <>
            <strong>{seciliVeri.il}</strong>
            {' — '}
            <strong>{seciliVeri.bizim}</strong> bayimiz
            <span className="soluk">
              {' · ilde toplam '}
              {seciliVeri.toplam.toLocaleString('tr-TR')}
              {seciliVeri.toplam > 0 && ` · pay %${((100 * seciliVeri.bizim) / seciliVeri.toplam).toFixed(1)}`}
            </span>
          </>
        ) : secili ? (
          <>
            <strong>{secili}</strong> <span className="soluk">— bayimiz yok</span>
          </>
        ) : (
          <span className="soluk">Bir il üzerine gelin ya da Tab ile gezin.</span>
        )}
      </p>
    </section>
  );
}
