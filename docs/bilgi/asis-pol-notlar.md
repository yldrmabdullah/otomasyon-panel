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

## TUZAK: GetXxxRecord bazen 0 döner (mutabakat kritik)

GetPumpSaleRecord / GetTankLevelRecord (tarih→başlangıç KayitID) **aynı parametreyle bazen 0,
bazen doğru ID dönüyor** (ASIS geçici hıçkırığı — 2026-07-23 canlı gözlendi: Haziran için önce
3847250, sonra 0, sonra yine 3847250). **0 KABUL EDİLİRSE cursor=0 → TÜM ARŞİV taranır (felaket,
job takılır).** Çözüm (asisClient.recordDene): 0 dönerse 3 kez dene, hâlâ 0 ise HATA fırlat —
asla 0'dan arşiv tarama. Mutabakat bu ID'ye bağlı; ID alınamıyorsa o ay hesaplanamaz (sessiz
yanlış sonuç yerine açık hata).

## Bayi ↔ istasyon eşleme

EPDK lisans no ile: ASIS `EPDKKod` = `BAY/939-82/{no}`. `{no}` ayıkla, bayinin EPDK no'suyla
eşle. 1 bayi → N istasyon olabilir (ör. MASKOLO 5 istasyon).

## Canlı doğrulama bulguları (2026-07-23)

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
