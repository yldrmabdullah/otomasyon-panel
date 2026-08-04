# Dışarıdan tetikleme kurulumu (cron 15 dk'ya çıkarmak)

> **Neden gerekli:** GitHub Actions'ın `schedule` tetikleyicisi ücretsiz planda ciddi
> şekilde kısılıyor. `*/15 * * * *` yazmasına rağmen **ölçülen gerçek aralık ortalama
> 95 dakika** (61–202 dk arası, 2026-07-29 ölçümü). Tank eşiği 35 dk olduğu için bayi
> ortalama 1.5 saat, en kötü 3.5 saat sonra haber alıyordu.
>
> **Çözüm:** `workflow_dispatch` (elle/API tetikleme) **kısıtlanmıyor.** Ücretsiz bir
> dış zamanlayıcı her 15 dk'da GitHub API'sini çağırır → job gerçekten 15 dk'da bir koşar.
> YAML'daki `schedule` yedek olarak kalır (dış tetikleyici düşerse sistem tamamen durmasın).

---

## 1) GitHub token oluştur (dar kapsamlı)

**github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens
→ Generate new token**

| Alan | Değer |
|---|---|
| Token name | `otomasyon-panel-tetikleyici` |
| Expiration | 1 yıl (takvime not al — süresi dolunca tetikleme sessizce durur) |
| Repository access | **Only select repositories** → `yldrmabdullah/otomasyon-panel` |
| Permissions → Repository | **Actions: Read and write** (yalnız bu) |

⚠️ **Neden fine-grained ve tek repo:** klasik (classic) token tüm repolara `workflow`
yetkisi verir. Bu token bir dış servise yazılacak — mümkün olan en dar kapsam seçilir.
Sızarsa etki alanı yalnız bu reponun Actions'ı olur.

Token'ı kopyala (`github_pat_...`). Bir daha gösterilmez.

---

## 2) cron-job.org'da iş oluştur

[cron-job.org](https://cron-job.org) → ücretsiz üyelik → **Create cronjob**

| Alan | Değer |
|---|---|
| Title | `Parkoil otomasyon job` |
| URL | `https://api.github.com/repos/yldrmabdullah/otomasyon-panel/actions/workflows/otomasyon-job.yml/dispatches` |
| Schedule | Every 15 minutes |
| Request method | **POST** |

**Advanced → Headers** (üç satır):

```
Accept: application/vnd.github+json
Authorization: Bearer github_pat_BURAYA_TOKEN
X-GitHub-Api-Version: 2022-11-28
```

**Advanced → Request body:**

```json
{"ref":"master"}
```

> `ref` zorunlu — hangi branch'in workflow'u koşacağını söyler. Bizde `master`.
> `dry_run` göndermezsen workflow varsayılanı (`'0'` = bildirim gönder) geçerli olur.
> Test için: `{"ref":"master","inputs":{"dry_run":"1"}}`

Kaydet ve **Test run** ile dene. Başarılıysa HTTP **204 No Content** döner
(gövde boş olur — bu normal, hata değil).

---

## 2b) ⭐ İKİNCİ İŞ — mutabakat çekimi (günde 1 kez)

> **Bu ayrı bir cron-job.org işidir.** Yukarıdaki iş alarm turunu (bağlantı/tank)
> 15 dakikada bir tetikler. Bu ikincisi tank seviyesi + satış özetini günde bir
> kez çeker — mutabakat hesabının A/C/D kalemleri.

**Neden gerekli (2026-08-04 ölçümü):** `mutabakat-cek.yml` GitHub `schedule`'ına
bağlı ve gecikme ölçümü BOZUYOR. Snapshot **anlık** — kayda giren ölçüm saati =
cron'un koştuğu saat. Gerçek koşular:

```
21:00 UTC'ye kurulu ama 21:56'da koştu  → ölçüm TR 03:30
elle tetiklenen koşular                 → ölçüm TR 08:30, 12:00, 15:00
```

Ölçümler gün ortasına kayınca mutabakat aralığının ucu kayıyor, `satis_ozet`
günlük toplam olduğu için aralığa oturmuyor ve **669 tankın tamamı "zaman riski"**
işaretleniyor → panelde gösterilebilir tek satır kalmıyor.

Dış tetikleyici gecikmeyi kaldırır, ölçüm her gün aynı gece saatinde alınır.

| Alan | Değer |
|---|---|
| Title | `Parkoil mutabakat çekimi` |
| URL | `https://api.github.com/repos/yldrmabdullah/otomasyon-panel/actions/workflows/mutabakat-cek.yml/dispatches` |
| Schedule | **Every day at 00:15** (saat dilimi: Europe/Istanbul) |
| Request method | **POST** |

Headers ve body **birinci işle aynı** — aynı token kullanılabilir, yeni token
üretmeye gerek yok:

```
Accept: application/vnd.github+json
Authorization: Bearer github_pat_BURAYA_TOKEN
X-GitHub-Api-Version: 2022-11-28
```

```json
{"ref":"master"}
```

⚠️ **Saat 00:15 seçildi, keyfi değil:** TR gece yarısını 15 dakika geçe koşarsa
gün tam kapanmış olur ve ölçüm `KAPANIS_PENCERE_BAS=22` / `BIT=6` aralığına
rahatça düşer (bkz. `core/db.ts`). Daha erken (23:xx) çalışırsa günün son
saatlerindeki satış kaçar; daha geç (06:00 sonrası) çalışırsa `seviyeCek.ts`'in
gün-ortası koruması devreye girip **çekimi atlar**.

⚠️ **YAML'daki `schedule` KALSIN** — dış tetikleyici düşerse (token süresi dolar,
cron-job.org hesabı kapanır) sistem tamamen durmasın. İkisi aynı gün koşarsa
sorun olmaz: gün-ortası koruması ve `ON CONFLICT` üst üste yazmayı engelliyor.

### Kurulduktan sonra doğrulama

```bash
# Ölçüm saatleri gece penceresine düştü mü (TR saati)
gh run list --workflow=mutabakat-cek.yml --limit 5 --json createdAt,event
```

Panelde 3-4 gün sonra Mevzuat → mutabakat tablosunda "zaman riski" olmayan
satırlar görünmeye başlamalı.

---

## 3) Doğrula

```bash
gh run list --repo yldrmabdullah/otomasyon-panel --limit 5
```

`workflow_dispatch` olaylı koşular 15 dk aralıkla görünmeli. Gerçek aralığı ölçmek için:

```bash
gh run list --repo yldrmabdullah/otomasyon-panel --limit 20 \
  --json event,createdAt --jq '[.[] | select(.event=="workflow_dispatch") | .createdAt] | reverse | .[]'
```

---

## Alternatifler

| Servis | Not |
|---|---|
| **cron-job.org** | Ücretsiz, 1 dk'ya kadar, POST + header destekli — bu rehber bunu anlatıyor |
| **UptimeRobot** | Ücretsiz planda 5 dk aralık ama POST body desteği kısıtlı |
| **Kalıcı sunucu** | Zaten bir sunucunuz varsa `curl` + sistem cron'u en sağlamı |
| **GitHub ücretli plan** | `schedule` kısıtı hafifler ama garanti değil |

---

## ⚠️ Saat dilimi tuzağı (teşhis sırasında)

`gh run list` **UTC** gösterir, cron-job.org ise işin kendi saat diliminde
(**Europe/Istanbul = UTC+3**). "Koşu gelmedi" derken aslında 3 saat farkına
bakıyor olabilirsin. Referans olarak sunucu saatini kullan:

```bash
curl -sI https://api.github.com | grep -i "^date:"   # gerçek UTC
```

Not: bazı geliştirme kabuklarında `TZ=Europe/Istanbul date` çalışmaz (tzdata yok)
ve sessizce UTC döner — buna güvenme, yukarıdaki komutu kullan.

## Sorun giderme

| Belirti | Sebep |
|---|---|
| HTTP 404 | Token'ın repoya erişimi yok, ya da workflow dosya adı yanlış |
| HTTP 403 | Token'da **Actions: Read and write** izni yok |
| HTTP 422 | `ref` eksik veya branch adı hatalı (bizde `master`) |
| 204 dönüyor ama koşu yok | `concurrency` grubu nedeniyle önceki koşu hâlâ sürüyor olabilir |
| Bir gün sonra durdu | Token süresi doldu (fine-grained token'lar sessizce geçersizleşir) |

⚠️ **Token süresi dolduğunda tetikleme SESSİZCE durur** — GitHub uyarı maili atmaz.
Süre bitiş tarihini takvime not al. Kontrol: yukarıdaki `gh run list` komutu.
