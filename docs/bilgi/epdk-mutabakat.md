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

⭐ `YakitDolumBaslamaMiktariLT` / `BitisMiktariLT` → **tank seviyesi geçmişi**.
`GetTankLevelRecord` KayitID=0 dönüyordu ama seviye bilgisi DOLUM kaydında zaten var.

### DOĞRULAMA — RAHA, PIR2026000008470 (25.07.2026)
| | ASIS | POL | |
|---|---|---|---|
| Σ `DolumMiktari` | 14.991,21 | İstasyon Dolum 14.991,21 | ✅ **birebir** |
| Σ `EslesmeMiktari` | 14.991,21 | (bu kayıtta dolum=eşleşme) | ✅ |
| Σ `IrsaliyeLitre` | 14.886 | Fatura 14.876 | ≈ 10 lt fark |

→ **`IrsaliyeLitre` SATIRLARA BÖLÜNMÜŞ, toplanır** (T1 7.932 + T2 4.968 + T3 1.986).
§4d'deki "her satırda tekrar ediyor" yorumu YANLIŞTI; sebep irsaliye no'nun yıllar
arası tekrar kullanılması + kapsamsız gruplamaydı.

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
3. `GetPumpSaleRecord` ve `GetTankLevelRecord` bu guidKey'e neden KayitID=0 dönüyor?
   (Canlı test: 1 gün / 3 gün / 7 gün / 15 gün / 30 gün — hepsinde 0. Yetki mi?)

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
