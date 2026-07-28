// Vercel serverless: tüm bayi listesi (Piyasa modülünün "Tüm Bayiler" tablosu).
// Salt-okuma. Sorgu core/panelSorgu.ts'te.
//
// BU ENDPOINT ÖNCEDEN HİÇ YOKTU: panel /api/bayiler'i çağırıyor ama yalnız
// local'de public/api/bayiler statik dosyası vardı → prod'da 404 alıyor ve
// hatayı yutup "0 / 0" gösteriyordu. Kullanıcı "veri yok" ile "sistem bozuk"u
// ayırt edemiyordu. Panel artık hatayı yutmuyor, burası da gerçek veri veriyor.
//
// NOT (bilinen sınır): 30 bin satır tek yanıtta döner (~9.4 MB ham / ~1 MB gzip).
// Sunucu-taraflı sayfalama+arama sıradaki iş; o zaman bu handler query
// parametresi (q/il/dagitici/durum/sirala/sayfa) alacak şekilde genişletilecek
// ve bayiler_epdk(il), (dagitim_sirketi), (lisans_durumu) indeksleri gerekecek.
import { db, hataYanit } from './_db.js';
import { bayiVerisi } from '../../core/panelSorgu.js';

export default async function handler(_req: unknown, res: any) {
  try {
    const satirlar = await bayiVerisi(db());
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(satirlar);
  } catch (e) {
    hataYanit(res, e);
  }
}
