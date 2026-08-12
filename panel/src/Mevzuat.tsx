// EPDK Mevzuat modülü — "mevzuat profesörü" + A3↔Logo mutabakatı.
// İçerik docs/bilgi/epdk-mutabakat.md bilgi tabanından. DOĞRULANMASI GEREK = Parkoil teyidi bekliyor.
import { Sekmeler } from './Sekme.js';
import { Mutabakat } from './Mutabakat.js';
import { Uzlastirma } from './Uzlastirma.js';

interface Konu {
  baslik: string;
  ozet: string;
  detaylar: string[];
  durum: 'dogrulandi' | 'kismen' | 'todo';
}

const KONULAR: Konu[] = [
  {
    baslik: '1240 Sayılı Kurul Kararı',
    durum: 'dogrulandi',
    ozet: 'Dağıtıcının satış/dolum/envanter/durum verisini EPDK\'ya iletme zorunluluğu. Yeni standartlar 1 Temmuz 2026\'da yürürlükte.',
    detaylar: [
      'Tank belirsizlik: günlük (açılış+dolum−satış) vs kapanış farkı ≤ 288 litre, hata ≤ %3',
      'Aylık faturalı satış toplam dolumdan %3\'ten fazla saparsa açıklama zorunlu',
      'Tank verisi anlık; kalibrasyon değişiminde 24 saat içinde yedek',
      'Birim: benzin/motorin litre, fuel-oil/kalorifer kg',
    ],
  },
  {
    baslik: 'Zaman Damgası (zd.kamusm.gov.tr)',
    durum: 'dogrulandi',
    ozet: 'TÜBİTAK Kamu SM zaman damgası (5070 sayılı Kanun). Otomasyon, EPDK\'ya ilettiği veriyi e-imzalı damgalar.',
    detaylar: [
      'POL anasayfasındaki "KalanKredi" = zaman damgası kredisi',
      'Tüm ekran ve dışa aktarılan dosyalarda zaman damgası ZORUNLU',
      'Kredi bitmeden takip edilmeli → panelde uyarı planlanıyor',
    ],
  },
  {
    baslik: 'Otomasyon Veri Tabloları',
    durum: 'kismen',
    ozet: 'Pompa+tank otomasyonundan günlük otomatik EPDK\'ya iletilen tablolar.',
    detaylar: [
      'Dep1 = akaryakıt satışları', 'Dep2 = tank dolumları', 'Dr = stok hareketi',
      'K = kasa/fiş', 'Dat = tank kontrol/mutabakat',
      '⚠ Tam alan listesi resmi 1240 kılavuzuyla doğrulanmalı',
    ],
  },
  {
    baslik: 'İrsaliye / Dolum Bildirimi',
    durum: 'kismen',
    ozet: 'Tank dolumu otomatik algılanıp net/brüt miktar, sıcaklık, irsaliye ile bildirilir.',
    detaylar: [
      'ASIS GetTankFillingList bunun bizdeki karşılığı: IrsaliyeNo, IrsaliyeLitre, HacimFark',
      '⚠ "48 saat içinde bildirim" süresi resmi metinde doğrulanmalı (kılavuz "anlık" diyor)',
    ],
  },
  {
    baslik: 'A1A / A1B / A1C Rolleri',
    durum: 'kismen',
    ozet: 'Bildirim sorumluluk katmanları (kağıt form değil, web servis rolleri).',
    detaylar: [
      'A1A = Dağıtıcı (Parkoil) · A1B = Bayi · A1C = Otomasyon firması',
      'A1C resmi kaynakta doğrulandı; ⚠ A1A/A1B etiketleri "Yükümlülük Tablosu v17" ile teyit edilmeli',
    ],
  },
  {
    baslik: 'İdari Para Cezaları (5015 m.19)',
    durum: 'todo',
    ozet: '2026 yılı %25,49 artışlı. Bayilik cezası standart cezanın yarısı, otomasyon işleticisi 1/10.',
    detaylar: [
      'Bildirim yükümlülüğü ihlali: net satış hasılatının ‰8\'i (alt ~110.000 TL)',
      '⚠ Madde 19 taban tutarları resmi tebliğ tablosundan alınmalı',
    ],
  },
];

const DURUM_ETIKET: Record<Konu['durum'], { metin: string; sinif: string }> = {
  dogrulandi: { metin: 'DOĞRULANDI', sinif: 'iyi-r' },
  kismen: { metin: 'KISMEN', sinif: 'uyari' },
  todo: { metin: 'TEYİT GEREK', sinif: 'krit' },
};

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Mutabakat takvimi: her ayın mutabakatı ertesi ayın 20'sine kadar.
// Yaklaşan 3 dönemi (geçen ay + bir öncesi + iki öncesi bağlamı) döndür; odak = en güncel açık dönem.
function mutabakatTakvimi() {
  const bugun = new Date();
  const yil = bugun.getFullYear();
  const ay = bugun.getMonth(); // 0-11

  // Son 3 mutabakat dönemi: dönem ayı D → son tarih (D+1). Ör. bugün Temmuz (6) ise
  // odak dönem Haziran (5), son tarih 20 Temmuz.
  const donemler = [];
  for (let i = 1; i <= 3; i++) {
    const donemAy = ay - i; // geçmiş aylar
    const d = new Date(yil, donemAy, 1);
    const dAy = d.getMonth();
    const dYil = d.getFullYear();
    // Son tarih: dönemin ertesi ayının 20'si, gün sonu.
    const sonTarih = new Date(dYil, dAy + 1, 20, 23, 59, 59);
    const kalanMs = sonTarih.getTime() - bugun.getTime();
    const kalanGun = Math.ceil(kalanMs / 86_400_000);
    donemler.push({
      donemAd: `${AYLAR[dAy]} ${dYil}`,
      sonTarihAd: `20 ${AYLAR[(dAy + 1) % 12]} ${dAy === 11 ? dYil + 1 : dYil}`,
      kalanGun,
      gecti: kalanMs < 0,
    });
  }
  return donemler;
}

function MevzuatBilgi() {
  const takvim = mutabakatTakvimi();
  const odak = takvim[0]; // en güncel açık/yakın dönem (geçen ay)

  return (
    <>
      <div className="modul-bar">
        <span className="modul-alt">EPDK bildirim &amp; mevzuat rehberi</span>
        <span className="taze">Kaynak: docs/bilgi/epdk-mutabakat.md</span>
      </div>

      {/* MUTABAKAT TAKVİMİ — geri sayımlı, en öne */}
      <section>
        <h2>Mutabakat Takvimi</h2>
        <div className={`takvim-odak ${odak.gecti ? 'krit' : odak.kalanGun <= 5 ? 'uyari' : 'iyi'}`}>
          <div className="takvim-stripe" />
          <div className="takvim-govde">
            <div className="takvim-donem">{odak.donemAd} mutabakatı</div>
            <div className="takvim-durum">
              {odak.gecti ? (
                <span className="krit-metin" role="alert">
                  <span aria-hidden="true">⚠ </span>SÜRESİ GEÇTİ — son tarih {odak.sonTarihAd} idi
                </span>
              ) : (
                <>
                  Son tarih <b>{odak.sonTarihAd}</b> ·{' '}
                  <span className={odak.kalanGun <= 5 ? 'krit-metin' : ''}>{odak.kalanGun} gün kaldı</span>
                </>
              )}
            </div>
          </div>
          <div className="takvim-sayac mono">{odak.gecti ? '!' : odak.kalanGun}</div>
        </div>
        <div className="takvim-kural">Her ayın mutabakatı, takip eden ayın <b>20'sine</b> kadar tamamlanmalı.</div>
        <div className="takvim-mini">
          {takvim.slice(1).map((d) => (
            <div key={d.donemAd} className="takvim-mini-kart">
              <span className="mini-donem">{d.donemAd}</span>
              <span className={`mini-durum ${d.gecti ? 'iyi' : 'uyari'}`}>
                {d.gecti ? 'tamamlanmış olmalı' : `${d.kalanGun} gün`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="mevzuat-uyari">
        <b>Mevzuat bilgi tabanı canlı.</b> EPDK resmi kaynaklarından + mevcut POL/ASIS sisteminden
        derlendi. <span className="krit-metin">TEYİT GEREK</span> etiketli maddeler Parkoil mevzuat
        sorumlusunca doğrulanmalı. Doğrulandıkça bilgi tabanı güncellenir.
      </div>

      {/* Mutabakat kuralı — en somut operasyonel gerçek, öne çıkar */}
      <section>
        <h2>Kritik Mutabakat Kuralları</h2>
        <div className="kural-grid">
          <div className="kural-kart">
            <div className="kural-deger mono">≤ 288 <span>lt/gün</span></div>
            <div className="kural-aciklama">Tank belirsizlik limiti (açılış+dolum−satış vs kapanış)</div>
          </div>
          <div className="kural-kart">
            <div className="kural-deger mono">≤ %3</div>
            <div className="kural-aciklama">Aylık satış / dolum sapması — aşılırsa açıklama zorunlu</div>
          </div>
          <div className="kural-kart">
            <div className="kural-deger mono">24 <span>saat</span></div>
            <div className="kural-aciklama">Kalibrasyon değişimi sonrası yedekleme süresi</div>
          </div>
          <div className="kural-kart">
            <div className="kural-deger mono">1 Tem <span>2026</span></div>
            <div className="kural-aciklama">Yeni teknik standartların yürürlük tarihi</div>
          </div>
        </div>
      </section>

      {/* Mevzuat konuları */}
      <section>
        <h2>Mevzuat Konuları</h2>
        <div className="konu-liste">
          {KONULAR.map((k) => {
            const d = DURUM_ETIKET[k.durum];
            return (
              <div key={k.baslik} className="konu-kart">
                <div className="konu-ust">
                  <span className="konu-baslik">{k.baslik}</span>
                  <span className={`rozet ${d.sinif}`}>{d.metin}</span>
                </div>
                <p className="konu-ozet">{k.ozet}</p>
                <ul className="konu-detay">
                  {k.detaylar.map((x) => {
                    const teyit = x.startsWith('⚠');
                    return (
                      <li key={x} className={teyit ? 'uyari-madde' : ''}>
                        {teyit ? (
                          <>
                            <span aria-hidden="true">⚠ </span>
                            <span className="sr-only">Doğrulanmalı: </span>
                            {x.slice(2)}
                          </>
                        ) : (
                          x
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Mutabakat kontrolü — formül çözüldü (POL Tank Uzlaştırma Raporu) */}
      <section>
        <h2>Mutabakat Kontrolü</h2>
        <div className="formul-kart">
          <div className="formul-baslik">Tank Uzlaştırma Formülü <span className="rozet iyi-r">ÇÖZÜLDÜ</span></div>
          <div className="formul-satir mono">
            Fark = (Dönem Başı + Dolum − Satış) − Dönem Sonu Stok
          </div>
          <div className="formul-satir mono">Oran % = (Fark ÷ Satış) × 100</div>
          <div className="formul-aciklama">
            EPDK limiti: tank farkı <b>≤ 288 lt/gün</b>, oran <b>≤ %3</b>. Aşan tanklar mutabakat
            sapmasıdır (fire/kaçak/ölçüm hatası) — dönem kapanmadan (ayın 20'si) düzeltilmeli.
          </div>
        </div>
        <div className="takvim-bos bosluk-ust">
          <b>Otomatik hesaplama planı:</b> 4 girdi de ASIS'te var — dolum (GetTankFillingList ✓
          çekiliyor), satış (GetPumpSaleList), dönem başı/sonu stok (GetTankLevelList). Bunlar
          bağlanınca panel her ay, her tank için farkı otomatik hesaplayıp <b>288 lt / %3</b> aşanları
          listeleyecek → POL raporu beklemeden, ceza riskini erken yakala.
        </div>
      </section>
    </>
  );
}

// Modül girişi — iki sekme: mevzuat bilgi tabanı + A3↔Logo mutabakatı.
// Sekmeler bileşeni Piyasa'da da kullanılıyor; localStorage ile son sekme hatırlanır.
export function Mevzuat() {
  return (
    <Sekmeler
      anahtar="mevzuat"
      tanimlar={[
        { id: 'uzlastirma', ad: 'Tank Uzlaştırma', icerik: () => <Uzlastirma /> },
        { id: 'mutabakat', ad: 'A3 ↔ Logo Mutabakatı', icerik: () => <Mutabakat /> },
        { id: 'bilgi', ad: 'Mevzuat Bilgisi', icerik: () => <MevzuatBilgi /> },
      ]}
    />
  );
}
