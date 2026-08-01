# EPDK Akaryakıt Bildirim & Mutabakat Mevzuatı

> Kaynak: EPDK/GİB resmi kılavuzları + 5015 sayılı Kanun + web araştırması (2026-07-23).
> **DOĞRULANMASI GEREK** işaretli maddeler resmi metinde birebir teyit edilemedi — kullanıcı/
> Parkoil mevzuat sorumlusu doğrulamalı. Doğrulanınca işaret kaldırılır.

## 1. A1A / A1B / A1C — bildirim rol katmanları

Klasik "kağıt form" DEĞİL; EPDK Petrol Piyasası Bayi Otomasyon Sistemi web servisleri
üzerinden akan **sorumluluk grupları**:
- **A1A – Dağıtıcı** (Parkoil): bayilerinin otomasyon verisini EPDK'ya iletmekle yükümlü. `DOĞRULANMASI GEREK`
- **A1B – Bayi**: stok/alım-satım istasyon otomasyonuyla günlük iletilir. `DOĞRULANMASI GEREK`
- **A1C – Otomasyon firması**: EPDK "A1C Web Servis Kılavuzu" **resmi sayfada doğrulandı**. Çapraz kontrolden sorumlu.
- İçerik: satış, dolum, envanter, istasyon durumu. Periyot: anlık/günlük.
- Kaynak: https://www.epdk.gov.tr/Detay/Icerik/1-3378/petrolbayi-otomasyon-sistemi-islemleri
- **TODO:** A1A/A1B etiketlerini "Bildirim Yükümlülük Tablosu v17 (01.01.2026)" ile birebir teyit et.

## 2. Otomasyon veri tabloları (Dep1/Dep2/Dr/K/Dat)

Pompa (PX) + tank (TX) otomasyonundan **günlük otomatik** EPDK'ya iletilir:
| Tablo | İçerik |
|-------|--------|
| Dep1 | Akaryakıt satışları (pompa) |
| Dep2 | Tank dolumları |
| Dr | Stok/tank hareketi |
| K | Kasa/satış (fiş) |
| Dat | Tank kontrol / mutabakat |
`DOĞRULANMASI GEREK` (endüstri kaynağı; resmi 1240 kılavuzunda tam alan listesiyle doğrula).

## 3. ⭐ 1240 sayılı Kurul Kararı — teknik zorunluluklar (yür. 1 Temmuz 2026)

**Dayanak:** Her dağıtım şirketi satış/dolum/envanter/durum hareketlerini belirlenen sürelerde
EPDK'ya iletmekle mükellef. (Resmi kılavuz doğrulandı.)

Kritik limitler (mutabakat kontrolümüzün temeli):
- **Tank belirsizlik:** günlük (açılış+dolum−satış) vs bildirilen kapanış farkı **≤ 288 litre**, hata **≤ %3**.
- **Zaman damgası** tüm ekran/dışa-aktarımda ZORUNLU.
- **Aylık satış çapraz kontrol:** aylık faturalı satış toplam dolumdan **%3'ten fazla saparsa** açıklama şart.
- Eksik veri sıfır/rastgele doldurulamaz → "eksik/hatalı/bağlantı hatası/tadilatta/mühürlü" işaretlenir.
- Birim: fuel-oil/kalorifer **kg**; benzin/motorin **litre**.
- Tank otomasyonu: veri **anlık**; kalibrasyon değişiminde **24 saat** içinde yedek; çekmez seviye
  <150mm satış engeli; satış yokken **>0,382 lt/sa** eksilmede alarm (hata ≤ %1).
- Uzaktan erişim (P-BYS/BGOM): 5070 sayılı Kanun nitelikli sertifika, min **5 yıl** sorgu geçmişi.
- Kaynak: https://ynokc.gib.gov.tr/UploadedFiles/Files/IstasyonOtomasyonSistemiTeknikKilavuzu1_0.pdf
  · https://www.enerjigunlugu.net/epdk-petrol-otomasyon-sistemi-kilavuzunu-guncelledi-67451h.htm

## 4. Zaman damgası — zd.kamusm.gov.tr

TÜBİTAK BİLGEM Kamu SM Zaman Damgası Sunucusu (5070 sayılı Kanun). Otomasyon, EPDK'ya ilettiği
satış/dolum verisini e-imzalı zaman damgalar. POL anasayfasında "KalanKredi 7.225" = bu damga
kredisi. **Doğrulandı.** Kaynak: https://kamusm.bilgem.tubitak.gov.tr/urunler/zaman_damgasi/
- **otomasyon.epdk.gov.tr:** EPDK veri toplama ucu. `DOĞRULANMASI GEREK` (tam alan adı resmi sayfada görülmedi).

## 4b. ⭐ MUTABAKAT TAKVİMİ — aylık, ertesi ayın 20'sine kadar (KULLANICI, 2026-07-23)

> Parkoil kuralı (kullanıcı bildirdi): **Her ayın mutabakatı, TAKİP EDEN ayın 20'sine kadar
> tamamlanmalı.** Örnek: Haziran mutabakatı → 20 Temmuz son gün. Her ay için geçerli.

- Dönem = takvim ayı (ör. 01–30 Haziran). Son tarih = ertesi ay 20'si (dahil).
- Panelde: içinde bulunulan ay için "geçen ayın mutabakatı, X gün kaldı" geri sayımı; 20'sine
  yaklaşınca uyarı, geçince kritik.
- "İstasyon dönemleri" → POL'de dönem bazlı raporlar var (Mutabakat Raporu, Tank Uzlaştırma
  Raporu, Günlük Tank Uzlaştırma, Ürün Uzlaştırma). Mutabakat verisi SOAP'ta ayrı metot DEĞİL;
  ASIS dolum (Dep2/GetTankFillingList) + satış (Dep1/GetPumpSaleList) + tank durumundan HESAPLANIR.
  `DOĞRULANMASI GEREK`: POL'deki "Mutabakat Raporu" tam olarak neyi neyle karşılaştırıyor.

## 4a-KESİN. ⭐⭐ MUTABAKAT FORMÜLÜ ÇÖZÜLDÜ (POL Tank Uzlaştırma Raporu, 2026-07-23)

POL "Tank Uzlaştırma Raporu" Excel'i çözüldü — mutabakat = **TANK STOK HAREKETİ** (irsaliye-vs-dolum
DEĞİL, o varsayım yanlıştı). Tank+dönem bazında:

| Kolon | Anlam |
|-------|-------|
| A | Dönem Başı Stok (lt) |
| B | Dolum Miktarı (lt) |
| C | Pompa Satış (lt) |
| D | Dönem Sonu Stok (lt) — fiziksel ölçülen |
| **E (Fark)** | **(A + B − C) − D** |
| **F (Oran %)** | **(E / C) × 100** |

Mantık: "başı + dolum − satış = olması gereken kapanış; ölçülenle farkı = fire/kaçak/ölçüm hatası".
Örnekle doğrulandı: (1240.43+0−453.95)−783.45 = 3.03 ✓. Dönem seçilebilir (rapor günlük çekilmişti;
AYLIK seçilince "Haziran → 20 Temmuz" mutabakatı bu). Rapor kolonları ERP/EPDK/İst.Kod/Ad/Mıntıka/
Bölge/Ürün/TankNo + A..F + İlk/Son Kalibrasyon % + Müteahhit.

**BİZİM İÇİN KRİTİK:** 4 girdi de ASIS'te VAR → mutabakatı POL'süz hesaplayabiliriz:
- A, D (dönem başı/sonu stok) → GetTankLevelList (tank seviye geçmişi, artımlı)
- B (dolum) → GetTankFillingList (BENDE VAR, tank_dolum tablosu)
- C (satış) → GetPumpSaleList (artımlı)
→ Panel: aylık, tank bazında (A+B−C)−D hesaplar, EPDK 288 lt / %3 limitini aşanları listeler.

**Kalan:** GetTankLevelList (A/D) + GetPumpSaleList (C) henüz çekilmiyor. Dolum (B) hazır.

## 4c. ⭐ DOLUM VERİSİ CANLI ÇEKİLDİ (GetTankFillingList, 2026-07-23)

35.689 dolum kaydı Supabase `tank_dolum`'a yüklendi (2025→2026; birkaç eski test kaydı 2001).
Artımlı cursor `asis.son_dolum_id`. Her dolum: dolum miktarı, net, başl/bitiş seviye, sıcaklık,
irsaliye no/litre, **irsaliye_hacim_fark** (irsaliye − tank).

**KRİTİK bulgu — "fark > 288" ham kural YANILTICI:**
1. **İrsaliye litresi 0 olan çok kayıt var** (~son 90 günde 3507/7722). İrsaliye no girilmiş ama
   litre boş → fark = tüm dolum. Bu "mutabakat sapması" DEĞİL, "irsaliye litresi eksik" kategorisi.
2. **Çok-tanka bölünen dolum:** irsaliye 33.000 lt ama tek tank kaydında dolum 1.000 lt görünüyor
   (bir tanker birden çok tanka boşaltıyor, irsaliye toplamı her tank satırında tekrar ediyor).
   → Tek satırda irsaliye-vs-dolum karşılaştırması YANLIŞ. Gerçek mutabakat muhtemelen **irsaliye no
   bazında** (aynı irsaliyenin tüm tank dağılımı toplanıp irsaliye litresiyle) yapılıyor. `DOĞRULANMASI GEREK`

## 4g. ⭐⭐⭐ ASIS'TEN ÇEKİLEBİLİR — ama irsaliye litresi %45 EKSİK AKIYOR (2026-07-29)

Soru: "Excel elle yüklemek mantıklı değil, ASIS web servisinden çekemez miyiz?"
**Cevap: EVET, girdiler ASIS'te VAR.** `GetTankFillingList` mutabakatın iki tarafını
da taşıyor. Ama bir tarafı **eksik dolduruluyor**.

### ASIS'te olan ama ÇEKMEDİĞİMİZ alanlar (kod eksikliği — düzeltilebilir)
`core/asisClient.ts:tankDolumlari()` bu alanları map etmiyordu:
| Alan | Ne | Kanıt |
|---|---|---|
| **`EslesmeMiktari`** | POL'ün "Eşleşen Tank Dolum"u | RAHA 8470: 3 satır toplamı 14.991,21 |
| `IrsaliyeMiktar` | (canlıda hep 0 görüldü) | |
| `IrsaliyeMiktarFark` | | |
| `IrsaliyeBirimfiyat` | | |
| `KalibrasyonYuzdesi` | 1240 kararı kalibrasyon takibi için | 86 |
| `DolumTipi` | O / M — teslim tipi | |
| `YakitDolumBaslama/BitisMiktariLT` | tank seviyesi (mutabakat A/D girdisi!) | 567,71 → 2.574,21 |
| `TankerSicakligi`, `Baslangic/BitisSicakligi` | hacim düzeltmesi | |

`YakitDolumBaslamaMiktariLT` / `BitisMiktariLT` → dolum anındaki tank seviyesi.

> **DÜZELTME 2026-07-29:** Burada "`GetTankLevelRecord` KayitID=0 dönüyor, o yüzden
> seviyeyi dolum kaydından almak zorundayız" yazıyordu. Bu bir **çıkmaz sokak değildi**
> — `bitis` parametresi hatalıydı (soru 3'e bak). Mutabakat A/D için asıl kaynak
> **`GetTankLevelList`**: 30 dakikalık temiz grid (günde 49 damga), tek zaman
> damgasında **662 tank** (filo 669), sıcaklık düzeltilmiş **`YakitSeviyeLTNet`**
> (%96 dolu) ve hazır `EpdkID`. Geçmiş 2025-02-26'ya kadar var.
> Dolum kaydındaki seviye alanları yine değerli (dolum anına özgü) ama tek dayanak değil.

### DOĞRULAMA — RAHA, PIR2026000008470 (25.07.2026)
| | ASIS | POL | |
|---|---|---|---|
| Σ `DolumMiktari` | 14.991,21 | İstasyon Dolum 14.991,21 | ✅ **birebir** |
| Σ `EslesmeMiktari` | 14.991,21 | (bu kayıtta dolum=eşleşme) | ✅ |
| Σ `IrsaliyeLitre` | 14.886 | Fatura 14.876 | ≈ 10 lt fark |

→ Bu irsaliyede `IrsaliyeLitre` **satırlara bölünmüş** ve toplanıyor
(T1 7.932 + T2 4.968 + T3 1.986 = 14.886).

### ⚠️⚠️ DÜZELTME (2026-07-29): davranış KARMA, tek kural yok

Yukarıdaki "bölünmüş, toplanır" sonucu **tek irsaliyeden genellenmişti — hatalı.**
Tüm tabloda ölçüm: çok satırlı **5.669** irsaliyenin **873'ünde** `irsaliye_litre`
her satırda **AYNI** (tekrar), geri kalanında **bölünmüş**.

Kanıt (tekrar eden örnek) — `PIR2026000007487`, istasyon 210230, 6 satır:
her satırda `irsaliye_litre = 33.107`. `sum()` → **198.642 lt** (bir tankerin ~6 katı,
fiziksel olarak imkânsız); `max()` → 33.107, dolum toplamı 32.804 → fark **-303 lt** (makul).

**Sonuç: `sum()` tekrar edenleri şişirir, `max()` bölünmüşleri eksik sayar.** Ayırt edici
bir alan bulunamadı (`irsaliye_miktar` hep 0, `dolum_tipi` ayrım vermiyor).

Temmuz 2026'da iki yöntemin verdiği "EPDK limiti (288 lt) aşan irsaliye" oranı:
`sum()` → %42 · `max()` → %60. **İkisi de gerçek olamaz** — bir dağıtıcıda bu oran
imkânsız. Bu yüzden panele "mutabakat ihlali" uyarısı **bu alandan türetilerek konulamaz.**

**Ayrıca `irsaliye_hacim_fark` alanı çöp değer taşıyor:** irsaliyeli kayıtlarda en büyük
mutlak değer **566.660.992**. Bu alan da kullanılmayacak.

**Yapılabilir olan:** fark hesabı değil, **eksik veri raporu** — hangi istasyon dolumlarında
irsaliye bilgisi ASIS'e hiç akmıyor (aşağıdaki §4d/4g bulgusu, %100 eksik olan istasyonlar var).
O somut, savunulabilir ve yorum gerektirmiyor.

### ⛔ ASIL SORUN: irsaliye litresi ASIS'e AKMIYOR
RAHA Temmuz, 11 irsaliye — DB toplamı POL faturasıyla karşılaştırıldı:
| İrsaliye | ASIS Σ irsLitre | POL fatura | |
|---|---|---|---|
| 7368 | 24.768 | 24.768 | ✅ |
| 7626 | 12.477 | 12.477 | ✅ |
| 7946 | 11.691 | 11.691 | ✅ |
| 7754 | 1.724 | 1.724 | ✅ |
| 8470 | 14.886 | 14.876 | ≈ |
| **7678 · 8007 · 8249 · 8250 · 8406** | **0** | 11.642 · 11.893 · 1.959 · 16.172 · 9.862 | ❌ |

**Toplama kuralı DOĞRU** (4 irsaliyede birebir). Sorun: **11 irsaliyenin 5'inde
(=%45) ASIS'te irsaliye litresi HİÇ YOK**, POL'de var. Bu yüzden ASIS toplamı
39.682, POL 136.886.

Bu, önceki "%40 eksik bildirim" bulgusunun ta kendisi — ama anlamı değişiyor:
veri POL'de VAR, **ASIS web servisine akmıyor**. Yani bir A1B eksikliği değil,
bir **entegrasyon/senkronizasyon eksikliği**.

### "Belki bugün olduğu için yansımamıştır" — TEST EDİLDİ, HAYIR (2026-07-29)
Kullanıcı haklı bir hipotez sordu: boş kayıtlar yeni olabilir, POL'e sonradan
girilmiştir. Test edildi — **doğrulanmadı**:

| İrsaliye | Dolum günü | DB'de çekildi | ASIS ŞU AN | POL |
|---|---|---|---|---|
| 8249 | 21 Tem | 23 Tem | **0** | 1.959 |
| 8250 | 21 Tem | 23 Tem | **0** | 16.172 |
| 8406 | 24 Tem | 28 Tem | **0** | 9.862 |

5–8 gün geçmiş, ASIS'te hâlâ 0. Yani gecikme değil — **irsaliye litresi ASIS'e
hiç akmıyor.** (Aynı dönemde 10, 15, 25 Temmuz kayıtlarında dolu → kayıt bazında,
zaman bazında değil.)

### İrsaliye no YILLAR ARASI tekrar — ölçüldü, MARJİNAL
"ASIS 9 satır döndürüyor ama DB'de 3 var → artımlı çekim eksik" diye yorumlamıştım,
**yanlıştı**. Gerçek: `8406` DB'de 6 satır — 3'ü **2025** (irsaliye dolu: 30.787),
3'ü **2026** (irsaliye 0). ASIS ikisini birlikte döndürüyor, çekim eksik değil.

Kapsam ölçüldü: 16.685 irsaliyenin yalnız **9'u** iki yılda geçiyor → marjinal.
Ama gruplamada **yıl/dönem filtresi ZORUNLU**, yoksa o 9 kayıt toplamları bozar.

### ⭐ ASIL BULGU: fark TAM 1.000,00 lt — POL'de bir DÜZELTME kaydı var (2026-07-29)

Kullanıcı uyardı: *"burada farklı bir durum vardır, ikisi de aynı yerden besleniyor."*
Haklıydı. POL Excel ile ASIS canlı yanıtı irsaliye bazında karşılaştırıldı:

| İrsaliye | POL İstasyon Dolum | ASIS Σ brüt | Fark | ASIS irsaliye |
|---|---|---|---|---|
| 7368 | 25.000,82 | 25.000,82 | **0** | 24.768 ✓ |
| 7626 | 12.569,55 | 12.569,55 | **0** | 12.477 ✓ |
| 7754 | 1.721,26 | 1.721,26 | **0** | 1.724 ✓ |
| 7946 | 11.785,47 | 11.785,47 | **0** | 11.691 ✓ |
| 8470 | 14.991,21 | 14.991,21 | **0** | 14.886 ✓ |
| 7678 | 11.761,18 | 12.761,18 | **+1.000,00** | **0** |
| 8250 | 16.479,81 | 17.479,81 | **+1.000,00** | **0** |
| 8007 | 12.166,80 | 12.456,80 | +290 | **0** |
| 8406 | 9.983,05 | 10.413,05 | +430 | **0** |
| 7755 | 20.201,28 | 20.301,28 | +100 | 4.460 (kısmi) |

**Örüntü kesin:** irsaliye litresi DOLU olan 5 kayıtta dolum farkı **tam sıfır**.
İrsaliye litresi BOŞ olan kayıtlarda dolum da kayıyor — ve iki tanesinde fark
**tam 1.000,00** (yuvarlak sayı → hesap hatası değil, bir İŞLEM).

Üç hesap yöntemi de denendi, hiçbiri açıklamıyor (8250 için):
| Yöntem | Toplam | POL'e fark |
|---|---|---|
| Σ `DolumMiktari` (brüt) | 17.479,81 | +1.000,00 |
| Σ `DolumMiktariNet` | 17.308,96 | +829,15 |
| Σ seviye farkı (bitiş−başlangıç) | 16.388,80 | −91,01 |

→ Yani POL farklı bir alan/formül kullanmıyor; **POL tarafında bu teslime ait bir
düzeltme (iade / transfer / iptal / manuel düzeltme) kaydı var** ve ASIS ham dolum
kaydını olduğu gibi veriyor.

**Bu, ASIS'e sorulacak soruyu DEĞİŞTİRİYOR.** Artık "IrsaliyeLitre neden boş" değil:

> POL "Tesis Dolum" ekranında PIR2026000008250 (21.07.2026, RAHA ENERJİ) için
> İstasyon Dolum **16.479,81** görünüyor; ASIS `GetTankFillingList` aynı irsaliye
> için 3 tank satırı × toplam **17.479,81** döndürüyor (fark tam 1.000,00 lt) ve
> `IrsaliyeLitre=0`. Aynı dönemde 7368/7626/7754/7946/8470 kayıtlarında hem dolum
> **birebir** tutuyor hem `IrsaliyeLitre` dolu geliyor.
> 1. Bu 1.000 lt'lik düzeltme POL'de hangi işlemden geliyor (iade/transfer/manuel)?
> 2. O düzeltme ve fatura miktarı hangi SOAP metodundan alınabilir?
>    (`GetTankFillingList` vermiyor; ekranda "İade Bakım Transfer Var Mı?" kolonu var.)

### Düzeltme izi SOAP'ta ARANDI — YOK (tüketici arama, 2026-07-29)
1. **34 alanın tamamı** sorunlu kayıtta (8250 T1) tek tek incelendi. Düzeltme/iade/
   transfer izi taşıyan alan **yok**. `EslesmeMiktari` bile ham dolumla aynı (8596,02).
2. **19 metodun tamamı** (docs/ASIS_TAM_REFERANS.md) tarandı: iade/bakım/transfer
   düzeltmesi veren metot **yok**. `GetPumpSaleListTransfer` var ama o tanker SATIŞI,
   dolum düzeltmesi değil.
3. Tank Dolum ekranındaki **"İade Bakım Transfer Var Mı?"** kolonunun SOAP karşılığı
   bulunamadı (Excel'de değer `-`).

**SONUÇ:** POL ile ASIS aynı veritabanından besleniyor (kullanıcı doğru), ama POL ham
dolum kaydına bir **düzeltme uyguluyor** ve o düzeltme SOAP arayüzünde hiç açılmıyor.
Bu yüzden mutabakatın "Kullanılan" tarafı bile ASIS'ten TAM hesaplanamıyor — 11
irsaliyeden 5'inde sapıyor (2× tam 1.000 lt, ayrıca 290 / 430 / 100 lt).

### Bu ne demek — üç sonuç
1. **Panel dolum tarafını ASIS'ten hesaplayabilir** (`EslesmeMiktari` doğru).
2. **Fatura/sevk tarafı ASIS'te güvenilir DEĞİL** — %45 boş. Mutabakatın "Dağıtıcıdan
   Alınan" kolonu bu yüzden ASIS'ten tam hesaplanamaz.
3. **ASIS'e sorulacak (asıl soru):** İrsaliyeli teslimlerin bir kısmında
   `IrsaliyeLitre=0` geliyor ama POL'de fatura miktarı dolu. Bu alan neden
   boş kalıyor? POL'ün gördüğü fatura verisi hangi metottan/alandan geliyor?
   (Örnek: PIR2026000008250, 21.07.2026, RAHA — POL 16.172 lt, ASIS 0.)

### Yapılacak (kod)
`tankDolumlari()`'ye eksik alanları ekle → `EslesmeMiktari` ile dolum tarafı
POL'le uyumlu hesaplanır; `YakitDolum*MiktariLT` ile tank seviyesi de gelir.
Fatura tarafı ASIS'te düzelene kadar mutabakat "eksik veri" uyarısıyla gösterilir.

## 4f. ⭐⭐⭐ MUTABAKAT FORMÜLÜ KESİN ÇÖZÜLDÜ (2026-07-29, POL Excel + ekran eşleştirmesi)

**"İstasyon Dönemleri Analiz"** ekranı (POL → Raporlar → İstasyon Dönemleri) aylık
mutabakatın TAMAMINI veriyor. Üç POL Excel export'u ekranla birebir eşleştirildi.

### Doğrulama — RAHA ENERJİ (210001), Temmuz 2026
| Satır | Excel'den hesap | Ekran | |
|---|---|---|---|
| Dağıtıcıdan Alınan | Σ `Fatura Satış Miktarı` = **136.886** | 136.886 | ✓ |
| Kullanılan Miktar | Σ `İstasyon Dolum` = **138.619,29** | 138.619 | ✓ |
| **Fark** | **−1.733,29** | **−1.733 (%−1,27)** | ✓ |
| Kontrol | Σ `Kalan Miktar` = −1.733,29 | | ✓ |

→ **`Fark = Dağıtıcıdan Alınan − Kullanılan Miktar`**
→ **`Fark(%) = Fark / Dağıtıcıdan Alınan × 100`**
→ Satır bazındaki `Kalan Miktar` kolonu = o irsaliyenin kendi farkı; toplamı dönem farkı.

⚠️ Bu, §4a'daki "tank stok hareketi" formülünden **BAŞKA** bir kontrol. İkisi ayrı:
- §4a (Tank Uzlaştırma): tank içi hareket — `(başı + dolum − satış) − sonu`
- §4f (İstasyon Dönemleri): **dağıtıcı↔bayi mutabakatı** — sevk edilen vs tanka giren

### ⚠️ "Algılanan" ile "Eşleşen" AYNI DEĞİL — karıştırılmamalı
| Kalem | RAHA | Not |
|---|---|---|
| Algılanan Tank Dolum | 141.439,29 | Tank Dolum Excel'inin `Çıkan Litre` toplamı |
| **Eşleşen Tank Dolum** | **138.619,29** | Mutabakatta KULLANILAN değer |
| Fark | 2.820 | Dönem dışı / eşleşmemiş kayıtlar |

Tank Dolum Excel'i "algılanan"ı verir. Mutabakat hesabında **Eşleşen** kullanılır.
`Eşleşme Durumu` kolonu (Eşleşen / Eşleşmeyen) ve `Eşleşme Miktarı` bunu ayırır.
Alt kırılım: `Eşleşen Tank Dolum (IST)` istasyon + `(KP)` köy pompası.

### `Dönem Dışı Eşleşen` — dönem sınırı tuzağı
SLH PETROL (210008) Temmuz: `Dönem Dışı Eşleşen 25.457 lt`. Dış Satış Excel'i
40.186 lt (2 kayıt) veriyor ama ekran `Dış Satış Toplam: 24.586` — fark dönem
dışından. **Excel'i dönem filtresi olmadan toplamak yanlış sonuç verir.**

### Gerçek sapma örneği — SLH PETROL, Temmuz 2026 (ekran KIRMIZI)
| | K95 | Motorin | Toplam |
|---|---|---|---|
| Dağıtıcıdan Alınan | 16.008 | 68.748 | 84.756 |
| Kullanılan | 16.224 | 61.022 | 77.246 |
| **Fark** | −216 | **7.726** | 7.510 |
| **Fark(%)** | −1,35 | **11,24** ⚠ | **8,86** ⚠ |
| Pompa Satış | 19.004 | 74.049 | 93.053 |
| Dış Satış | 0 | 24.586 | 24.586 |
| Algılanan Tank Dolum | 20.295 | 58.143 | 78.438 |
| Eşleşen Tank Dolum | 16.544 | 36.436 | 52.980 |
| Dönem Dışı Eşleşen | 3.751 | 21.706 | 25.457 |

Motorin %11,24 → EPDK %3 limitinin **çok üstünde**. RAHA'da %−1,27 (limit içinde).
POL yüzdeyi kırmızı gösteriyor → ekranın kendi eşiği var, bizim de aynı eşikle
alarm kurmamız gerekir.

### POL Excel export kolonları (import aracı için)
**Tesis Dolum** (`tesis_dolum_islem_detaylari*.xlsx`) — başlık satırı 5:
`İrsaliye Tarihi · Ürün · Dagitici Sevk İrsaliye No · Fatura No · Birim Fiyat ·
Fatura Satış Miktarı · Kalan Miktar · İstasyon Dolum · Köy Pompası · Tanker ·
Belgelenen Dış Satış Miktarı · Dağıtıcıya İade · Evrak Durum · Plaka Dorse ·
Plaka Çekici · SatisTip · Fark Yüzde · Lisans No · İstasyon Ad · Bölge · Mıntıka`

**Tank Dolum** (`tankdolumislemdetay*.xlsx`) — başlık satırı 3:
`İşlem Tarihi · Eşleşme Durumu · Evrak No · Evrak Tarihi · Tank No · Çıkan Litre ·
Eşleşme Miktarı · Ürün · İade Bakım Transfer Var Mı · Şehir · Adres · Fatura Durum`

**Dış Satış** (`dis_satis_*.xlsx`) — başlık satırı 3:
`İşlem Tarihi · Evrak No · Evrak Tarihi · Belgelenen Dış Satış Miktarı · Ürün ·
Şehir · Satışın Yapıldığı İlçe · Dolum Yolu · Plaka · Plaka Dorse ·
İstasyon Fatura No · ...`

⚠️ **Tarihler Excel serial** (46228 = 25.07.2026). Dönüşüm: `1899-12-30 + n gün`.
⚠️ Hücreler XML'de **ham sayı** (nokta ondalık) — TR binlik/ondalık çevirimi YAPILMAZ,
doğrudan `Number()`. (İlk denemede `14991.21`'i binlik sanıp 12 milyon çıktı.)

## 4e. ⭐⭐ POL EKRANLARI ÇÖZÜLDÜ — mutabakat POL'de HAZIR (2026-07-29, kullanıcı SS)

İki POL ekranı görüldü ve **eşleştirildi**. Bu, §4d'deki "alan güvenilmez" yorumunu
düzeltiyor: alan güvenilmez değil, **iki farklı biçimde** geliyor ve POL zaten
doğru hesabı yapıp gösteriyor.

**Ekran 1 — Satış Takip** (`EpdkModulu/Epdk2011/GonderilecekVeriler/SatisTakip.aspx`)
Kolonlar: İrsaliye Tarihi · Ürün · **Dağıtıcı Sevk İrsaliye No** · Fatura No ·
Birim Fiyat · **Fatura Satış Miktarı** · **Kalan Miktar** · **İstasyon Dolum** ·
Köy Pompası · Tanker

**Ekran 2 — Tank Dolum** (`EpdkModulu/Epdk2011/IstasyonDisSatis.aspx`)
Kolonlar: İşlem Tarihi · **Eşleşme Durumu (yeşil/kırmızı ışık)** · Evrak No ·
Evrak Tarihi · **Tank No** · **Çıkan Litre** · **Eşleşme Miktarı** · Ürün ·
İade/Bakım/Transfer Var Mı · Şehir · Adres

### Eşleştirme kanıtı — `PIR2026000008470` (25.07.2026, RAHA ENERJİ)
| | POL Ekran 1 | POL Ekran 2 | Bizim DB |
|---|---|---|---|
| Fatura Satış Miktarı | **14.876,00** | — | — |
| İstasyon Dolum | **14.991,21** | T1 7.992,09 + T2 4.992,63 + T3 2.006,49 = **14.991,21** ✓ | brüt aynı ✓ |
| **Kalan Miktar** | **−115,21** | — | — |
| Hesap | `14.876 − 14.991,21 = −115,21` ✓ | | |

→ **MUTABAKAT FARKI = POL'ün "Kalan Miktar" kolonu.** Fatura (dağıtıcının sevk
ettiği) − İstasyon Dolum (tanka gerçekten giren). −115 lt, yani **288 limitinin
içinde, sorun yok**. Bizim analiz bunu "%53 ihlal" diye gösteriyordu.

### `irsaliye_litre` İKİ BİÇİMDE geliyor (ölçüldü, 30 gün / 863 teslim)
| Biçim | Sayı | Doğru işlem | Uyum |
|---|---|---|---|
| Tek satır | 412 | değeri doğrudan | %72 |
| Satırlara BÖLÜNMÜŞ (farklı değerler) | 353 | **SUM** | %62 |
| Her satırda TEKRAR eden (aynı değer) | 98 | **MAX** | %44 |
| → "1 farklı değer varsa MAX, >1 ise SUM" kuralıyla | 863 | | **%65** |

%65 yeterli değil (kalan %35'in gerçek sapma olması gerçekçi değil). Ayrıca:
- **İrsaliye no YILLAR ARASI tekrar kullanılıyor:** `PIR2026000008470` hem 5 Kas 2025
  hem 25 Tem 2026'da var → gruplamaya **tarih de girmeli**, yoksa toplamlar karışır.
- `dolum_miktari_net` POL'ün İstasyon Dolum'una brütten daha yakın.

### ⛔ KARAR: tersine mühendislik YAPILMAYACAK
POL bu hesabı zaten yapıyor ve `Kalan Miktar` + `Eşleşme Durumu` (yeşil/kırmızı ışık)
olarak gösteriyor. Formülü %65 isabetle taklit etmek yerine **POL'ün kendi çıktısını
almak** doğru yol:
1. **Excel export** — her iki ekranda Excel/PDF butonu var → `araclar/polExcelImport.ts`
   deseniyle (bayi iletişimde kanıtlandı) içe aktarılır. En hızlı ve KESİN yol.
2. **ASIS'te karşılığı** — "Eşleşme Miktarı" / "Eşleşme Durumu" alanlarını veren bir
   SOAP metodu var mı? ASIS'e sorulacak (bkz aşağıdaki soru listesi).

Bulunan diğer POL raporları (menüden): Mutabakat Dönemleri · Sorunlu İstasyonlar ·
Dönemsel Veri Gönderim · **Epdk Durum Analiz** · Epdk İçerik Kontrol Dolum · Epdk
İçerik Kontrol Satış · Aylık Ticket Sayısı · Tavan Fiyat Karşılaştırma · A3 Aylık
Satış Kontrol → hepsi otomasyon işi; incelenmeli.

## 4d. ⛔ `irsaliye_litre` ALANI GÜVENİLMEZ — dolum mutabakatı KURULAMADI (2026-07-29)

Dolum verisiyle (B girdisi) bağımsız bir "irsaliye vs tank" mutabakatı kurmayı denedim.
**Sonuç: bu alanla yapılamaz.** Üç katmanlı kanıt:

**1. İrsaliye çok tanka bölünüyor ve litre her satırda TEKRAR ediyor.** Kanıtlandı:
irsaliye 33.145 lt → 7 tank satırı, her satırda "33.145" yazılı, tank toplamı 33.295.
Gerçek fark −150 lt (limit içinde) ama satır bazında bakan 7 ayrı "−31.000 lt sapma"
görür. Son 90 günde dolumların **%58'i** böyle bölünmüş → ASIS'in `irsaliye_hacim_fark`
alanı satır bazında **KULLANILAMAZ**. (Bu kısım doğru ve değerli bir bulgu.)

**2. Ama `irsaliye_litre` irsaliyenin litresi DEĞİL.** Farklı irsaliye numaralarında
aynı değer tekrar ediyor:
| İrsaliye no | Gün | Tank dolumu | `irsaliye_litre` |
|---|---|---|---|
| PIR2026000007775 | 11 Tem | 18.066,69 | 17.779 |
| PIR2026000008064 | 18 Tem | 18.146,28 | 17.779 |

İki ayrı teslim, iki ayrı irsaliye, **aynı** "irsaliye litresi". Bu alan muhtemelen
sabit bir tanker/dorse kapasitesi ya da başka bir şey — teslimin gerçek litresi değil.

**3. Sonuç mantık dışı.** İrsaliye no bazında gruplayınca 788 teslimin **420'si (%53)**
"EPDK ihlali" çıkıyor. Gerçek bir dağıtıcıda bu oran imkânsız — EPDK çoktan ceza
kesmiş olurdu. Yani yorum hatalı, veri değil.

**KURAL: bu alandan mutabakat/ihlal raporu üretilmez.** Üretilirse %53 yanlış alarmla
güvenilirliğini yitirir ve otomasyon ekibi paneli kullanmayı bırakır.

### Yine de KULLANILABİLİR olan (ölçülmüş, güvenilir)
Bunlar `irsaliye_litre`'nin anlamına bağlı DEĞİL — varlığına/yokluğuna bakıyor:
| Bulgu | 30 günde | Ne demek |
|---|---|---|
| İrsaliye NO hiç girilmemiş | 238 teslim | A1B bildirimi hiç yapılmamış |
| İrsaliye no var, LİTRE boş/0 | 604 teslim | A1B eksik bildirim |
| → toplam | **842 / 1.630 (%52)** | bir bayi/istasyon listesi çıkarılabilir |

137 istasyonda bulgu var; bazılarında **%100 eksik** (GÖNÜLCÜ 83/83, YORPET 30/30).
Bu somut, savunulabilir ve kimsenin takip etmediği bir eksiklik → panelde gösterilebilir.

**Sorulacak (Parkoil / ASIS):**
1. `IrsaliyeLitre` alanı tam olarak neyi taşıyor? Neden farklı irsaliyelerde aynı değer?
2. Gerçek irsaliye litresi ASIS'te başka bir alanda mı, yoksa hiç yok mu?
3. ~~`GetPumpSaleRecord` ve `GetTankLevelRecord` neden KayitID=0 dönüyor?~~
   **ÇÖZÜLDÜ 2026-07-29 — sorulmasına gerek yok.** Yetki sorunu değildi: `bitis`
   parametresinin **saat kısmı yok sayılıyor**, sadece tarih kullanılıyor. Bu yüzden
   `baslangic=28T00:00, bitis=28T23:59:59` sıfır genişlikte aralık olup `Code 900 ·
   KayitID 0` veriyordu. Doğru kullanım: **`bitis` = ertesi günün 00:00:00.**
   Kanıt (aynı gün, tek fark bitiş saati):
   | baslangic | bitis | Sonuç |
   |---|---|---|
   | `28T00:00:00` | `28T23:59:59` | Code 900 · KayitID **0** |
   | `28T00:00:00` | `28T12:00:00` | Code 900 · KayitID **0** |
   | `28T00:00:00` | `29T00:00:00` | Code 0 · KayitID **7402284** |
   | `28T00:00:00` | `29T12:00:00` | Code 0 · KayitID **7402284** (aynı) |
   Aynı kural `GetTankLevelRecord` ve `GetTankFillingRecord` için de geçerli
   (`29T00:00→29T23:59:59` = 900/0 ama `29T00:00→30T00:00` = 10184060).
   → **Çözünürlük 1 GÜN**; gün içi aralık sorgulanamaz.

**Yapılacak (Parkoil'e sor):** POL "Mutabakat Raporu"/"Tank Uzlaştırma" tam olarak neyi karşılaştırıyor?
İrsaliye no bazında mı, tank bazında mı? 288 lt limiti hangi büyüklüğe uygulanıyor (günlük tank stok
farkı mı, dolum-irsaliye farkı mı)? Bu netleşince mutabakat kontrolü doğru kurulur. Şu an panel farkı
"ham gösterge" olarak listeler, kesin ihlal olarak DEĞİL.

## 5. İrsaliye / dolum bildirimi

- Dep2: tank ünitesi dolumu otomatik algılar → net/brüt miktar, sıcaklık, kesafet, başl-bitiş.
  (Resmi kılavuz doğrulandı — ASIS `GetTankFillingList` bunun bizdeki karşılığı: IrsaliyeNo/Litre/
  Birimfiyat/HacimFark veriyor.)
- Dolum-irsaliye eşleşmesi **48 saat içinde** bildirim → `DOĞRULANMASI GEREK` (endüstri kaynağı;
  resmi kılavuz "anlık" diyor).
- Aylık mutabakat ekseni: **istasyon otomasyonu (pompa+tank) ↔ dağıtıcı P-BYS ↔ EPDK**.

## 6. Lisans formatları

- **Bayilik: `BAY/939-82/{no}`** (5015 sayılı Kanun). Bildirimde bayi kimliği bu no ile. Bizim ASIS
  eşleme anahtarımız da bu (EPDKKod). Doğrulandı.
- **Depolama: `DEP/...`** (terminal/depo, Dep1/Dep2/Dr bu lisans altında). Format detayı `DOĞRULANMASI GEREK`.
- Kaynak: https://www.epdk.gov.tr/Detay/Icerik/3-0-88/petrollisans-islemleri

## 7. Cezalar (5015 sayılı Kanun Madde 19) — yür. 1 Ocak 2026

Her yıl yeniden değerlemeyle artar (Resmi Gazete tebliği). **2026: %25,49 artış** (tebliğ 25.12.2025).
- Bayilik lisansı: 19/1-(a) cezasının **yarısı**.
- Bağımsız denetim: **1/4**.
- Otomasyon işleticisi (tüzel): 19/1-(ç)'nin **1/10**.
- Diğer yükümlülükler (bildirim dahil): net satış hasılatının **‰8** (alt ~110.000 TL). `DOĞRULANMASI GEREK` (2026 kesin bant).
- **TODO:** Madde 19 taban tutarları resmi tebliğ GÖRSEL tablosunda; sayısal değerler metinden çekilemedi.
- Kaynak: https://www.mevzuat.gov.tr/mevzuatmetin/1.5.5015.pdf ·
  https://orgtr.org/5015-sayili-petrol-piyasasi-kanununun-19-uncu-maddesi-uyarinca-2026-yilinda-uygulanacak-idari-para-cezalari-hakkinda-teblig/

## Doğrulanacaklar (Parkoil mevzuat sorumlusuna sor)
1. A1A/A1B kod etiketleri (v17 tablosu) 2. Dep1–Dat tam alan listesi 3. "48 saat" dolum bildirim süresi
4. Madde 19 taban ceza tutarları 2026 5. otomasyon.epdk.gov.tr alan adı + binde-8 bandı kesin değeri

> **Parkoil için en kritik doğrulanmış gerçekler:** 1240 zorunluluğu · anlık/günlük bildirim ·
> zd.kamusm zaman damgası · 288 L/gün + %3 belirsizlik · aylık %3 mutabakat · BAY/939 lisans · 2026 ceza yürürlüğü.

---

## ⭐ SATIŞ VERİSİ ÇEKİLİYOR — mutabakatın "C" kalemi (2026-08-01)

Mutabakat formülünün eksik parçasıydı. `araclar/satisCek.ts` ile çözüldü.

### Hacim ölçümü (gerçek, cursor farkından)

| | Ham | Özet |
|---|---|---|
| Günlük | **20.325** satış | ~525 satır |
| Aylık | 610.000 | ~16.000 |
| Yıllık | **7,4 milyon** | **~190.000** |

**39 kat sıkışma.** Kullanıcı kararı: **yalnız özet saklanır.**

### Neden özet yeterli
Mutabakat, A1a kriterleri (288 lt / %3) ve sızıntı tespiti **gün + istasyon + tank**
kırılımında çalışır. Ham fiş detayına gerek yok.

**Kaybedilen:** plaka, pompacı, saat, vardiya, fiş bazında detay. *"Şu plaka şu saatte
aldı"* sorusu bu tablodan yanıtlanmaz — gerekirse ASIS'ten o gün için tekrar çekilir.

**Korunan:** `cari_tip` kırılımı — dış satış / filo / kart ayrımı buradan çıkacak.
Canlı dağılım (31 Tem): tip 1 → 536.259 lt · tip 3 → 189.828 lt · tip 2 → 20.316 lt ·
tip 7 → 449 lt.

### ⚠️ İKİ TUZAK (ikisi de kodda çözülü)

**1. Cursor zaman filtresi DEĞİL.** `TPompaSatisID` merkeze VARIŞ sırasına göre
artıyor, `Tarih` gerçek satış anı. Bir sayfada tarih 11 saate kadar geriye sıçrıyor.
→ Gruplama `Tarih` alanına göre yapılır, cursor'a güvenilmez.

**2. Saat bazında "geri pay" İMKÂNSIZ.** İlk sürümde 24 saat pay koydum → ilk 2 sayfa
(20.000 kayıt) boşa gitti. Sebep: `bitis` güne yuvarlandığı için "12 saat geri" bile
**bir TAM gün geri** demek (ölçüm: 29 Tem cursor'u 30 Tem'inkinden 20.589 kayıt geride).
→ Pay 0; hedef günün KENDİ cursor'u kullanılır. Gecikmeli satışlar ID'ce sonra geldiği
için ileri sayfalarda zaten yakalanıyor.

Sonuç: **5 sayfa → 3 sayfa** (%40 az trafik). Doğrulama: 30 Tem eski ayarla 21.170 fiş,
yeni ayarla 21.169 — tek fiş fark (gün sınırı), veri kaybı yok.

### Kullanım
```bash
npm run satis                      # dün
npm run satis -- 2026-07-25        # belirli gün
npm run satis -- 2026-07-01 2026-07-31   # aralık
```

`satis_ozet` PK: (gun, istasyon_kod, tank_no, urun_id, cari_tip) → aynı gün tekrar
çekmek güvenli, üzerine yazar.

### Sıradaki: tank seviye geçmişi
`tank_seviye_gun` tablosu hazır (şemada), `GetTankLevelList` ile doldurulacak.
Bu gelince mutabakatın A/D kalemi (dönem başı/sonu stok) tamamlanır ve
**A1a kriterleri hesaplanabilir hale gelir.**
