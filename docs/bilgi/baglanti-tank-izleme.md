# Bağlantı & Tank İzleme — İş Mantığı

## ⭐ Satış noktası tipleri (ASIS `IstasyonTip`)

> Kaynak: canlı ASIS `GetStationList.IstasyonTip`, 2026-07-28 · tip isimleri kullanıcı teyidi.

Parkoil'in satış noktaları **üç ayrı iş modeli**. Üçü de gerçek bayi/satış noktası:

| Tip (ASIS değeri) | Panel etiketi | Canlı sayı |
|---|---|---|
| `İstasyonlu` | İstasyon | 265 |
| `Köy pompası` | Köy pompası | 2 (ikisi de BURSA, aktif) |
| `Tanker` | **Köy tankeri** | 2 |

Ayrıca **istasyon dışı** satış da var (ASIS'te ayrı tip olarak görünmüyor — ileride
netleştirilecek).

⚠️ **Yanlış varsayıma düşme:** `Tanker-1`/`Tanker-2` kayıtları `EPDKKod=1` ve `durum=false`
olduğu için "dağıtıcının kendi aracı, gerçek bayi değil" diye yorumlanabilir — **yanlış.**
Bunlar **köy tankeri** satış noktaları (kullanıcı teyidi 2026-07-28). Panelden gizlenmez,
diğer tipler gibi normal izlenir; yalnız tip filtresiyle ayrıştırılır.

Panelde: `istasyonlar.tip` kolonu + İzleme'de "Tip" kolonu ve tip dropdown filtresi.
Rozet renkleri **nötr** (bu bir sınıflandırma, aciliyet değil — alarm kırmızısıyla yarışmaz).

## ⚠️ `online` ≠ `IstasyonDurum` (2026-07-28 düzeltmesi)

ASIS iki farklı şey döndürüyor, bunlar **karıştırılmamalı**:

| Alan | Anlamı | DB kolonu |
|---|---|---|
| `IstasyonDurum` (bool) | Kütükte **aktif kayıt** mı | `baglanti_durum.kayitli_aktif` |
| `SonTarih` tazeliği | **Gerçekten veri geliyor mu** | `baglanti_durum.online` |

**Bulunan bug:** `onlineDurumlar()` `online: i.durum` yazıyordu, yani `IstasyonDurum`'u
"online" sayıyordu. Sonuç: panel **"180 Online"** gösterirken o istasyonların son verisi
**5 gün öncesiydi**. Kullanıcıya canlı gösterilen veri canlı değildi.

Düzeltme sonrası canlı: **172 gerçek online**, 179 kütükte aktif → aradaki **7 istasyon
"kayıtlı aktif ama veri gelmiyor"** (eskiden bunlar Online görünüyordu).

**Kural motorunda kritik incelik:** `baglantiKopuklari()` içinde `!d.online` ile eleme
YAPILMAZ — `online` artık "veri taze mi" demek, kopuk istasyon zaten `online=false` olur ve
bu filtre **tüm kopuk alarmlarını susturur.** Elemek için `kayitliAktif` kullanılır (kütükte
pasif noktayı arayıp rahatsız etmemek için).

Kategori sıralamasında da `kayitli_aktif IS FALSE` → `kapandi` kontrolü, EPDK kontrolünden
**önce** gelir: ASIS bizim için pasif işaretlemişse EPDK'da hâlâ ONAYLANDI görünse bile
"kopuk" diye alarm üretmek yanlış alarmdır.

## ⚠️ `IstasyonKod='0'` → 5 bayi izlemeden düşüyordu (2026-07-28)

ASIS'te **5 istasyonun `IstasyonKod` alanı `0`** (atanmamış). `istasyon_kod` PK olduğu için
upsert'te birbirlerini eziyorlardı → 269 istasyondan yalnız **265'i** DB'ye giriyordu ve
**4 gerçek bayi izlemeden tamamen düşmüştü**: MERTAY, ASTEK, ÇAYIRPINAR (×2). Bağlantıları
kopsa kimse görmezdi — panelin var oluş sebebine aykırı.

Çözüm: `core/asisClient.ts` → `istasyonKimlik()`. Kod yok/`0` ise EPDK no'dan stabil
`E-{no}` kimliği üretir (EPDK no her bayide tekil ve sabit, snapshot'lar arası tutarlı).
Son çare `T-{TIstasyonID}`. Hiçbiri yoksa kayıt **atlanır ve loglanır** (sessizce ezmek yerine).

Doğrulama: DB artık ASIS ile birebir **269 = 269**. Eski bug'ın kalıntısı `kod='0'` satırı
silindi (ilişkili alarm/tank sıfırdı; aynı bayi `E-08690` olarak mevcut).

**Ders:** dış sistemden gelen "kod" alanının tekil olduğunu varsayma — upsert öncesi
tekillik doğrulanır, çakışma sessizce veri kaybına dönüşür.

## İki farklı sorun tipi

### 1. Bağlantı kopuk (istasyon seviyesi)
İstasyon POL'e hiç veri göndermiyor (offline). Belirti: `IstasyonOnlineDurum` → offline
veya `SonVeriTarihi` çok eski.

- **Eşik (varsayılan):** son veri > **3 saat** önce → kopuk say (env: `KOPUK_ESIK_SAAT`).
  > (2026-07-23, kullanıcı) "örnek olarak 3-4 saati geçmiş kullanıcılar" → 3 saat başlangıç.
- **Kaynak:** `GetStationList.SonTarih`.
  > **DÜZELTME 2026-07-29:** Eskiden buraya "IstasyonOnlineDurum boş dönüyor" yazılıydı;
  > **yanlıştı** — metot çalışıyor (179 kayıt), sorun parametre adıydı (`<Key>` şart).
  > Ama kaynak yine SonTarih kalıyor, iki sağlam sebeple: (1) IstasyonOnlineDurum'un
  > `SonVeriTarihi` alanı **her kayıtta boş** → eşik hesabı yapılamaz; (2) listede
  > **179** istasyon var, kütükte **268** → yokluğu "offline" saymak ~90 yanlış alarm
  > üretir. IstasyonOnlineDurum'u kopukluk kaynağı olarak DEĞİL, ek teşhis verisi
  > (`IP`, `TankVersiyon`, `PompaVersiyon`) olarak kullan.
- **Pasif filtresi (KRİTİK):** son veri > `PASIF_ESIK_GUN` (varsayılan 7) gün ise istasyon
  "pasif/ölü" sayılır, alarm ATILMAZ. Yoksa aylardır kapalı ~90 kayıt her turda alarm üretir.
  Ayrıca `kayitliAktif=false` (ASIS kütüğünde pasif) istasyonlara da alarm yok — bkz yukarıdaki
  `online` ≠ `IstasyonDurum` bölümü, burada `online` ile eleme yapmak alarmları susturur.
- **Kim çözer:** Sorun bayideyse bayi, bayilik dışıysa POL. Ama önce *tespit* + *haber ver*.
- **Hedef:** Hem otomasyon ekibi hem **bayi** (çoğu bayi takip etmiyor).

### 2. Tank veri yok (tank seviyesi)
Bağlantı var (istasyon online) ama bir/birkaç/tüm tank veri göndermiyor.

- **Eşik (varsayılan):** tank son ölçümü > **35 dk** önce → veri yok say
  (env: `TANK_VERI_ESIK_DK`). Tank verisi 30 dk periyotlu → 35 dk tolerans.
- **Hedef:** Ekip + bayi (SMS).

## Alarm yaşam döngüsü

```
AÇIK yok + eşik aşıldı        → alarm AÇ, ilk bildirimi gönder
AÇIK var + eşik hâlâ aşılı    → tekrar-bildirim aralığı geçtiyse hatırlat (debounce)
AÇIK var + durum düzeldi      → alarm KAPAT, "düzeldi" bildirimi (opsiyonel)
```

- **Debounce:** Aynı açık alarm için varsayılan **6 saatte bir** hatırlatma
  (env: `TEKRAR_BILDIRIM_SAAT`). Her job turunda spam ATMA.

## Bildirim kanalları

- **Mail:** SMTP. Ekip dağıtım listesi + ilgili bayinin epostası.
- **SMS:** Netgsm. Bayi telefonu + (opsiyonel) ekip nöbetçi telefonu.
- **DRY_RUN=1:** hiçbir şey göndermez, sadece loglar (test).

## GitHub Actions (canlı çalışma) — kurulum notları

Repo: **`yldrmabdullah/otomasyon-panel`**, branch `master`, cron `*/15 * * * *`.

⚠️ **Bu alt-proje KENDİ reposu olarak yayınlandı** — `package.json`, `core/`, `job/` repo
**kökünde**. Workflow'da `otomasyon-panel/` öneki KULLANILMAZ. (2026-07-28/29 tarihinde bu
önek yüzünden job 15 dakikada bir `setup-node` adımında ~15 sn'de düşüyordu:
`Some specified paths were not resolved, unable to cache dependencies`. Bir gün boyunca
**hiçbir alarm bildirimi gitmedi** ve fail mailleri yığıldı.)

**Ders:** cron'un "kurulu olması" çalıştığı anlamına gelmez. Yeni bir zamanlanmış iş
kurulduğunda ilk gerçek koşu **teyit edilir** (`gh run list`), yalnız YAML'ın doğru
görünmesine güvenilmez. Fail sessiz değildi — mail atıyordu — ama kimse bakmıyordu.

### ⚠️ GH Actions cron GERÇEKTE 95 dk'da bir çalışıyor (ölçüldü 2026-07-29)

YAML `*/15 * * * *` diyor ama **gerçek aralıklar: 61, 62, 78, 80, 84, 88, 105, 202 dk
→ ortalama 95 dk.** GitHub ücretsiz planda sık zamanlanmış işleri ciddi şekilde kısıyor
(kuyruğa alır, atlar). Bu bir yapılandırma hatası değil, platform sınırı.

**Sonucu:** tank eşiği 35 dk ama kontrol ortalama 95 dk'da bir → bir tank veri göndermeyi
kestiğinde bayi **ortalama ~1.5 saat, en kötü 3.5 saat** sonra haber alıyor. "30 dakikada
bir veri düşer, kopukluğu hızlı yakalayalım" hedefiyle çelişiyor.

**Seçenekler** (karar bekliyor):
| Yol | Gerçek aralık | Maliyet |
|---|---|---|
| Böyle bırak | ~95 dk | 0 |
| Dışarıdan tetikleme (cron-job.org vb. → `workflow_dispatch` API) | ~15 dk | 0 |
| GitHub'da ücretli plan | ~15 dk | aylık ücret |
| Kalıcı sunucu / Vercel Cron | dakika hassasiyeti | Vercel Cron ücretsiz planda günde 1 |

Not: `workflow_dispatch` ile ELLE tetikleme kısıtlanmıyor — dışarıdan tetikleme bu yüzden
çalışır. `gh workflow run` ile test edilen koşu 05:54'te sorunsuz geçti.

### Secret / Variable ayrımı

| GitHub Secret (sır) | GitHub Variable (sır değil) |
|---|---|
| `ASIS_GATEWAY`, `ASIS_GUID_KEY`, `ASIS_DAGITICI_KOD`, `DATABASE_URL` | `KOPUK_ESIK_SAAT=3`, `TANK_VERI_ESIK_DK=35`, `TEKRAR_BILDIRIM_SAAT=6`, `PASIF_ESIK_GUN=7` |
| `SMTP_*`, `NETGSM_*`, `EKIP_MAIL`, `EKIP_TELEFON` | |

Eşikleri variable yapmak, değiştirmek için kod/deploy gerektirmemesini sağlar.

⚠️ **`PASIF_ESIK_GUN` job env'ine geçmeyi UNUTMA.** İlk kurulumda eksikti; o filtre
olmadan aylardır kapalı ~90 istasyon her turda alarm üretir ve bayiler boş yere rahatsız
edilir (bkz yukarıdaki pasif filtresi).

### Bildirim durumu (2026-07-29)

`SMTP_*` ve `NETGSM_*` **bilinçli olarak tanımlı DEĞİL** → job çalışır, ASIS'ten çeker,
alarm tespit eder, DB'ye yazar, panel beslenir ama **bildirim göndermez**. Kimlikler
geldiğinde eklenir. Açmadan önce dikkat: o an açık olan tüm alarmlar ilk koşuda bayilere
gider (2026-07-29 itibarıyla 11 bildirim: 4 kopuk + 7 tank).

Elle test: `gh workflow run otomasyon-job.yml -f dry_run=1` → gerçek veri, sıfır mesaj.

## Yanlış alarmdan kaçın

> Kullanıcıya "kopuk" gösterilen istasyon gerçekten kopuk olmalı. Yanlış alarm bayiyi yorar
> ve güveni düşürür. Eşikleri gerçek POL raporuyla karşılaştırarak kalibre et.

## İleride

- Bakım/planlı kesinti penceresi (o sırada alarm atma).
- Bayi bazlı özel eşik (bazı istasyonlar doğası gereği aralıklı).
- Tekrarlayan kopukluk trendi (sık kopan istasyon raporu).
