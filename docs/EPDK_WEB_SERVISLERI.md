# EPDK Petrol Piyasası Web Servisleri — Referans

> Kaynak: EPDK resmi web servis sayfası (kullanıcı ekran görüntüleri, 2026-07-23).
> Ana sayfa: https://www.epdk.gov.tr/Detay/Icerik/3-0-226/web-servisler
> Bu servisler EPDK'nın DIŞA açtığı resmi API'lerdir — mevzuat profesörünün "resmi kaynak" ayağı.
> Çoğu YENİ (2026). guidKey/kimlik gerektirenler için EPDK'dan erişim talep edilir.

## 1. Lisans Sorgulama Servisleri (apigateway.epdk.gov.tr)

Lisans no / VKN ile lisans doğrulama. Her birinde `?swagger` ile şema görülür.

| Servis | URL |
|--------|-----|
| Akaryakıt Harici Ürün Yetkileri | https://apigateway.epdk.gov.tr/petrolAkaryakitHariciUrunYetkileriSorgula |
| **Bayilik Lisansı** | https://apigateway.epdk.gov.tr/petrolBayilikLisansiSorgula |
| **Dağıtıcı Lisans** | https://apigateway.epdk.gov.tr/petrolDagiticiLisansSorgula |
| **Depolama Lisans** | https://apigateway.epdk.gov.tr/petrolDepolamaLisansSorgula |
| İhrakiye Teslim Lisans | https://apigateway.epdk.gov.tr/petrolIhrakiyeTeslimLisansSorgula |
| İletim Lisans | https://apigateway.epdk.gov.tr/petrolIletimLisansSorgula |
| İşleme Lisans | https://apigateway.epdk.gov.tr/petrolIslemeLisansSorgula |
| Madeni Yağ Lisans | https://apigateway.epdk.gov.tr/petrolMadeniYagLisansSorgula |
| Rafinerici Lisans | https://apigateway.epdk.gov.tr/petrolRafinericiLisansSorgula |
| Serbest Kullanıcı Lisans | https://apigateway.epdk.gov.tr/petrolSerbestKullaniciLisansSorgula |
| Taşıma Lisans | https://apigateway.epdk.gov.tr/petrolTasimaLisansSorgula |

**Bizim için değerli:** `petrolBayilikLisansiSorgula` → BAY/939-82/{no} lisansını EPDK'dan resmi
doğrula (bayi aktif mi, lisans geçerli mi). Bizim ASIS EPDKKod eşlememizi RESMİ kaynakla teyit eder.
`petrolDagiticiLisansSorgula` → Parkoil'in kendi dağıtıcı lisansı.

### ⭐ petrolBayilikLisansiSorgula — CANLI TEST EDİLDİ (2026-07-23)
- **Kimlik GEREKMİYOR** (swagger: `security: []`). GET, JSON body.
- **Zorunlu alanlar:** `lisansDurumu` (dizi) + **`dagiticiLisansNo`**.
  - `lisansDurumu` değerleri: `ONAYLANDI`, `SONLANDIRILDI`, `IPTAL_EDILDI`, `IADE_EDILDI`, `FAALIYETI_GECICI_DURDURULDU`
- Opsiyonel: `vergiNo`, `unvan`, `bayiLisansNo`, lisans başlangıç/bitiş tarih min/max.
- **BLOKAJ:** `dagiticiLisansNo` (Parkoil'in DAĞITICI lisans no'su) zorunlu → herkes her bayiyi
  sorgulayamıyor, sadece kendi bayilerini. **Parkoil dağıtıcı lisans no'su lazım** (kullanıcıdan/Logo'dan).
- Bulununca: TEK çağrıyla Parkoil'in TÜM bayilerini EPDK RESMİ kaydından çek → ASIS/POL eşlememizin
  resmi doğrulaması + lisansı iptal/sonlandırılmış bayileri yakala (bunlara sipariş/işlem engeli).
- Örnek: `curl -X GET .../petrolBayilikLisansiSorgula/ -d '{"dagiticiLisansNo":"DAG/...","lisansDurumu":["ONAYLANDI"]}'`

## 2. Fiyat / Bülten Servisleri

| Servis | URL | Not |
|--------|-----|-----|
| İllere Göre Akaryakıt Bayi Fiyatları (XML) | https://lisansws.epdk.gov.tr/services/bildirimPetrolAkaryakitFiyatlari | 01.01.2016'dan |
| En Yüksek 8 Firma Ortalama Fiyat (XML) | https://lisansws.epdk.gov.tr/services/bildirimPetrol8FirmaBulten | 01.01.2016'dan |
| Petrol Piyasası Bülten | https://apigateway.epdk.gov.tr/petrolBayiSatisFiyatBulten | |

**Bizim için değerli:** Fiyat doğrulama/karşılaştırma. Parkoil'in ayrı scraper'ı var; bu RESMİ EPDK
fiyatı → tavsiye fiyat kontrolü, rakip fiyat analizi.

## 3. ⭐ Bayi Otomasyon Sistemi (mutabakat/bildirimin kalbi)

Sayfa: https://www.epdk.gov.tr/Detay/Icerik/1-3378/petrolbayi-otomasyon-sistemi-islemleri
Kılavuzlar (bildirimin nasıl yapıldığını anlatır — mevzuat profesörü için birincil kaynak):
- **Bayi Otomasyon Dağıtıcı Otomasyon Yetkilisi Kullanım Kılavuzu** (Parkoil rolü = A1A dağıtıcı)
- **Petrol Piyasası Bayi Otomasyon Sistemi Web Servis Kullanım Kılavuzu**
- **Bayi Otomasyon-Otomasyon Firması Yetkilisi Veri Sorgulama Kullanım Kılavuzu**
- **Bayi Otomasyon Sistemi A1C Web Servis Kullanım Kılavuzu** (A1C = otomasyon firması)

Sol menü başlıkları (Petrol Piyasası): Mevzuat, Lisans İşlemleri, Tarifeler, **Bayi Otomasyon
Sistemi İşlemleri**, Elektronik Lisans, Akaryakıt Harici Ürün, Ulusal Marker, Kamulaştırma,
**Zorunlu Petrol Stoku**, Klasör Revizyonu.

## 4. ⭐ Petrol Piyasası Stok İzleme Sistemi

Sayfa: https://www.epdk.gov.tr/Detay/Icerik/3-34212/petrol-piyasasi-stok-izleme-sistemi
- **Petrol Piyasası Stok İzleme Sistemi Web Servis Kullanım Kılavuzu** (Zorunlu Petrol Stoku kapsamı)
→ Stok bildiriminin EPDK tarafı. Bizim tank stok/mutabakat verimizin EPDK'ya gittiği yer.

## Diğer piyasalar (kapsam dışı — sadece kayıt)
Elektrik (dağıtım/ön lisans), Doğal Gaz, LPG lisans sorgulama servisleri de aynı apigateway'de.
Eski genel XML: https://lisansws.epdk.gov.tr/services/lisansPublicProxy?wsdl (01.07.2026 KAPANACAK).

---

## Bu servisler bize ne kazandırır (mevzuat profesörü için)

1. **Lisans doğrulama:** ASIS'ten gelen BAY/939-82/{no}'yu `petrolBayilikLisansiSorgula` ile RESMİ
   EPDK kaydına karşı doğrula → bayi lisansı aktif mi/iptal mi. Bizim eşlememizin resmi teyidi.
2. **Fiyat:** EPDK resmi bayi fiyatı → tavsiye fiyat/rakip analizi.
3. **Kılavuzlar:** A1A/A1B/A1C bildirim sürecinin RESMİ tanımı — mevzuat bilgi tabanındaki
   "DOĞRULANMASI GEREK" maddelerini bu kılavuzlarla netleştir.
4. **Stok İzleme WS:** Zorunlu petrol stoku bildiriminin EPDK tarafı.

**Yapılacak:** Bu servislerin çoğu kimlik (guidKey/sertifika) ister. Parkoil'in EPDK erişim
bilgileri lazım. Erişim olanları (özellikle bayilikLisansiSorgula) panele bağlanabilir.
`?swagger` ile her servisin girdi/çıktı şeması alınıp bu dökümana işlenmeli (erişim gelince).
