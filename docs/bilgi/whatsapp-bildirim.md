# WhatsApp bildirim — araştırma ve maliyet (2026-08-26)

> Kullanıcı sordu: *"bildirimlerde whatsapp ve mail kullanmak istiyorum"* ve
> *"whatsapp ücretli mi"*. Mail açıldı (bkz. `baglanti-tank-izleme.md`),
> WhatsApp **ertelendi** — kullanıcı kararı: "mail'i canlıya al, WhatsApp sonra".
>
> Projede WhatsApp'a dair KOD YOK. Bu dosya, işe başlanacağında sıfırdan
> araştırma yapılmaması için toplanan bilgi.

## Ücretli mi? EVET — ama bu hacimde önemsiz

- Meta **mesaj başına** ücret alır. **Aylık ücretsiz kota YOK** (Temmuz 2025'te kaldırıldı;
  eski "1.000 ücretsiz konuşma" modeli bitti).
- 4 kategori: **marketing / utility / authentication / service**.
  - Bizim alarm bildirimi = **utility** (operasyonel/işlemsel, pazarlama değil).
  - **service** kategorisi ücretsiz ama o yalnız müşteri sana yazdıktan sonraki yanıt.
- Türkiye: marketing ~**$0,0109**/mesaj; **utility oranı 1 Tem 2026'da %84 DÜŞÜRÜLDÜ**
  (utility marketing'in belirgin altında).
- ⚠️ **1 Ekim 2026'dan itibaren** Meta 24 saatlik pencere içindeki utility/service
  mesajlarını da ücretlendirmeye başlıyor → o tarihten sonra "pencere içi bedava"
  varsayımına dayanma.

**Ölçülen hacmimiz** (bkz. `baglanti-tank-izleme.md`): eşiği geçen gerçek bildirim
**ayda ~200**. Utility oranıyla **ayda birkaç dolar**. Maliyet karar kriteri DEĞİL.

## Gerçek maliyet: kurulum ve şablon zorunluluğu

Para değil, SÜRE ve KISIT:

1. **Serbest metin gönderemezsin.** Müşteri sana yazmadıysa yalnız **Meta onaylı
   şablonla** ("template") mesaj atılır. Her mesaj tipi için AYRI şablon başvurusu
   ve Meta onayı gerekir. Örn: `"{{1}} istasyonunuz {{2}} saattir veri göndermiyor"`.
2. Müşteri yazarsa 24 saatlik pencere açılır, o pencerede serbest metin gider.
3. Gerekenler: **Meta Business doğrulaması** + **WABA** (WhatsApp Business Account)
   + kalıcı access token + bir telefon numarası.
4. ⚠️ **O numara artık normal WhatsApp'ta kullanılamaz.** Ayrı/yeni numara ayrılmalı.
5. Kullanıcının seçtiği 4 kapsam (operasyonel alarm · piyasa/istihbarat · yönetim
   özeti · mevzuat/EPDK) → **her biri ayrı şablon** demek.

## Yol seçenekleri

| Yol | Kurulum | Not |
|---|---|---|
| **Netgsm/mevcut sağlayıcı** | En hızlı — SMS için zaten `core/bildirim/netgsm.ts` var | Netgsm'de WhatsApp Business hizmeti var mı, TEYİT EDİLMEDİ |
| **Meta Cloud API** (doğrudan) | Meta Business doğrulama + WABA + şablon onayı (günler) | Resmî, aracısız, uzun vadede en esnek |
| ~~whatsapp-web.js vb.~~ | — | ⛔ **KULLANILMAZ**: resmî değil, numara banlanabilir, kurumsal bildirimde kabul edilemez risk |

## Kod nereye eklenir (altyapı HAZIR)

`core/bildirim/` **kanal soyutlamalı** yazılmış — dağıtım mantığı yeniden yazılmaz:

```
core/bildirim/index.ts   → bildir(konu, mailGovde, smsMetin, hedef)   ← tek giriş
        ├── mail.ts      → SMTP            ✅ canlı
        ├── netgsm.ts    → SMS             kod var, kimlik yok
        └── whatsapp.ts  → EKLENECEK       ← yeni kanal buraya
```

`bildir()` şunları ZATEN yapıyor (WhatsApp da bedava devralır): hedef birleştirme +
tekilleştirme, `DRY_RUN`, `BAYIYE_GONDER` kapısı, bir kanalın hatası diğerini
durdurmaz, bozuk adres ayıklama.

Eklenecekler:
1. `core/bildirim/whatsapp.ts` — şablon gönderimi (`sablonKod` + parametre dizisi).
2. `config.whatsapp` — token/numara/`gecerli` getter (mail/sms deseniyle aynı).
3. `bildir()` içine 3. kanal + `sonuc.waDenendi`.
4. Şablon metinleri: alarm mesajı serbest metin OLAMAZ → `smsMetin` doğrudan
   kullanılamaz, parametreli şablona dönüştürülmeli.

## Önce netleşmesi gerekenler (kod yazmadan)

- [ ] Netgsm'de WhatsApp Business hizmeti var mı? (varsa en kısa yol)
- [ ] WhatsApp için ayrılacak telefon numarası hangisi?
- [ ] Şablon metinleri — 4 kapsam için ayrı ayrı, Meta onayına gidecek hali
- [ ] Alıcı: ekip mi, bayi mi? (bayi = `BAYIYE_GONDER` kapısı + yanlış alarm riski)

## Kaynaklar
- Meta resmî fiyatlandırma: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- (Türkiye oranları rate card indirmesiyle alınıyor; blog özetleri güncel olmayabilir.)
