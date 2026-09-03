# Bayi bazlı istisnalar / notlar

Bu dosya belirli bayilerde bulunan, genele yayılmayan somut vakaları tutar.
Format: bayi + tarih + kaynak + bulgu + kanıt.

## ⭐⭐ HAKYEMEZ PETROL (210196 / Gaziantep / EPDK 41436) — taşıyıcı çakışması, eksik dolum şüphesi

> (2026-09-02, kullanıcı bir POL ekran görüntüsü paylaştı — RaporBaşlıkTankDolum, Ağustos
> 2026, "alım 211.254 L vs dolum 136.610 L, kalan 74.643,81 L" — sonra "plaka" ve "boşaltmıyor/
> başka yere satıyor mu" sorusu geldi. Logo (LOGODATA salt-okuma, `readuser1`) + otomasyon-panel
> Postgres (ASIS `tank_dolum`) çapraz sorgulanarak doğrulandı.)

### Bulgu

HAKYEMEZ'in **tüm** satış irsaliyeleri tek bir taşıyıcıya bağlı: Logo `SHPAGNCOD = T00202`,
`L_SHPAGENT.TITLE = "63 ABT 713 HAKYEMEZ"` (gerçek sahibi: TÜRKEL PETROL OTO.İNŞ.NAK.GID.TİC.LTD.ŞTİ,
VKN 8770094758). Yani plaka **taşıyıcı kartının başlığına gömülü** — ayrı bir plaka kolonu yok
(`STFICHE.GENEXP3/4` boş, `L_SHPAGENT`'te de plaka alanı yok, TITLE'a serbest metin olarak yazılmış).

**Aynı tanker (T00202 / 63 ABT 713) düzenli olarak ŞEMS PETROL İNŞAAT TAŞIMACILIK'a da (120.Ş01.0006)
mal taşıyor** — son 180 günde HAKYEMEZ'e 35 irsaliye / 62,2 mn TL, ŞEMS'e 28 irsaliye / 40,5 mn TL.
**11 ayrı günde bu tanker aynı gün içinde hem HAKYEMEZ'e hem ŞEMS'e sevkiyat yapmış** (28 May, 11 Haz,
30 Haz, 2 Tem, 6 Tem, 9 Tem, 13 Tem ×2, 6 Ağu, 8 Ağu, 31 Ağu — hepsi 2026).

### Logo (fatura) vs ASIS (gerçek tank dolumu) — irsaliye bazlı karşılaştırma

Logo `STLINE.AMOUNT` (fatura edilen litre) ile otomasyon-panel `tank_dolum` tablosundaki (ASIS'ten
çekilen gerçek tank seviye artışı) aynı irsaliye no için toplam karşılaştırıldı. Çoğu irsaliye
%0-2 sapmada (normal ölçüm farkı) ama **7 irsaliyede büyük, sistematik eksik** var:

| İrsaliye | Tarih | Logo (fatura) | ASIS (tank dolum) | Fark | % | Aynı gün ŞEMS'e de gitmiş mi |
|---|---|---|---|---|---|---|
| PIR2026000007150 | 30.06.2026 | 33.156 L | 3.677,56 L | 29.478 L | **%89 eksik** | ✅ evet |
| PIR2026000007274 | 02.07.2026 | 30.969 L | 7.007,99 L | 23.961 L | **%77 eksik** | ✅ evet |
| PIR2026000004388 | 30.04.2026 | 31.169 L | 13.041,07 L | 18.128 L | **%58 eksik** | hayır (bu tarihte SEMS verisi yok) |
| PIR2026000007462 | 06.07.2026 | 33.109 L | 16.071,05 L | 17.038 L | **%52 eksik** | ✅ evet |
| PIR2026000007655 | 09.07.2026 | 30.941 L | 18.227,69 L | 12.713 L | **%41 eksik** | ✅ evet |
| PYR2026000000008 | 13.07.2026 | 28.061 L | 16.477,41 L | 11.584 L | **%41 eksik** | ✅ evet |
| PIR2026000005513 | 28.05.2026 | 33.027 L | 23.792,76 L | 9.234 L | **%28 eksik** | ✅ evet |

Toplam eksik ≈ **104.000 L** (Ağustos ekranındaki 74.643 L farkın büyük kısmını açıklıyor).

**6/7 şüpheli irsaliye, tankerin aynı gün ŞEMS PETROL'e de gittiği günlerle örtüşüyor** — tesadüf
olamayacak kadar güçlü bir örüntü. Yorum: tanker muhtemelen Mersin terminalinden tek seferde
yükleniyor, faturası HAKYEMEZ'e kesilen miktarın bir kısmı aynı turda başka bayiye (ŞEMS veya
güzergâhtaki üçüncü bir yer) boşaltılıyor olabilir.

**Tank konumu tutarlı, şüpheli değil**: 7 şüpheli irsaliyenin 15 dolum parçasından 13'ü Tank 4'e
(HAKYEMEZ'in ana motorin tankı, toplam hacminin ~%90'ı zaten oradan geçiyor), 2'si Tank 3'e —
istasyonun genel dağılımıyla uyumlu. Sorun tank/konum değil, **irsaliyenin parçalara bölünmüş
kaydında bir kısmının tanka hiç yansımaması** (ör. PIR2026000007655 üç ayrı günde üç parça
halinde dolduruluyor, parçalardan biri eksik/küçük kalıyor).

⚠️ **Ters yönlü anormallik de var**: `PIR2026000007940` (15.07.2026) Logo'da 30.900 L iken ASIS'te
61.231,34 L (fazla, %98) — muhtemelen bu irsaliye 9 parçaya bölünmüş kayıtta komşu bir dolumun
yanlış etiketlenmesi (bkz [[epdk-mutabakat]] §4d, irsaliye no satır bazında güvenilmez bulgusu).
Bu satır dış satış/kaçak analizinden HARİÇ tutulmalı, veri kalitesi sorunu.

### Neden POL/A1B bunu yakalamıyor

`a1b_gun` (günlük otomasyon mutabakatı, tank bazlı) HAKYEMEZ'de neredeyse tamamen NORMAL/Sağlandı
çıkıyor (78/80 gün NORMAL, sadece 2 günde 46-87 L önemsiz sapma, hiç elle düzeltme yok) — çünkü
A1B **günlük tank toplam hareketine** bakıyor, irsaliye-tanker çapraz kontrolü yapmıyor. Asıl sapma
yalnız **irsaliye bazında** (aylık kümülatif `uzlastirma` tablosunda Ağustos %-5,92 sapma olarak
görünüyor, ama kök neden orada da görünmüyor — sadece "kalibrasyon değişti" etiketleniyor).

### Sonuç ve etkisi

- **Bayi portalı**: HAKYEMEZ'in Logo cari kaydı bu faturalar üzerinden borçlandırılıyor — tankına
  hiç girmemiş olabilecek ~104.000 L'nin parasını ödüyor/borçlanıyor görünüyor. Limit/risk hesabını
  etkiler.
- **EPDK/otomasyon**: A1a/A1B tank verisine dayandığından, eksik dolum EPDK'ya "kalibrasyon sapması"
  gibi gidiyor; kök neden (taşıma/teslim) EPDK'nın göremediği bir katman.
- **Panele eklenmesi istenen "plaka" özelliği** tam bunun için: taşıyıcı kodu (`SHPAGNCOD`) +
  aynı gün çoklu-bayi tespiti + irsaliye bazlı Logo↔ASIS miktar karşılaştırması otomatik alarm
  olarak kurulabilir. Bu vaka canlı, ölçülmüş bir kanıt niteliğinde — ilk uygulama örneği olarak
  kullanılabilir.

**Doğrulanmadı / sıradaki adım:** ŞEMS PETROL'ün kendi tank_dolum/Logo karşılaştırması henüz
yapılmadı — tankerin gerçekten nereye "fazla" boşalttığını göstermek için ŞEMS tarafında da aynı
analiz tekrarlanmalı (ŞEMS'te fazla mı çıkıyor, yoksa iki bayide de eksik mi — üçüncü bir yere
gidiyor olabilir).
