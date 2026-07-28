# ASIS / PetechOnline (POL) SOAP — TAM Referans

> **Kaynak:** Canlı WSDL (`https://pol.parkoil.tr/Poservice/gateway.asmx?WSDL`, 2207 satır)
> baştan sona parse edildi (2026-07-23). Bu, servisin **kesin** sözleşmesidir — her metodun
> girdi/çıktısı ve her alan gerçek WSDL'den. Tahmin yok.

## Bağlantı bilgileri

| | |
|---|---|
| Gateway | `https://pol.parkoil.tr/Poservice/gateway.asmx` |
| Namespace | `http://www.asis.com.tr/` |
| SOAPAction | `http://www.asis.com.tr/{MetotAdi}` |
| Kimlik | `guidKey` = `0DC03ACA-...` (bazı metotlarda `Key` veya `key` adıyla), `dagiticiKod` = 21 |

> ⚠️ **Parametre adı metottan metoda DEĞİŞİYOR.** Bazısı `guidKey`, bazısı `Key`, bazısı `key`.
> Element **SIRASI da** önemli (ASMX pozisyonel). Aşağıda her metodun tam girdisi var.

---

## 🟢 Bu projede kullanılan / kullanılabilir okuma metotları

### GetStationList — istasyon kütüğü + bağlantı (SonTarih)
- **Girdi:** `DagiticiKod` (int), `guidKey` (string)
- **Çıktı:** `Code`, `Message`, `Stations[]` → her **Station**:
  `IstasyonERPKod, IstasyonKod, TIstasyonID, IstasyonAd, IstasyonDurum(bool), IstasyonTip,`
  **`SonTarih`** (son veri zamanı), `Enlem, Boylam, EPDKKod, SehirAd, BolgeAdi, MantikaAd`
- **Kullanım (biz):** kütük + EPDK eşleme + bağlantı (SonTarih eskiliği). Canlı: 269 istasyon.
- **İletişim alanı YOK.**
- **`IstasyonTip`** (2026-07-28 canlı sayım): `İstasyonlu` 265 · `Köy pompası` 2 · `Tanker` 2.
  `Tanker` = **köy tankeri** satış noktası (dağıtıcı aracı DEĞİL — kullanıcı teyidi).
  Üçü de gerçek bayi. Panelde tip kolonu + filtre.
- ⚠️ **`IstasyonKod` TEKİL DEĞİL:** 5 kayıtta `0` geliyor. PK olarak kullanılırsa upsert'te
  birbirlerini ezer ve 4 bayi kaybolur. `core/asisClient.ts:istasyonKimlik()` EPDK no'dan
  `E-{no}` türetir. (2026-07-28 canlı tespit, bkz `docs/bilgi/baglanti-tank-izleme.md`.)
- ⚠️ **`IstasyonDurum` "online" DEĞİL** — kütükte aktif kayıt mı demek. Gerçek bağlantı
  `SonTarih` tazeliğinden hesaplanır; ikisi karıştırıldığı için panel "180 Online" gösterirken
  o istasyonların son verisi 5 gün öncesiydi.

### IstasyonOnlineDurum — ⭐ ANLIK online/offline + IP + versiyon
- **Girdi:** `Key` (string = guidKey) — **TEK parametre!** (guidKey/dagiticiKod DEĞİL — o yüzden
  ilk denemede boş dönmüştü, 2026-07-23 düzeltildi.)
- **Çıktı:** `IstasyonOnlineBilgi[]` → her kayıt:
  `DagiticiKod, IstasyonKod, `**`OnlineDurum(bool)`**`, SonVeriTarihi(nil geliyor), IstasyonAd,`
  `EpdkKodu, `**`EpdkID`**` (ayıklanmış no!), `**`IP`**`, TankVersiyon, PompaVersiyon, Enlem, Boylam, LisansTipi`
- **Kullanım (biz):** anlık bağlantı durumu (GetStationList.SonTarih'i tamamlar). Canlı: **180 kayıt**
  (= aktif istasyon sayısı). IP + versiyon = teşhis/eskilik. EpdkID hazır (regex'e gerek yok).
- Not: `SonVeriTarihi` bu metotta nil → "ne zamandır offline" için GetStationList.SonTarih kullan.

### GetTankLastLevel — ⭐ anlık tank durumu
- **Girdi (SIRA önemli):** `guidKey`, `dagiticiKod` (int), `IstasyonKod` (string, opsiyonel/nil).
  Nil → **tüm istasyonların tankları tek çağrıda** (canlı: 666 tank/175 istasyon).
- **Çıktı:** `TankLastLevel[]` → her tank:
  `IstasyonAd, IstasyonKod, `**`DurumTarihi`**`, Kapasite, UrunAdi, TankNo, UrunKisaAd,`
  `YakitSeviyeMM, `**`YakitSeviyeLT`**`, SuSeviyeMM, `**`SuSeviyeLT`**
- **Kullanım (biz):** tank veri takibi (DurumTarihi eskiliği). 30 dk periyot.

### GetProductTypeList — yakıt tanımları
- **Girdi:** `DagiticiKod`, `guidKey`
- **Çıktı:** `Product[]` → `TUrunID, UrunAdi, UrunKisaAd, Durum(bool)`
- **Kullanım (biz):** ASIS TUrunID → bizim yakıt eşleme.

### GetSaleTypeList — satış/dolum tipleri
- **Girdi:** yok (parametresiz)
- **Çıktı:** `SaleType[]` → `SaleTypeID, Name, ShortName(=CariTip), Status, UpdateTime`

---

## 🔵 İleride kullanılabilir (satış / stok / dolum / fiyat)

### GetTankFillingList — ⭐⭐ tank dolum + İRSALİYE (EPDK mutabakatı için değerli)
- **Girdi:** `KayitID` (int, artımlı cursor), `dagiticiKod`, `guidKey`
- **Çıktı:** `TankFilling[]` → çok zengin:
  `TTankDolumID, TIstasyonID, TUrunID, TankNo, UrunAdi, DolumBaslamaZamani, DolumBitimZamani,`
  `DolumMiktari, DolumMiktariNet, YakitDolumBaslama/BitisMiktariLT, DolumTipi, TalepTarihi,`
  `EslesmeMiktari, YakitDolum...MM, SuBaslangic/BitisMiktariMM, BaslangicSicakligi, BitisSicakligi,`
  `TankerSicakligi, KalibrasyonYuzdesi, `**`IrsaliyeNo, IrsaliyeLitre, IrsaliyeBirimfiyat,`**
  **`IrsaliyeMiktar, IrsaliyeHacimFark, IrsaliyeMiktarFark`**`, Kapasite, IstasyonAd, IstasyonKod,`
  `IstasyonTip, TankerDolumTarihi`
- **Neden değerli:** İrsaliye no/litre/fiyat + hacim/miktar farkı → EPDK dolum bildirimi/mutabakat
  ham verisi. A1A/A1B işlerine gelince ilk bakılacak metot.

### GetPumpSaleList — pompa satışları (artımlı)
- **Girdi:** `KayitID` (long cursor), `dagiticiKod`, `guidKey`
- **Çıktı:** `PumpSale[]` → `TPompaSatisID, Tarih, TIstasyonID, TUrunID, AracRFID, IstasyonRecId,`
  `VardiyaNo, CariTip, TankNo, PompaNo, Tabanca, BirimFiyat, Litre, Tutar, Plaka, Durum,`
  `PompaciAd, SayacIlk, SayacSon, SayacFark`

### GetPumpSaleListDetail — pompa satışı DETAYLI (tarih aralığı)
- **Girdi:** `baslangic`, `Bitis` (dateTime), `dagiticiKod`, `GirisAd`, `Sifre`
- **Çıktı:** `PumpSaleDetail[]` → GetPumpSaleList + `EPDKKod, IstasyonERPKod, SehirAd, IlceAd,`
  `NetLitre, BrutLitre, YakitSeviyeMM, SuSeviyeMM, TankStok, GelisZaman, Sarfiyat, Aciklama`
- Not: ayrı `GirisAd/Sifre` ister (guidKey değil).

### GetPumpSaleListTransfer — tanker transfer satışları
- **Girdi:** `KayitID`, `dagiticiKod`, `guidKey`
- **Çıktı:** `PumpSaleTransfer[]` → `TPompaSatisTransferID, Tarih, IstasyonKod/Ad, AracRFID,`
  `BirimFiyat, Litre, Tutar, Plaka, IstasyonRecId, Sehir, Ilce, UrunAd`

### GetSales / GetSalesByPompaSatisID — filo satışları (araç/şoför kırılımlı)
- **Girdi:** `KayitID` (long), `key`, `dagiticiKod`
- **Çıktı:** `Sales[]` → `Plaka, AracKm, Tarih, UrunAdi, Litre, BirimFiyat, Tutar, CalismaSaati,`
  `TPompaSatisFiloID, TPompaSatisID, TIstasyonID, IstasyonKod/Ad, FiloKodAd, SatisRFID, TUrunID,`
  `IstasyonRecID, SaseNo, RuhsatNo, PersonelAd, YakitAlan, PersonelGuncelRFID, FarkKm`

### GetTankLevelList — tank seviye GEÇMİŞİ (artımlı, sıcaklık/kalibrasyon dahil)
- **Girdi:** `KayitID` (int), `dagiticiKod`, `guidKey`
- **Çıktı:** `TankLevel[]` → `TTankDurumID, TIstasyonID, TalepTarihi, TankNo, DurumTarihi,`
  `Kapasitesi, YakitSeviyeMM/LT, SuSeviyeMM/LT, `**`KalibrasyonYuzdesi, Sicaklik`**`, TanimlanmaTarihi,`
  `KalibrasyonDurumu, IstasyonKod/Ad/ERPKod, `**`YakitSeviyeLTNet`**`, TUrunID, UrunAdi, EpdkID`

### TankSonDurum — stok toplamı (grup/bölge/mıntıka/istasyon kırılımı)
- **Girdi:** `guidKey`, `kirilim`, `kirilimAdi`
- **Çıktı:** `TankSonDurumVeri[]` → `GrupKodu, GrupAdi, GrupErpKod, UrunAdi, UrunKodu, StokMiktari,`
  `TankKapasitesi, `**`DolulukOrani`**

### IstasyonStokTankKapasite — istasyon+tank stok + KALAN GÜN
- **Girdi:** `guidKey`
- **Çıktı:** `IstasyonSonStok[]` → `IstasyonAd, EpdkKodu, UrunAd, Stok, TankNo, TankKapasite,`
  **`KalanGun`**` (stok kaç gün yeter), Tarih`

### PompaSatisToplam — satış litresi toplamı (tarih aralığı, kırılım)
- **Girdi:** `guidKey`, `satisTipEkle` (bool), `trhBaslangic`, `trhBitis`, `kirilim`, `kirilimAdi`
- **Çıktı:** `PompaSatisToplamVeri[]` → `GrupKodu/Adi/ErpKod, UrunAdi, UrunKodu, SatisTipi, ToplamLitre`

### IstasyonUrunLitre / IstasyonUrunLitreTip — dönemsel satış litresi
- **Girdi:** `guidKey`, `BeginDate`, `EndDate`
- **Çıktı:** `IstasyonAd, EpdkKodu, UrunAd, LitreToplam` (Tip'te ek: `CariTip, CariTipAciklama`)

### SonBirimFiyat — ⭐ tavsiye + pompa fiyatı (tarih aralığı)
- **Girdi:** `guidKey`, `trhBaslangic`, `trhBitis`, `istasyonErpKod`
- **Çıktı:** `SonBirimFiyatVeri[]` → `Tarih, EpdkKod, ErpKodu, Unvan, Bolge, Mintika, Il, Ilce,`
  `Urun, `**`TavsiyeFiyat, PompaFiyat`**`, EpdkUrunKodu`
- Not: Parkoil'in ayrı fiyat scraper'ı var; bu SOAP fiyatı alternatif kaynak olabilir.

### GetDiscountData / GetExtraDiscountData / ...Date — indirim tanımları
- **Girdi:** `DagiticiKod`, `guidKey`
- **Çıktı:** `SelfServiceDiscount[]` → `BaslamaTarihi, SehirAd, IlceAd, PlakaKodu, UrunKodu,`
  `UrunErpKod, IndirimMiktari, IndirimTip`

### GetPumpSaleRecord / GetTankLevelRecord / GetTankFillingRecord — cursor bulma
- **Girdi:** `DagiticiKod`, `guidKey`, `baslangic`, `bitis`
- **Çıktı:** `ResultKey` → `Code, Message, KayitID` (tarih aralığındaki en küçük KayıtID).

### CheckKey — guidKey geçerli mi
- **Girdi:** `key` — **Çıktı:** string.

---

## 🔴 Yazma / filo metotları (bizim kapsam DIŞI — salt-okuma prensibi)

- **Authorize** (VehicleInfo → araç yakıt onayı), **SendSale** (satış gönderme)
- **SetVehicleLimit / GetVehicleLimit** (plaka limiti yaz/oku: `KalanLimit`)
- **UpdateFleetBankLimit / GetFleetBankLimit / GetFleetBankLimitHistory** (filo banka limiti)
- **handleNfRequest** (AsPay GSM bildirim — kapsam dışı)

---

## ❌ Servisin VERMEDİĞİ (kesin, WSDL tam tarandı)

**Bayi iletişim: telefon / eMail / KEP / ilgili kişi / adres / vergi dairesi / VKN → SOAP'ta YOK.**
Tüm WSDL `grep -iE 'mail|telefon|phone|gsm|eposta|kep|adres|ilgili|vergi|fax'` → 0 eşleşme.
Bu veri sadece **POL web paneli** `Istasyon.aspx`'te. → `bayi_iletisim` tablosundan beslenir.

---

## Özet: metot sayısı

Toplam **~40 operasyon.** Okuma (bizim ilgi alanı): ~25. Yazma/filo: ~10. Kimlik/yardımcı: ~5.
Bu projenin MVP'si 4 metot kullanıyor (GetStationList, IstasyonOnlineDurum, GetTankLastLevel,
GetProductTypeList). Büyüdükçe dolum/satış/stok/fiyat metotları devreye girecek.
