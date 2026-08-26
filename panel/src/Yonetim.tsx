// Yönetim modülü — bayilerin ürün grubuna göre BİZDEN alımları (tarih filtreli).
// Kaynak: /api/yonetim → satis_fatura → BFF /dis/v1/mutabakat/fatura-satislari → Logo.
//
// NEDEN AYRI MODÜL: Piyasa modülü DIŞ dünyayı anlatıyor (EPDK, rakip, tüm bayiler).
// Burası İÇ ticaret: kendi bayimiz bizden ne kadar aldı. Ölçü litre + TL.
//
// ⚠️ Toplamlar İPTAL HARİÇ (sunucu tarafında filtreli). İptal sayısı "Veri kapsamı"
//    satırında görünür — sessizce yok sayılmıyor.
import { useMemo, useState } from 'react';
import { Tablo, type TabloKolon } from './Tablo.js';
import { Sekmeler } from './Sekme.js';
import { CubukYatay } from './Grafik.js';
import { Bos, Kart, ModulBar, trTarih, useVeri } from './ortak.js';

interface OzetV { bayi_sayisi: string; fatura_sayisi: string; litre: string; tutar: string }
interface BayiV {
  cari_kod: string; bayi_ad: string | null;
  litre: string; tutar: string;
  motorin_litre: string; benzin_litre: string; diger_litre: string;
  fatura_sayisi: string; ilk_alim: string | null; son_alim: string | null;
}
interface GrupV { urun_grubu: string; litre: string; tutar: string; bayi_sayisi: string }
interface AylikV { ay: string; urun_grubu: string; litre: string; tutar: string }
interface TesisV { tesis: string; litre: string; bayi_sayisi: string }
interface KapsamV {
  veri_bas: string | null; veri_bit: string | null;
  iptal_satir: string; tutarsiz_satir: string; grupsuz_satir: string; son_kosu: string | null;
}
interface YonetimV {
  uretim: string;
  aralik: { bas: string; bit: string };
  ozet: OzetV;
  bayiler: BayiV[];
  gruplar: GrupV[];
  aylik: AylikV[];
  tesisler: TesisV[];
  kapsam: KapsamV;
}

/** Ürün grubu kimliği → ekran adı. Sunucu kanonik kimlik gönderir. */
const GRUP_AD: Record<string, string> = {
  motorin: 'Motorin', benzin: 'Benzin', kalorifer: 'Kalorifer Yakıtı',
  fuel_oil: 'Fuel Oil', gazyagi: 'Gazyağı', diger: 'Diğer / eşleşmeyen',
};

const n = (s: string | null | undefined) => Number(s ?? 0);
const litreYaz = (v: number) => `${v.toLocaleString('tr', { maximumFractionDigits: 0 })} L`;
const tlYaz = (v: number) => `${v.toLocaleString('tr', { maximumFractionDigits: 0 })} ₺`;

/** ay 'YYYY-MM' → 'Tem 2026' (grafik ekseni için kısa). */
function ayKisa(ay: string): string {
  const [y, a] = ay.split('-');
  const adlar = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${adlar[Number(a)] ?? a} ${y}`;
}

/** Hazır tarih aralıkları — yönetimin en sık sorduğu dönemler. */
function hazirAralik(tip: 'buAy' | 'gecenAy' | 'buYil' | 'son12'): { bas: string; bit: string } {
  const b = new Date();
  const g = (d: Date) => d.toISOString().slice(0, 10);
  const ayBasi = (kaydir: number) => new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + kaydir, 1));
  if (tip === 'buAy') return { bas: g(ayBasi(0)), bit: g(ayBasi(1)) };
  if (tip === 'gecenAy') return { bas: g(ayBasi(-1)), bit: g(ayBasi(0)) };
  if (tip === 'buYil') return { bas: `${b.getUTCFullYear()}-01-01`, bit: g(ayBasi(1)) };
  return { bas: g(ayBasi(-11)), bit: g(ayBasi(1)) };
}

const BAYI_KOLONLARI: TabloKolon<BayiV>[] = [
  { id: 'bayi', ad: 'Bayi', varsayilan: true, hucre: (b) => b.bayi_ad ?? <span className="soluk">{b.cari_kod}</span>,
    sirala: (b) => b.bayi_ad ?? b.cari_kod, ara: (b) => `${b.bayi_ad ?? ''} ${b.cari_kod}` },
  { id: 'cari', ad: 'Cari Kod', varsayilan: false, sinif: 'mono soluk', hucre: (b) => b.cari_kod,
    sirala: (b) => b.cari_kod, ara: (b) => b.cari_kod },
  { id: 'litre', ad: 'Toplam', varsayilan: true, sinif: 'sag', hucre: (b) => litreYaz(n(b.litre)),
    sirala: (b) => n(b.litre), metin: (b) => String(n(b.litre)) },
  { id: 'tutar', ad: 'Tutar', varsayilan: true, sinif: 'sag', hucre: (b) => tlYaz(n(b.tutar)),
    sirala: (b) => n(b.tutar), metin: (b) => String(n(b.tutar)) },
  { id: 'motorin', ad: 'Motorin', varsayilan: true, sinif: 'sag', hucre: (b) => litreYaz(n(b.motorin_litre)),
    sirala: (b) => n(b.motorin_litre), metin: (b) => String(n(b.motorin_litre)) },
  { id: 'benzin', ad: 'Benzin', varsayilan: true, sinif: 'sag', hucre: (b) => litreYaz(n(b.benzin_litre)),
    sirala: (b) => n(b.benzin_litre), metin: (b) => String(n(b.benzin_litre)) },
  { id: 'diger', ad: 'Diğer', varsayilan: false, sinif: 'sag', hucre: (b) => litreYaz(n(b.diger_litre)),
    sirala: (b) => n(b.diger_litre), metin: (b) => String(n(b.diger_litre)) },
  { id: 'fatura', ad: 'Fatura', varsayilan: false, sinif: 'sag', hucre: (b) => b.fatura_sayisi,
    sirala: (b) => n(b.fatura_sayisi) },
  { id: 'sonAlim', ad: 'Son Alım', varsayilan: true, hucre: (b) => trTarih(b.son_alim),
    sirala: (b) => b.son_alim ?? '', metin: (b) => b.son_alim ?? '' },
];

export function Yonetim() {
  const [aralik, setAralik] = useState(() => hazirAralik('son12'));
  const url = `/api/yonetim?baslangic=${aralik.bas}&bitis=${aralik.bit}`;
  const { veri, hata, yukleniyor, yenile } = useVeri<YonetimV>(url);

  // Aylık trend: ürün grubu satırlarını aya göre topla (grafik tek seri çiziyor).
  const aylikToplam = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of veri?.aylik ?? []) m.set(a.ay, (m.get(a.ay) ?? 0) + n(a.litre));
    return [...m.entries()].map(([ay, litre]) => ({ ay, litre })).sort((x, y) => x.ay.localeCompare(y.ay));
  }, [veri?.aylik]);

  if (hata) return <Bos />;

  const ozet = veri?.ozet;
  const kapsam = veri?.kapsam;
  // Veri hiç çekilmemiş mi, yoksa bu aralıkta mı yok? İkisi farklı mesaj.
  const veriHicYok = !!veri && !kapsam?.veri_bas;

  return (
    <>
      <ModulBar
        alt="Bayi alımları · ürün grubu & ciro"
        taze={veri?.uretim ?? null}
        yukleniyor={yukleniyor}
        yenile={yenile}
      />

      {/* Tarih filtresi — hazır aralıklar (segment) + serbest giriş.
          Sınıflar mevcut tasarım sisteminden: .filtre-cubugu + .segment/.akt
          (yeni sınıf uydurmak = stilsiz kalma riski). */}
      <div className="filtre-cubugu">
        <div className="segment" role="group" aria-label="Hazır tarih aralığı">
          {([['buAy', 'Bu ay'], ['gecenAy', 'Geçen ay'], ['buYil', 'Bu yıl'], ['son12', 'Son 12 ay']] as const)
            .map(([tip, ad]) => {
              const a = hazirAralik(tip);
              const secili = a.bas === aralik.bas && a.bit === aralik.bit;
              return (
                <button key={tip} type="button" className={secili ? 'akt' : undefined}
                  aria-pressed={secili} onClick={() => setAralik(a)}>{ad}</button>
              );
            })}
        </div>
        <label className="tarih-alan">
          <span>Başlangıç</span>
          <input type="date" value={aralik.bas} max={aralik.bit}
            onChange={(e) => e.target.value && setAralik((x) => ({ ...x, bas: e.target.value }))} />
        </label>
        <label className="tarih-alan">
          {/* Bitiş HARİÇ — sunucu yarı-açık aralık kullanıyor, kullanıcı bilmeli. */}
          <span>Bitiş <span className="soluk">(hariç)</span></span>
          <input type="date" value={aralik.bit} min={aralik.bas}
            onChange={(e) => e.target.value && setAralik((x) => ({ ...x, bit: e.target.value }))} />
        </label>
      </div>

      <section className="kartlar">
        <Kart ad="Alım Yapan Bayi" deger={n(ozet?.bayi_sayisi).toLocaleString('tr')} />
        <Kart ad="Toplam Miktar" deger={litreYaz(n(ozet?.litre))} />
        <Kart ad="Toplam Tutar" deger={tlYaz(n(ozet?.tutar))}
          alt={n(kapsam?.tutarsiz_satir) > 0 ? `${kapsam?.tutarsiz_satir} satırda tutar yok` : undefined}
          uyari={n(kapsam?.tutarsiz_satir) > 0} />
        <Kart ad="Fatura" deger={n(ozet?.fatura_sayisi).toLocaleString('tr')} />
      </section>

      {veriHicYok ? (
        <div className="analiz-not krit-not">
          Satış verisi henüz çekilmemiş. <b>BFF</b> ayarlandıktan sonra{' '}
          <code>npm run satis:fatura -- --aylar 12</code> ile doldurulur.
        </div>
      ) : (
        <>
          {/* Veri kapsamı — "boş mu, eksik mi" sorusu ekranda cevaplanmalı. */}
          <div className="analiz-not">
            Veri aralığı: <b>{trTarih(kapsam?.veri_bas)}</b> – <b>{trTarih(kapsam?.veri_bit)}</b>
            {n(kapsam?.iptal_satir) > 0 && <> · {kapsam?.iptal_satir} iptal satırı toplamlara DAHİL DEĞİL</>}
            {n(kapsam?.grupsuz_satir) > 0 && <> · ⚠️ {kapsam?.grupsuz_satir} satır ürün grubuna eşlenemedi</>}
            {kapsam?.son_kosu && <> · son çekim {trTarih(kapsam.son_kosu)}</>}
          </div>

          <Sekmeler
            anahtar="yonetim"
            tanimlar={[
              {
                id: 'bayiler',
                ad: 'Bayi Alımları',
                sayi: veri?.bayiler.length ?? 0,
                icerik: () => (
                  <>
                    <CubukYatay
                      veri={veri?.bayiler ?? []}
                      ad={(b) => b.bayi_ad ?? b.cari_kod}
                      deger={(b) => n(b.litre)}
                      baslik="En Çok Alım Yapan Bayiler"
                      altBaslik={`${veri?.bayiler.length ?? 0} bayi · litre · seçili tarih aralığı`}
                      limit={12}
                    />
                    <Tablo
                      anahtar="yonetimBayi"
                      baslik="Bayi Bazında Alımlar"
                      kolonlar={BAYI_KOLONLARI}
                      satirlar={veri?.bayiler ?? []}
                      satirAnahtar={(b) => b.cari_kod}
                      yukleniyor={yukleniyor}
                      aramaEtiket="Bayi adı veya cari kod ara"
                      ilkGosterim={50}
                      adim={100}
                      bosMesaj="Bu tarih aralığında alım yok."
                    />
                  </>
                ),
              },
              {
                id: 'urun',
                ad: 'Ürün Grubu',
                icerik: () => (
                  <>
                    <CubukYatay
                      veri={veri?.gruplar ?? []}
                      ad={(g) => GRUP_AD[g.urun_grubu] ?? g.urun_grubu}
                      deger={(g) => n(g.litre)}
                      baslik="Ürün Grubuna Göre Satış"
                      altBaslik="litre · iptal hariç"
                      limit={8}
                    />
                    <Tablo
                      anahtar="yonetimGrup"
                      baslik="Ürün Grubu Kırılımı"
                      kolonlar={[
                        { id: 'grup', ad: 'Ürün Grubu', varsayilan: true, hucre: (g: GrupV) => GRUP_AD[g.urun_grubu] ?? g.urun_grubu,
                          sirala: (g: GrupV) => g.urun_grubu, ara: (g: GrupV) => g.urun_grubu },
                        { id: 'litre', ad: 'Miktar', varsayilan: true, sinif: 'sag', hucre: (g: GrupV) => litreYaz(n(g.litre)),
                          sirala: (g: GrupV) => n(g.litre), metin: (g: GrupV) => String(n(g.litre)) },
                        { id: 'tutar', ad: 'Tutar', varsayilan: true, sinif: 'sag', hucre: (g: GrupV) => tlYaz(n(g.tutar)),
                          sirala: (g: GrupV) => n(g.tutar), metin: (g: GrupV) => String(n(g.tutar)) },
                        { id: 'bayi', ad: 'Bayi', varsayilan: true, sinif: 'sag', hucre: (g: GrupV) => g.bayi_sayisi,
                          sirala: (g: GrupV) => n(g.bayi_sayisi) },
                      ]}
                      satirlar={veri?.gruplar ?? []}
                      satirAnahtar={(g) => g.urun_grubu}
                      yukleniyor={yukleniyor}
                    />
                  </>
                ),
              },
              {
                id: 'trend',
                ad: 'Aylık Trend',
                icerik: () => (
                  <CubukYatay
                    veri={aylikToplam}
                    ad={(a) => ayKisa(a.ay)}
                    deger={(a) => a.litre}
                    baslik="Aylık Satış Miktarı"
                    altBaslik="litre · tüm ürün grupları · iptal hariç"
                    limit={24}
                  />
                ),
              },
              {
                id: 'tesis',
                ad: 'Çıkış Tesisi',
                icerik: () => (
                  <CubukYatay
                    veri={veri?.tesisler ?? []}
                    ad={(t) => t.tesis}
                    deger={(t) => n(t.litre)}
                    baslik="Çıkış Tesisine Göre Satış"
                    altBaslik="hangi ikmal noktasından ne kadar çıktı · litre"
                    limit={12}
                  />
                ),
              },
            ]}
          />
        </>
      )}
    </>
  );
}
