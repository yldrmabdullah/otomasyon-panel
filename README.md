# Parkoil Otomasyon Paneli

ASIS POL istasyon otomasyon sisteminden veri çekip, **bağlantısı kopuk istasyonları** ve
**veri göndermeyen tankları** tespit eden; ekip + bayiye **mail + SMS** ile alarm veren
izleme sistemi + web paneli. İleride EPDK mutabakatı / A1A-A1B gibi mükerrer işlere genişler.

> AI ile çalışıyorsan önce [`CLAUDE.md`](CLAUDE.md) ve [`docs/bilgi/`](docs/bilgi/) oku.

## Mimari

```
GitHub Actions (cron ~15 dk) → job/ (Node) → ASIS SOAP çek → kural motoru
   → Postgres (durum/alarm) → mail(SMTP)+SMS(Netgsm)
panel/ (React, Vercel) → /api/durum → Postgres'ten okur
```

- **job/** — GH Actions'ta çalışan izleme+alarm işi (stateless).
- **core/** — ASIS istemci, kural motoru, DB, bildirim (ortak mantık).
- **panel/** — izleme paneli (Vercel). `panel/api/durum.ts` DB'den okur.
- **docs/bilgi/** — ⭐ iş/mevzuat bilgi tabanı (AI öğrendikçe günceller).

## Kurulum (job)

1. Node 20+.
2. `npm install`
3. `.env.example` → `.env` kopyala, doldur:
   - `ASIS_GUID_KEY` (POL güvenlik anahtarı)
   - `DATABASE_URL` (Supabase/Neon Postgres connection string)
   - SMTP + Netgsm bilgileri
4. Şemayı kur: `npm run db:migrate`
5. Test (bildirim ATMADAN): `.env`'de `DRY_RUN=1` → `npm run job`
6. Canlı: `DRY_RUN=0`.

## GitHub Actions

`.github/workflows/otomasyon-job.yml` her 15 dk'da bir çalışır + elle tetiklenebilir
(workflow_dispatch, `dry_run` girdisiyle).

> **Repo yapısı notu:** Bu alt-proje ParkoilProd içinde. GitHub Actions workflow'ları repo
> KÖKÜNDEKİ `.github/workflows/`'ten çalışır. Eğer bu klasör kendi başına bir repo olarak
> push edilirse dosya doğru yerde. ParkoilProd tek repo olarak push edilirse workflow'u
> repo köküne taşı (`working-directory: otomasyon-panel` zaten ayarlı).

**Gerekli Secrets:** `ASIS_GATEWAY`, `ASIS_GUID_KEY`, `ASIS_DAGITICI_KOD`, `DATABASE_URL`,
`SMTP_HOST/PORT/USER/PASS/FROM`, `EKIP_MAIL`, `NETGSM_USERCODE/PASSWORD/HEADER`, `EKIP_TELEFON`.
**Opsiyonel Variables:** `KOPUK_ESIK_SAAT`, `TANK_VERI_ESIK_DK`, `TEKRAR_BILDIRIM_SAAT`.

## Panel (Vercel)

```
cd panel
npm install
npm run dev     # local geliştirme
```

Vercel'e deploy: `panel/` klasörünü Vercel projesi olarak bağla. `DATABASE_URL` env'ini
Vercel'e ekle. `panel/api/durum.ts` serverless function olarak DB'den okur.

## Alarm mantığı (özet)

| Alarm | Koşul | Eşik (varsayılan) |
|-------|-------|-------------------|
| Bağlantı kopuk | offline VEYA son veri > eşik | 3 saat |
| Tank veri yok | online ama tank son ölçüm > eşik | 35 dk |

- Aynı açık alarm için **6 saatte bir** hatırlatma (spam önleme).
- Durum düzelince alarm kapanır.
- Detay: [`docs/bilgi/baglanti-tank-izleme.md`](docs/bilgi/baglanti-tank-izleme.md).

## Bilinen açık noktalar

- **Bayi iletişim (mail/telefon):** POL'de olduğu söylendi; hangi SOAP metodunda döndüğü
  doğrulanacak. Doğrulanana kadar `bayi_iletisim` tablosundan beslenir (kod bağımsız).
- **`IstasyonOnlineDurum` alan adları:** canlı yanıtla doğrulanacak (istemci esnek yazıldı).
- Bkz `docs/bilgi/asis-pol-notlar.md`.
