# Yönetim modülü — bayilerin ürün grubuna göre alımları

> Kullanıcı isteği (2026-08-26): *"yeni Yönetim diye tab oluştursak, orada bizden
> bayilerin ürün gruplarına göre alımları olsa, tarih filtresi koysak, en çok hangi
> bayiler bizden ne kadar alıyor vs. görsek."*
>
> Bu, Piyasa modülünden AYRI bir soru: Piyasa **dış** dünyayı anlatır (EPDK, rakip,
> tüm bayiler); Yönetim **iç** ticareti (kendi bayimiz bizden ne aldı).

## Veri zinciri

```
Logo LOGODATA (canlı, VPN arkası)
  INVOICE (TRCODE 7/8, FICHENO PRK%/PRR%) + STLINE (LINETYPE=0 mal satırı)
    ↓ SUM(AMOUNT)=litre · SUM(TOTAL)=TL · ITEMS=ürün · CLCARD=cari+ünvan
BFF  LogoCanliServisi.MutabakatSatislariAsync
    ↓ GET /dis/v1/mutabakat/fatura-satislari?baslangic=&bitis=  (X-Api-Key, salt-oku)
otomasyon-panel  araclar/satisFaturaCek.ts   (npm run satis:fatura)
    ↓ upsert
Postgres  satis_fatura   (PK: fatura_no + urun_kod)
    ↓ core/panelSorgu.ts > yonetimVerisi()
Panel  /api/yonetim → panel/src/Yonetim.tsx  ("Yönetim" modülü)
```

**Neden BFF üzerinden:** panel Vercel'de, Logo VPN arkasında. BFF (reportapi) public
ve `X-Api-Key` korumalı. `a3-mutabakat` işi de AYNI ucu kullanıyor — uç yeni değil,
yalnız iki alan eklendi.

**Neden yeni tablo (`satis_fatura`), `mutabakat_a3` değil:** `mutabakat_a3` bir
**kıyas** tablosu (A3 ile Logo'yu yan yana koyar; `durum`, `litre_fark` kolonlu,
yalnız mutabakata giren dönemi içerir). "Hangi bayi ne kadar aldı" sorusu için
düz bir **satış fact** tablosu gerekiyor.

## BFF'e eklenen alanlar (2026-08-26)

`LogoCanliServisi.MutabakatSatislariAsync` + `LogoMutabakatSatiri` + `DisMutabakatController`:

| Alan | Kaynak | Neden |
|---|---|---|
| `tutar` | `SUM(sl.TOTAL)` | Yönetim litre değil **TL** soruyor ("ne kadar alıyor") |
| `bayiAd` | `MAX(cl.DEFINITION_)` | Panel yalnız cari kodu (120.xx) görüyordu |

Kayıt tipine **opsiyonel parametre** olarak eklendi (`string? BayiAd = null,
decimal Tutar = 0`) → mevcut çağıranlar derlenmeye devam eder. Mutabakat kıyası
bu iki alanı kullanmıyor, A3 karşılaştırması etkilenmiyor. Build: 0 uyarı 0 hata.

⚠️ **BFF canlıya çıkmadan `tutar`/`bayiAd` BOŞ gelir.** `satisFaturaCek.ts` bunu
satır sayısıyla uyarır ve panel "N satırda tutar yok" der — sessiz eksik veri olmaz.

## ⚠️ TUZAK: Türkçe I, İngilizce ürün adı

`urunGrubu()` ürün adını kanonik gruba çeviriyor (motorin/benzin/kalorifer/fuel_oil/
gazyagi/diger). İlk sürümde yalnız Türkçe küçültme vardı (`I → ı`) ve Logo'daki
**`FUEL OIL 6`** ürünü `fuel oıl` oluyor, `/fuel\s*oil/` **eşleşmiyor**, ürün
sessizce `diger` grubuna düşüyordu (2026-08-26 testte yakalandı).

Ürün adları Türkçe+İngilizce karışık (`OIL`, `DIESEL`) → **iki normalize birlikte
taranır**: `tr` (İ→i, I→ı) ve `en` (düz toLowerCase). 11 vakalık test geçti.

**Genel ders:** Türkçe küçültme İngilizce kelime içeren alanlarda tek başına
yeterli değil. Aynı tuzak ürün/ünvan/tesis adı eşleyen her yerde geçerli.

## Kurallar / kararlar

- **Toplamlar İPTAL HARİÇ** (`WHERE NOT iptal`). İptal satırı DB'den SİLİNMEZ,
  işaretlenir ve sayısı panelde "Veri aralığı" satırında görünür — yönetim
  "neden düştü" diye sorduğunda cevap kaybolmasın.
- **`bitis` HARİÇ** (yarı-açık aralık) — BFF ucuyla aynı sözleşme. Panelde etiketi
  açıkça "(hariç)" yazıyor.
- Tarih parametresi `yyyy-MM-dd` biçim doğrulamasından geçer (`araligiCoz`);
  uymuyorsa varsayılana düşer. Ham string SQL'e gitmez.
- Panel varsayılanı **son 12 ay**; hazır aralıklar: bu ay / geçen ay / bu yıl / son 12 ay.
- Ekran yetkisi: `yonetim` (bkz. `core/ekranlar.ts`). Kapı sunucuda —
  `korumali(..., { ekran: 'yonetim' })` + local sunucuda aynı kapı. Yetkisiz
  istek 401/403 (doğrulandı). **Mevcut kısıtlı kullanıcılar bu ekranı otomatik
  GÖRMEZ** (ekranlar dizisi doluysa `yonetim` içinde yok) — bilinçli, elle verilir.

## Kurulan parçalar

| Parça | Yer |
|---|---|
| Çekim | `araclar/satisFaturaCek.ts` · `npm run satis:fatura [bas] [bit]` / `-- --aylar 12` |
| Şema | `core/schema_hacim.sql` → `satis_fatura`, `satis_fatura_kosu` |
| Yazma | `core/db.ts > satisFaturaKaydet / satisFaturaKosuKaydet` |
| Sorgu | `core/panelSorgu.ts > yonetimVerisi()` |
| API | `api/yonetim.ts` (Vercel) + `araclar/panelSunucu.ts` `/api/yonetim` (local) |
| Panel | `panel/src/Yonetim.tsx` — sekmeler: Bayi Alımları / Ürün Grubu / Aylık Trend / Çıkış Tesisi |
| Cron | `.github/workflows/satis-fatura-cek.yml` — günlük 05:40 UTC |

## Durum (2026-08-26)

Kod + şema + panel HAZIR ve sentetik veriyle uçtan uca doğrulandı (toplamlar,
iptal hariç tutma, ürün grubu kırılımı). **`satis_fatura` boş** — çünkü:

1. BFF değişikliği (`tutar` + `bayiAd`) **`live`'a deploy edilmedi** (push kullanıcı
   onayı bekliyor — kalıcı kural).
2. Local `.env`'de `BFF_URL`/`BFF_API_KEY` boş ("doldur" yazıyor); GitHub'da
   secret olarak MEVCUT (a3-mutabakat kullanıyor).

Deploy sonrası ilk dolum: `npm run satis:fatura -- --aylar 12` (ya da workflow'u
`aylar=12` ile elle tetikle). Panel o ana kadar "Satış verisi henüz çekilmemiş"
diyor — boş ekran değil, sebebi yazıyor.
