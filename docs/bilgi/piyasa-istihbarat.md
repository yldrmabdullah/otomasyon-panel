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
İdeal: piyasaCek.ts çekim EKSİK biterse (hataliDagitici>0 veya işlenen<beklenen) o günün
snapshot'ını yazmasın/işaretlesin — TODO.

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
