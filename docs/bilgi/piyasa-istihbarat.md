# Piyasa İstihbarat Modülü (EPDK) — DURUM & DEVAM NOTU

> Vizyon (kullanıcı): "Otomasyonu tamamen bilen uygulama." EPDK resmi web servisleriyle
> TÜM Türkiye akaryakıt piyasasını izle — tüm dağıtıcılar + tüm bayiler DB'ye, gün gün snapshot,
> **bayi transferleri** (kim hangi dağıtıcıdan hangisine geçmiş), bölge/firma bazında raporlar.
> Panelde **3. modül** (İzleme / Mevzuat / **Piyasa**), aynı platform aynı DB.

## Karara bağlanan tasarım
- Transfer tespiti: **günlük snapshot karşılaştırma** (dünkü dagitimSirketi ≠ bugünkü → transfer).
- İlk kapsam: **tüm 32 dağıtıcı + tüm bayiler** (~13bin bayi, throttle nedeniyle yavaş, arka plan).

## EPDK servisleri — CANLI DOĞRULANDI (2026-07-23), PUBLIC (kimliksiz!)
- **petrolDagiticiLisansSorgula** → 32 ONAYLI dağıtıcı. Girdi: `{lisansDurumu:["ONAYLANDI"]}`.
  Döner: lisansNo (DAĞ/416-55/00516), lisansSahibiUnvani, vergiNo, il/ilce/adres, marka, yakıt türleri.
- **petrolBayilikLisansiSorgula** → bir dağıtıcının bayileri. Girdi: `{dagiticiLisansNo, lisansDurumu:[...]}`.
  Döner (ZENGİN): lisansNo(BAY/939-82/...), lisansSahibi, **dagitimSirketi** (transfer anahtarı!),
  il/ilce/tesisAdresi, vergiNo, kategorisi(ISTASYONLU), lisansDurumu, kacakciliktanIptalEdildi,
  **dagiticiIleYapilanSozlesmeBaslangic/BitisTarihi**. OPET lisansNo ile 463 bayi geldi.
- lisansDurumu değerleri: ONAYLANDI, SONLANDIRILDI, IPTAL_EDILDI, IADE_EDILDI, FAALIYETI_GECICI_DURDURULDU.

## TUZAKLAR (çözüldü)
1. **Throttling (429 "BLOCKED"):** çok hızlı istek → engel. Çözüm: 9 sn bekle + tekrar (epdkClient içinde).
2. **GET + JSON body:** EPDK GET metodunda body istiyor. Node `fetch` GET+body KABUL ETMEZ →
   `https.request` (düşük seviye) kullanıldı. curl `-d` çalışır ama Türkçe Ğ'yi bozar → `--data-binary @dosya`.
3. **Türkçe Ğ (DAĞ/):** dagiticiLisansNo BİREBİR gönderilmeli (UTF-8). Inline `-d` bozuyor, JSON.stringify korur.
4. **dagiticiLisansNo zorunlu:** bayilik sorgusu dağıtıcı olmadan boş/hata. Önce dağıtıcı listesi çekilir,
   her dağıtıcının lisansNo'suyla bayiler çekilir.
5. **null dönüş:** yanlış format/eşleşmeyen dağıtıcı → `null` (hata değil). Array değilse boş kabul et.

## KRİTİK BULGULAR (2026-07-23, 12.632 bayi çekildikten sonra)

**1. ✅ PARKOIL = TURGUT DAĞITIM ENERJİ A.Ş. — KANITLANDI (2026-07-23, kullanıcı + veri).**
Parkoil bir MARKA; EPDK'daki resmi dağıtıcı tüzel kişiliği **TURGUT DAĞITIM ENERJİ ANONİM ŞİRKETİ**,
lisans **DAĞ/13252-3/48112**, EPDK'da 168 bayi. Kanıt: bizim bilinen 4 Parkoil bayisi (RAHA 47501,
TUANA 40237, ASLANLAR 47929+47293) HEPSİ Turgut Dağıtım altında çıktı. → Panelde "BİZ" = Turgut
Dağıtım; kendi bayilerimiz vs rakipler karşılaştırması yapılabilir. ASIS'te ~235 istasyon, EPDK'da
168 bayi (fark incelenebilir: ASIS'te olup EPDK'da farklı durumda olanlar vb.).

**2. BAY/939-82/ öneki PARKOIL'E ÖZEL DEĞİL — genel EPDK seri kodu.** Bizim ASIS eşlememizde
"BAY/939-82/{no}" Parkoil bayisi sanılıyordu; YANLIŞ. Bu önek onlarca dağıtıcıya dağılmış:
Petrol Ofisi 1663, OPET 1477, Shell 893, Güzel Enerji 780... → 939-82 bir dağıtıcı kodu değil,
EPDK'nın genel akaryakıt bayilik lisans serisi. ⚠️ Bu, ASIS EPDKKod eşlememizin de gözden
geçirilmesi gerektiğini gösterir (ASIS'teki 235 istasyon hepsi 939-82; demek Parkoil'in ASIS'teki
istasyonları genel seri no ile — Parkoil↔bayi eşlemesi EPDK no'nun {no} kısmıyla, seri ile değil).

**3. En büyük dağıtıcılar (bayi sayısı):** Petrol Ofisi 2567, OPET 1969, Shell 1261, Güzel Enerji 1054,
Aytemiz 879, Kadooğlu 501, Termopet 460, Akpet 389, Altınbaş 362, Turkey 342, Siyam 311, Socar 270.

## TUZAK: EKSİK snapshot → sahte transfer (ÖNEMLİ)
Transfer tespiti iki snapshot gününü karşılaştırır. Bir çekim YARIM kalırsa (ör. 6/32 dağıtıcı,
session kapandı) o günün snapshot'ı eksik olur. Sonraki TAM çekimle karşılaştırınca eksik günde
"olmayan" binlerce bayi "yeni_bayi/transfer" sanılır (2026-07-28: 17.866 sahte transfer üretti).
KURAL: Transfer tespiti yalnız İKİ TAM snapshot arasında anlamlı. Yarım çekim snapshot'ı SİLİNMELİ.
Çözüm uygulandı: eksik 25-Tem snapshot + sahte transferler silindi, 28-Tem tam snapshot taban.

### ✅ ÇÖZÜLDÜ (2026-07-29): kod artık kendini koruyor
Önceki "TODO: piyasaCek eksik biterse snapshot yazmasın" maddesi kapandı — ama koruma
**`piyasaCek`'e değil `transferleriTespitEt`'in İÇİNE** kondu: çağıran kim olursa olsun
(cron, elle çalıştırma, ileride başka bir araç) koruma devrede kalsın.

Mekanizma: yeni snapshot'ın satır sayısı önceki günün **%90'ının altındaysa** çekim yarım
kabul edilir → karşılaştırma ATLANIR, `-1` döner, anlaşılır uyarı + düzeltme SQL'i loglanır.
`piyasaCek` bunu görünce **exit 2** ile çıkar (cron sessizce "başarılı" görünmesin).

Eşiğin gerekçesi: gerçek piyasada bir günde bayi sayısının %10 düşmesi mümkün değil —
böyle bir düşüş **her zaman** veri toplama arızasıdır, piyasa olayı değil.

Kanıt (gerçek veriyle test edildi):
| Senaryo | Sonuç |
|---|---|
| Yarım snapshot (6.000 / 30.303 = %19.8) | ENGELLENDİ, 0 transfer yazıldı |
| Tam snapshot + 3 kasıtlı değişim | `dagitici_degisti 1`, `ayrildi 1`, `yeni_bayi 1` — üçü de doğru |

## ✅ TRANSFER TESPİTİ İLK KEZ ÇALIŞTI (2026-07-29)

İki tam snapshot oluştu (28 Tem 30.303 · 29 Tem 30.307, ikisi de `tum` kapsam) ve
mekanizma ilk kez gerçek veriyle koştu: **15 değişim**, sıfır hayalet kayıt.

| Tip | Sayı | Örnek |
|---|---|---|
| `dagitici_degisti` | 5 | CANSA (Konya): BAŞ → **Aytemiz** · İPEK (Çorum): TP Petrol → **ES ES** |
| `durum_degisti` | 6 | 4× ONAYLANDI→SONLANDIRILDI · ÇINARLI: geçici durdurma → **ONAYLANDI** |
| `yeni_bayi` | 4 | TUNALAR (Sivas) → Petrol Ofisi · UYKA (Kayseri) → OPET |

Günlük net artış 4 bayi (30.303 → 30.307) — makul. Sayının bu mertebede olması
doğrulama: binlerce çıksaydı bütünlük koruması devreye girmiş olurdu.

⚠️ Kendi hatam olarak not: ilk çekimi `--tum-durumlar` bayrağı OLMADAN başlattım
→ yalnız onaylı bayiler geldi (12.624) ve kapsam 28 Tem ile uyuşmadı. Koruma
engelledi (doğru davranış), yanlış kapsamlı snapshot silinip doğru bayrakla
tekrar çekildi. **Çekim komutunu bayraksız çalıştırmak = kapsam uyuşmazlığı.**

## Transfer tespiti nasıl çalışıyor (mekanizma)

`bayi_snapshot` her gün 30.303 bayinin fotoğrafını tutar (kolon: `snapshot_gun`,
`bayi_lisans_no`, `dagitim_sirketi`, `lisans_durumu`, `il`). `transferleriTespitEt(bugun)`
bugünü **bir önceki snapshot günüyle** `FULL OUTER JOIN` eder ve dört değişimi yakalar:

| Tip | Koşul | İş anlamı |
|---|---|---|
| `dagitici_degisti` | `dagitim_sirketi` farklı | Bayi dağıtıcı değiştirdi (bizden gitti / bize geldi) |
| `yeni_bayi` | Dün yok, bugün var | Piyasaya yeni giriş |
| `ayrildi` | Dün var, bugün yok | EPDK kütüğünden düştü |
| `durum_degisti` | `lisans_durumu` farklı | ONAYLANDI → SONLANDIRILDI vb. |

⚠️ **Panel "0 kayıt" gösteriyorsa mekanizma bozuk değildir** — tek gün snapshot varsa
karşılaştıracak önceki gün yoktur ve fonksiyon `0` döner. İkinci gün oluşunca çalışır.
Panelde bu durum açıkça yazılı ("İlk snapshot alındı; ikinci günden itibaren…").

## TUZAK: null lisansNo (constraint) — ÇÖZÜLDÜ
Tüm-durumlarda bazı dağıtıcı VE bayi kayıtlarında lisansNo null (iptal/iade). PK null olamaz →
batch patlıyordu. dagiticilariKaydet + bayileriKaydet null lisansNo'yu atlar. dagıtıcı listesi
HER ZAMAN sadece ONAYLANDI (32 aktif); tumDurumlar yalnız bayi durumuna uygulanır (191 kapanmış
dağıtıcının tarihsel bayilerini çekmek çok uzun + düşük değer).

## GÜNCEL VERİ (2026-07-28): 32 dağıtıcı, 30.673 bayi (tüm durum), Parkoil 167 aktif, 15./32 sıra.
Analizler panelde: 300 sözleşme-bitecek (6 ay), 61 il'de Parkoil konumu + beyaz alan. panelSnapshot.ts
ile snapshot üretiliyor (panel/public/api/piyasa + bayiler).

## TUZAK: EPDK yanıtı UTF-8 (chunk sınırı) — ÇÖZÜLDÜ
`d += chunk` ile string biriktirince çok-baytlık Türkçe karakter chunk sınırında bozuluyordu
(ANON��M, Ş��RKETİ → 42 bozuk kayıt). Çözüm: chunk'ları Buffer olarak biriktir, sonda
`Buffer.concat().toString('utf8')`. epdkClient.ts düzeltildi, tablolar TRUNCATE + yeniden çekildi.

## NEREDE KALDIK (2026-07-23) — kod HAZIR, çekim/DB/panel YAPILMADI
- ✅ `core/schema_piyasa.sql` — dagiticilar, bayiler_epdk, bayi_snapshot, transferler tabloları (YAZILDI, migrate EDİLMEDİ)
- ✅ `core/epdkClient.ts` — epdk.dagiticilar() + epdk.bayiler() (throttle-korumalı, YAZILDI, typecheck EDİLMEDİ)
- ⬜ migrate: schema_piyasa.sql'i Supabase'e uygula
- ⬜ toplu çekim aracı: 32 dağıtıcı + her birinin bayileri → dagiticilar + bayiler_epdk + ilk snapshot
- ⬜ Panel: Piyasa modülü (dağıtıcı listesi, bayi arama, transfer raporu)
- ⬜ Günlük job: snapshot al → dünle karşılaştır → transferler tablosuna yaz
- ⬜ Parkoil dağıtıcısını tespit et

İlgili: [[epdk-mutabakat]], docs/EPDK_WEB_SERVISLERI.md

## Çekim otomatikleşti + tazelik göstergesi (2026-07-29)

**Sorun:** EPDK piyasa çekimi (`piyasaCek.ts`) hiçbir cron'da yoktu — elle çalıştırılıyordu.
Panelde yalnız **2 günlük** snapshot vardı (28-29 Tem) ve kullanıcı baktığı verinin bayat
olduğunu **göremiyordu**. Transfer tespiti günlük snapshot karşılaştırmasına dayandığı için
çekim yapılmayan her gün transfer takibi **tamamen duruyordu**.

**Çözüm:**
1. `.github/workflows/piyasa-cek.yml` — günde 1 kez 06:00 TR (03:00 UTC) + `workflow_dispatch`.
   İzlemeden **ayrı workflow**: bu çekim EPDK throttle'ı yüzünden 15-70 dk sürebiliyor, aynı
   job'a konsa 15 dakikalık izlemeyi bloke edip alarm bildirimlerini geciktirirdi.
   `timeout-minutes: 120`, `concurrency: piyasa-cek` (yarıda kesilirse yarım snapshot kalır).
2. `npm run piyasa` script'i — **`--tum-durumlar` bayrağı GÖMÜLÜ.**
   ⚠️ Bu bayrak zorunlu: snapshot'a kapsam yazılıyor ve `transferleriTespitEt` farklı
   kapsamdaki iki günü karşılaştırmayı reddediyor (doğru davranış). Mevcut snapshot'lar
   `tum` kapsamında; bayrak düşerse sadece ONAYLANDI çekilir (30.303 → 12.624) ve transfer
   tespiti **her gün** başarısız olur. (Bu hata 2026-07-29'da bir kez yapıldı.)
3. `tazelikVerisi()` (core/panelSorgu.ts) + `<TazelikSerit>` — 7 kaynağın yaşı panelde
   görünür, eşiği geçen kaynak ▲ + kalın + sr-only "güncel değil" ile işaretlenir.
   Eşikler: ASIS kaynakları 180 dk (cron 15 dk ama dış tetikleyici düşerse ~95 dk'ya
   çıkıyor), dolum 1440 dk, EPDK/snapshot 2880 dk (günde 1 çekim).

**Neden ModulBar'daki "Güncelleme" yetmiyordu:** o değer API **yanıtının** üretim zamanı —
isteği o an attığımız için her zaman "az önce" gösteriyor. Kullanıcının bilmesi gereken
arkadaki **kaynağın** yaşı. İkisi ayrı şey.

**Çıkış kodları** (job'un çarpı vermesi kasıtlı): 0 başarılı · 2 transfer tespiti yapılmadı
(bütünlük koruması) · 1 çekim hatası. 2 ve 1 sessizce "başarılı" görünmemeli.

## "Bize geliş" kolonu + DATE saat kayması bug'ı (2026-07-30)

### Kolon eklendi: sözleşme başlangıcı
Kullanıcı "bize geliş / bizden gidiş tarihi" istedi. EPDK'nın verdiği:

| İstenen | Kaynak | Durum |
|---|---|---|
| **Bize geliş** | `sozlesme_baslangic` (EPDK `dagiticiIleYapilanSozlesmeBaslangicTarihi`) | ✅ 167 aktif bayimizde **167/167 dolu** |
| Sözleşme bitiş | `sozlesme_bitis` | ✅ %100 |
| **Bizden gidiş** | — | ❌ **EPDK VERMİYOR** |
| Not/açıklama | `iptal_aciklama` | ❌ kaybedilen 49 bayide %0 (ONAYLANDI'da tanım gereği boş) |

Güvenilirlik: Turgut dağıtıcı lisansı 29.01.2025 başlıyor, en eski bayi sözleşmesi
11.02.2025 — lisanstan ÖNCE sözleşmesi olan bayi 0. Tutarlı.

**⚠️ KOLON ADI KOŞULLU:** rakip bayilerde bu tarih RAKİPLE yapılan sözleşmedir.
Bu yüzden başlık "Sadece bizim" filtresi açıkken **"Bize Geliş"**, tüm piyasa
görünümünde nötr **"Sözleşme Başl."** olur. Sabit "Bize Geliş" yazmak 30 bin rakip
bayi için yanlış bilgi olurdu.

### ❌ EPDK GEÇMİŞ TUTMUYOR — "gidiş tarihi" alınamaz
Canlı test: bayi dağıtıcı değiştirince EPDK kaydını **yeni dağıtıcıya taşıyor**, eskisinde
iz bırakmıyor. Turgut'un tüm-durum listesinde (207 kayıt) kaybedilen 49 bayiden **kesişim 0**.
Her lisans no yanıtta tam bir kez geçiyor.
→ Gidiş tarihi ancak KENDİ günlük snapshot'ımızla öğrenilir (`transferler.tespit_gun`),
28 Temmuz 2026'dan itibaren ve günlük çekim düzenli çalışırsa.

### ⚠️⚠️ BULUNAN BUG: pg sürücüsü DATE'i BİR GÜN GERİ kaydırıyordu

`pg` varsayılan olarak `DATE`'i yerel-saatli `Date` nesnesine çeviriyor:
`2025-02-11` → `2025-02-10T21:00:00Z` (TR = UTC+3). API JSON'a `toISOString()` ile
yazınca tarih **bir gün geriye kayıyordu**: DB'de 11 Şubat, API'de **10 Şubat**.

Ekranda fark GÖRÜNMÜYORDU çünkü `trTarih()` yerel saatle biçimlendirip günü geri
düzeltiyor — ama `<time dateTime="2025-02-10">` özniteliği (makine-okur değer,
ekran okuyucunun okuduğu) yanlış kalıyordu. Sözleşme takibinde bir günlük kayma
kabul edilemez.

**Çözüm:** `core/db.ts` başında `pg.types.setTypeParser(1082, v => v)` — DATE (OID 1082)
string olarak okunur. DATE saat taşımaz, string doğru davranış. TIMESTAMPTZ dokunulmadı
(o gerçekten an bilgisi taşır, Date olması doğru).

**Bu düzeltme TÜM tarih alanlarını etkiliyor:** sözleşme başlangıç/bitiş, lisans
tarihleri, iptal tarihi. Doğrulandı: API artık 2025-02-11 (DB'deki gerçek değer).
