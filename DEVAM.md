# DEVAM — kaldığın yer (son güncelleme: 2026-08-05)

> Bu dosya **oturumlar arası devir teslim** içindir. Yeni bir oturuma başlarken
> önce bunu oku, sonra `CLAUDE.md` ve ilgili `docs/bilgi/*.md`.
> Detaylı iş bilgisi `docs/bilgi/` altında; burada yalnız **durum + sıradaki iş** var.

---

## ⭐⭐ YARIN İLK İŞ (2026-08-06) — mutabakat sapma listesi

**Kullanıcı kararı (2026-08-05):** "olur notunu al yarın bakarız" — bugünkü sapma
listesi 2 GÜNLÜK aralığı kapsıyor, tek güne oturmuş hâli beklenecek.

### Neden bekliyoruz
Elde 3 ve 5 Ağustos gece ölçümü var; 4 Ağustos'un kendi ölçümü YOK (test
koşularımın bozduğu kayıt silindi). Aralık 3 Ağu 03:30 → 5 Ağu 03:30, yani
**48 saat**. EPDK tek gün bazında bakıyor → rakamlar şişik görünüyor.
Bu gece cron koşunca 5 Ağustos'un ölçümü gelecek ve 24 saatlik gerçek aralık
oluşacak.

### Yarın yapılacak
```bash
# 1) Gece çekimi doğru saatte koştu mu (TR 22:00–06:00 arası olmalı)
node --env-file=.env --import tsx -e "
import { pool, kapat } from './core/db.js';
const r = await pool().query(\`SELECT gun::text,
  to_char(max(kapanis_zaman) AT TIME ZONE 'Europe/Istanbul','MM-DD HH24:MI') tr,
  count(*) n, count(acilis_lt) acilis FROM tank_seviye_gun GROUP BY gun ORDER BY gun\`);
console.table(r.rows); await kapat();"

# 2) Mutabakat — aralık 24 saate düştü mü, sapma listesi ne
#    (kullanılabilir satır sayısı ve aralik_saat alanına bak)
```

### Bugünkü liste (2 günlük — karşılaştırma için)
Hedef gün 4 Ağustos · 398/669 kullanılabilir · 375 limitte (%94) · 23 aşan (%5,8)
· net fark −37.215 lt

EPDK eşiğini (288 lt VE %3) aşan ilk 8:
| Fark | Bayi | İl / kod | Tank |
|---|---|---|---|
| −1.157 | BAŞKAN AKARYAKIT | ADANA 210048 | t1 Motorin |
| +1.071 | NASPET TARIM | MARDİN 210067 | t2 Motorin |
| −801 | ROZA PETROL | AKSARAY 210006 | t2 + t3 |
| −778 | EYMEN KELEŞOĞLU | SAMSUN 210240 | t4 K95 |
| +624 | ONUR GRUP | KIRIKKALE 210237 | t3 |
| −492 | BAŞKAN AKARYAKIT | NİĞDE 210050 | t2 |
| −420 | KERVANSARAYKAHVE | K.MARAŞ 210233 | t4 |
| −417 | ÖZ TOROS | ERZİNCAN 210266 | t4 K95 |

Kalan 5 (300–370 lt): AKBAŞOĞLU/Karabük 210187 · TAHA/Adana 210127 ·
ŞABAN DÜZGÜN/Aksaray 210214 · DORUK/Uşak 210135 · MSTF/Manisa 210122

### ⚠️ AYRI VAKA: ILGINPARK 210020 tank 4 (KONYA)
Listede yok (satış eşleşti) ama verisi TUTARSIZ:
```
3 Ağu 03:30: 28.995 lt (kapasite 30.000, neredeyse dolu)
4 Ağu 03:30:  2.578 lt → 26.417 lt DÜŞMÜŞ
o günün satışı: yalnız 4.368 lt
dolum: 4 Ağu 01:58→02:47, 26.260 lt (irsaliye SCN2026000186634)
```
Bir tank 26 bin litre düşerken 4 bin litre satılamaz. Ölçüm dolumun hemen
ardından alınmış → 28.995 muhtemelen dolum sırasındaki geçici okuma, gerçek
stok değil. **Kalibrasyon ya da ölçüm zamanlaması sorunu.** ASIS/bayi tarafına
sorulmalı. (Aynı irsaliye tank 3'e de 6.918 lt yazmış — tek tankerden iki tank.)

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
2. ✅ **YAPILDI (2026-08-04/05)** — veri birikti, hesap yazıldı, **ÇALIŞIYOR**:
   `core/panelSorgu.ts > mutabakatVerisi()`. 398/669 kullanılabilir satır,
   375 limitte (%94), 23 eşik aşan. Yolda **6 kök tuzak** çözüldü — hepsi
   `docs/bilgi/epdk-mutabakat.md` sonunda yazılı (anahtar çevirisi, gün etiketi
   vs zaman damgası, TR/UTC kayması, zaman_riski eşiği tutarsızlığı…).
3. ⬜ **SIRADAKİ** — Mutabakat modülü PANELDE yok. Sorgu hazır, ekran yazılacak:
   istasyon × aralık, sapma listesi, 288 lt / %3 uyarısı, kapsam dürüstlüğü
   (79 tank mutabakat dışı — satışı var seviyesi yok, günün %10'u).
   Kullanıcı onayladı, veri hazır — tek engel ekranın yazılmamış olması.

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

## ✅ BİLDİRİMLER KURULDU — bilinçli olarak KAPALI

**Durum (2026-08-05):** altyapı tamam, canlıda test edildi, mail geldi.
Kullanıcı kararıyla susturuldu: *"mailleri bir süre pasif hale getirelim, güzel
çalışıyor bildirimler, ben aktif edeceğim sonra."*

### Açma/kapama — TEK ANAHTAR, kod değişmez
```bash
gh variable set BILDIRIM_KAPALI --body 0   # AÇ
gh variable set BILDIRIM_KAPALI --body 1   # KAPAT (şu an bu)
```
Ya da GitHub → Settings → Secrets and variables → Actions → Variables.

| Kapalıyken | Davranış |
|---|---|
| Alarm job'u | Koşar, alarm açar, panele yazar — **mail atmaz** (DRY_RUN=1) |
| Piyasa mailleri | Hiç koşmaz (`if:` ile atlanır) |
| Elle tetikleme | Çalışır — kapalıyken de test edilebilir |

⚠️ DRY_RUN "bildirildi" İŞARETLEMEZ → kapalı dönemde biriken alarmlar
açıldığında ilk maillerini alır (kaçmaz). Uzun kapalı kalırsa açılışta yığın
gelebilir; gerekirse "yalnız hâlâ açık olanları bildir" modu eklenir.

### Kurulu secret'lar (GitHub)
`SMTP_HOST/PORT/USER/PASS/FROM` + `EKIP_MAIL`. SMTP = BFF'nin kullandığı hesap
(`smtp.gmail.com:587`, `parkoildev@gmail.com`). **Netgsm YOK** → SMS gönderilmiyor.

### ⚠️ BAYİLERE GÖNDERİM AYRI ANAHTARLA KAPALI
`BAYIYE_GONDER=0` (varsayılan). Kod bayi adreslerini ekip adresiyle birleştirip
hepsine gönderiyordu — secret'lar girildiği an **178 bayi telefonuna + 168 bayi
mailine** mesaj gidecekti. Açmadan önce bildirim hacmi izlenmeli: ölçüm, tank
alarmlarının **%63'ünün 30 dakikada kendiliğinden kapandığını** ve tek istasyonun
24 saatte 51 alarm ürettiğini gösterdi.

### Bildirim eşiği ALARM eşiğinden AYRI
`BILDIRIM_TANK_ESIK_SAAT=3`. Alarm 35 dk'da açılır (panelde görünür), mail 3 saat
bekler. 7 günlük ölçüm: eşik 35dk→1.915 mail · 2sa→192 · **3sa→49** (44 tekil tank).

### Mail biçimi: istasyon bazında GRUPLU
İNCİRLİK'in 4 tankı sessizken 4 ayrı mail gidiyordu. Artık tek mail:
"Tüm tanklar veri göndermiyor (4/4)" + tank/ürün/son ölçüm tablosu +
**bağlantı durumu satırı** (teşhisin kendisi: bağlantı çalışıyorsa prob arızası).

### Piyasa mailleri (3 tip, hepsi pasif)
| Mail | Ne zaman | Pencere |
|---|---|---|
| Sözleşme — bizim | Her gün 11:00 TR | 30 gün (boşsa gönderilmez) |
| Sözleşme — rakip | Pazartesi 11:30 TR | 7 gün (46 bayi) |
| Transfer | Her gün 20:00 TR | Yalnız o gün |

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

### 1. ✅ Harita klavye erişimi — YAPILDI (2026-08-03)
Kullanıcı kararı: **(a) harita salt görsel.** 81 ilden `tabIndex={0}` + `role="button"` +
il bazlı `aria-label` kaldırıldı, `aria-hidden="true"` eklendi. Artık klavye kullanıcısı
tabloya ulaşmak için 81 durak geçmiyor ve "basılınca hiçbir şey olmayan düğme" yanıltması
kalktı. Bilgi kaybı yok: `svg` `role="img"` + özet `aria-label` taşıyor, tüm sayılar
alttaki tabloda. Hover (`onMouseEnter/Leave`) korundu; ölü kalan `onFocus/onBlur` silindi.

> Tıklanabilir yapılacaksa: gerçek `onClick`+`onKeyDown` VE "haritayı atla" skip-link'i
> (`.atla`, `stil.css:131`) BİRLİKTE eklenmeli — biri olmadan diğeri yarım çözüm.

### 2. ✅ Piyasa ham tablosu ortak `Tablo`'ya birleştirildi (2026-08-03)
`Tablo`'ya opsiyonel `sunucu?: {...}` prop grubu eklendi; verilmezse davranış **bit-for-bit
korunuyor** (13 kontrollü render testiyle doğrulandı, client modu dahil).

⚠️ **`sunucu` modunda client-side sıralama VE filtreleme ATLANIYOR** — atlanmasaydı 50
satırlık sayfa kendi içinde yeniden sıralanır, kullanıcı tüm tablonun sıralı olduğunu
sanardı (sessiz veri yanlışlığı; hata vermez, yalnız yanlış gösterir).

Kazanç: **Piyasa.tsx 950 → 771 satır (−179)**. Ayrıca CSV aktarımındaki kolon `switch`'i
silindi — kolon metinleri artık `bayiKolonlari()` tek kaynağından geliyor (önceden ekran
ve CSV ayrı listelerdi → yeni kolonun CSV'ye eklenmesi unutulabilirdi).

Dikkat: kolon id'leri (`bayi`) ile sunucu sıralama alanları (`lisans_sahibi`) FARKLI —
`BAYI_SIRA_ALANI` / `BAYI_SIRA_KOLONU` ile eşleniyor. Kolon id'lerini sunucu adlarına
çevirmek localStorage'daki mevcut kolon seçimlerini geçersiz kılardı.

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
