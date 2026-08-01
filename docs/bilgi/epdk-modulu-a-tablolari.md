# POL "EPDK 2020" modülü — A tabloları, kriterler ve sorun tespiti

> Kaynak: POL canlı ekranları + 11 Excel çıktısı (2026-08-01, kullanıcı indirdi).
> Analiz aracı: `araclar/polTabloKesif.ts`.
> **Bu dosya "otomasyon ekibi POL'de ne yapıyor" sorusunun cevabıdır.**

## Kısaca: bu modül ne işe yarıyor

POL, Parkoil'in **EPDK'ya yaptığı zorunlu bildirimleri** hazırlayıp gönderiyor.
Her tablo bir bildirim türü. Otomasyon ekibinin günlük işi bu tabloları kontrol edip
**"Sağlanmadı" / "Gönderilemedi"** çıkanları düzeltmek.

Her tabloda ortak 3 kolon var:
- **Durum / Gönderim Durumu** — Gönderildi · Beklemede · Düzenlenmedi
- **Epdk Sorgu** — Eşleşen · Sorgulanmadı (EPDK karşı taraftan teyit etti mi)
- **Epdk Cevap** — `BASARILI:137729087` gibi (EPDK'nın verdiği kayıt no)

---

## ⭐ A1a — İstasyon Otomasyon Sistemi (GÜNLÜK, en kritik)

**Ne:** Her tank için günlük hareket. EPDK'ya her gün gider.
**Boyut:** 667 satır/gün (tank × istasyon), 35 kolon.

### Formül (canlı veriyle ÇÖZÜLDÜ, 2026-08-01)

```
Beklenen ertesi gün açılışı = Gün Başı Stok + Tanka Dolum − Satış
Fark = Ertesi Gün Açılış − Beklenen
```

| Kriter | Nedir | EŞİK (ölçüldü) |
|---|---|---|
| **Kriter 1** | Farkın MUTLAK değeri (litre) | **288 lt** |
| **Kriter 2** | Farkın YÜZDESİ | **%3** |
| **KS** | İkisinin birleşik sonucu | — |

Eşik tespiti (667 satır taranarak): K1 sağlanan en büyük **277,91** · sağlanmayan en
küçük **359,97** → eşik arada, mevzuattaki **288 lt** ile uyumlu. K2 sağlanan en büyük
**2,91** · sağlanmayan en küçük **3,08** → **%3**. Bu, 1240 sayılı Kurul Kararı'yla birebir.

### Canlı sonuç (01.08.2026)
- 667 satırın **640'ı KS Sağlandı**, **27'si Sağlanmadı**
- K1 sağlanmayan 20, K2 sağlanmayan 46

### ⚠️ KRİTİK BULGU: sorunluların yarısı GERÇEK SAPMA DEĞİL
27 "Sağlanmadı" kaydının **14'ünde "Ertesi Gün Açılış = 0"**. Yani ertesi günün tank
verisi hiç gelmemiş → fark otomatik olarak tüm stok kadar çıkıyor (ör. 16.803 lt, K2 %100).

**Bu bir OTOMASYON ARIZASI, kaçak değil.** İkisini ayırmak şart:
- `Ertesi Gün Açılış = 0` → tank verisi gelmemiş → **bağlantı/sensör sorunu**
- `Ertesi Gün Açılış > 0` ama fark > 288 lt → **gerçek stok sapması** (incelenmeli)

### Diğer kolonlar
`POL Stok` / `POL Tanka Dolum` / `POL Satış` — POL'ün kendi hesabı, EPDK'ya gidenle
karşılaştırma için. `Paket Sayısı` (48 = günde 48 yarım saatlik paket).

---

## A1b — Düzeltilmiş Otomasyon Sistemi

**Ne:** A1a'da hata çıkanların ELLE DÜZELTİLMİŞ hali. 44 kolon (A1a + düzeltme izi).

Ek kolonlar: `Düzenleme Yapan`, `Düzenleme Tarihi`, `Açıklama`, ve **`Gün Başı Stok (A1A)`,
`Tanka Dolum (A1A)`, `Satış (A1A)` — yani orijinal değerler yanında saklanıyor.**

Örnekte `Durum = "B düzenlenmedi"` ve `Sorgu = "Sorgulanmadı"` → henüz düzeltilmemiş.

**Panel için değeri:** hangi istasyonlar sürekli elle düzeltme gerektiriyor → kronik sorunlu.

---

## A1c — İstasyon Otomasyon Sistemi Stok Durumu

**Ne:** Anlık tank stoğu, günde birkaç kez. **14.611 satır** (en büyük dosya).
18 kolon: tank kapasitesi, stok miktarı, otomasyon lisans no, bölge/mıntıka.

`Epdk Cevap` burada `{"status":true}` biçiminde (diğerlerinden farklı).

---

## A2 — Tarımsal Amaçlı Satış Tankeri

**Ne:** Tarımsal satış tankeri bildirimi. **Parkoil'de 0 kayıt** (bu iş yapılmıyor).
27 kolon hazır ama boş. Köy tankeri satışı devreye girerse dolacak.

---

## A3 — Aylık Satış (dağıtıcı faturası ↔ istasyon dolumu)

**Ne:** Dağıtıcının kestiği fatura ile istasyona giren miktarın karşılaştırması.
1.626 satır. **MUTABAKATIN FATURA AYAĞI BURADA.**

Kritik kolonlar:
- `Fatura Satış Miktarı` (dağıtıcı ne fatura etti)
- **`Dolum/Dış Satış Miktarı`** (istasyona ne girdi)
- `Dağıtıcı Fatura No`, `Plaka`, `Plaka Dorse`
- `CikisTesis` (DEP/… depolama lisansı) → `SevkTesis` (BAY/… bayi)
- `Düzeltme Silme No` (GUID — düzeltme izi)

Örnek: fatura 17.136 lt → dolum 17.295,18 lt (**+159 lt fark**).

`Açıklama` alanında gerçek metin var: *"Yapılan tüm uyarılara …"*

---

## A4 — Bayi Dış Satış ⭐ (kullanıcının sorduğu "dış satış")

**Ne:** Bayinin istasyon dışına, başka bir şirkete yaptığı satış. **4.186 satır.**

Kritik kolonlar:
- `Belgelenen Dış Satış Miktarı`
- **`Dış Satış Yapılan Şirketin TC/Vergi Kimlik No`** + vergi dairesi + il
- `Dolum Yolu` (Diğer / 1 …)
- `Plaka` + `Plaka Dorse`
- `İrsaliye Tarihi`, `Dağıtıcı Evrak No` (PIR…), `Dağıtıcı Fatura No` (PRK…)
- `İndir` → PDF belgesi (ör. `Çetin-6011.pdf`)

**Ayrıca "Dış Satış Detay" ekranı** (istasyon bazında, SLH örneği 3 kayıt) aynı veriyi
tek bayi için gösteriyor.

⚠️ Örnekteki tüm kayıtlar `Gönderim Durumu = Beklemede`, `Epdk Sorgu = Sorgulanmadı`
→ EPDK'ya henüz gönderilmemiş.

---

## A5 — Akaryakıt İstasyonu Fiyat Takibi

**Ne:** Bayi pompa fiyatı bildirimi. 827 satır. Fiyat + tarih + istasyon.
ASIS `SonBirimFiyat` metodu bunun kaynağı olabilir (320 kayıt/gün, `PompaFiyat` %100 dolu).

---

## İstasyon Dönemleri ⭐⭐ — AYLIK KAPATMA (kullanıcı: "en kritik yer")

**Ne:** Ay bazında istasyon mutabakatı. Dönem = takvim ayı (01.08.2026 – 31.08.2026).
Her istasyon için "Detay" ekranı **tam mutabakat tablosunu** veriyor.

### SLH Petrol, 2026 Temmuz örneği (ekran görüntüsünden)

| Kalem | K95 | Motorin | Toplam |
|---|---|---|---|
| **Dağıtıcıdan Alınan** | 20.442 | 93.443 | 113.885 |
| **Kullanılan Miktar** | 17.721 | 82.460 | 100.181 |
| **Fark** | 2.721 | 10.983 | **13.704** |
| **Fark (%)** | 13,31 | 11,75 | **12,03** ⚠ |
| Pompa Satış Toplam | 21.103 | 83.571 | 104.674 |
| **Dış Satış Toplam** | 0 | 32.386 | 32.386 |
| Algılanan Tank Dolum | 21.792 | 71.780 | 93.572 |
| **Eşleşen Tank Dolum** | 18.041 | 50.074 | 68.115 |
| Dönem Dışı Eşleşen | 3.751 | 21.706 | 25.457 |
| Transfer / İade / Fire | 0 | 0 | 0 |

**Buradan öğrenilenler:**
1. **Dış satış mutabakata giriyor** — 32.386 lt motorin dış satış var
2. **"Algılanan" ≠ "Eşleşen" tank dolum** — 93.572 vs 68.115 (fark 25.457 = dönem dışı)
3. **Dönem Dışı Eşleşen** ayrı kalem: ay sonunda gelen ama önceki aya ait dolum
4. Transfer / İade / Fire / Dağıtıcıya İade / Otomasyon Transfer kalemleri VAR (bu örnekte 0)

### Alt ekranlar (İstasyon Dönemleri → Detay)
- **Tesis Dolum İşlem Detayları** — irsaliye bazında: fatura satış miktarı, **kalan miktar**,
  istasyon dolum, köy pompası, tanker. Yeşil/kırmızı renk = eşleşti/eşleşmedi.
- **Tank Dolum** — evrak bazında: çıkan litre, eşleşme miktarı, **"İade Bakım Transfer Var Mı?"**
- **Fark Dolum** — NEGATİF çıkan litre kayıtları (−120, −200 lt) → *düzeltme kayıtları*
- **Dış Satış Detay** — vergi kimlik no ile birlikte

---

## UE (Uzaktan Erişim) ve E (Bilgi Sistemi) — HENÜZ İNCELENMEDİ

Kullanıcı Excel almadı, ekran görüntüsünden görülenler:

**UE-1 Detaylı İstasyon Otomasyon Sistemi Raporu** — filtreler: Damga Durum, **Arıza Durum**,
Tank No, **DolumDurum**. Kolonlar: `Saat-1`, `Saat-2`, `Stok Açılış`, `Stok Kapanış`,
**`Tank Seviyesi Azalma Miktarı`**, `Tankın Bağlı Olduğu Pompa-Tabanca Numaraları`, `Satış`,
`Zaman Damgası`. Alt sekmeler: UE-4D, UE-4T, UE5, UE-1 Log.

→ **Bu tablo sızıntı/kaçak tespiti için birebir uygun** ("Tank Seviyesi Azalma Miktarı" +
"Arıza Durum"). Örnek boş geldi (1/08 günü için veri yok).

**Bilgi Sistemi (E):** E-2 Bayi Köy/Demiryolu Pompası, E-4 Tadilat Başlama Beyanı,
E-5 Tadilat Bitiş, **E-6 Aykırılık Beyanı**, E-7 Uzaktan Erişim ve Web Servis Bilgileri.

→ **E-6 Aykırılık Beyanı** sorun bildiriminin resmi kanalı görünüyor.

**Raporlar menüsü:** Mutabakat Dönemleri, **Sorunlu İstasyonlar**, Dönemsel Veri Gönderim,
**Epdk Durum Analiz**, Epdk İçerik Kontrol Dolum, Epdk İçerik Kontrol Satış, Aylık Ticket
Sayısı, **Tavan Fiyat Karşılaştırma**, A3 Aylık Satış Kontrol.

---

## ⭐ ASIS SOAP'TAN ÇEKİLEBİLİRLİK

Kullanıcının sorusu: *"bunlar ASIS'ten çekilebiliyor mu?"*

### A1a için gereken 4 veri

| Veri | Durum |
|---|---|
| Tanka Dolum | ✅ `tank_dolum` tablosunda VAR (dün 118 kayıt) |
| Anlık stok | ✅ `tank_durum` (673 tank) ama **geçmiş yok** |
| Gün başı / ertesi gün açılış | ⚠️ `GetTankLevelList` ile ÇEKİLEBİLİR — henüz çekilmiyor |
| Satış | ⚠️ `GetPumpSaleList` ile ÇEKİLEBİLİR — henüz çekilmiyor |

**Sonuç: A1a kriterleri ASIS'ten HESAPLANAB İLİR.** İki metot da 2026-07-30'da canlı
doğrulandı (bkz. `asis-pol-notlar.md`). Eksik olan çekim işi, veri kaynağı değil.

### Çekilemeyenler (SOAP'ta karşılığı YOK)
- **EPDK gönderim durumu** (`Gönderildi`/`Beklemede`) ve **`Epdk Cevap`** — bunlar POL'ün
  EPDK ile yaptığı yazışma, ASIS servisinde açılmıyor
- **A1b düzeltme izi** (kim, ne zaman düzeltti)
- **A4 dış satış belgesi** (PDF) ve vergi kimlik bilgileri
- 34 SOAP operasyonunda `iade|bakim|mutabakat|duzelt` taraması: **0 sonuç**

→ Yani **"veri" çekilebilir, "EPDK'ya gitti mi" bilgisi çekilemez.** Panel sapmayı
POL'den ÖNCE yakalayabilir ama gönderim durumunu POL'den öğrenmek gerekir.

---

## Kullanıcının sorduğu sorun tipleri — tespit edilebilir mi?

| Sorun | Tespit edilebilir mi | Nasıl |
|---|---|---|
| **Hayali dolum** | ✅ EVET | Dolum kaydı var ama tank seviyesi artmamış (`GetTankLevelList` + `tank_dolum`) |
| **Gerçek olmayan satış** (test/muayene) | ⚠️ KISMEN | `GetPumpSaleList.CariTip` kırılımı var ama hangi kodun "test" olduğu belirsiz — **POL ekranıyla eşleştirilmeli** |
| **Mükerrer tesis dolum** | ✅ EVET | Aynı `irsaliye_no` birden fazla kez → `tank_dolum`'da grup-by |
| **Mükerrer tank dolum** | ✅ EVET | Aynı tank + yakın zaman + aynı miktar |
| **Kalibrasyon sorunu** | ✅ EVET | `kalibrasyon_yuzdesi > 0` (86 istasyonda 272 kayıt) |
| **Sızıntı / kaçak** | ✅ EVET (satış çekilince) | Tank seviyesi düşüyor ama satış yok |
| **Stok sapması (K1/K2)** | ✅ EVET | Yukarıdaki formül — 288 lt / %3 eşiği |
| **Tank verisi gelmemesi** | ✅ ZATEN VAR | Panelde alarm olarak çalışıyor |
| **EPDK'ya gönderilmedi** | ❌ HAYIR | POL'ün kendi durumu, SOAP'ta yok |

---

## Açık sorular (netleşmeli)

1. **`CariTip` kodları ne demek?** 1, 2, 3, 7 değerleri geliyor (bugünkü 10.000 satışta).
   `GetSaleTypeList`'teki ID'lerle (1=Pompacı, 2=Cari, 3=Otomatik Onay, 7=Pompa Problemli)
   eşleşiyor GÖRÜNÜYOR ama doğrulanmadı. Dış satış hangisi?
2. **"Dönem Dışı Eşleşen"** tam olarak nasıl hesaplanıyor? (SLH'de 25.457 lt)
3. **UE-1'in "Tank Seviyesi Azalma Miktarı"** SOAP'ta hangi alan? (sızıntı tespiti için kritik)
4. **A3'teki `Dolum/Dış Satış Miktarı`** tek kolonda ikisi birden mi tutuluyor?

---

## ⭐ SORUN TESPİTİ — canlı veriyle TEST EDİLDİ (2026-08-01)

İddia değil, çalıştırılmış sorgu sonuçları. Son 90 gün, mevcut `tank_dolum` tablosu:

### 1. Mükerrer tesis dolum — ÇALIŞIYOR
Aynı irsaliye numarası birden fazla istasyonda:

| İrsaliye No | İstasyon | Satır | Toplam lt |
|---|---|---|---|
| **`1234`** | 4 | 8 | 51.681 |
| **`1235`** | 2 | 2 | 19.897 |
| `PIR2026000004753` | 2 | 2 | 6.498 |
| `PIR2026000004904` | 2 | 2 | 6.503 |

⚠️ **`1234` ve `1235` gerçek irsaliye numarası DEĞİL** — elle uydurulmuş görünüyor.
Gerçek format `PIR2026000008671`. Bu tek başına incelenmeye değer bir bulgu.

Not: PIR… ile başlayanlarda 2 istasyon olması normal olabilir (bir tanker iki bayiye
boşaltmış). Asıl anormal olan uydurma numaralar ve 4 istasyona bölünen tek irsaliye.

### 2. Mükerrer tank dolum — ÇALIŞIYOR
Aynı tanka **2 saat içinde neredeyse aynı miktar** (fark <1 lt) iki kez:
**15 şüpheli kayıt.**

### 3. Hayali dolum — ÇALIŞIYOR (ama veri sınırlı)
Dolum kaydı var, `seviye_bitis_lt <= seviye_baslangic_lt` yani tank seviyesi artmamış:
**593 kayıttan 4'ü.**

⚠️ Kısıt: `seviye_*` alanları yalnız 593 kayıtta dolu (29 Temmuz'da eklendi, geriye
dönük gelmiyor). Kapsam zamanla artacak.

### 4. Kalibrasyon — ZATEN PANELDE
86 istasyonda 272 kayıt. 1240 sayılı karar: değişimde 24 saat içinde yedek zorunlu.

---

## Panele eklenebilecek "Sorun Tespit" modülü

Yukarıdaki dördü + aşağıdakiler tek ekranda toplanabilir:

| Kontrol | Veri durumu |
|---|---|
| Mükerrer tesis dolum (aynı irsaliye, çok istasyon) | ✅ hazır |
| Uydurma irsaliye no (format dışı) | ✅ hazır |
| Mükerrer tank dolum (2 saat, aynı miktar) | ✅ hazır |
| Hayali dolum (seviye artmamış) | ⚠️ kapsam artıyor |
| Kalibrasyon değişimi | ✅ hazır |
| **A1a kriter sapması (288 lt / %3)** | ❌ satış + seviye geçmişi gerek |
| **Sızıntı (seviye düşüyor, satış yok)** | ❌ satış + seviye geçmişi gerek |
| **Test/muayene satışı** | ❌ CariTip eşlemesi netleşmeli |

**Son üçü `GetPumpSaleList` + `GetTankLevelList` çekilince açılır.**
