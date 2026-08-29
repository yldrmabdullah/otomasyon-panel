# İstasyon Günlük Ürün Analizi (POL) — otomasyon notları

> Kullanıcı isteği (2026-08-29): *"otomasyon projemizde POL'e girip veri çekebiliyorduk ya,
> istasyon günlük ürün analizi gibi mesela"*.
>
> Rapor `docs/bilgi/pol-harita.md`'de zaten kayıtlıydı (satır 303) — sıfırdan keşif
> gerekmedi. Bu dosya, **gerçek çekimde ölçülenleri** ekler.

## Kaynak

| | |
|---|---|
| Sayfa | `OtomasyonModulu/UrunRaporlari/IstasyonAnaliz.aspx` |
| İndirme | **tek tık** — `i[class*="excel_2019"]` (Raporla butonu da yedek denenir) |
| Tarih filtresi | **`dtpSatisBaslama_Date1` / `_Date2`** |
| Araç | `araclar/urunAnalizCek.ts` · `npm run urun:analiz -- [bas] [bit]` |
| Tablo | `istasyon_urun_analiz` (`core/schema_urun_analiz.sql`) |
| Cron | `.github/workflows/urun-analiz-cek.yml` — günlük 04:20 UTC (TR 07:20) |

⚠️ **Tarih filtresi adı A1b'den FARKLI.** A1b/A3 gibi raporlar `dtpTarih_Date1` kullanıyor;
bu sayfa `dtpSatisBaslama_Date1`. Araç filtre alanını bulamazsa **hata fırlatıyor** —
sessizce geçseydi rapor TÜM tarihleri indirir ve veri yanlış olurdu.

## İlk gerçek çekim (2026-08-29, tarih 2026-08-28)

```
324 satır · 143 istasyon · 4 ürün · 845.246,6 litre
```

| Ürün | Satır | Litre | Tutar (TL) | Fiş adedi |
|---|---:|---:|---:|---:|
| Mtrn (motorin) | 143 | 732.287,9 | 52.868.162,55 | 10.978 |
| LPG | 74 | 71.526,0 | 2.281.746,40 | 4.688 |
| K95 (benzin) | 104 | 40.757,9 | 3.025.809,06 | 4.245 |
| ADB (adblue) | 3 | 674,8 | 20.149,06 | 23 |

Boş alan kontrolü: `epdk_kod` **324/324 dolu**, `tarih` 324/324, `litre` 324/324.

## Ölçülen tuzaklar

1. **`Marka` ve `ERP Kod` kolonları KAYNAKTA BOŞ.** Excel başlığında varlar ama tüm
   satırlarda `null` geliyor. Kodun hatası değil — bu alanlara güvenip iş kuralı yazma.
2. **Ürün adları KISALTMA:** `Mtrn`, `K95`, `LPG`, `ADB`. Portal/Logo yakıt kodlarıyla
   (motorin/benzin/kalyak) birebir DEĞİL — eşleme gerekirse ayrı harita yazılmalı.
3. **Tarih Excel serial** olarak geliyor (`46262` = 2026-08-28), metin değil.
   `tarihCoz()` hem serial hem `DD.MM.YYYY` hem ISO biçimini karşılıyor.
4. **Başlık satırı 4. satırda** (üstte "RaporBaslik…" ve "Günün Tarihi…" var).
   Kolonlar **başlık adıyla** bulunuyor, harf/indeks sabitlenmiyor (proje kuralı).
5. İndirilen dosya adı `.xls` uzantılı ama içerik XLSX — `XLSX.readFile` sorunsuz okuyor.

## Şema kararı: UNIQUE kısıt YOK (bilinçli)

POL aynı istasyon+ürün+gün için birden çok satır dönebiliyor (işlem tipi kırılımı) ve
hangi kombinasyonun gerçekten tekil olduğu **henüz ölçülmedi**. Yanlış bir UNIQUE sessiz
veri kaybı yaratırdı. İdempotentlik `DELETE ... WHERE tarih BETWEEN` + `INSERT` ile
sağlanıyor → aynı aralık tekrar çekilince çiftlemez.

İlk birkaç günün verisi birikince `(epdk_kod, urun, tarih)` dağılımına bakılıp tekil
çıkarsa kısıt eklenebilir.

## Ne için kullanılabilir

- **Aldı / sattı karşılaştırması:** `satis_fatura` (bayinin bizden aldığı, litre+TL) ile
  `istasyon_urun_analiz` (istasyonda sattığı) EPDK kodu üzerinden birleştirilir.
  Bkz. `docs/bilgi/yonetim-bayi-alimlari.md`.
- **İstasyon performansı:** litre/fiş adedi trendleri, ürün kırılımı.
- ⚠️ Kaçak/sızıntı analizi için **UE-4D/UE-4T daha zengin** (tank bazlı) — bkz.
  `pol-harita.md` "iş değeri notları".

## Sonraki adım (yapılmadı)

Panelde ekran yok. Veri birikince `panel/` altına bir modül eklenebilir; yetki için
`core/ekranlar.ts`'e yeni ekran kodu tanımlanmalı (menüden gizlemek yetki değildir —
sunucu kapısı `korumali(handler, { ekran: '...' })` ile kurulur).
