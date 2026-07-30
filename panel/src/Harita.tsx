/* Türkiye il haritası — GERÇEK il sınırlarıyla bayi dağılımı.
 *
 * ⚠️ TARİHÇE (2026-07-30): İlk sürüm 81 ili bir 18×9 IZGARAYA yerleştiriyordu
 * ("coğrafi konumlarına yaklaşık" gerekçesiyle). Sonuç Türkiye'ye benzemiyordu:
 * Sinop tek başına tepede, Trakya Anadolu'ya bitişik, Hakkari/Iğdır kopuk adalar.
 * Kullanıcı haklı olarak reddetti. Ders: "yaklaşık" diye geçilen görsel bir şey
 * ölçülmeden kabul edilmemeli — bakınca anlaşılan bir hataydı.
 *
 * Şimdi gerçek sınırlar kullanılıyor: `haritaYollari.ts` (araclar/haritaUret.ts ile
 * GeoJSON'dan üretilmiş, 81 il, 70 KB, dış istek YOK — panelin kendi kendine yeten
 * yapısı korunuyor; Leaflet + tile sunucusu ~150 KB + internet bağımlılığı olurdu).
 *
 * Projeksiyon: eşit dikdörtgen + orta enlem (39°) kosinüs düzeltmesi. Doğrulama:
 * 8 coğrafya testi (Edirne batıda, Sinop kuzeyde, Hakkari doğuda…) üretici aracın
 * yanında geçirildi.
 *
 * İL ADI EŞLEMESİ: yollar EPDK biçiminde (BÜYÜK HARF, Türkçe) — `bayiler_epdk.il`
 * ile 81/81 birebir eşleştiği doğrulandı. Eşleşmezse il boyanmaz (sessiz kayıp),
 * bu yüzden üretici araç eşleşmeyen ad kalırsa hata verip çıkıyor.
 */
import { useId, useMemo, useState } from 'react';
import { HARITA_BOY, HARITA_EN, IL_YOLLARI } from './haritaYollari.js';

export interface HaritaIl {
  il: string;
  /** O ildeki bizim bayi sayımız. */
  bizim: number;
  /** O ildeki toplam bayi (piyasa). */
  toplam: number;
}

/**
 * @param veri il bazında sayılar (EPDK büyük-harf il adıyla) — TÜM iller verilmeli;
 *   bayimiz olmayan il nötr çizilir ("0 bayi" ile "az bayi" aynı renge boyanmaz).
 * @param olcu 'bizim' → kendi bayi sayımız; 'pay' → o ildeki payımız (%)
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

  const harita = useMemo(() => new Map(veri.map((v) => [v.il, v])), [veri]);

  const deger = (il: string): number => {
    const v = harita.get(il);
    if (!v) return 0;
    if (olcu === 'pay') return v.toplam > 0 ? (100 * v.bizim) / v.toplam : 0;
    return v.bizim;
  };

  const enBuyuk = useMemo(() => {
    let m = 0;
    for (const [, il] of IL_YOLLARI.map((x) => [0, x[0]] as const)) {
      const d = deger(il);
      if (d > m) m = d;
    }
    return m || 1;
  }, [harita, olcu]);

  /** Sıralı ramp kademesi. 0 → 'yok' (nötr): yokluk "az" değildir. */
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
  const bizimIl = IL_YOLLARI.filter(([il]) => (harita.get(il)?.bizim ?? 0) > 0).length;

  return (
    <section className="harita-blok" aria-labelledby={basId}>
      <div className="harita-ust">
        <div>
          <h3 id={basId}>{baslik}</h3>
          {altBaslik && <p className="harita-alt">{altBaslik}</p>}
        </div>
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
          viewBox={`0 0 ${HARITA_EN} ${HARITA_BOY}`}
          className="harita-svg"
          role="img"
          aria-label={`Türkiye il haritası. ${bizimIl} ilde bayimiz var. Ayrıntılı sayılar altta ve tabloda.`}
        >
          {IL_YOLLARI.map(([il, d]) => {
            const v = harita.get(il);
            const k = kademe(deger(il));
            return (
              <path
                key={il}
                d={d}
                className={`harita-il ${k} ${secili === il ? 'sec' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={
                  v && v.bizim > 0
                    ? `${il}: ${v.bizim} bayimiz, ilde toplam ${v.toplam}`
                    : `${il}: bayimiz yok`
                }
                onMouseEnter={() => setSecili(il)}
                onMouseLeave={() => setSecili(null)}
                onFocus={() => setSecili(il)}
                onBlur={() => setSecili(null)}
              />
            );
          })}
        </svg>
      </div>

      {/* Sabit yükseklik → hover'da düzen zıplamaz.
          aria-live: klavyeyle gezerken ekran okuyucu da duyar. */}
      <p className="harita-bilgi" role="status" aria-live="polite">
        {seciliVeri && seciliVeri.bizim > 0 ? (
          <>
            <strong>{seciliVeri.il}</strong>
            {' — '}
            <strong>{seciliVeri.bizim}</strong> bayimiz
            <span className="soluk">
              {' · ilde toplam '}
              {seciliVeri.toplam.toLocaleString('tr')}
              {seciliVeri.toplam > 0 &&
                ` · pay %${((100 * seciliVeri.bizim) / seciliVeri.toplam).toFixed(1)}`}
            </span>
          </>
        ) : secili ? (
          <>
            <strong>{secili}</strong>
            <span className="soluk">
              {' — bayimiz yok'}
              {seciliVeri && seciliVeri.toplam > 0 && ` · ilde toplam ${seciliVeri.toplam.toLocaleString('tr')} bayi`}
            </span>
          </>
        ) : (
          <span className="soluk">Bir il üzerine gelin ya da Tab ile gezin.</span>
        )}
      </p>
    </section>
  );
}
