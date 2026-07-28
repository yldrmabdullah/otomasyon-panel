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
