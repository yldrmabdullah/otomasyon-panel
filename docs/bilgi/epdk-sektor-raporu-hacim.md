# EPDK Sektör Raporu — HACİM bazlı pazar payı (kaynak keşfi)

> Kaynak: EPDK Petrol Piyasası **Aylık Sektör Raporu** eki (Excel).
> Keşif: 2026-08-26, canlı dosya indirilip ölçüldü. Kimlik/yetki GEREKMİYOR (public).
> İhtiyaç: "pazar payını bayi ADEDİ değil MOTORİN/BENZİN SATIŞ HACMİ üzerinden göster."

## Neden bu kaynak

Panelin mevcut pazar payı (`core/panelSorgu.ts`, ANALİZ 2) **bayi adedi** oranıdır:
`bizim bayi / o ildeki toplam bayi`. Hacim değil.

Hacim için denenen ve ÇALIŞMAYAN yollar (bkz. `docs/EPDK_WEB_SERVISLERI.md`):
- `petrolBayiSatisFiyatBulten` → yalnız ülke geneli **fiyat**; firma/il kırılımı yok
  (fazladan alan eklenince 400 döner).
- `bildirimPetrol8FirmaBulten`, `bildirimPetrolAkaryakitFiyatlari` → **`Sorgu Yetkisi Yok!`**
  (SOAP, kimlik gerekiyor).
- Lisans sorgulama uçlarının HİÇBİRİNDE satış miktarı yok — hepsi kütük/lisans verisi.

→ **Hacim verisi yalnız aylık sektör raporu ekinde (Excel) var.** Ve orada hazır
hesaplanmış pazar payı yüzdesi bile bulunuyor.

## İndirme akışı

1. Dizin sayfası: `https://www.epdk.gov.tr/Detay/Icerik/3-0-104/petrolaylik-sektor-raporu`
2. Sayfa **iç içe accordion** (`<li class="accordion-pop">`); tablo DEĞİL — `<tr>` ile
   ayrıştırmaya çalışmak tek satır döndürür.
3. Her rapor bloğunda başlık (`2026 Yılı ... Haziran Ayı Sektör Raporu`) + dosya linkleri:
   `href="/Detay/DownloadDocument?id=<ID>"` ve hemen ardından biçim ikonu
   (`/Content/img/excel.png` | `pdf.png` | `word.png`). **Excel'i ikondan ayırt et.**
4. ⚠️ **ID'ler opak ve ay↔ID eşlemesi KOD'A GÖMÜLMEZ** — her koşuda dizin sayfası
   ayrıştırılıp taze alınır. (Keşifte bir LLM özeti 2025 ID'lerini 2026'nınkilerle
   karıştırdı; ID'ler ay bilgisi taşımıyor, doğrulanmadan güvenilmez.)
5. ⚠️⚠️ **BAŞLIKTA HTML VARLIKLARI** (2026-08-26, canlı yakalandı): sayfa UTF-8
   olmasına rağmen EPDK başlıklarda Türkçe karakterlerin bir kısmını sayısal
   varlık olarak gönderiyor — `Eyl&#252;l`, `Sekt&#246;r`. Varlık çözülmezse ay adı
   eşleşmiyor ve o dönem **SESSİZCE ATLANIYOR**: Eylül 2025 + Eylül 2024 ekleri
   mevcut olduğu halde listede çıkmıyordu (22 yerine 20 ay). Yalnız `ü/ö` içeren
   aylar etkilendiği için fark edilmesi zor. `hacimCek.ts > varlikCoz()` çözer.

Ölçüm: Haziran 2026 eki 495 KB, 21 sheet, HTTP 200, kimlik yok.
Dizinde (2026-08-26) **22 aylık Excel eki**: 2024-09 → 2026-06.

## ⚠️⚠️ EN BÜYÜK TUZAK: format YILA GÖRE DEĞİŞİYOR

İki tamamen farklı workbook düzeni var. Tek parser YETMEZ.

### Biçim A — "Tablo N" (2026 ve sonrası)
Sheet'ler: `Açıklamalar`, `İçindekiler`, `Tablo 1` … `Tablo 24`.
İlgili tablolar:

| Sheet | İçerik | Birim |
|---|---|---|
| **Tablo 17** | Dağıtıcıların bayi satış miktarı — **BENZİN** türleri + `Pazar Payı (%)` | litre |
| **Tablo 18** | Dağıtıcıların bayi satış miktarı — **MOTORİN** türleri + `Pazar Payı (%)` | litre |
| Tablo 14 | Dağıtıcı yurt içi akaryakıt satışı + `Pay (%)` (benzin/motorin/FO/gazyağı) | m³ |
| **Tablo 24** | **İL** × şirket × ürün yurtiçi satış | **ton** |
| Tablo 23 | İl × şirket × ürün *teslim* (satış değil — karıştırma) | ton |

Tablo 17/18 kolonları: `İstasyon Pompa Satış`, `Köy Pompası Satış`,
(motorinde ek: `Tarımsal Satış Amaçlı Tanker Satış`), `Dış Satış`, `Toplam Satış`,
`Pazar Payı (%)`. Yani **payı biz hesaplamıyoruz, EPDK veriyor.**
⚠️ Kolon SAYISI benzin ile motorinde FARKLI (motorinde tarımsal tanker kolonu fazla)
→ kolonu indeksle değil **başlık adıyla** bul.

⚠️⚠️ **EPDK YAZIM HATASI — Tablo 17 başlığı: `Lisanas Sahibinin Unvanı`**
(2026-08-26 canlı yakalandı). Tablo 18'de doğru: `Lisans Sahibinin Ünvanı`.
Başlık satırını "Lisans" kelimesiyle arayan kod **benzin tablosunu bulamıyor ve
SESSİZCE 0 satır** dönüyordu — hata yok, log temiz, yalnız motorin geliyordu
(34 satır yerine 68 beklenir). Üstelik `Unvanı`/`Ünvanı` yazımı da iki tabloda
farklı. **Ders:** başlık satırını ünvan kolonundan değil, EPDK'nın tutarlı
yazdığı VERİ kolonundan (`Toplam Satış`) sapta. Doğrulama: iki grubun
`Pazar Payı` toplamı **her biri tam %100,000** olmalı (ölçüldü) — tutmuyorsa
satır düşmüş demektir.

### Biçim B — il-başına-sheet (2025 ve öncesi)
Sheet'ler: `ADANA`, `ADIYAMAN`, … (81 il, `Tablo *` sheet'i YOK).
Her sheet: **iki satırlı başlık** (r2 ürün grubu, r3 teslim tipi), r4'ten veri.
Kolonlar: `İL | Lisans Sahibinin Unvanı | Benzin(Bayiye/Diğer) | Motorin(Bayiye/Serbest/Diğer) | … | Toplam(Ton)`.
Pazar payı yüzdesi YOK → il toplamından kendimiz hesaplarız.
⚠️ Aralık 2025 eki **tek sheet (ADANA)** ile geliyor — bozuk/eksik yayın. Her dosya
sheet sayısıyla doğrulanmalı; "81 sheet var" varsayımı yapılmaz.

### Ortak tuzak: `İL` kolonu birleşik hücre
Her iki biçimde de `İL` yalnız o ilin İLK satırında dolu, devam satırlarında BOŞ.
**Forward-fill zorunlu**, yoksa 81 ilin 80'i kaybolur. Ayrıca `TOPLAM` içeren
satırlar veri değil, ara toplam → filtrele.

## Ölçülen değerler (doğrulama tabanı)

Turgut Dağıtım Enerji A.Ş., **Ocak–Haziran 2026 kümülatif**:

| Ölçü | Değer | Pazar payı |
|---|---|---|
| Benzin (Tablo 17, bayi satış) | 5.541.016,71 L | **%0,1427** |
| Motorin (Tablo 18, bayi satış) | 128.836.231,17 L | **%0,8875** |
| Genel akaryakıt (Tablo 14) | 112.071,279 m³ | %0,7366 |

⭐ **İŞ İÇGÖRÜSÜ:** Parkoil **motorin ağırlıklı** bir dağıtıcı. Bayi ADEDİNDE 15. sırada
(167 bayi) ama hacim payı motorinde %0,89, benzinde %0,14 — yani benzin tarafında
adet payının çok altında. Adet bazlı grafik bu farkı GİZLİYOR.

İl bazında (Tablo 24, Haziran 2026, ton): 53 ilde satış var (81 ilin tamamı ayrıştırıldı).
En yüksek hacim payı: BİLECİK %7,90 · ISPARTA %7,27 · BURDUR %5,29 · NİĞDE %3,93.
En düşük: İSTANBUL %0,032 (146/454.810 ton).

⭐ **ADET ≠ HACİM (kanıt):** ISPARTA adet bazında %2,7 (3/111 bayi) ama hacim bazında
**%7,27** — az sayıda YÜKSEK HACİMLİ istasyon. BİLECİK ikisinde de yüksek (%6,7 adet /
%7,90 hacim). İki metrik ayrı sorulara cevap veriyor, biri diğerinin yerine geçmez.

## Kayıt/karşılaştırma notları

- Rapor **kümülatif** (Ocak–ilgili ay). Aylık tek-ay değeri için ardışık iki raporun
  farkı alınır. Tablo 12/20/23 "dönem" (tek ay), 13/14/17/18/21 "kümülatif" — başlıktaki
  `Kümülatif` kelimesine bak, karıştırma.
- ⚠️ EPDK'nın kendi uyarısı (İçindekiler sonu): lisans sahipleri sonradan **bildirim
  düzeltmesi** yapabiliyor → aynı ayın değeri sonraki yayınlarda DEĞİŞEBİLİR. Bu yüzden
  veri `(donem, kaynak_rapor_ay)` ile saklanır; eski dönem yeniden çekilince üzerine
  yazılır (upsert), fark loglanır.
- Birimler karışık: Tablo 17/18 **litre**, Tablo 14 **m³**, Tablo 23/24 **ton**.
  Birim dönüşümü yapılmaz (yoğunluk gerekir) — her tablo kendi biriminde saklanır ve
  panelde birim ETİKETLENİR.
- Gecikme: aylık yayın, ay kapandıktan ~1-2 ay sonra. Canlı/gerçek zamanlı DEĞİL.
  Panelde "EPDK Haziran 2026 kümülatif" gibi dönem etiketi şart.

## Kurulan otomasyon (2026-08-26)

| Parça | Yer |
|---|---|
| Çekim aracı | `araclar/hacimCek.ts` · `npm run hacim [yıl] [ay]` / `--tumu` |
| Şema | `core/schema_hacim.sql` → `epdk_hacim_dagitici`, `epdk_hacim_il`, `epdk_hacim_kosu` |
| Yazma | `core/db.ts > hacimDagiticiKaydet / hacimIlKaydet / hacimKosuKaydet` |
| Sorgu | `core/panelSorgu.ts > hacimVerisi()` — `piyasaVerisi().hacim` içine gömülü |
| Panel | `panel/src/Piyasa.tsx > HacimBolumu` — **"Hacim Payı"** sekmesi |
| Cron | `.github/workflows/hacim-cek.yml` — ayın 5'i ve 20'si 06:20 UTC |

Yüklenen veri (2026-08-26): **22 dönem** (2024-09 → 2026-06). Dağıtıcı tablosu
yalnız 2026 biçiminde var (6 dönem × 2 ürün × 34 dağıtıcı); il tablosu 22 dönemin
hepsinde.

⚠️ **TURGUT ilk kez 2025-02'de görünüyor** — 2024-09…2024-12 dönemlerinde satırı YOK.
Bu ayrıştırma hatası DEĞİL, gerçek piyasa geçmişi (o dönemlerde majörler doğru
ayrıştırılıyor, ünvan varyantı da yok — kontrol edildi).

## Ünvan eşleme

Bizim kayıt: `TURGUT DAĞITIM ENERJİ ANONİM ŞİRKETİ` (EPDK kütüğündeki `dagitim_sirketi`
ile aynı yazım — `bayiler_epdk` tablosundaki `BIZ` sabiti). Panelde "Turgut Dağıtım"
olarak kısaltılıyor. Ünvan eşlemesi ünvan METNİYLE yapılır; sektör raporunda lisans no
YOK. ⚠️ Ünvan yazımı değişirse (A.Ş./ANONİM ŞİRKETİ) eşleme sessizce kopar →
eşleşmeyen ünvanlar loglanmalı.
