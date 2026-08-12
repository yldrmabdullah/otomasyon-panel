# POL (PetechOnline) Rapor Haritası

> **Kaynak:** Kullanıcının 2026-08-12'de yaptığı GENEL TUR (35 sayfa, 23 Excel indirme,
> 62 export POST yakalandı). Amaç: "nerede ne var" bilgisini kalıcı kılmak — her yeni işte
> sıfırdan POL keşfi yapmamak.
>
> **Giriş (kanıtlı):** CAPTCHA/2FA YOK. Saf-HTTP: `CheckLogin` AJAX → `uID` al →
> `form1.__ARG = "listID;uID"` + `kadi`/`sifre`/`hdnBtnName=MsSql2005_1` → `form1.submit()`.
> Playwright'ta da aynı akış (bkz. `araclar/a3Kiyas.mts`, `uzlasCek.mts`, `dissatisCek.mts`).

## ⭐ İNDİRME AKIŞI — otomatikleştirmenin anahtarı

Her raporun Excel indirme davranışı FARKLI. Tur verisinden çıkarıldı:

- **"tek tık"** → FA excel ikonuna (`i.fa-file-new_excel_2019`) tıkla, indirme başlar.
  ⚠️ Ardından Raporla'ya BASMA — akışı bozar (A5'te bu yüzden takılmıştım).
- **"Raporla"** → önce filtre/export tipi, sonra `AsisButton1` ("Raporla") submit'i indirir.
- **tarih** → `dtpTarih_Date1` / `_Date2` inputları, format `D/MM/YYYY` (gün tek haneli olabilir).
- **dönem** → `ddlDonemAd...cmbAlt` combo (18=2026 Temmuz, 19=Ağustos…). ⚠️ Bazı sayfalarda
  (İstasyon Dönemleri) combo postback tetiklemiyor — grid güncellenmiyor, ÇÖZÜLMEDİ.

| Rapor | Yol | Filtre | İndirme | Excel alındı | Kolon |
|---|---|---|---|---|---|
| Tablo A5 - Akaryakıt İstasyonu Fiyat Takibi | `EpdkModulu/Epdk2020/AgHizmeti/A5.aspx` | tarih | tek tık | ✔ | 18 |
| Tablo A1a - Istasyon Otomasyon Sistemi | `EpdkModulu/Epdk2020/AgHizmeti/A1a.aspx` | tarih | Raporla | ✔ | 30 |
| Tablo A1b - Düzeltilmiş Otomasyon Sistemi | `EpdkModulu/Epdk2020/AgHizmeti/A1b.aspx` | tarih | tek tık |  | 30 |
| Tablo A1c - İstasyon Otomasyon Sistemi Stok Durumu | `EpdkModulu/Epdk2020/AgHizmeti/A1c.aspx` | tarih | Raporla |  | 18 |
| Tablo A2 - Tarımsal Amaçlı Satış Tankeri | `EpdkModulu/Epdk2020/AgHizmeti/A2.aspx` | tarih | tek tık |  | 27 |
| A3 Aylık Satış | `EpdkModulu/Epdk2020/AgHizmeti/A3A.aspx` | tarih | tek tık | ✔ | 25 |
| UE-1 - Detaylı İstasyon Otomasyon Sistemi Raporu | `EpdkModulu/Epdk2020/UzaktanErisim/UE1T.aspx` | tarih | tek tık | ✔ | 20 |
| UE-4D- Detaylı Günlük Bayi Denetim Raporu | `EpdkModulu/Epdk2020/UzaktanErisim/UE4D.aspx` | tarih | tek tık | ✔ | 30 |
| UE-4T-Detaylı Günlük Bayi Toplu Raporu | `EpdkModulu/Epdk2020/UzaktanErisim/UE4T.aspx` | tarih | tek tık | ✔ | 30 |
| UE5 Satış Raporu | `EpdkModulu/Epdk2020/UzaktanErisim/UE5S.aspx` | tarih | tek tık | ✔ | 18 |
| UE-1 - Log | `EpdkModulu/Epdk2020/UzaktanErisim/UE1TLog.aspx` | tarih | tek tık | ✔ | 20 |
| E-2 Bayi Köy/Demiryolu Pompası Bilgisi | `EpdkModulu/Epdk2015/BilgiSistemi/E2KPBilgisi.aspx` | — | tek tık | ✔ | 14 |
| E-4 Tadilat Başlama Beyanı | `EpdkModulu/Epdk2015/BilgiSistemi/E4TadilatBaslama.aspx` | tarih | tek tık |  | 13 |
| E-6 Aykırılık Beyanı | `EpdkModulu/Epdk2015/BilgiSistemi/E5TadilatBitis.aspx` | tarih | tek tık |  | 13 |
| E-6 Aykırılık Beyanı | `EpdkModulu/Epdk2015/BilgiSistemi/E6AykirilikBeyani.aspx` | tarih | tek tık |  | 13 |
| E-7 Uzaktan Erişim ve Web Servis Bilgileri | `EpdkModulu/Epdk2015/BilgiSistemi/E7UEBilgileri.aspx` | — | tek tık |  | 4 |
| Bayiler | `EpdkModulu/AlinanBilgiler/Bayiler.aspx` | — | Raporla | ✔ | 13 |
| Pompa Listesi | `EpdkModulu/AlinanBilgiler/KPompalar.aspx` | — | Raporla | ✔ | 13 |
| Tankerler | `EpdkModulu/AlinanBilgiler/Tankerler.aspx` | — | Raporla | ✔ | 5 |
| Epdk Ürün Bilgileri | `EpdkModulu/AlinanBilgiler/EpdkUrunBilgileri.aspx` | — | Raporla | ✔ | 3 |
| Dolum Eşleşme | `EpdkModulu/Epdk2015/Raporlar/DolumEslesme.aspx` | tarih | tek tık | ✔ | 9 |
| Saha Bilgisi Raporu | `EpdkModulu/Epdk2015/Raporlar/SahaBilgisiRaporu.aspx` | tarih | tek tık |  | 16 |
| Sözleşme Aralıkları | `EpdkModulu/Epdk2015/Raporlar/SozlesmeAralik.aspx` | tarih | Raporla |  | 10 |
| Fark Dolum | `EpdkModulu/Epdk2015/Raporlar/FarkDolum.aspx` | tarih | Raporla | ✔ | 11 |
| Epdk Servis Durum | `EpdkModulu/Epdk2015/Raporlar/EpdkServisOnlineDurum.aspx` | tarih | Raporla | ✔ | 6 |
| Pompa Tank Eşlestirme | `EpdkModulu/Epdk2015/Raporlar/PompaTankEslestirme.aspx` | tarih | tek tık | ✔ | 14 |
| Dolum Eşleşme Takip | `EpdkModulu/Epdk2015/Raporlar/DolumEslesmeTakip.aspx` | tarih | tek tık | ✔ | 18 |
| İstasyon Dönemleri | `EpdkModulu/IstasyonDonemleri.aspx` | dönem | tek tık | ✔ | 10 |
| İstasyon Günlük Ürün Analizi | `OtomasyonModulu/UrunRaporlari/IstasyonAnaliz.aspx` | tarih | tek tık | ✔ | 10 |
| Aylık Toplam Satış | `OtomasyonModulu/UrunRaporlari/UrunSehirSatisRaporu.aspx` | tarih | tek tık | ✔ | 14 |
| Aylık Alım Satım | `OtomasyonModulu/IstasyonRaporlari/AylikAlimSatim.aspx` | tarih | Raporla | ✔ | 16 |
| İstasyon Ürün Satış Aylık | `OtomasyonModulu/UrunRaporlari/IstasyonUrunSatisUrunPvt.aspx` | tarih | tek tık | ✔ | 21 |


---

## Hangi rapor ne işe yarar (iş değeri notları)

**Mutabakat / kaçak analizi:**
- **UE-4D / UE-4T** — "Başlangıç/Bitiş Tank Stok Miktarı", "Tankın Bağlı Olduğu Pompa-Tabanca",
  tank bazında günlük denetim. ⭐ Kaçak/sızıntı analizi için en zengin kaynak.
- **Fark Dolum** — irsaliye bazlı FARK kayıtları (negatif dolumlar = düzeltme kaydı).
- **Dolum Eşleşme / Dolum Eşleşme Takip** — "Eşleşme Durumu" kolonu → *dolum yansımaması*
  tespiti (bizden alınan tanka girmemiş). Faz 2'nin aradığı sinyal.
- **Aylık Alım Satım** — bayi bazında alım/satım özeti (yıl/ay).
- **İstasyon Dönemleri → Detay** — TAM mutabakat (Dağıtıcıdan Alınan / Kullanılan / Pompa /
  **Dış Satış** / Algılanan vs Eşleşen Tank Dolum / Dönem Dışı / Transfer / İade / Fire).
  ⚠️ Detay istasyon BAŞINA in-page açılıyor, toplu Excel'de YOK; dönem combo'su da
  tetiklenemedi → otomatikleştirilemedi (2026-08-12, 4 deneme).

**Fiyat:**
- **A5 - Akaryakıt İstasyonu Fiyat Takibi** — bayi × ürün × tarih × **Fiyat**. Web sitesindeki
  (parkoil.com.tr/data/fiyatlar-guncel.json — public, il/ilçe bazlı) fiyatla karşılaştırma için.
- **Tavan Fiyat Karşılaştırma** (Otomasyon Modülü → Ürün Raporları) — EPDK tavan fiyat kontrolü.

**Kütük / tanım:**
- **Bayiler · Pompa Listesi · Tankerler · Epdk Ürün Bilgileri** — referans kütükler.
- **E-2 Köy/Demiryolu Pompası** (enlem/boylam/kapasite), **E-7 UE ve Web Servis Bilgileri**.
- **Saha Bilgisi Raporu**, **Sözleşme Aralıkları**, **Pompa Tank Eşleştirme**.

**Bildirim / mevzuat:**
- **E-6 Aykırılık Beyanı** — "Kayıt Dışı İkmal", "İzinsiz Müdahale" → sorunun RESMİ bildirim kanalı.
- **E-4/E-5 Tadilat Başlama/Bitiş Beyanı**.
- **A1a/A1b/A1c** — istasyon otomasyon sistemi + düzeltilmiş + stok durumu (EPDK bildirim tabloları).
- **A2** — tarımsal amaçlı satış tankeri. **A3/A3A** — aylık satış (bkz. `a3Kiyas.mts`).
- **A4** — bayi dış satış (bkz. `dissatisCek.mts`).
- **Epdk Servis Durum** — EPDK bağlantı/şifre durumu.

---

## Zaten otomatikleştirilmiş olanlar

| Rapor | Araç | Tablo |
|---|---|---|
| A3 Aylık Satış Kontrol | `araclar/a3Kiyas.mts` | `mutabakat_a3` |
| Tank Uzlaştırma | `araclar/uzlasCek.mts` | `uzlastirma` |
| A4 Bayi Dış Satış | `araclar/dissatisCek.mts` | `uzlastirma_dissatis` |
| Tesis Dolum (Excel elle) | `araclar/polMutabakatImport.ts` | `mutabakat_irsaliye` |

## Ham tur verisi
Tam kolon listeleri ve filtre id'leri aşağıda. Yeni bir raporu otomatikleştirirken
buradaki kolon adları + indirme akışı tablosu başlangıç noktası olmalı.

### Tablo A5 - Akaryakıt İstasyonu Fiyat Takibi
`EpdkModulu/Epdk2020/AgHizmeti/A5.aspx`

Kolonlar (18): Gönderim Durumu · Epdk Sorgu · Bayi Lisans No · Köy /Demiryolu Pompa No · Akaryakıt Türü · Fiyat · Tarih · Otomasyon LisansNo · İst. Kod · İstasyon Adı · Bölge · Mıntıka · Gönderim Zamanı · Epdk Cevap · Sorumlu Kullanıcı · Marka · Muteahhit · Gönderim (Dün)

Filtreler: dtpTarih_dtpTarih_Date1, dtpTarih_dtpTarih_Date2, ddlGondermeDurumu_ddlGondermeDurumuFilter_ddlGondermeDurumuFiltercmbAlt, ddlEpdkSorgu_ddlEpdkSorguFilter_ddlEpdkSorguFiltercmbAlt, ddlIstasyonTip_ddlIstasyonTipFilter_ddlIstasyonTipFiltercmbAlt, TextboxEpdkKodu_TextboxEpdkKodutxt, KPNo_KPNotxt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc

### Tablo A1a - Istasyon Otomasyon Sistemi
`EpdkModulu/Epdk2020/AgHizmeti/A1a.aspx`

Kolonlar (30): Düzenleme · Durum · Epdk Sorgu · Tarih · Bayi Lisans No · Köy/Demiryolu <br/> Pompa No · Tank No · Tank Kapasitesi · Akaryakıt Türü · Gün Başı Stok · TankaDolum · Satış · Otomasyon LisansNo · İst. Kod · İstasyon Ad · Bölge · Mıntıka · Ertesi Gün Açılış · KS · Kriter1 Reel · Kriter 1 · K1 · Kriter2 Reel · Kriter 2 · K2 · Gönderme Zamanı · Paket Sayısı · POL Stok · POL Tanka Dolum · POL Satış

Filtreler: dtpTarih_dtpTarih_Date1, dtpTarih_dtpTarih_Date2, ddlGondermeDurumu_ddlGondermeDurumuFilter_ddlGondermeDurumuFiltercmbAlt, ddlDuzenlemeDurumu_ddlDuzenlemeDurumuFilter_ddlDuzenlemeDurumuFiltercmbAlt, TextboxEpdkKodu_TextboxEpdkKodutxt, KPNo_KPNotxt, txtTankNo_txtTankNotxt, ddlIstasyonTip_ddlIstasyonTipFilter_ddlIstasyonTipFiltercmbAlt, ddlKriter_ddlKriterFilter_ddlKriterFiltercmbAlt, ddlKriter1_ddlKriter1Filter_ddlKriter1FiltercmbAlt, ddlKriter2_ddlKriter2Filter_ddlKriter2FiltercmbAlt, IntervalTextboxesKriter1_IntervalTextboxesKriter1txtInterval_txtKucukAralik, IntervalTextboxesKriter1_IntervalTextboxesKriter1txtInterval_txtBuyukAralik, IntervalTextboxesFilter1_IntervalTextboxesFilter1txtInterval_txtKucukAralik, IntervalTextboxesFilter1_IntervalTextboxesFilter1txtInterval_txtBuyukAralik, IntervalTextboxesFilter2_IntervalTextboxesFilter2txtInterval_txtKucukAralik, IntervalTextboxesFilter2_IntervalTextboxesFilter2txtInterval_txtBuyukAralik, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc

### Tablo A1b - Düzeltilmiş Otomasyon Sistemi
`EpdkModulu/Epdk2020/AgHizmeti/A1b.aspx`

Kolonlar (30): Duzenleme · Durum · Sorgu · Tarih · İst. Kod · Bayi Lisans No · KPNo · Tank No · Tank Kapasitesi · Akaryakit Türü · Gün Başı Stok · TankaDolum · Satış · Ertesi Gün Açılış · Otomasyon LisansNo · KS · K1 Reel · Kriter 1 · K1 · K2 Reel · Kriter 2 · K2 · Paket Sayısı Düzeltme · Açıklama · Gönderme Zamanı · POL Stok · POL Tanka Dolum · POL Satış · Epdk Cevap · Düzenleme Yapan

Filtreler: dtpTarih_dtpTarih_Date1, dtpTarih_dtpTarih_Date2, ddlGondermeDurumu_ddlGondermeDurumuFilter_ddlGondermeDurumuFiltercmbAlt, ddlDuzenlemeDurumu_ddlDuzenlemeDurumuFilter_ddlDuzenlemeDurumuFiltercmbAlt, TextboxEpdkKodu_TextboxEpdkKodutxt, KPNo_KPNotxt, txtTankNo_txtTankNotxt, ddlIstasyonTip_ddlIstasyonTipFilter_ddlIstasyonTipFiltercmbAlt, ddlKriter_ddlKriterFilter_ddlKriterFiltercmbAlt, ddlKriter1_ddlKriter1Filter_ddlKriter1FiltercmbAlt, ddlKriter2_ddlKriter2Filter_ddlKriter2FiltercmbAlt, IntervalTextboxesKriter1_IntervalTextboxesKriter1txtInterval_txtKucukAralik, IntervalTextboxesKriter1_IntervalTextboxesKriter1txtInterval_txtBuyukAralik, IntervalTextboxesKriter2_IntervalTextboxesKriter2txtInterval_txtKucukAralik, IntervalTextboxesKriter2_IntervalTextboxesKriter2txtInterval_txtBuyukAralik, IntervalTextboxesKriter3_IntervalTextboxesKriter3txtInterval_txtKucukAralik, IntervalTextboxesKriter3_IntervalTextboxesKriter3txtInterval_txtBuyukAralik, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc

### Tablo A1c - İstasyon Otomasyon Sistemi Stok Durumu
`EpdkModulu/Epdk2020/AgHizmeti/A1c.aspx`

Kolonlar (18): Durum · Epdk Sorgu · Tarih · Bayi Lisans No · Köy/Demiryolu Pompa No · İstasyon Tip · Tank No · Akaryakıt Türü · Tank Kapasitesi · Stok Miktarı · Otomasyon LisansNo · İst. Kod · İstasyon Ad · Bölge · Mıntıka · Gönderme Zamanı · Epdk Cevap · Muteahhit

Filtreler: dtpTarih_dtpTarih_Date1, dtpTarih_dtpTarih_Date1Time1, dtpTarih_dtpTarih_Date2, dtpTarih_dtpTarih_Date2Time1, ddlGondermeDurumu_ddlGondermeDurumuFilter_ddlGondermeDurumuFiltercmbAlt, TextboxEpdkKodu_TextboxEpdkKodutxt, KPNo_KPNotxt, txtTankNo_txtTankNotxt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc

### Tablo A2 - Tarımsal Amaçlı Satış Tankeri
`EpdkModulu/Epdk2020/AgHizmeti/A2.aspx`

Kolonlar (27): Durum · Gönderim Durumu · Epdk Sorgu · Tarih · Bayi Lisans No · Akaryakıt Türü · Tanker Plaka No · Satış · Yapılan Dolum Miktarı · Dolum Yolu · Otomasyon LisansNo · Açıklama · İst. Kod · İstasyon Ad · Bölge · Mıntıka · Kriter Sonuç · Kriter 1 · K1 · Kriter 2 · K2 · Gönderme Zamanı · Epdk Cevap Düzeltme · Düzenleyen · Sorumlu Kullanıcı · Marka · Muteahhit

Filtreler: dtpTarih_dtpTarih_Date1, dtpTarih_dtpTarih_Date2, ddlGondermeDurumu_ddlGondermeDurumuFilter_ddlGondermeDurumuFiltercmbAlt, TextboxFilter1_TextboxFilter1txt, EpdkID_EpdkIDtxt, ddlEpdkSorgu_ddlEpdkSorguFilter_ddlEpdkSorguFiltercmbAlt, DropDownListFilterP1_DropDownListFilterP1Filter_DropDownListFilterP1FiltercmbAlt, DropDownListFilterP2_DropDownListFilterP2Filter_DropDownListFilterP2FiltercmbAlt, DropDownListFilterP3_DropDownListFilterP3Filter_DropDownListFilterP3FiltercmbAlt, IntervalTextboxesKriter1_IntervalTextboxesKriter1txtInterval_txtKucukAralik, IntervalTextboxesKriter1_IntervalTextboxesKriter1txtInterval_txtBuyukAralik, IntervalTextboxesKriter2_IntervalTextboxesKriter2txtInterval_txtKucukAralik, IntervalTextboxesKriter2_IntervalTextboxesKriter2txtInterval_txtBuyukAralik, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc

### A3 Aylık Satış
`EpdkModulu/Epdk2020/AgHizmeti/A3A.aspx`

Kolonlar (25): Durum · Epdk Sorgu · BayiLisansKodu · DagiticiFaturaTarihi · Dağıtıcı Fatura No · Akaryakıt Türü · Fatura Satış Miktarı · Dolum/Dış Satış Miktarı · Birim Fiyat · Plaka · Plaka Dorse · CikisTesis · SevkTesis · Otomasyon LisansNo · Açıklama · İst. Kod · İstasyon Ad · Bölge · Mıntıka · Gönderme Zamanı · Düzeltme Silme No · Epdk Cevap · Sorumlu Kullanıcı · Marka · Muteahhit

Filtreler: dtpTarih_dtpTarih_Date1, dtpTarih_dtpTarih_Date2, txEPDKKod_txEPDKKodtxt, txtIstasyonn_txtIstasyonntextboxAjax_ajaxInput, ddlSorumluKullanici_ddlSorumluKullaniciFilter_ddlSorumluKullaniciFiltercmbAlt, ddlGondermeDurumu_ddlGondermeDurumuFilter_ddlGondermeDurumuFiltercmbAlt, ddlEpdkSorgu_ddlEpdkSorguFilter_ddlEpdkSorguFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc

### UE-1 - Detaylı İstasyon Otomasyon Sistemi Raporu
`EpdkModulu/Epdk2020/UzaktanErisim/UE1T.aspx`

Kolonlar (20): Saat- 1 · Saat-2 · Bayi Lisans No · Köy/Demiryolu Pompa No · Tank No · Akaryakıt Türü · Stok Açılış · Stok Kapanış · Tank SeviyesiAzalma Miktarı · Tankın Bağlı Olduğu Pompa-Tabanca Numaraları · Satış · Zaman Damgası Tarihi · Indir · Kontrol · Geliş Zamanı · İstasyon Adı · Grup No · Tanka Dolum · Geçmişi · Muteahhit

Filtreler: dtp_Tarih_dtp_Tarih_Date1, dtp_Tarih_dtp_Tarih_Date1Time1, dtp_Tarih_dtp_Tarih_Date2, dtp_Tarih_dtp_Tarih_Date2Time1, ddlIstasyonTip_ddlIstasyonTipFilter_ddlIstasyonTipFiltercmbAlt, ddlSorumluKullanici_ddlSorumluKullaniciFilter_ddlSorumluKullaniciFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, clbEpdkIstasyon_clbEpdkIstasyon_cblAjaxSearch, clbEpdkIstasyon_clbEpdkIstasyon_selectInDiv, clbEpdkIstasyon_clbEpdkIstasyon_chktumu_chc, clbEpdkKP_clbEpdkKP_cblAjaxSearch, clbEpdkKP_clbEpdkKP_selectInDiv, clbEpdkKP_clbEpdkKP_chktumu_chc, ddl_DamgaDurum_ddl_DamgaDurumFilter_ddl_DamgaDurumFiltercmbAlt, ddl_ArizaDurum_ddl_ArizaDurumFilter_ddl_ArizaDurumFiltercmbAlt, txtTankFilter_txtTankFiltertxt, ddlDolumDurum_ddlDolumDurumFilter_ddlDolumDurumFiltercmbAlt, ddlvUrun_ddlvUrunFilter_ddlvUrunFiltercmbAlt, btn48Saat_btn48Saat_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt

### UE-4D- Detaylı Günlük Bayi Denetim Raporu
`EpdkModulu/Epdk2020/UzaktanErisim/UE4D.aspx`

Kolonlar (30): Tank No · Grup No · Akaryakıt Türü · Tankın Bağlı Olduğu Pompa-TabancaNumaraları[P-T] · BaşlangıçTank Stok Miktarı(litre)(A) · BitişTank Stok Miktarı(litre)(B) · Dolum Sırasındaki Satış Miktarı(litre)(C) · Dolum Miktarı(litre)(Tahmini Dolum+(C))(D) · UE-1'e Göre Satış(litre)(A-B+D) · UE-5'e göre Satış(litre) · Mutlak Fark(UE-1 ile UE-5) · Yüzdesel Mutlak Fark(UE-1 ile UE-5) · EPDK Kodu · İst. Kod · İstasyon Adı · Mıntıka · Bölge · Saat- 1 · Saat-2 · Bayi Lisans No · Tank No · Akaryakıt Türü · Stok Açılış · Stok Kapanış · Tank SeviyesiAzalma Miktarı · Bağlı Olduğu Pompa-Tabanca Numaraları[P-T] · Bayi Lisans No · İl · Tank No · Pompa No

Filtreler: dtp_Tarih_dtp_Tarih_Date1, txtIstasyon_txtIstasyontextboxAjax_ajaxInput, btn48Saat_btn48Saat_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt, NavigationToolBar1_Item2_Item2cmbAlt, NavigationToolBar3_Item2_Item2cmbAlt

### UE-4T-Detaylı Günlük Bayi Toplu Raporu
`EpdkModulu/Epdk2020/UzaktanErisim/UE4T.aspx`

Kolonlar (30): Tarih · Bayi Lisans no · Tank No · Grup No · Akaryakıt Türü · Tankın Bağlı Olduğu Pompa - Tabanca Numaraları[P-T] · BaşlangıçTank Stok Miktarı(litre)(A) · BitişTank Stok Miktarı(litre)(B) · Dolum SırasındakiSatış Miktarı(litre)(C) · Dolum Miktarı(litre)(Tahmini Dolum+(C))(D) · UE-1'e Göre Satış(litre)(A-B+D) · UE-5'e göreSatış(litre) · Mutlak Fark(UE-1 ile UE-5) · YüzdeselMutlak Fark(UE-1 ile UE-5) · İst. Kod · İstasyon Adı · Mıntıka · Bölge · Sorumlu Kullanıcı · Muteahhit · Saat- 1 · Saat-2 · Bayi Lisans No · Tank No · Akaryakıt Türü · Stok Açılış · Stok Kapanış · Tank SeviyesiAzalma Miktarı · Bağlı Olduğu Pompa-Tabanca Numaraları[P-T] · Bayi Lisans No

Filtreler: dtp_Tarih_dtp_Tarih_Date1, dtp_Tarih_dtp_Tarih_Date2, txtTankNo_txtTankNotxt, ddlSorumluKullanici_ddlSorumluKullaniciFilter_ddlSorumluKullaniciFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, chkTeblig_chc, clbEpdkIstasyon_clbEpdkIstasyon_cblAjaxSearch, clbEpdkIstasyon_clbEpdkIstasyon_selectInDiv, clbEpdkIstasyon_clbEpdkIstasyon_chktumu_chc, chcUrun_chcUrun_chktumu_chc, chcUrun_chcUrun_chk0_chc, chcUrun_chcUrun_chk1_chc, chcUrun_chcUrun_chk2_chc, chcUrun_chcUrun_chk3_chc, chcUrun_chcUrun_chk4_chc, chcUrun_chcUrun_chk5_chc, chcUrun_chcUrun_chk6_chc, chcUrun_chcUrun_chk7_chc, chcUrun_chcUrun_chk8_chc, chcUrun_chcUrun_chk9_chc

### UE5 Satış Raporu
`EpdkModulu/Epdk2020/UzaktanErisim/UE5S.aspx`

Kolonlar (18): Bayi Lisans No · Il · Tank No · Pompa No · Tabanca · Akaryakıt Türü · Plaka · Satış Başlangıç Tarihi · Satış Bitiş Tarihi · Satış Türü · Birim Fiyat · Satış Miktarı · Zaman Damgası Tarihi · Indir · Kontrol · İst. Kod · İstasyon Adı · Muteahhit

Filtreler: dtp_Tarih_dtp_Tarih_Date1, dtp_Tarih_dtp_Tarih_Date1Time1, dtp_Tarih_dtp_Tarih_Date2, dtp_Tarih_dtp_Tarih_Date2Time1, txtTankFilter_txtTankFiltertxt, Plaka_Plakatxt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, clbEpdkIstasyon_clbEpdkIstasyon_cblAjaxSearch, clbEpdkIstasyon_clbEpdkIstasyon_selectInDiv, clbEpdkIstasyon_clbEpdkIstasyon_chktumu_chc, ddlDamgaDurum_ddlDamgaDurumFilter_ddlDamgaDurumFiltercmbAlt, ddlIstasyonTip_ddlIstasyonTipFilter_ddlIstasyonTipFiltercmbAlt, ddlCariTip_ddlCariTipFilter_ddlCariTipFiltercmbAlt, ddlSorumluKullanici_ddlSorumluKullaniciFilter_ddlSorumluKullaniciFiltercmbAlt, chcUrun_chcUrun_chktumu_chc, chcUrun_chcUrun_chk0_chc, chcUrun_chcUrun_chk1_chc, chcUrun_chcUrun_chk2_chc, chcUrun_chcUrun_chk3_chc, chcUrun_chcUrun_chk4_chc

### UE-1 - Log
`EpdkModulu/Epdk2020/UzaktanErisim/UE1TLog.aspx`

Kolonlar (20): Saat- 1 · Saat-2 · Geliş Zamanı · EPDK Kodu · İst. Kod · İstasyon Adı · Mıntıka · Bölge · Tank No · Grup No · Akaryakıt Türü · Stok Açılış · Tanka Dolum · Stok Kapanış · Tank SeviyesiAzalma Miktarı · Tankın Bağlı Olduğu Pompa-Tabanca Numaraları · Damga Tarihi · Indir · Kontrol · Muteahhit

Filtreler: dtp_Tarih_dtp_Tarih_Date1, dtp_Tarih_dtp_Tarih_Date1Time1, dtp_Tarih_dtp_Tarih_Date2, dtp_Tarih_dtp_Tarih_Date2Time1, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, clbEpdkIstasyon_clbEpdkIstasyon_cblAjaxSearch, clbEpdkIstasyon_clbEpdkIstasyon_selectInDiv, clbEpdkIstasyon_clbEpdkIstasyon_chktumu_chc, chcUrun_chcUrun_chktumu_chc, chcUrun_chcUrun_chk0_chc, chcUrun_chcUrun_chk1_chc, chcUrun_chcUrun_chk2_chc, chcUrun_chcUrun_chk3_chc, chcUrun_chcUrun_chk4_chc, chcUrun_chcUrun_chk5_chc, chcUrun_chcUrun_chk6_chc, chcUrun_chcUrun_chk7_chc, chcUrun_chcUrun_chk8_chc, chcUrun_chcUrun_chk9_chc, chcUrun_chcUrun_chk10_chc

### E-2 Bayi Köy/Demiryolu Pompası Bilgisi
`EpdkModulu/Epdk2015/BilgiSistemi/E2KPBilgisi.aspx`

Kolonlar (14): Bayi Lisans No · Enlem · Boylam · Tank Sayısı · Toplam Kapasite · Pompa Sayısı · Tabanca Sayısı · Hizmet Alınan Otomasyon Şirketi · Köy/Demiryolu <br/> Pompa No · İstasyon Kod · İstasyon Adı · Bölge · Mıntıka · Muteahhit

Filtreler: txEPDKKod_txEPDKKodtxt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc, IstSecim_clbBolge_chk6_chc, IstSecim_ddlIstasyon_ddlIstasyontextboxAjax_ajaxInput, ReportButton1_ReportButton1_innerButton, btnSonBildirim_btnSonBildirim_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt

### E-4 Tadilat Başlama Beyanı
`EpdkModulu/Epdk2015/BilgiSistemi/E4TadilatBaslama.aspx`

Kolonlar (13): Bildirim Yap · Bayi Lisans No · Belgeyi Düzenleyen Kurum · Belge Tarihi · Tadilata Başlama Tarihi · Açıklama · Baslangıç Bildirim · Bildirim Tarihi · İstasyon Kod · İstasyon Adı · Bölge · Mıntıka · Muteahhit

Filtreler: DatetimePicker1_DatetimePicker1_Date1, DatetimePicker1_DatetimePicker1_Date2, txEPDKKod_txEPDKKodtxt, ddlIslemDurum_ddlIslemDurumFilter_ddlIslemDurumFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc, IstSecim_clbBolge_chk6_chc, IstSecim_ddlIstasyon_ddlIstasyontextboxAjax_ajaxInput

### E-6 Aykırılık Beyanı
`EpdkModulu/Epdk2015/BilgiSistemi/E5TadilatBitis.aspx`

Kolonlar (13): Bildirim Yap · Bayi Lisans No · Aykırılık Tespit Tarihi · Kayıt Dışı İkmal · İzinsiz Müdahele · Açıklama · Bildirim Tarihi · İstasyon Kod · İstasyon Adı · Bölge · Mıntıka · Bildirim · Muteahhit

Filtreler: DatetimePicker1_DatetimePicker1_Date1, DatetimePicker1_DatetimePicker1_Date2, ddlIslemDurum_ddlIslemDurumFilter_ddlIslemDurumFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc, IstSecim_clbBolge_chk6_chc, IstSecim_ddlIstasyon_ddlIstasyontextboxAjax_ajaxInput, Filtrele_Filtrele_innerButton

### E-6 Aykırılık Beyanı
`EpdkModulu/Epdk2015/BilgiSistemi/E6AykirilikBeyani.aspx`

Kolonlar (13): Bildirim Yap · Bayi Lisans No · Aykırılık Tespit Tarihi · Kayıt Dışı İkmal · İzinsiz Müdahele · Açıklama · Bildirim Tarihi · İstasyon Kod · İstasyon Adı · Bölge · Mıntıka · Bildirim · Muteahhit

Filtreler: DatetimePicker1_DatetimePicker1_Date1, DatetimePicker1_DatetimePicker1_Date2, ddlIslemDurum_ddlIslemDurumFilter_ddlIslemDurumFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc, IstSecim_clbBolge_chk6_chc, IstSecim_ddlIstasyon_ddlIstasyontextboxAjax_ajaxInput, Filtrele_Filtrele_innerButton

### E-7 Uzaktan Erişim ve Web Servis Bilgileri
`EpdkModulu/Epdk2015/BilgiSistemi/E7UEBilgileri.aspx`

Kolonlar (4): Uzaktan Erişim Adresi · UE Kullanıcı Adı · UED Kullanıcı Adı · Açıklama

Filtreler: txEPDKKod_txEPDKKodtxt, TextboxFilter1_TextboxFilter1txt, ReportButton1_ReportButton1_innerButton, btnSonBildirim_btnSonBildirim_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt

### Bayiler
`EpdkModulu/AlinanBilgiler/Bayiler.aspx`

Kolonlar (13): ID · İstasyon Adı · EPDK Kodu · Adres · Marka · Şehir · Enlem · Boylam · Tank Sayısı · Pompa Sayısı · Tabanca Sayısı · Toplam Tank Kapasitesi · Marka

Filtreler: AsisTextBox1_AsisTextBox1txt, Textbox1_Textbox1txt, TextboxFilter1_TextboxFilter1txt, TextboxFilter2_TextboxFilter2txt, AsisButton1_AsisButton1_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt

### Pompa Listesi
`EpdkModulu/AlinanBilgiler/KPompalar.aspx`

Kolonlar (13): ID · EPDK Kodu · Adres · Köy/Demiryolu <br/> Pompa No · Şehir · İlçe · GsmNo · Enlem · Boylam · Tank Sayısı · Pompa Sayısı · Tabanca Sayısı · Toplam Tank Kapasitesi

Filtreler: TextboxFilter1_TextboxFilter1txt, TextboxFilter2_TextboxFilter2txt, AsisButton1_AsisButton1_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt

### Tankerler
`EpdkModulu/AlinanBilgiler/Tankerler.aspx`

Kolonlar (5): EPDK Kodu · Plaka · İstiap Haddi · Tank Sayısı · Toplam Tank Kapasitesi

Filtreler: txEPDKKod_txEPDKKodtxt, TextboxFilter1_TextboxFilter1txt, AsisButton1_AsisButton1_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt

### Epdk Ürün Bilgileri
`EpdkModulu/AlinanBilgiler/EpdkUrunBilgileri.aspx`

Kolonlar (3): ID · Ad · GTİP

Filtreler: txEPDKKod_txEPDKKodtxt, AsisButton1_AsisButton1_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt

### Dolum Eşleşme
`EpdkModulu/Epdk2015/Raporlar/DolumEslesme.aspx`

Kolonlar (9): EPDK Kodu · İst. Kod · İstasyon Adı · Ürün Kısa Adı · Bölge · Mıntıka · Eşleşen Dolum (Adet) · Eşleşmeyen Dolum (Adet) · Muteahhit

Filtreler: dtpTarih2_dtpTarih2_Date1, dtpTarih2_dtpTarih2_Date1Time1, dtpTarih2_dtpTarih2_Date2, dtpTarih2_dtpTarih2_Date2Time1, ddl_DonemAd_ddl_DonemAdFilter_ddl_DonemAdFiltercmbAlt, txtEPDK_Kod_txtEPDK_Kodtxt, TextBoxEslesenDolum_TextBoxEslesenDolumtxtInterval_txtKucukAralik, TextBoxEslesenDolum_TextBoxEslesenDolumtxtInterval_txtBuyukAralik, TextBoxEslesmeyenDolum_TextBoxEslesmeyenDolumtxtInterval_txtKucukAralik, TextBoxEslesmeyenDolum_TextBoxEslesmeyenDolumtxtInterval_txtBuyukAralik, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc

### Saha Bilgisi Raporu
`EpdkModulu/Epdk2015/Raporlar/SahaBilgisiRaporu.aspx`

Kolonlar (16): İstasyon Bilgileri · İstasyonlu Köy Pompası · Tanker · Kayıt Tarihi · İst. Durum · İstasyon Tip · EPDK Kodu · İstasyon Kod · İstasyon Adı · Şehir · Pompa No · Tabanca Sayısı · Pompa Marka · Yazar Kasa Marka · Tank Kapasitesi · Muteahhit

Filtreler: dtpTarih2_dtpTarih2_Date1, dtpTarih2_dtpTarih2_Date1Time1, dtpTarih2_dtpTarih2_Date2, dtpTarih2_dtpTarih2_Date2Time1, txt_EPDKKod_txt_EPDKKodtxt, ddlIstasyonTips_ddlIstasyonTipsFilter_ddlIstasyonTipsFiltercmbAlt, ddlIstasyonDurums_ddlIstasyonDurumsFilter_ddlIstasyonDurumsFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc

### Sözleşme Aralıkları
`EpdkModulu/Epdk2015/Raporlar/SozlesmeAralik.aspx`

Kolonlar (10): EPDK Kodu · İstasyon Tip · İst. Kod · İstasyon Adı · Bölge · Mıntıka · Sözleşme Başlangıç · Sözleşme Bitiş · Fesih Tarihi · Muteahhit

Filtreler: dtpTarih_dtpTarih_Date1, dtpTarih_dtpTarih_Date2, DateTimePicker_DateTimePicker_Date1, DateTimePicker_DateTimePicker_Date2, DateTimePicker22_DateTimePicker22_Date1, DateTimePicker22_DateTimePicker22_Date2, txt_Plaka_txt_Plakatxt, ddlIstasyonTips_ddlIstasyonTipsFilter_ddlIstasyonTipsFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc

### Fark Dolum
`EpdkModulu/Epdk2015/Raporlar/FarkDolum.aspx`

Kolonlar (11): Dolum Tarihi · EPDK Kodu · İst. Kod · İstasyon Adı · Ürün · İrsaliye No · IrsaliyeTarihi · Dolum Miktarı (lt) · Eşleşen Miktar · Eşleşme Durumu · Muteahhit

Filtreler: dtpTarih2_dtpTarih2_Date1, dtpTarih2_dtpTarih2_Date2, txt_EPDKKod_txt_EPDKKodtxt, ddlIstasyonTips_ddlIstasyonTipsFilter_ddlIstasyonTipsFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc, IstSecim_clbBolge_chk6_chc, IstSecim_ddlIstasyon_ddlIstasyontextboxAjax_ajaxInput

### Epdk Servis Durum
`EpdkModulu/Epdk2015/Raporlar/EpdkServisOnlineDurum.aspx`

Kolonlar (6): İlk Tarih · Son Tarih · Adres · Bağlantı Durum · Şifre Durum · Süre

Filtreler: dtpTarih2_dtpTarih2_Date1, dtpTarih2_dtpTarih2_Date2, AsisButton1_AsisButton1_innerButton, AsisNavigationToolBar1_Item2_Item2cmbAlt

### Pompa Tank Eşlestirme
`EpdkModulu/Epdk2015/Raporlar/PompaTankEslestirme.aspx`

Kolonlar (14): Tarih · İstasyon Ad · İstasyon Kod · EPDK Kodu · Ürün · Tank No · Pompa No · Tabanca No · Tank GrupNo · Bölge · Mıntıka · Şehir · İlçe · Muteahhit

Filtreler: dtpSatisBaslama2_dtpSatisBaslama2_Date1, dtpSatisBaslama2_dtpSatisBaslama2_Date1Time1, dtpSatisBaslama2_dtpSatisBaslama2_Date2, dtpSatisBaslama2_dtpSatisBaslama2_Date2Time1, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstasyonSecim1_clbIstasyon_cblAjaxSearch, IstasyonSecim1_clbIstasyon_selectInDiv, IstasyonSecim1_clbIstasyon_chktumu_chc, IstasyonSecim1_clbMintika_cblAjaxSearch, IstasyonSecim1_clbMintika_selectInDiv, IstasyonSecim1_clbMintika_chktumu_chc, IstasyonSecim1_clbBolge_chktumu_chc, IstasyonSecim1_clbBolge_chk0_chc, IstasyonSecim1_clbBolge_chk1_chc, IstasyonSecim1_clbBolge_chk2_chc, IstasyonSecim1_clbBolge_chk3_chc, IstasyonSecim1_clbBolge_chk4_chc, IstasyonSecim1_clbBolge_chk5_chc, IstasyonSecim1_clbBolge_chk6_chc, IstasyonSecim1_ddlIstasyon_ddlIstasyontextboxAjax_ajaxInput

### Dolum Eşleşme Takip
`EpdkModulu/Epdk2015/Raporlar/DolumEslesmeTakip.aspx`

Kolonlar (18): Eşleşme Durumu · Dolum Tarihi · GelisTarihi · İşlem Tipi · İst. Kod · İstasyon Adı · EPDK Kodu · Bölge · Mıntıka · EpdkID · Tank No · Ürün · Evrak No · Fatura No · Fatura Tarihi · DolumLitre · Eşleşme Miktarı · Sorumlu Kullanıcı

Filtreler: dtp_DolumGun_dtp_DolumGun_Date1, dtp_DolumGun_dtp_DolumGun_Date2, TextboxLisansNo_TextboxLisansNotxt, TextboxEvrakNo_TextboxEvrakNotxt, ddl_IslemTip_ddl_IslemTipFilter_ddl_IslemTipFiltercmbAlt, ddl_EslesmeDurum_ddl_EslesmeDurumFilter_ddl_EslesmeDurumFiltercmbAlt, ddlSorumluKullanici_ddlSorumluKullaniciFilter_ddlSorumluKullaniciFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbMintika_chk0_chc, IstSecim_clbMintika_chk1_chc, IstSecim_clbMintika_chk2_chc, IstSecim_clbMintika_chk3_chc, IstSecim_clbMintika_chk4_chc, IstSecim_clbMintika_chk5_chc, IstSecim_clbMintika_chk6_chc

### İstasyon Dönemleri
`EpdkModulu/IstasyonDonemleri.aspx`

Kolonlar (10): Dönem · Açılış Günü · Kapanış Günü · EPDK Kodu · İstasyon Kod · İstasyon Ad · M. Durum Istasyon · Dönem Detay · Muteahhit · Sorumlu Kullanıcı

Filtreler: TextboxFilter1_TextboxFilter1txt, ddlDonemAd_ddlDonemAdFilter_ddlDonemAdFiltercmbAlt, ddlIstasyonTip_ddlIstasyonTipFilter_ddlIstasyonTipFiltercmbAlt, ddlDurum_ddlDurumFilter_ddlDurumFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbMintika_chk0_chc, IstSecim_clbMintika_chk1_chc, IstSecim_clbMintika_chk2_chc, IstSecim_clbMintika_chk3_chc, IstSecim_clbMintika_chk4_chc, IstSecim_clbMintika_chk5_chc, IstSecim_clbMintika_chk6_chc, IstSecim_clbMintika_chk7_chc, IstSecim_clbMintika_chk8_chc

### İstasyon Günlük Ürün Analizi
`OtomasyonModulu/UrunRaporlari/IstasyonAnaliz.aspx`

Kolonlar (10): Satış Bitiş · ERP Kod · EPDK Kodu · İst. Kod · İstasyon Adı · Ürün · Litre · Tutar · Adet · Marka

Filtreler: dtpSatisBaslama_dtpSatisBaslama_Date1, dtpSatisBaslama_dtpSatisBaslama_Date1Time1, dtpSatisBaslama_dtpSatisBaslama_Date2, dtpSatisBaslama_dtpSatisBaslama_Date2Time1, ddlMarka_ddlMarkaFilter_ddlMarkaFiltercmbAlt, ddlIslemTip_ddlIslemTipFilter_ddlIslemTipFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc, IstSecim_clbBolge_chk6_chc

### Aylık Toplam Satış
`OtomasyonModulu/UrunRaporlari/UrunSehirSatisRaporu.aspx`

Kolonlar (14): Durum · Yıl · Ay · EPDK Kodu · İst. Kod · İstasyon Adı · Bölge · Mıntıka · Ürün · Litre · Tutar · Adet · Marka · Muteahhit

Filtreler: dtpSatisBaslama_dtpSatisBaslama_Date1, dtpSatisBaslama_dtpSatisBaslama_Date1Time1, dtpSatisBaslama_dtpSatisBaslama_Date2, dtpSatisBaslama_dtpSatisBaslama_Date2Time1, ddlMarka_ddlMarkaFilter_ddlMarkaFiltercmbAlt, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc, IstSecim_clbBolge_chk6_chc

### Aylık Alım Satım
`OtomasyonModulu/IstasyonRaporlari/AylikAlimSatim.aspx`

Kolonlar (16): Yıl · Ay · EPDK Kodu · İst. Kod · İstasyon Adı · Bölge · Mıntıka · İstasyon Tip · Durum · Ürün Kısa Adı · Tesis Dolum (Litre) · Dolum Miktarı (Brüt Lt) · Satış Toplam (LT/m³) · Dış Satış · Marka · Muteahhit

Filtreler: DatetimePicker1_DatetimePicker1_Date1, DatetimePicker1_DatetimePicker1_Date2, txtEPDKKod_txtEPDKKodtxt, ddlIstasyonTipP_ddlIstasyonTipPFilter_ddlIstasyonTipPFiltercmbAlt, ddlDurum_ddlDurumFilter_ddlDurumFiltercmbAlt, ddlMarka_ddlMarkaFilter_ddlMarkaFiltercmbAlt, MarkerAralik_MarkerAraliktxtInterval_txtKucukAralik, MarkerAralik_MarkerAraliktxtInterval_txtBuyukAralik, IntervalTextboxesFilter1_IntervalTextboxesFilter1txtInterval_txtKucukAralik, IntervalTextboxesFilter1_IntervalTextboxesFilter1txtInterval_txtBuyukAralik, IntervalTextboxesFilter2_IntervalTextboxesFilter2txtInterval_txtKucukAralik, IntervalTextboxesFilter2_IntervalTextboxesFilter2txtInterval_txtBuyukAralik, IntervalTextboxesFilter3_IntervalTextboxesFilter3txtInterval_txtKucukAralik, IntervalTextboxesFilter3_IntervalTextboxesFilter3txtInterval_txtBuyukAralik, ddlOtomasyonFirmasi_ddlOtomasyonFirmasiFilter_ddlOtomasyonFirmasiFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv

### İstasyon Ürün Satış Aylık
`OtomasyonModulu/UrunRaporlari/IstasyonUrunSatisUrunPvt.aspx`

Kolonlar (21): İst. Kod · İstasyon Adı · Bölge · Mıntıka · Yıl · Ay · Toplam(Lt) · Toplam(Adet) · K95 · K95 Adet · Mtrn · Mtrn Adet · LPG · Adet · ADB · ADB Adet · SYH · SYH Adet · YAKIT · fuel Adet · Marka

Filtreler: dtpSatisBaslama_dtpSatisBaslama_Date1, dtpSatisBaslama_dtpSatisBaslama_Date1Time1, dtpSatisBaslama_dtpSatisBaslama_Date2, dtpSatisBaslama_dtpSatisBaslama_Date2Time1, ddlMarka_ddlMarkaFilter_ddlMarkaFiltercmbAlt, IstSecim_clbIstasyon_cblAjaxSearch, IstSecim_clbIstasyon_selectInDiv, IstSecim_clbIstasyon_chktumu_chc, IstSecim_clbMintika_cblAjaxSearch, IstSecim_clbMintika_selectInDiv, IstSecim_clbMintika_chktumu_chc, IstSecim_clbBolge_chktumu_chc, IstSecim_clbBolge_chk0_chc, IstSecim_clbBolge_chk1_chc, IstSecim_clbBolge_chk2_chc, IstSecim_clbBolge_chk3_chc, IstSecim_clbBolge_chk4_chc, IstSecim_clbBolge_chk5_chc, IstSecim_clbBolge_chk6_chc, IstSecim_ddlIstasyon_ddlIstasyontextboxAjax_ajaxInput

