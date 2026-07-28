# ASIS / PetechOnline (POL) SOAP Metot Katalogu

> Kaynak: ASİS "PetechOnline Web Servis" resmi dokümanı (rev 2.0) + Parkoil canlı
> doğrulamaları. Ana repodaki `b2b/docs/ASIS_POL_WEB_SERVISI.md` bunun daha uzun halidir.
> Burada bu projenin ihtiyaçlarına (bağlantı + tank izleme) odaklanılmıştır.

## Ortak

- Gateway: `https://pol.parkoil.tr/Poservice/gateway.asmx`
- Namespace: `http://www.asis.com.tr/`
- `guidKey` + `dagiticiKod=21` her çağrıda gider.
- SOAPAction: `http://www.asis.com.tr/{MetotAdi}`

## Bu proje için KRİTİK metotlar

### GetStationList ⭐ (istasyon kütüğü + BAĞLANTI + eşleme) — canlı doğrulandı
Tanımlı istasyonlar. **Bağlantı izlemenin ASIL kaynağı** (`SonTarih`).
- Girdi: `DagiticiKod, guidKey`.
- Döner (canlı): `IstasyonKod`, `TIstasyonID`, `IstasyonAd`, `IstasyonDurum` (true/false=aktif),
  `IstasyonTip`, **`SonTarih`** (son veri gönderim zamanı), `EPDKKod`, `SehirAd`, `BolgeAdi`,
  `MantikaAd`, `Enlem`, `Boylam`. (2026-07-23: 269 istasyon.)
- **Kullanım:** kütük + EPDK bayi eşleme + **bağlantı** (`SonTarih` eskiliği → kopuk).

### GetTankLastLevel ⭐ (tank izleme) — canlı doğrulandı
Anlık tank durumları. **Parametresiz (IstasyonKod nil) → TÜM tankları tek çağrıda döndürür**
(2026-07-23: 666 tank / 175 istasyon). İstasyon başına ayrı çağrıya gerek YOK.
- Girdi sırası (ÖNEMLİ): `guidKey, dagiticiKod, IstasyonKod`. Ters sıra boş döndürüyordu.
- Döner: `TankNo`, `DurumTarihi` (30dk periyot), `Kapasite`, `YakitSeviyeLT`, `SuSeviyeLT`,
  `IstasyonKod/Ad`, `UrunAdi/KisaAd`.
- **Kullanım:** her tankın `DurumTarihi` > `TANK_VERI_ESIK_DK` ise o tank veri göndermiyor.

### IstasyonOnlineDurum ✅ (ÇALIŞIYOR — girdi `<Key>`)
Girdi TEK alan `<Key>` (=guidKey). İlk denemede yanlış parametreyle (guidKey+dagiticiKod)
çağırıp boş sanmıştık; DÜZELTİLDİ. 180 kayıt döner: OnlineDurum (anlık!), IP, TankVersiyon,
PompaVersiyon, EpdkID, LisansTipi. SonVeriTarihi nil → "ne zamandır" için GetStationList.SonTarih.
**Tam alan/girdi listesi: `docs/ASIS_TAM_REFERANS.md`.**

## Yardımcı metotlar

| Metot | Ne döner | Not |
|-------|----------|-----|
| GetProductTypeList | `TUrunID`, `UrunAdi`, `UrunKisaAd`, `Durum` | Yakıt eşleme |
| GetTankLevelList | Tank seviye geçmişi (artımlı, `TTankDurumID`); sıcaklık/kalibrasyon burada | İleride trend |
| TankSonDurum | Stok toplamı (bölge/mıntıka/istasyon kırılımı) | İleride stok raporu |
| IstasyonStokTankKapasite | 30 dk paketlerle istasyon+tank stok/kapasite | İleride |
| GetPumpSaleList | Pompa satışları (artımlı, `TPompaSatisID` cursor) | İleride satış analizi |
| GetSaleTypeList | Satış/dolum tipleri | — |

## Artımlı çekim mantığı (satış/seviye geçmişi için)

İlk çağrıda `KayitID=0`; sonraki çağrılarda son çekilen kaydın `KayitID`'si → sadece yeni
kayıtlar gelir. Cursor `sistem_ayar` tablosunda saklanır. (MVP'de bağlantı+son tank durumu
için gerekmiyor; satış/geçmiş fazında lazım.)

## KESİN: bayi iletişim SOAP'ta YOK (WSDL tam tarandı — 2026-07-23)

`gateway.asmx?WSDL` (108 KB, 40+ operasyon) **tamamı** tarandı:
`grep -iE 'mail|telefon|phone|gsm|eposta|kep|adres|ilgili|yetkili|vergi|fax|iletisim|cep'`
→ **HİÇBİR eşleşme yok.** `Station` complexType'ın TAM alan listesi (13 alan):
IstasyonERPKod, IstasyonKod, TIstasyonID, IstasyonAd, IstasyonDurum, IstasyonTip, SonTarih,
Enlem, Boylam, EPDKKod, SehirAd, BolgeAdi, MantikaAd. İletişim alanı YOK.

**Ama POL WEB PANELİ'nde var:** `Istasyon.aspx` (İstasyon İşlemleri → İstasyon Tanımları)
detayında İlgili Kişi, Telefon, eMail, KEP, Adres, İlçe, Vergi Dairesi, VKN, "Ekstre Gönderim
Opsiyonu: Faks/Email/SMS" DOLU. Yani veri POL'de yaşıyor ama SOAP dışarı açmıyor.

**Sonuç:** İletişim `bayi_iletisim` tablosundan beslenir. Kaynak POL paneli (Excel export
veya — export'ta iletişim yoksa — Istasyon.aspx scrape) ya da ParkB2B DB. Kod bundan bağımsız.
Tekrar SOAP'ta arama — yok, kanıtlı.
