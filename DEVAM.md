# DEVAM — kaldığın yer (son güncelleme: 2026-08-03)

> Bu dosya **oturumlar arası devir teslim** içindir. Yeni bir oturuma başlarken
> önce bunu oku, sonra `CLAUDE.md` ve ilgili `docs/bilgi/*.md`.
> Detaylı iş bilgisi `docs/bilgi/` altında; burada yalnız **durum + sıradaki iş** var.

---

## 30 saniyede durum

| | |
|---|---|
| **Canlı panel** | https://otomasyon-panel-dun.vercel.app |
| **Vercel ekibi** | `yldrmabdullah-s-team` (⚠️ `yldrmabdullahs-projects` DEĞİL — panel orada yok) |
| **Repo** | `yldrmabdullah/otomasyon-panel` @ `master` |
| **Push durumu** | Temiz, bekleyen commit yok |
| **Giriş** | `ahmet` / şifre `npm run kullanici -- sifirla ahmet` ile yenilenir |
| **DB** | Supabase **transaction pooler** (port **6543**) |

### Local'de ayağa kaldırma
```bash
cd otomasyon-panel
node --env-file=.env --import tsx araclar/panelSunucu.ts   # API → :5178
cd panel && npx vite                                        # panel → :5173
```
Panel `:5173`'ten açılır; `/api/*` istekleri Vite proxy ile `:5178`'e gider.
**API'yi ÖNCE başlat.**

### Doğrulama komutları
```bash
npm run typecheck                              # kök
npx tsc --noEmit -p panel/tsconfig.json        # panel
cd panel && npx vite build                     # 0 uyarı olmalı
PANEL_SIFRE=<sifre> npm run mobil              # 24/24 temiz olmalı
```

---

## ✅ ÇÖZÜLDÜ: piyasa cron'u çalışıyor

3 gün üst üste başarılı: 31 Tem (130 dk) · 1 Ağu (135 dk). Limiti 240'a çıkarmak
doğru karardı — 120'de kalsaydı ikisi de kesilecekti.
Transfer tespiti de sonuç üretiyor: 31 Tem 21 hareket, 1 Ağu 12 hareket.

---

## ⭐ 1 AĞUSTOS'TA YAPILANLAR (mutabakat altyapısı)

### Satış verisi çekiliyor — `npm run satis`
- Hacim ölçüldü: günde **20.325** ham satış, yılda 7,4 milyon
- **39 kat sıkışma** → `satis_ozet` tablosu, günde ~525 satır, yılda ~190 bin
- Kırılım: gün + istasyon + tank + ürün + **cari_tip** (dış satış ayrımı için)
- DB'de 3 gün var (29-31 Tem). 31 Tem: 151 istasyon, 746.852 lt, 52,4M TL

### Tank seviyesi çekiliyor — `npm run seviye`
- ⚠️ **`GetTankLevelList` KULLANILAMADI**: 269 istasyondan yalnız 16-19'una
  ulaşıyor (ölçüldü). Bir gün için 669 tank beklenirken 83 geliyordu.
  30 Temmuz'da "çalışıyor" diye kaydetmiştim — tek sayfaya bakmış, kapsamı
  test etmemiştim. **ASIS'e sorulacak: yetki mi, parametre mi?**
- Çözüm: `GetTankLastLevel` **670 tankın tamamını** veriyor (537 ms) ama anlık.
  Her gece çekilip biriktirilir → `kapanis_lt` bu gece, `acilis_lt` dünkü kapanış.
- ⚠️ **Geçmiş için veri YOK** — seri 1 Ağustos'tan itibaren başlıyor.
- İlk koşu yapıldı: 669 tank, 2 tankın ölçümü bayat.

### Sorun Tespiti modülü panelde
Menüde yeni sekme. Kaynak: kendi DB'miz, POL'e bağımlı değil.
- Kural dışı irsaliye **8** (ör. `1234` → 4 istasyona 51.681 lt — uydurma görünüyor)
- Çoklu istasyon 33 · Mükerrer dolum 18 · Seviye anomalisi 4 · Kalibrasyon 100
- Kapsam dürüstlüğü: seviye kontrolü yalnız **%4** kayıtta yapılabiliyor, ekranda yazılı

### POL "EPDK 2020" modülü çözümlendi
`docs/bilgi/epdk-modulu-a-tablolari.md` — A1a kriter formülü **288 lt / %3**
canlı 667 satır taranarak ölçüldü. 27 "Sağlanmadı" kaydının **14'ü gerçek sapma
değil** (ertesi gün açılış = 0, yani tank verisi gelmemiş).

---

## ⚠️ SIRADAKİ: MUTABAKAT HESABI (artık yapılabilir)

Formülün 4 girdisinden **3'ü hazır**:

| Kalem | Kaynak | Durum |
|---|---|---|
| A — dönem başı stok | `tank_seviye_gun.acilis_lt` | ⏳ yarından itibaren |
| B — dolum | `tank_dolum` | ✅ 36.465 kayıt |
| C — satış | `satis_ozet` | ✅ 3 gün |
| D — dönem sonu stok | `tank_seviye_gun.kapanis_lt` | ✅ 669 tank |

`Fark = (A + B − C) − D` · EPDK limiti **288 lt / %3**

**Yapılacak:**
1. ✅ **YAPILDI (2026-08-03)** — `.github/workflows/mutabakat-cek.yml`: `seviyeCek` +
   `satisCek` günlük 21:00 UTC (00:00 TR) cron'a bağlandı. İzleme job'una EKLENMEDİ
   (o 15 dk'da bir koşuyor; aynı iş günde ~96 kez tekrarlanırdı).
2. Birkaç gün veri biriksin (A kalemi için en az 2 gün gerekiyor)
3. Mutabakat modülü: istasyon × gün/ay, sapma listesi, 288 lt / %3 uyarısı

### ⚠️ 1-2 AĞUSTOS SEVİYE VERİSİ KALICI OLARAK KAYIP

Cron 1 Ağustos'ta bağlanacaktı, 3 Ağustos'ta bağlandı → **2 gün seviye çekilmedi.**
`GetTankLastLevel` ANLIK ölçüm verir, tarih parametresi yok → o günler **telafi
edilemez**. `seviyeCek.ts 2026-08-01` çalıştırmak o günü değil, çalıştırıldığı anın
ölçümünü eski güne yazar → **sessiz veri yanlışlığı, YAPILMAMALI.**

Sonuç: `Fark = (A+B−C)−D` kesintisiz gün çifti ister (bir günün kapanışı ertesinin
açılışı). 1-2 Ağustos boşluğu zinciri kırıyor → **Ağustos tam ay olarak çıkmayacak**,
seri fiilen 3 Ağustos'tan başlıyor. İlk tam ay = **Eylül**.

Satış farklı: ASIS'te geçmiş duruyor, geriye dönük çekilebilir →
`npm run satis -- 2026-08-01 2026-08-02` (elle, `DATABASE_URL` gerekir) veya
workflow'u `satis_bas`/`satis_bit` girdileriyle elle tetikle.

---

## ⚠️ BİLDİRİMLER FİİLEN KAPALI (sessizce)

Ölçüldü: **GitHub'da SMTP/Netgsm secret'ları HİÇ YOK**, `EKIP_MAIL` boş.
Job `DRY_RUN: 0` ile "CANLI bildirim" yazıyor ama gönderecek adres olmadığı için
her turda `Bildirim gönderilen alarm: 0`.

Yani alarm tespiti çalışıyor, **haber verme çalışmıyor** ve bu log'a bakmadan
anlaşılmıyor. Kullanıcı "bildirimleri en son yaparız" demişti — açılacaksa:

```bash
gh secret set SMTP_HOST      # ve SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
gh secret set EKIP_MAIL      # dağıtım listesi
gh secret set NETGSM_USERCODE  # ve NETGSM_PASSWORD, NETGSM_HEADER, EKIP_TELEFON
```
`DRY_RUN=1` ile önce test edilir (bildirim atmaz, sadece loglar).

---

## Panelde ne var (5 modül)

| Modül | İçerik |
|---|---|
| **İzleme** | 269 istasyon, bağlantı/tank durumu, alarm rozetleri, tip filtresi |
| **Operasyon** | 3 sekme: Stok tahmini · Alarm geçmişi · Veri kalitesi |
| **Mevzuat** | EPDK & mutabakat bilgisi (statik) |
| **Piyasa** | 5 sekme + **gerçek il sınırlı Türkiye haritası** + 30.308 bayi tablosu |
| **Kullanıcılar** | Yetki yönetimi (admin/izleyici), kilitlenme koruması |

**Her tabloda ⭳ CSV butonu** (15 tablo). PDF: `Ctrl+P` → "PDF olarak kaydet".

---

## SIRADAKİ İŞLER (öncelik sırası)

### 1. Harita klavye erişimi — ÜRÜN KARARI GEREKİYOR
81 il `tabIndex={0}` + `role="button"` taşıyor → klavye kullanıcısı tabloya ulaşmak için
**81 durak** geçiyor. Üstelik `role="button"` yanıltıcı: `onClick`/`onKeyDown` YOK,
yani Enter'a tepki vermeyen bir "buton" (ekran okuyucu "düğme" der, basılır, hiçbir şey olmaz).

Seçenekler:
- **(a)** `tabIndex`/`role` kaldır → harita salt görsel. Veri kaybı yok: `svg` zaten
  `role="img"` + özet `aria-label` taşıyor, tüm sayılar alttaki tabloda.
- **(b)** `.atla` skip-link deseniyle "Haritayı atla" bağlantısı + gerçek `onKeyDown` ekle.

Panelde `.atla` sınıfı ve kullanımı zaten var (`stil.css:131`, `App.tsx:102`).
**Kullanıcıya sorulmadan yapılmamalı.**

### 2. Piyasa ham tablosunun ortak `Tablo`'ya birleştirilmesi
`Piyasa.tsx`'te sunucu-taraflı sayfalamalı ham `<table>` var (30.308 satır client'a
inemiyor). Ortak `Tablo` client-side sıralıyor. Kullanıcının gördüğü fark: Temizle
butonu, 3-tık sıralama iptali, sayaç dili, kolon seçici konumu.

Somut plan: `Tablo`'ya opsiyonel `sunucu?: {toplam, sayfa, sayfaDegis, sirala,
siralaDegis, yukleniyor}` prop grubu. Verilmezse mevcut davranış bit-for-bit korunur.
⚠️ **`sunucu` modunda client-side sıralama ATLANMALI** — atlanmazsa 50 satırlık sayfa
kendi içinde yeniden sıralanır ve sunucu sırası bozulur (**sessiz veri yanlışlığı**).
Kazanç ~60 satır siler.

### 3. `.cikis-btn` dokunmatik hedefi
Şu an 32px, WCAG 2.5.5 önerisi 44px. Düzeltmek `--kenar-yuk`'u etkiler (sticky `th`
offset'i). İkisi birlikte güncellenmeli + `npm run mobil` ile doğrulanmalı.

### 4. Boş gösterimi tek tipe indirme
`<Bos />` (aria-label="veri yok") vs düz `'—'` karma. `sayi()`/`trTarih()` **string**
döndürüyor ve template içinde kullanılıyor → körü körüne JSX'e çevirmek `[object Object]`
üretir. Doğru yol: `sayi()` (string, metin içi) + `SayiHucre` (JSX, hücre içi) ayrımı.

### 5. Mutabakat: dolum/irsaliye farkı
`irsaliye_litre` davranışı **KARMA** (çok satırlı 5.669 irsaliyenin 873'ünde tekrar,
gerisinde bölünmüş) → fark bu alandan hesaplanamaz. `irsaliye_hacim_fark` çöp taşıyor
(en büyük değer 566.660.992). Bkz. `docs/bilgi/epdk-mutabakat.md`.

**Yapılabilir olan:** fark hesabı değil, **eksik veri raporu** (irsaliye bilgisi ASIS'e
hiç akmayan istasyonlar — bazılarında %100). Zaten Operasyon → Veri kalitesi'nde var.

### 6. ASIS'e sorulacaklar (kullanıcı iletecek)
1. POL ekranının ham veriye uyguladığı **1.000,00 lt düzeltme** nereden geliyor?
   (34 SOAP operasyonunda `iade|bakim|mutabakat|duzelt` taraması: 0 sonuç)
2. "İade Bakım Transfer Var Mı?" kolonunun SOAP karşılığı var mı?
3. `GetPumpSaleListDetail` için `GirisAd`/`Sifre` alınabilir mi? (tarih aralıklı,
   cursor'lu metottan değerli)
4. `lisansws.epdk.gov.tr` fiyat servisleri ("Sorgu Yetkisi Yok!") — dağıtıcı
   yetkimizle erişilebilir mi? Firma bazlı fiyat orada olabilir.

---

## Bugün çözülen kritik şeyler (tekrarlanmasın)

| Konu | Sonuç |
|---|---|
| ASIS `GetXxxRecord` KayitID=0 | `bitis` = **ertesi gün 00:00** olmalı; saat kısmı yok sayılıyor |
| Cursor ≠ zaman filtresi | ID varış sırasına göre; tarih 11 saat geriye sıçrıyor → client-side filtre |
| `IstasyonOnlineDurum` "yetki yok" | YANLIŞ kayıttı; `<Key>` (büyük K) şart, 179 kayıt geliyor |
| Supabase `EMAXCONNSESSION` | session pooler limit 15 → **transaction pooler (6543)** + serverless `max:2` |
| `DATABASE_URL` üç yerde | Vercel + **GitHub secret** + local `.env` — biri atlanınca CI kırıldı |
| pg `DATE` bir gün geri | `setTypeParser(1082, v=>v)` — `<time dateTime>` yanlıştı |
| Mobil: menü sayfayı geniş tutuyordu | `.kenar` `min-width:0` + `overflow-x:clip` |
| Mobil: taşma testi yetersizdi | Tablo 1305px/356px, menü 1/5 görünür, font 11px → test **okunabilirliği de ölçüyor** |
| Harita ızgarası Türkiye'ye benzemiyordu | Gerçek il sınırları (`haritaYollari.ts`, 70 KB, dış istek yok) |

---

## Kalıcı kurallar (CLAUDE.md'yi tamamlar)

- **Push kullanıcı incelemesi olmadan YAPILMAZ.** Commit OK.
- Şifre/guidKey/bağlantı dizesi komut satırına yazılmaz — dosyadan `<` ile beslenir, sonra silinir.
- Bu sistem **salt-okuma**: ASIS'e ve EPDK'ya yazılmaz.
- **Bir yapılandırma değeri değişirse "başka nerede duruyor?" diye ara** (bugün iki kez yandı).
- **Görsel/yerleşim iddiası statik analizle kanıtlanamaz** — `npm run mobil` ile ölç.
- `vite build` çıktısındaki `[WARNING]` satırları görmezden gelinmez (bugün gerçek CSS
  syntax hatası oradan yakalandı).
- Yeni CSS sınıfı yazmadan önce `grep` ile `stil.css`'te varlığını doğrula (TypeScript
  sınıf adını denetlemez → yanlış sınıf **sessizce** stilsiz çıkar).
