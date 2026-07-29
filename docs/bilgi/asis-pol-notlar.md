# ASIS POL — Sistem ve İş Notları

## POL nedir

**PetechOnline (POL)** = ASİS'in istasyon otomasyon merkez sunucusu. Parkoil'in
istasyonlarındaki tank/pompa/satış/dolum verisini toplar. Web arayüzü: `pol.parkoil.tr`
(otomasyon ekibi buradan bakar). Dışarı SOAP/ASMX web servisiyle açar.

> (2026-07-23, kullanıcı anlattı) Otomasyon çalışanının günlük ilk işi: bağlantı
> sorunlarını tespit edip bayiye ulaşmak, sorunu anlamak. Sorun bayideyse bayi çözer,
> POL/bayilik dışıysa POL çözer. Çoğu bayi kendi bağlantısını takip etmiyor → onları da
> haberdar etmek gerekiyor.

## POL arayüzündeki ilgili ekranlar (referans)

- **İstasyon Raporları → İstasyon Bağlantı Durumu:** her istasyonun online/offline durumu,
  Son Veri Gönderim Zamanı, Periyod (sn). Bizim bağlantı alarmımızın kaynağı bu mantık.
- **Tank Raporları → Tank Durum Raporu:** istasyon+tank bazında Durum Tarihi, kapasite,
  yakıt seviyesi. Bizim tank alarmımızın kaynağı.
- Anasayfa: Online/Offline istasyon sayısı, WebServis çalışma durumu, EPDK servis durumu.

> (2026-07-23, kullanıcı ekran görüntüleri) 180 aktif istasyon. Bağlantılı örnekte
> "Son Veri Gönderim Zamanı" ve "Periyod (sn)" (30 veya 240 sn) kolonları var.

## Tank veri periyodu

> (2026-07-23, kullanıcı anlattı) Tank verisi **her 30 dakikada bir** POL'e düşer. Bir
> tank bundan uzun süre veri göndermezse bu ayrı bir sorundur (bağlantı var ama tank sessiz).

## SOAP erişimi

- Gateway: `https://pol.parkoil.tr/Poservice/gateway.asmx`
- `guidKey` (secret) + `dagiticiKod=21` her çağrıda.
- Namespace: `http://www.asis.com.tr/`
- Salt-okuma. ASIS'e yazılmaz.

## Tuzaklar (canlı doğrulanmış — ana repodan)

1. **Element sırası:** ASMX WSDL element sırasına duyarlı. `GetTankLastLevel` için doğru
   sıra `guidKey, dagiticiKod, IstasyonKod`. Ters sıra "Code=0 başarılı" döner ama liste BOŞ.
2. **Tarih/TZ:** Yanıttaki tarihler Türkiye yerel saati, timezone taşımaz. UTC'ye çevirirken
   Europe/Istanbul kabul et; sunucu TZ'sine göre `toUTC` yapma → yanlış tazelik hesabı.
3. **Code != 0:** Hata durumunda sessizce boş liste dönebiliyor. Yanıttaki `Code`/`Message`
   kontrol et; 0/200/boş değilse hata fırlat (cursor sessizce takılmasın).

## ⭐ ÇÖZÜLDÜ: GetXxxRecord'un 0 dönmesi — `bitis` saati yok sayılıyor (2026-07-29)

**Kök neden bulundu.** Eskiden buraya "ASIS geçici hıçkırığı, aynı parametreyle bazen 0 bazen
doğru dönüyor" yazılıydı — teşhis **yanlıştı**. Gerçek kural: `bitis` parametresinin **saat
kısmı yok sayılıyor, sadece tarih kullanılıyor**. `bitis` = başlangıçla aynı gün verilirse
aralık sıfır genişlikte olur → `Code 900 · "Gosterilecek data bulunamadi" · KayitID 0`.

**KURAL: `bitis` = ertesi günün `00:00:00`.** Çözünürlük **1 gün**; gün içi aralık sorgulanamaz.

`GetPumpSaleRecord`, aynı gün (2026-07-28), tek fark bitiş saati:

| baslangic | bitis | Sonuç |
|---|---|---|
| `28T00:00:00` | `28T12:00:00` | Code 900 · KayitID **0** |
| `28T00:00:00` | `28T23:59:59` | Code 900 · KayitID **0** |
| `28T00:00:00` | `29T00:00:00` | Code 0 · KayitID **7402284** |
| `28T00:00:00` | `29T00:00:01` | Code 0 · KayitID **7402284** (aynı) |
| `28T00:00:00` | `29T12:00:00` | Code 0 · KayitID **7402284** (aynı) |

Aynı kural `GetTankLevelRecord`'da da doğrulandı (`29T00:00→29T23:59:59` = 900/0;
`29T00:00→30T00:00` = 10184060) ve `GetTankFillingRecord` için de geçerli. Tarih **biçimi**
fark etmiyor (`2026-07-28` ile `2026-07-28T00:00:00` aynı sonucu verir).

`recordDene`'nin 0'ı reddetme koruması **doğru, kalsın** (0 → cursor=0 → tüm arşiv taranır,
felaket). Ama artık 0 görülünce ilk şüphe "ASIS hıçkırığı" değil, **`bitis` günü hatalı**.

## TUZAK: cursor ≠ zaman filtresi — ID sırası satış tarihine göre DEĞİL (2026-07-29)

`GetPumpSaleRecord(28.07)` = 7402284 diyor ama o cursor'dan sonraki **ilk kayıt 27T23:52**
tarihli. Sebep: `TPompaSatisID` merkeze **varış** sırasına göre artıyor, `Tarih` ise pompadaki
gerçek satış anı — istasyonlar gecikmeli gönderiyor.

Tek sayfada (10.000 kayıt) ölçüm: **ID %100 artan**, ama tarih **4.796 kez geriye sıçrıyor**,
en fazla **659 dakika (11 saat)** geriye. Sayfanın tarih aralığı 27T18:51 → 28T14:51.

**Sonuç:** "O günün satışları"nı `record(gün) → list(cursor)` ile çekmek **yanlış toplam üretir**
(mutabakatta kabul edilemez). Doğrusu: cursor'ı **en az 12 saat geriden** başlat ve kayıtları
`Tarih` alanına göre **client-side** filtrele. Aynı uyarı `GetTankLevelList` için de geçerli —
orada ID sırası **istasyon-major**: küçük cursor'lar tek istasyonun aylarını gezer, bir sayfa
3 ayrı günü karıştırabilir.

## TUZAK: parametre adı büyük-küçük harfe duyarlı (2026-07-23 bulgusu, 2026-07-29 ölçüldü)

Aşağıdaki 2026-07-23 bölümü `IstasyonOnlineDurum`'un `<Key>` istediğini zaten kaydetmişti.
2026-07-29'da harf harf ölçüldü — duyarlılık **tam**:

| Gönderilen | Sonuç |
|---|---|
| `<Key>` | **179 kayıt**, 89.6 KB |
| `<key>` | 0 kayıt, 0.4 KB — HTTP 200, SOAP Fault YOK, Code YOK |
| `<guidKey>` | 0 kayıt |
| `<KEY>` | 0 kayıt |

**⚠️ Bu bilgi 2026-07-23'te burada doğruyken, `core/tipler.ts` ve `baglanti-tank-izleme.md`
"boş dönüyor / yetki yok" diye YANLIŞ kalmıştı** (2026-07-29'da düzeltildi). Ders sadece
"parametre adını WSDL'den doğrula" değil: **bir tuzak çözüldüğünde onu tekrarlayan TÜM
dosyalar aranıp güncellenmeli**, yoksa kod yorumu dokümanı yalanlar ve sonraki oturum
yanlışa güvenir. `dagiticiKod` eklemek sonucu değiştirmiyor (ASMX fazla elementi yok sayıyor).

## Bayi ↔ istasyon eşleme

EPDK lisans no ile: ASIS `EPDKKod` = `BAY/939-82/{no}`. `{no}` ayıkla, bayinin EPDK no'suyla
eşle. 1 bayi → N istasyon olabilir (ör. MASKOLO 5 istasyon).

## Canlı doğrulama bulguları (2026-07-23)

> **NOT (2026-07-29):** Aşağıdaki sayılar o günün fotoğrafı, **sabit değil**. 6 gün sonra
> ölçüm: istasyon **269→268**, IstasyonOnlineDurum **180→179**, tank **666→669**. Panelde
> hiçbir sayıyı hard-code etme, testlerde eşitlik yerine aralık/oran kontrolü yap.

guidKey `0DC03ACA-...` + dağıtıcı 21 ile canlı POL'e çağrı yapıldı (salt-okuma):

- **GetStationList → 269 istasyon.** Her istasyonda `SonTarih` (son veri gönderim zamanı),
  `EPDKKod` (BAY/939-82/{no}), `IstasyonDurum` (true/false = aktif mi), `IstasyonTip`
  ("İstasyonlu" vb.), koordinat, şehir/bölge/mıntıka DOLU. RAHA/TUANA/ASLANLAR ekranla birebir.
- **IstasyonOnlineDurum → ÇALIŞIYOR** (DÜZELTME 2026-07-23): İlk denemede boş dönmüştü çünkü
  YANLIŞ parametre gönderdim (`guidKey`+`dagiticiKod`). WSDL'e göre girdi TEK alan: `<Key>`
  (=guidKey). Doğru parametreyle **180 kayıt** döndü (=aktif istasyon). Zengin veri: `OnlineDurum`
  (anlık online/offline!), `IP`, `TankVersiyon`, `PompaVersiyon`, `EpdkID` (ayıklanmış no),
  `LisansTipi`. AMA `SonVeriTarihi` bu metotta `nil` geliyor. → Bağlantı için EN İYİSİ:
  `IstasyonOnlineDurum.OnlineDurum` (anlık) + `GetStationList.SonTarih` (ne zamandır) BİRLİKTE.
- **DERS:** ASIS'te parametre ADI metottan metoda değişir (`guidKey`/`Key`/`key`) ve SIRA önemli.
  Bir metot "boş" dönüyorsa önce WSDL'deki tam girdi tanımına bak. Tam referans:
  docs/ASIS_TAM_REFERANS.md (WSDL 2207 satır tam parse edildi).
- **GetTankLastLevel parametresiz (IstasyonKod nil) → TÜM tankları döndürür:** 666 tank /
  175 istasyon tek çağrıda. İstasyon başına ayrı çağrıya GEREK YOK. `DurumTarihi` 30 dk
  periyotlu (09:30, 10:00...). `SuSeviyeLT` dolu (tankta su → kalite göstergesi).
- **Tarih formatı:** ISO ama TZ'siz (`2026-07-23T09:58:26.453`) = Türkiye yerel saati.
  UTC'ye çevirirken bileşenlere ayır + UTC-3 uygula. `Date.parse` KULLANMA (makine TZ'sine
  göre çift kayma yapar — doğrulandı).

## Pasif/ölü kayıt filtresi (KRİTİK kalibrasyon — 2026-07-23)

269 istasyonun ~96'sı ilk bakışta ">3sa kopuk" çıktı ama çoğu **3600+ saat / yıllar** veri
göndermemiş (hiç devreye girmemiş veya kapanmış kayıtlar; bazılarında SonTarih ~epoch →
1.100.000+ saat). Ekranda **180 aktif** istasyon vardı → fark bu ölü kayıtlar.

**Çözüm (kullanıcı kararı):** Son `PASIF_ESIK_GUN` (varsayılan 7) günden eski veri gönderen
istasyon "pasif" sayılır, alarm ATILMAZ. Gerçek alarm = son 7 günde veri vermiş AMA şimdi
>3sa sessiz. Bu filtreyle **kopuk 96→2, tank-veri-yok 158→37** (operasyonel gerçek sayılar).

## ÇÖZÜM: bayi iletişim BFF /dis/v1/bayi-iletisim ile (2026-07-23, canlı test edildi)

İletişim ASIS SOAP'ta yok ama Logo cari kartında VAR. Statik export bayatlar (bayi gelince/
gidince) → BFF'e endpoint eklendi: **`GET /dis/v1/bayi-iletisim`** (X-Api-Key). Bizim Bayiler
tablosundaki EpdkKod (ASIS eşleme anahtarı) + canlı Logo cari kartından telefon(TELNRS1)/
cep(CELLPHONE)/eposta(EMAILADDR), LogoKod ile birleşir. Her çağrıda taze → bayat kopya yok.

Job başında bir kez çeker (core/bffIletisim.ts), EPDK no ile alarm hedefine bağlar. BFF kapalıysa
bayi hedefi boş kalır, alarm yine ekibe gider. Env: BFF_URL + BFF_API_KEY.

**Canlı test bulguları — KESİN SAYILAR (2026-07-23, 191 eşleşen bayi):**
- **Eşleşme:** 269 ASIS istasyonundan ~191 bayi bizim Bayiler.EpdkKod ile eşleşiyor. Eşleşmeyenler
  (ör. ILGINPARK 45536) Bayiler'de EpdkKod'u boş → o bayiye bildirim gitmez.
- **E-posta dolu: 100/191 (%52).** → mail bayilerin yarısına ulaşır. 91 bayinin hiç iletişimi yok.
- **Cep telefonu (CELLPHONE) dolu: 0/191 (%0!).** Sabit telefon (TELNRS1): 12/191 (%6).
  → **SMS şu an neredeyse İŞE YARAMAZ** — Logo'da cep tel hiç doldurulmamış. Netgsm kurmadan önce
  telefon verisi çözülmeli. Telefon POL panelinde DOLU (ör. RAHA 0552...) ama Logo'da yok.

**ÇÖZÜLDÜ — POL Excel ikinci kaynak (2026-07-23):** POL İstasyon Tanımları ekranı Excel export
(SpreadsheetML .xls) telefon %100, mail %90, KEP %38 içeriyor (Logo telefon %0 idi). Bu Excel
`araclar/polExcelImport.ts` ile Supabase `bayi_iletisim`'e yazıldı (180 bayi). Job artık İKİ
kaynağı birleştiriyor: BFF(canlı Logo) + bayi_iletisim(POL Excel), alan bazında dolu olanı seçer
(iletisimCoz). Kanıt: ILGINPARK/GÜLPET (Logo'da yoktu) artık gerçek telefon+mail alıyor. %100 kapsam.
- **BFF (Logo):** bayi gelince/gidince OTOMATİK güncel ama telefon eksik.
- **POL Excel (bayi_iletisim):** telefon tam ama ARA SIRA elle güncellenir (yeni export → import).
- **Excel kolon TUZAĞI (ÖNEMLİ):** POL export'unda satırlar arası hizalama SABİT DEĞİL — bir bayide
  2 telefon varsa sonraki hücreler kayıyor (sabit-index okuma YANLIŞ veri verir; VKN/EPDK no 10 hane
  olduğu için telefonla karışır). ÇÖZÜM: içerik-tabanlı ayıklama (polExcelImport.ts): EPDK='BAY/'
  içeren hücre; telefon=10 hane + '5' ile başlayan (gerçek cep, VKN/EPDK elenir); mail='@' içeren;
  KEP=kep.tr ayrı. Satırdaki TÜM hücreler taranır.
- **ÇOKLU iletişim:** 27 bayide 2+ cep, birkaçında 2+ mail var. bayi_iletisim.telefonlar/epostalar
  TEXT[] dizi. Bildirim HEPSİNE gider (kullanıcı kararı). job iletisimCoz BFF+POL tüm no/mailleri
  birleştirip tekilleştirir. Kanıt: ASLANLAR 47929 → 2 cep (5XXXXXXXXX, 5YYYYYYYYY). KEP bildirime
  DAHİL DEĞİL (kayıt için tutulur; kullanıcı kararı).
- Kalan veri kusuru: bazı POL maillerinde Türkçe karakter (ör. 'ılgınpark...@') → geçersiz, bounce olur.

**Yapılacak (opsiyonel iyileştirme):** POL Excel'i periyodik güncelle (bayi değişince yeni export).
Bayiler.EpdkKod eksikleri doldur (BFF eşleşmesi artar; ama POL zaten kapsıyor).

**Yapılacak (veri kalitesi, kod değil):** (1) Bayiler.EpdkKod eksik olanları doldur (eşleşme artar).
(2) Logo'da cep telefonu boş olanları POL panelinden (orada telefon dolu, ör. RAHA 0552...) tamamla.

## KESİNLEŞTİ: bayi iletişim SOAP'ta YOK, POL panelinde VAR (2026-07-23)

WSDL (`gateway.asmx?WSDL`, 40+ operasyon) tamamen tarandı → telefon/mail/eposta/kep/adres/
vergi/ilgili-kişi alanı **HİÇ yok**. `Station` tipi 13 alan, hepsi teknik/konum (bkz
docs/ASIS_METOTLARI.md). **Bu kapandı — tekrar SOAP'ta arama.**

Ancak POL WEB PANELİ `Istasyon.aspx` (İstasyon İşlemleri → İstasyon Tanımları) detayında bu
bilgiler DOLU: İlgili Kişi (ör. RAHA→<İLGİLİ KİŞİ>), Telefon (0 5XX XXX XX XX), eMail
(<bayi-mail@ornek.com>), KEP, Adres, İlçe, Vergi Dairesi, VKN (<VKN-10-hane>). Ayrıca
"Ekstre Gönderim Opsiyonu: Faks/Email/SMS" seçenekleri → POL zaten bayiye mesaj gönderebiliyor.

**İletişim kaynağı:** `bayi_iletisim` tablosu. Doldurma: POL İstasyon Tanımları ekranından
Excel export (liste ekranında export butonları var) — export'ta telefon/mail kolonları varsa
doğrudan import; yoksa Istasyon.aspx detay scrape veya ParkB2B DB. Alarm kodu kaynaktan bağımsız.
Eşleme EPDK no ile (Station.EPDKKod ↔ bayi_iletisim.epdk_no).

## ⭐ TAM METOT DENETİMİ — canlı durum tablosu (2026-07-29)

WSDL'deki **34 operasyonun** tamamı canlı çağrıldı (salt-okuma, sıralı). Doküman "ne yazıyor"
değil, sunucu "ne dönüyor" kaydı. **Belgeye güvenip üç kez yanıldığımız için bu tablo esas alınır.**

### Çalışanlar

| Metot | Kayıt / süre | Notlar |
|---|---|---|
| `GetStationList` | **268** · 322 ms | 12/12 alan dolu. Kütük + `SonTarih` (kopukluk kaynağı). Sayıyı hard-code etme (269→268 değişti). |
| `GetTankLastLevel` | **669 tank / 176 ist.** · 302 ms | 11/11 dolu. Anlık izlemenin belkemiği. 669'un 665'i bugün taze, 4'ü 07-26'da takılı. |
| `GetTankLevelList` | **10.000/sayfa** · 655 ms · 7.4 MB | ⭐ Mutabakat A/D kaynağı. 30 dk grid (günde 49 damga), tek damgada **662 tank**, `YakitSeviyeLTNet` %96 dolu, geçmiş 2025-02-26'ya kadar. ID **istasyon-major** → zaman filtresi client-side. |
| `GetPumpSaleList` | **10.000/sayfa** · ~400-800 ms · 5 MB | ⭐ Mutabakat C (satış) kalemi. 17/20 alan dolu, ~20.000 satır/gün. `SayacIlk/Son/Fark` **hep 0** → pompa sayaç mutabakatı YAPILAMAZ. EPDK kodu yok, `GetStationList` join şart. |
| `GetPumpSaleRecord` | tek ID · ~250 ms | Cursor kapısı. `bitis`=ertesi gün kuralı zorunlu. |
| `GetTankLevelRecord` | tek ID · ~300 ms | Aynı kural. ~31k kayıt/gün. |
| `GetTankFillingRecord` | tek ID · 685 ms | Aynı kural. Dolum (B kalemi) cursor girişi. |
| `IstasyonOnlineDurum` | **179** · 316 ms | `<Key>` şart. 12/13 dolu ama **`SonVeriTarihi` boş** → eşik hesabı yapılamaz. 179 vs 268 farkı: yokluğu "offline" sayma. Değeri: `IP`, `TankVersiyon`, `PompaVersiyon` (saha yazılım envanteri). |
| `SonBirimFiyat` | **320** · ~600 ms | 10/12 alan %100 dolu (`EpdkKod`, `Unvan`, `Bolge`, `Mintika`, `Il`, `Ilce`, `Urun`, `PompaFiyat`). **`TavsiyeFiyat` ve `ErpKodu` %0 dolu** → tavsiye-fiyat kıyası YAPILAMAZ. Sadece 2 ürün (K95, Motorin). `istasyonErpKod` filtresi sonucu sıfırlıyor → boş bırak, client-side `EpdkKod` ile filtrele. |
| `GetProductTypeList` | **5 ürün** · 269 ms | `TUrunID` ↔ yakıt sözlüğü. Etanollü/biodizel yok (eski portal listesiyle uyumlu). Günde 1 çek, cache'le. |
| `GetSaleTypeList` | **9** · 234 ms | Parametresiz (guidKey bile istemiyor). ⚠️ `SaleTypeID=8` **iki kez** (Aytemiz Kart + İndirim Kart) → ID'yi Map anahtarı yaparsan biri kaybolur, `ShortName` kullan. |
| `GetDiscountDate` | tek tarih · - | Dokümanda adı yoktu. `ActiveDiscountDate=0001-01-01` → kampanya yok. Ucuz nöbetçi: değişirse kampanya tanımlanmış. |

### Çalışmayanlar

| Metot | Durum | Sebep |
|---|---|---|
| `TankSonDurum` | boş | **12 kombinasyon** denendi. WSDL'de `kirilim` tipi `s:string` (int değil) → 0-4 zaten geçersiz enum. Doğru enum sözlüğü ASIS'ten yazılı alınmadan uğraşmaya değmez. |
| `PompaSatisToplam` | boş | Aynı `kirilim`/`kirilimAdi` ailesi, aynı sonuç. İşlevi `GetPumpSaleList` grup-by ile çıkar. |
| `IstasyonUrunLitre` / `...Tip` | **HTTP 500** | ASIS'te bozuk stored procedure: `exec Entegrasyon.dbo.sYillikToplam2`. 4 aralık denendi, hepsi 500. Bizim tarafta çözülemez. |
| `IstasyonStokTankKapasite` | **HTTP 500** | `Invalid object name 'Entegrasyon.dbo.vStokKapasite'` — view sunucuda YOK. `KalanGun` cazipti; kendimiz hesaplarız (stok ÷ günlük satış). |
| `GetPumpSaleListDetail` | yetki | guidKey kabul etmiyor, ayrı `GirisAd`/`Sifre` istiyor → `BAŞARISIZ KULLANCI` (ASIS'in yazım hatası). Kimlik elimizde yok. **Tarih-aralıklı** olduğu için cursor'lu metottan değerli olabilir → ASIS'ten istenmeli. |
| `GetPumpSaleListTransfer` | boş, hata yok | `KayitID=0` = tüm arşiv; boş = bu dağıtıcıda tanker transfer satışı hiç yok. Köy tankeri devreye girerse tekrar bak. |
| `GetSales` / `GetSalesByPompaSatisID` | boş | Filo alt-sistemi. Parametre adı `key` doğru (`guidKey` ile Result elementi bile gelmiyor) → auth OK, veri yok. Şema zengin (`Temperature, TankStock, ReceiptNo, Odometer`) ama erişim/veri yok. |
| `GetDiscountData` / `GetExtraDiscountData` | boş | Element sırası ters çevrildi, aynı sonuç. `GetDiscountDate` kanıtlıyor: kampanya tanımlı değil. Gerçek durum, hata değil. |

### ❌ Düzeltme katmanı SOAP'ta YOK — kesin negatif sonuç

POL ekranının ham ASIS verisine uyguladığı **tam 1.000,00 lt** fark ve "İade Bakım Transfer Var
Mı?" kolonu aranıyordu. **34 operasyonun tamamında** ham kelime taraması:

```
iade: 0   bakim/bakım: 0   mutabakat: 0   duzelt/düzelt: 0
tashih: 0  revize: 0        manuel: 0      onay: 0*
```
(*yalnız `GetSaleTypeList`'in "Otomatik Onay" **veri değerinde**, metot/alan adında değil)

Eşleşen tüm adlar ham veri: `GetPumpSaleListTransfer` (tanker **satışı**), `Irsaliye*`
(`GetTankFillingList` içinde), `KalibrasyonDurumu`, `SayacFark`, `TankStok`.

**Yorum:** düzeltme katmanı POL uygulama katmanında (`.aspx`) hesaplanıyor, servis ham veri
veriyor. Bu yol **kapandı**. Kalan seçenekler: (a) o iki irsaliyede `IrsaliyeHacimFark`/
`IrsaliyeMiktarFark` 1.000 lt'yi açıklıyor mu (en ucuz, en umutlu), (b) `GetPumpSaleListDetail`
için ASIS'ten kimlik istemek, (c) POL arayüzünü scrape, (d) ASIS'e doğrudan sormak.

### Diğer alan tuzakları
- Enlem/Boylam ondalık ayracı **metoda göre değişiyor**: `GetStationList` noktalı (`38.852122`),
  `IstasyonOnlineDurum` virgüllü (`38,852122`) → tek parse fonksiyonu ikisinde patlar.
- `PumpSale.Durum` 10.000 kayıtta **tek değer (10)** → iptal/iade izi yok (düzeltme-izi
  yokluğuyla tutarlı).
- `GetSales` Code/Message zarfı **döndürmüyor** (diğerlerinden farklı) → hata kontrolü ayrı.
- HTTP 500 fault'ları dahili SQL/proc adını sızdırıyor (ASIS'e bildirilebilir güvenlik notu).
