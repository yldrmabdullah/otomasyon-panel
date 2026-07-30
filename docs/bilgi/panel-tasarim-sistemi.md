# Panel Tasarım Sistemi — kararlar ve gerekçeler

> Kaynak: 2026-07-28, 4 paralel uzman denetimi (UI/UX, görsel sistem, erişilebilirlik+responsive,
> kod kalitesi+performans) + kullanıcı kararları. Bu dosya **neden** böyle olduğunu kaydeder;
> tokenların kendisi `panel/src/stil.css`'te.

## Marka rengi kararı (2026-07-28)

**Karar: accent = Parkoil kırmızısı.** Kardeş proje `b2b/src/index.css:8`'de
`--color-brand: #e30613` "single source of truth" notuyla tanımlı. Panel başlangıçta mavi
accent kullanıyordu; kullanıcı b2b standardını görünce kırmızıya geçmeyi seçti.

**Çakışma problemi:** kırmızı hem marka hem alarm rengi. Ölçüm: `--accent` ile `--krit`
arasındaki renk mesafesi 1.16:1 (koyu) / 1.10:1 (açık) — görsel olarak neredeyse ayırt
edilemez. Çözüm **renk değil, TAŞIYICI ayrımı**:

| Anlam | Token | Taşıyıcı |
|---|---|---|
| Marka / interaktif / "bizim bayi" | `--accent`, `--marka` | Sol şerit + kırmızı kalın metin + `PARKOIL` rozeti. **Zemin dolgusu YOK.** |
| Aciliyet / alarm | `--krit` | **Zemin dolgusu** + kalın metin + `▲`/`▲▲` işareti + "alarm" mini-rozeti |

Kural: bir öğe kırmızı ZEMİN alıyorsa aciliyet demektir. Marka vurgusu asla zemin doldurmaz.
`--marka` (#e30613 ham) yalnız şerit/dolgu/logo için — metin olarak kullanılmaz (koyu zeminde
3.49:1, non-text eşiğini geçer ama metin eşiğini geçmez).

## Kontrast (WCAG AA, ölçülmüş)

Açık tema başta **kullanılamaz** durumdaydı: `-bg` tint'leri override edilmiş ama ana semantik
renkler koyu tema değerinde kalmıştı. Ölçülen: `.rozet.uyari` **1.80:1**, `.rozet.iyi-r`
**1.89:1**. `#26c99e` mint yeşili beyaz üzerinde temelde okunmuyor.

**Ders: açık tema override'ında `-bg` tint'i yetmez, ana renk de koyulaşmak zorunda.**

Son durumda 22 metin/zemin çiftinden 22'si AA (4.5:1) geçiyor. En kırılgan token `--soluk-2`
(`.bos` boş-durum, placeholder, `.alarm-zaman`, `td.yok`).

⚠️ **`--soluk-2` DÖRT zeminde ölçülür, sadece `--panel`'de değil:**

| Zemin | Nerede |
|---|---|
| `--panel` | normal hücre |
| `--panel-2` | **satır hover** (`tbody tr:hover td`) |
| `krit-bg` karışımı | `.satir-alarmli` |
| `accent-bg` karışımı | `.satir-biz` |

Panel'de 4.78:1 geçen `#7f8898` hover'da **4.25:1**'e, alarmlı satırda **4.24:1**'e düşüyordu.
Seçilen değerler dördünde de geçiyor: koyu **`#868f9f`** (≥4.65), açık **`#5f6875`** (≥4.80).
Değiştirirken dört zemini birlikte ölç — tek zemin yanıltıcı.

`data-theme` blokları `@media (prefers-color-scheme)`'i **yenmek zorunda** → aynı token seti
birebir iki kez yazılır. Tekrar bilinçli; birini güncelleyip diğerini atlamak sessiz regresyon.

## Emoji yasağı

Modül ikonları emoji idi (`📡 ⚖️ 🛢️`). Sorunlar: platformdan platforma farklı render, renk
kontrolü yok, ekran okuyucuya çöp metin ("siyah daire Online", 50 satırda 50 kez "siyah yıldız"),
kurumsal panelde amatör duruyor. → `panel/src/ikon.tsx` inline stroke SVG (currentColor).

Metin içindeki dekoratif işaretler (`↻`, `⚠`, `▲`, `‹›`) `aria-hidden="true"` ile sarılır.
**Bilgi taşıyan** işaret (eski `★` = bizim bayi) gizlemek yetmez — `.sr-only` metin karşılığı
gerekir ("Parkoil bayisi: ").

## Erişilebilirlik kalıpları (uygulanmış)

- **Yarım ARIA, hiç ARIA'dan kötüdür.** `role="tablist"` vardı ama `role="tab"`/`aria-selected`
  yoktu → ekran okuyucu hangisinin seçili olduğunu hiç söylemiyordu. Bu bir filtre grubu,
  tab değil → `role="group"` + `aria-pressed`. Aynı şekilde `role="menu"` yalnız `menuitem*`
  çocuk kabul eder; `label`+checkbox geçersiz çocuk ve okunmayabilir → `role="group"`.
- Açılır menü: Escape + focus'u tetikleyiciye geri verme + Tab'la çıkınca kapanma zorunlu.
- Sıralanabilir `<th>` **gerçek `<button>`** içerir (klavyeyle erişim) + `aria-sort`; ok karakteri
  `aria-hidden`, yön `aria-sort`'ta.
- 60 sn'lik otomatik yenileme sessizdi → `role="status" aria-live="polite"` duyuru bölgesi.
- Filtre sayaçları `aria-live` — "142 / 380" değil "142 / 380 istasyon" (çıplak sayı anlamsız).
- Aciliyet rengi tek taşıyıcı olamaz (WCAG 1.4.1): `td.krit/uyari` renk + kalınlık + `▲▲` +
  `.sr-only` "Kritik gecikme: ".
- `type="button"` **her** butonda. Bugün `<form>` yok ama bir gün arama kutusu form'a sarılırsa
  her buton sayfayı submit eder — sessiz mayın.
- Tema seçici bir erişilebilirlik kontrolü (düşük görme). CSS'te `data-theme` override'ları
  vardı ama hiçbir kod set etmiyordu → ölü altyapı, şimdi `App.tsx` bağladı.

## Responsive

- **Dokunma hedefleri:** `@media (pointer: coarse)` içinde 44px (WCAG 2.5.5). Masaüstünde
  kompakt bilgi yoğunluğu korunur — operasyon paneli için doğru denge. Native checkbox 13px'ti,
  20px'e çıkarıldı.
- **Taşan grid:** `minmax(360px, 1fr)` konteyner 360px'den darsa **taşar** (CSS Grid min'i ihlal
  eder). Doğru deyim: `minmax(min(360px, 100%), 1fr)`. 5 grid bundan etkileniyordu.
- **521–860px boşluğu:** sadece 2 breakpoint vardı, iPad portre/katlanabilir ele alınmamıştı →
  760px ara breakpoint.
- **Sticky çakışması:** mobilde `.kenar` sticky top:0 ve `th` sticky top:0 → tablo başlığı
  sidebar'ın altına kayıp gidiyordu. `th { top: var(--kenar-yuk) }`.
- **Yatay kaydırmada bağlam kaybı:** ad kolonu `position: sticky; left: 0` + **opak** zemin
  (şeffaf tint altından içerik görünür → `color-mix` ile opaklaştırıldı).
- 6 butonlu `.segment` 375px'de taşıp **sayfa gövdesini yatay kaydırıyordu** → `flex-wrap`
  (kaydırma değil sarma: 6 filtrenin hepsi tek bakışta görünür).
- `100vh` mobil adres çubuğunu hariç tutmaz → `100dvh` + `@supports not` fallback.

## Sessiz veri kaybı yasağı

Sözleşme tablosu `.slice(0, 60)` ile 60 üstünü **sessizce atıyordu** ama başlıktaki rozet toplam
sayıyı (143) gösteriyordu. Bir operasyon panelinde bu kabul edilemez. Kural:

> Bir liste kırpılıyorsa (a) sayaç kırpılmış/toplam ikisini de göstersin, (b) kalanına ulaşan
> açık bir kontrol olsun ("Daha fazla göster (83 kayıt daha)").

Aynı ilke hata yutmaya da uygulanır: `/api/bayiler` 404'te `[]` dönüp "0 / 0" gösteriyordu →
kullanıcı "veri yok" ile "sistem bozuk"u ayırt edemiyordu. Artık hata ekranda.

## Local ↔ prod tek gerçek (kritik mimari ders)

Panel verisinin **iki ayrı, senkronsuz uygulaması** vardı: `araclar/panelSnapshot.ts` (local
statik dosya) ve `panel/api/*.ts` (Vercel serverless). Sonuçlar:

- Serverless `sozlesmeBitecek`, `bolgesel`, `beyazAlan`, `kaybedilen` alanlarını **hiç
  döndürmüyordu** → prod'da Piyasa modülünün yarısı boş.
- `baglanti`'yı `kategori`/`rakip`/`iptal_aciklama` **olmadan** seçiyordu → prod'da İzleme
  tablosu `TypeError` ile çökerdi.
- `ozet` alan adı uyuşmazlığı (`bayi_sayisi` vs `toplam_bayi`) → kartta **NaN**.
- `ONAYLANDI` filtresi bir tarafta var bir tarafta yok → aynı panel local'de 12.624, prod'da
  30.303 "aktif bayi" gösteriyordu. Bu doğrudan **"kullanıcıya gösterilen veri gerçek olmalı"**
  ilkesinin ihlali.
- `/api/bayiler` serverless karşılığı **hiç yazılmamıştı**.

**Çözüm ve kalıcı kural:** tüm panel sorguları `core/panelSorgu.ts`'te. İki tüketici de o modülü
çağırır. Sorgu değişikliği YALNIZ orada yapılır.

Bunun derleyicide yakalanmamasının nedeni: `vite build` `tsc` çalıştırmıyordu ve `tipler.ts`
paylaşılmıyordu (`Piyasa.tsx` kendi interface'lerini yerel tanımlıyordu). → `build` artık
`tsc --noEmit && vite build`.

## Performans dersleri (30 bin satırlık tablo)

- `localeCompare(x, 'tr', {numeric:true})` her karşılaştırmada yeni `Intl.Collator` kurar.
  30 bin öğe → ~440 bin kurulum → 2-6 sn ana thread bloğu. **Collator modül düzeyinde bir kez.**
- Arama debounce'suzdu → "ADANA" yazmak 5 tam tarama+sıralama tetikliyordu. 250 ms debounce;
  input **anlık** state'e bağlı kalır (yazma gecikmesi olmasın), memo gecikmeli değeri kullanır.
- Arama hedefi (`ad + no + ilçe`.toLowerCase) her filtrede yeniden kuruluyordu → yükleme anında
  bir kez `_ara` alanına yazılır.
- Filtre ve sıralama **ayrı memo**: tek memo'da sıralama yönü değişince filtre de baştan
  koşuyordu (ve tersi).
- `useEffect(() => setSayfa(1), [filtreler])` anti-pattern: ekstra render turu + sıralamanın
  iki kez koşması. Reducer'da filtre değişimi `sayfa: 1`'i **aynı dispatch'te** sıfırlar.
- `/api/durum` yanıtının %41'i (114 KB) `tanklar` idi ve UI'da **tüketicisi yoktu**; 60 sn'de bir
  çekiliyordu → günde ~164 MB boşa trafik. Kaldırıldı; gerekirse ayrı endpoint.
- Polling `document.visibilityState === 'visible'` kontrolüyle — arka plan sekmesi ağı yormaz.
- **Sanallaştırma (react-window) GEREKMİYOR:** 50 satır sayfalanıyor, darboğaz render değil
  `JSON.parse` + sıralama. Doğru çözüm sunucu-taraflı sayfalama (sıradaki iş).

## Bilinen açık iş

- `/api/bayiler` 30 bin satırı tek yanıtta döndürüyor (~9.4 MB ham / ~1 MB gzip). Sunucu-taraflı
  sayfalama+arama yazılacak; `bayiler_epdk(il)`, `(dagitim_sirketi)`, `(lisans_durumu)` indeksleri
  ve `lisans_sahibi` için `pg_trgm` GIN gerekecek. Sıralama kolonu **whitelist**'ten geçmeli
  (SQL injection).
- Filtre durumu URL'de değil → "Mersin'deki ES ES bayileri" ekranı paylaşılamıyor, geri tuşu
  çalışmıyor. Reducer'daki `Sorgu` nesnesi endpoint query string'iyle birebir aynı şekilde
  tasarlandı; URL senkronu neredeyse bedava.
## Ortak `Tablo<T>` bileşeni (`panel/src/Tablo.tsx`)

Bildirimsel kolon tanımı: `{ id, ad, varsayilan, sabit?, hucre, sinif?, hucreSinif?, sirala?, ara? }`.
`<th>`, `<td>` ve `colSpan` **tek `gorunur` listesinden** türetilir → kolon kayması yapısal
olarak imkânsız (eskiden iki ayrı yerde elle eşleniyordu). Sağladıkları:

- Her kolonda **sıralama** (`sirala` verilirse), Türkçe collator, 3-durum döngüsü:
  artan → azalan → **sıralama yok** (kullanıcı iptal edebilmeli).
- **Arama** (`ara` verilen kolonları tarar), `useDeferredValue` ile — input anlık kalır.
- Uzun listede **dikey kaydırma + sabit başlık** (`kaydirmaEsigi`, varsayılan 25 satır).
- **Kademeli gösterim** (`ilkGosterim`/`adim`) + "Daha fazla göster (N kayıt daha)".

### ⚠️ Üç tuzak (canlı-doğrulanmış)

**1. Veriye bağlı hücre stili `<td>`'ye gitmeli, içteki `<span>`'e değil.**
`sinif` sabit sınıf; satıra göre değişen sınıf için **`hucreSinif`** kullanılır. CSS
`td.krit`/`td.uyari` gibi element-bağlı seçiciler ve `::after` ok işaretleri `<span>`'de
eşleşmez → 269 satırın 120'sinde aciliyet sinyali sessizce kaybolmuştu.

**2. Dilimleme arama/sıralama SONRASI yapılır.**
Tabloya kırpılmış liste vermek (`satirlar={ilk50}`) aramayı yalnız o 50 satırda çalıştırır ve
kalan 250'de sonuç varken **"kayıt yok" der**. Tam listeyi ver, `ilkGosterim` ile sınırla.

**3. İlk kolon `ad-hucre` + `sabit: true` olmak ZORUNDA.**
Mobil sticky CSS `th:first-child` ↔ `td.ad-hucre` çiftini sabitliyor. Rozet kolonunu başa
koymak başlıkta bir sütunu, gövdede başkasını sabitleyip hizayı bozuyordu. `sabit: true` de
şart: kolon kapatılabilirse çift kayar.

Ek: kendi scroll container'ı olan tabloda (`.kaydirmali`) mobil `th { top: var(--kenar-yuk) }`
offset'i **yanlış** — sticky referansı sidebar değil container'dır → `.tablo-sar.kaydirmali th
{ top: 0 }` ile sıfırlanır.

### Hâlâ elle eşlenen tablo

Piyasa "Tüm Bayiler" (30 bin satır, kendi sayfalama + çoklu dropdown filtresi) `Tablo`'ya
geçmedi; orada `<th>`/`<td>` elle eşleniyor (tutarlılık doğrulandı ama yapısal garanti yok).
Sunucu-taraflı sayfalamaya geçilirken birlikte ele alınmalı.

## Sentinel tarih (ASIS)

ASIS "hiç veri göndermemiş" için **1900-12-31** döndürüyor. Ham gösterilince panelde
**"45865 gün önce"** çıkıyordu. `ortak.tsx` → `zamanFark()`/`veriYok()` 10 yıl (`SENTINEL_GUN
= 3650`) üstünü sentinel kabul eder → "hiç veri yok". Canlı dağılım doğruladı:
`{1900: 39, 2025: 23, 2026: 207}` — meşru bir tarihin 10 yılı aşması bu veri setinde imkânsız.

Ayrıca bu satırlar **kırmızı ▲▲ ile gösterilmemeli**: veri gelmemesi bir aciliyet değil, bilgi
eksikliği. Ayrı sınıf `td.yok` (nötr + italik, işaret yok).

## UI tutarlılık denetimi + il haritası (2026-07-30)

### Bulunan 2 gerçek bug (dün eklenen kodda)

1. **`.etiket` sınıfı CSS'te HİÇ YOKTU.** `Operasyon.tsx` rozetleri `className="etiket uyari"`
   ile yazılmıştı ama projenin rozet sınıfı `.rozet` (stil.css:437). Sonuç: Operasyon →
   Alarm sekmesindeki **"Eşik ayarı" / "Gerçek arıza" rozetleri renksiz düz metin** olarak
   çıkıyordu — hem de modülün en önemli kolonu. → `.rozet` yapıldı.
2. **`var(--kenar)` bir renk token'ı DEĞİL.** Tanımlı olanlar `--kenar-en: 224px` ve
   `--kenar-yuk: 58px` (uzunluk). Renk yerine kullanınca `border-color` geçersiz olup
   `currentColor`'a düşüyor → kenarlık metin rengiyle çiziliyor, panelin sessiz
   `--cizgi` dilinden çok daha belirgin. → `var(--cizgi)` yapıldı (2 yer).

**Ders:** yeni sınıf yazmadan önce `grep` ile o sınıfın CSS'te VAR olduğunu doğrula.
TypeScript CSS sınıf adını denetlemiyor — yanlış sınıf sessizce stilsiz çıkar.

### Yapısal düzeltme: `basId` prop'u kaldırıldı

`Tablo`'nun `basId?: string` prop'u çağrı tarafında verilmesi UNUTULABİLİYORDU:
Operasyon'un **5 tablosunda eksikti** → `aria-labelledby` boş kalıp **isimsiz landmark
region** oluşuyordu (ekran okuyucu "region" der, hangi tablo olduğunu söylemez).
Artık `Tablo` kendi id'sini `useId()` ile üretiyor → kayma yapısal olarak imkânsız.
5 çağrıdaki elle id'ler silindi (dışarıdan referans olmadığı doğrulandı).

### Responsive: tazelik şeridi mobilde taşıyordu

Dün eklenen tazelik şeridinin hiç breakpoint kuralı yoktu. 7 kaynak `white-space: nowrap`
ile tek satırda **~1314 px** sürüyordu → 360-768 px arası TÜM mobil genişliklerde sayfaya
yatay kaydırma biniyordu. `overflow-x: auto` yanına "taşmasın" yorumu yazılmıştı — **auto
taşmayı önlemez**, taşınca kaydırma çubuğu ekler. Kaldırıldı; 520px altında 2 sütun ızgara.

Ek kapatılan açıklar: `.rampa-gosterge` (flex-wrap yoktu), `.sifre-deger` (uzun şifre
karttan taşıyordu → `overflow-wrap: anywhere`).

**AÇIK KALAN (bilinçli):** `.cikis-btn` dokunmatikte 32px (WCAG 44px önerisi altında).
44px'e çıkarmak `--kenar-yuk: 58px`'i aşar ve bu değer 860px altında **sticky `th` offset'i**
olarak kullanılıyor (stil.css:764) → tablo başlıkları şeridin arkasına kayar. İkisi
birlikte güncellenmeli, ayrı iş.

## Türkiye il haritası (Harita.tsx)

### ⚠️ IZGARA DENEMESİ REDDEDİLDİ (2026-07-30) — sonra gerçek sınırlara geçildi

İlk sürüm 81 ili bir **18×9 ızgaraya** yerleştiriyordu, "coğrafi konumlarına yaklaşık"
gerekçesiyle. **Sonuç Türkiye'ye benzemiyordu:** Sinop tek başına tepede, Trakya Anadolu'ya
bitişik, Hakkari/Iğdır kopuk adalar gibi. Kullanıcı haklı olarak reddetti.

**Ders:** "yaklaşık" diyerek geçilen GÖRSEL bir çıktı, ölçülmeden/bakılmadan kabul
edilemez. Sayısal doğrulama (81 il tam, çakışma yok, adlar eşleşiyor) yapılmıştı ama
**şeklin kendisi** hiç denetlenmemişti — hâlbuki bakınca anlaşılan bir hataydı.

**Şimdiki çözüm — gerçek il sınırları:**
`panel/src/haritaYollari.ts` (81 il, 5.956 nokta, **70 KB**), `araclar/haritaUret.ts`
ile GeoJSON'dan üretiliyor. Kaynak: github.com/cihadturhan/tr-geojson. Dış istek YOK
(Leaflet + tile sunucusu ~150 KB + internet bağımlılığı olurdu). Bundle: gzip 110 KB.

Projeksiyon: eşit dikdörtgen + orta enlem (39°) kosinüs düzeltmesi — bu çarpan olmadan
harita yatay olarak ~%29 gerilir. En/boy oranı korunur (çarpılma yok).

**Bu kez şekil de doğrulandı — 8 coğrafya testi geçti:**
Edirne x=47 (batı) · Van x=944 (doğu) · Sinop y=24 (kuzey) · Antalya y=382 (güney) ·
Ankara ortada. Testler: Edirne<Van, Sinop<Antalya (kuzey), İstanbul<Ankara,
Hakkari>Şanlıurfa, İzmir<Antalya, Ankara merkeze yakın.

Haritada plaka/sayı METNİ YOK: 81 ilin şekli farklı, küçük illere metin sığmıyor ve
üst üste biniyordu. Sayı hover/odak şeridinde veriliyor.

Doğrulananlar:
- 81 il tam, plaka/ad tekil, ızgara çakışması yok (betikle denetlendi)
- İl adları EPDK verisiyle **81/81 birebir** eşleşiyor → hiçbir il haritada kaybolmuyor
- ⚠️ `bolgesel` sorgusu `WHERE bizim>0` yüzünden yalnız **61 il** döndürüyor; harita için
  TÜM illeri veren ayrı `haritaIl` alanı eklendi (20 il nötr görünür — "0 bayi" ile
  "az bayi" aynı renge boyanmaz)
- Hücre metni kontrastı **her iki tema için ayrı ölçüldü**: ramp yönü ters olduğu için
  (koyu temada k1 en açık, açık temada k1 en koyu) tek sabit atama bir temada 1.29:1
  veriyordu. `--harita-ink` değişkeniyle temaya göre çevrildi, 10 kombinasyon da AA (≥4.5).
- Klavye erişimi: her il `tabIndex=0` + `aria-label`, hover bilgisi `aria-live="polite"`

⚠️ **TypeScript tuzağı:** plaka kodlarını `[09, 'AYDIN', ...]` diye yazmak **sekizlik
literal** hatası verir (TS1121). Öneki sıfır kullanılmaz; gösterimde `padStart(2,'0')`.
