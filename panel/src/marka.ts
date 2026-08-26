/* Parkoil logosu (parkoil-kirmizi.png) — base64 gömülü.
 *
 * NEDEN GÖMÜLÜ: indirilen .xls dosyası kullanıcının diskinde/mailinde açılıyor;
 * panele erişimi olmayan biri (muhasebe, yönetim) de açabilir. Dış URL referansı
 * verilse Excel resmi çekemez ve kırık ikon görünür. Base64 4,7 KB → dosyaya ~6 KB
 * ekliyor, kabul edilebilir.
 *
 * ⚠️ KANITLANDI (2026-08-26): Excel COM ile açılıp `Shapes.Count = 1` ölçüldü —
 * legacy HTML-tablo .xls biçimi data: URI resmini GERÇEKTEN gömüyor. Varsayım değil.
 */
export const PARKOIL_LOGO_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAN0AAABDCAMAAAAvdvAbAAADAFBMVEVHcEzOHST//f/////OGiLNGCDNFR3NGiHNFx7OHCPywsTw' +
  'u731zM7ZTFH10tPgb3P21NX++fn219f54+X21NXbU1j32dr0xsj21dbyw8X99/f+9fXwuLvaU1jywMLTLzb//f3+9vbzycv76+z+' +
  '/Pz44eH43+D////zx8n10tTyw8b10dL98fDywMLTMTf++/v109TZTFLur7HurrHfaW776OjhbnLsqqz++vrgbXHywsTzyMn////l' +
  'hYn0y83njZDieXzic3j99PTmio3WP0X55OXdWl/10NHhc3j0xMT0yszkfYLrn6L10NLxv8HmiY3wtrnqm5754+T209Tkf4Pmh4ri' +
  'dnraT1TvsbPnjpH98fHmio7YRErUMzrxvr/wubvzw8XvsbTtqKrxur3jfIDkgITroaTroKPplJfurrD77OzcWF7pmJrPHybtqqrn' +
  'j5LnjZHlh4veY2jusbTfaW3YR03roqXicnb53t/sp6rtqKvwvb/aUFbVOT/kf4PfYmfeZWraUlfjd3vmjZDur7Hro6bcVVrusbPn' +
  'jpLxurvokpb77O3qmp3/+vrqnJ/1ycvxvsDYR03419fxv8DroqXrpKftrK/lhIfqnaDpmJvqnJ/tq67plpr21dbieX3roqbpl5ra' +
  'S1HvsrTvr7L2yMvdX2TmhYn21Nbxv8HpmJvur7H0zM7wt7nnkZXvsLLfZWnZTVLkgYXjfoLni4/gbHDfZ2vvs7bmhon//v778fHk' +
  'gYX22NnkgYX45ubxwMH0y8zxwMLVOUDYRErXQ0nurbDspafzy83109T55OTzyMn0ztDus7XOFh3RGyLOGB/PHyXPGyLQHSTZQUjQ' +
  'ICfRJCvTJSzRIinYMTjSHiXXLDPTJy7OGiHhYGXVKzLXKTDPGSDUJCvicnXYOD7TICfZNDvcO0HNEhnZO0HdS1DcVlvZNj3fWF3g' +
  'cHTUKTDdTVLXMDbibXHaPkXhaW7XMzrfXGHXNTzbRErULjXdQUfbSE7fY2jeUljSJi3NDxfNFx7nkJPY/7AeAAAAzHRSTlMA/gMF' +
  '/v7+/v7+QU5X/kT8SQ1GKUH7OFxORAscUf499Q8WUyAJLyYBRzFLNhpg+CVS/DlH/kr4NRL0aE8C84T5+c4z7/1A+mXrIm39X19U' +
  '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';
