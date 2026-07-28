# Bilgi Tabanı — `docs/bilgi/`

Bu klasör, otomasyon işinin **iş bilgisini ve mevzuatını** tutar. Kod değil, **bilgi**.
Amaç: bu projeyi geliştiren/işleten her AI (ve insan) aynı bilgiye sahip olsun; kimse
sıfırdan başlamasın.

## Nasıl kullanılır

- **Oku:** Bir işe başlamadan önce ilgili dosyayı oku (ör. mutabakat işi → `epdk-mutabakat.md`).
- **Yaz:** Yeni bir şey öğrendiğinde (kullanıcı anlattı, canlıda doğruladın, mevzuat okudun)
  → ilgili dosyayı güncelle veya yeni dosya aç.
- **Kaynak belirt:** Her önemli bilgiye tarih + kaynak ekle (kim söyledi / nerede doğrulandı).
  Örn: `> (2026-07-23, kullanıcı anlattı)` veya `> (canlı POL, GetStationList doğrulandı)`.

## Dosyalar

| Dosya | İçerik | Durum |
|-------|--------|-------|
| `asis-pol-notlar.md` | ASIS POL sistemi, iş akışı, tuzaklar | Başlangıç dolu |
| `baglanti-tank-izleme.md` | Bağlantı/tank izleme iş mantığı ve eşikler | Başlangıç dolu |
| `epdk-mutabakat.md` | EPDK mutabakat mevzuatı ve süreci | İskelet (ileride) |
| `a1a-a1b.md` | A1A / A1B bildirimleri | İskelet (ileride) |
| `bayi-ozel-durumlar.md` | Bayi bazlı istisnalar/notlar | Boş (geldikçe) |

## Yazım kuralı

Her dosya kısa, madde madde, aranabilir olsun. Uzun anlatı değil, **operasyonel gerçek**.
Bir bilgi yanlış çıkarsa düzelt/sil — eski yanlış bilgi bırakma.
