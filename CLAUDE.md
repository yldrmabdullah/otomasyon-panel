# CLAUDE.md — Parkoil Otomasyon Paneli (AI rehberi)

> Bu alt-projede herhangi bir şey yapmadan önce bunu oku. Bu, ParkoilProd içinde **ayrı,
> bağımsız** bir otomasyon projesi. BFF (API/) veya b2b/ ile aynı DB'yi paylaşmaz.

## Bu proje nedir

Parkoil otomasyon ekibinin işini otomatikleştiren **izleme + alarm + (ileride) mükerrer iş**
platformu. Kaynak sistem: **ASIS POL** (`pol.parkoil.tr`) — istasyon otomasyon merkezi.

**İlk hedef (MVP):**
1. Bağlantısı kopuk istasyonları tespit (>3 saat veri yok) → mail + SMS (ekip + bayi).
2. Veri göndermeyen tankları tespit (>~35 dk; tank verisi 30 dk periyotlu) → mail + SMS.
3. Otomasyon ekibinin bakacağı izleme paneli.

**Uzun vade (aynı proje, gelişerek):** EPDK bildirimleri, A1A/A1B, aylık mutabakat gibi
mükerrer işler. Bunlar geldikçe **`docs/bilgi/`** altına mevzuat/iş bilgisi işlenir.

## ⭐ EN ÖNEMLİ KURAL: öğren ve kaydet

Bu proje kod kadar **iş bilgisi** de biriktirir. Sen (AI) bu işi öğrenerek yapmalısın:

- **Her oturumda önce [`docs/bilgi/`](docs/bilgi/) altındaki ilgili dosyaları oku.**
- **Yeni bir şey öğrendiğinde** (EPDK mevzuatı, mutabakat kuralı, ASIS tuzağı, bir bayi
  özel durumu) → ilgili `docs/bilgi/*.md` dosyasını **güncelle veya yeni dosya aç.**
- Kod değişikliğiyle birlikte bilgi de commit'lenir. Bilgi kaybolmaz, her yeni AI onu okur.
- Bilgi dosyaları **tarih + kaynak** içerir (kim söyledi / nerede doğrulandı).

## Mimari (özet)

```
GitHub Actions (cron ~15 dk) → Node job → ASIS SOAP çek → kural motoru
   → durum karşılaştır (Postgres) → mail(SMTP)+SMS(Netgsm) → Postgres'e yaz
Postgres (Supabase/Neon) ← job yazar, panel okur
Vercel panel (React) → Postgres'ten canlı durum + alarm geçmişi
```

Neden bu model: POL internete açık (Logo/DB gibi VPN arkasında değil) → GH Actions runner
erişebilir, kalıcı sunucu şart değil, ücretsiz. Durum stateless runner'da tutulamaz →
Postgres'te.

## Klasörler

- `core/` — ortak mantık: `asisClient.ts` (SOAP), `kurallar.ts` (alarm mantığı),
  `db.ts` (Postgres), `bildirim/` (mail + SMS), `tipler.ts`.
- `job/` — GH Actions entry noktası (`index.ts`): tek seferlik çek→değerlendir→bildir→yaz.
- `panel/` — React + Vite izleme paneli (Vercel).
- `docs/bilgi/` — ⭐ AI'ın biriktirdiği iş/mevzuat bilgisi.
- `docs/ASIS_METOTLARI.md` — ASIS SOAP 19 metot alan katalogu.
- `.github/workflows/` — cron job workflow.

## ASIS erişimi (kritik bilgiler)

- Gateway: `https://pol.parkoil.tr/Poservice/gateway.asmx`
- `guidKey` + `dagiticiKod=21` **her** çağrıda gider (guidKey secret'ta).
- Namespace: `http://www.asis.com.tr/`
- **Salt-okuma.** ASIS'e asla yazılmaz.
- **Tuzak (kanıtlı):** ASMX element SIRASINA duyarlı. `GetTankLastLevel` için doğru sıra
  `guidKey, dagiticiKod, IstasyonKod`. Ters sıra "Code=0 başarılı" ama BOŞ döner.
- Tarih alanları Türkiye yerel saati (timezone taşımaz) → UTC'ye çevirirken Europe/Istanbul
  kabul et, sunucu TZ'sine güvenme.
- Detaylı metot listesi: [`docs/ASIS_METOTLARI.md`](docs/ASIS_METOTLARI.md).
- Referans (port kaynağı): ana repodaki `API/Parkoil.Bff.Infrastructure/Otomasyon/Asis/AsisPolIstemcisi.cs`.

## EPDK eşleme anahtarı (kanıtlı)

Bayi ↔ ASIS istasyonu eşlemesi **EPDK lisans no** ile: ASIS `EPDKKod` = `BAY/939-82/{no}`.
`{no}` ayıklanır (`/(\d+)$` regex), bayinin EPDK no'suyla eşlenir. 1 bayi → N istasyon olabilir.

## Kurallar (kalıcı)

- **Push kullanıcı incelemesi olmadan YAPILMAZ.** Commit OK.
- Şifreler/guidKey/API anahtarı log veya komutta plaintext görünmesin. `.env` commit edilmez.
- Bu sistem **salt-okuma** — ASIS'e/Logo'ya yazmaz.
- Kullanıcıya "kopuk" gösterilen istasyon gerçekten kopuk olmalı (yanlış alarm bayiyi yorar).
- Bildirim spam'i önle: aynı açık alarm için tekrar tekrar mesaj atma (debounce).

## Komutlar

```
npm install
cp .env.example .env   # doldur
npm run db:migrate     # şemayı kur
npm run job            # tek seferlik çalıştır (DRY_RUN=1 ile bildirim atmadan test)
npm run typecheck
```

## Şüphede kaldığında

Ana ParkoilProd `CLAUDE.md` ve `b2b/docs/ASIS_POL_WEB_SERVISI.md` ASIS'in kaynak
referansıdır. Bu alt-proje onlardan bağımsız çalışır ama ASIS bilgisi oradan gelir.
