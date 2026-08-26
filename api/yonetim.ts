// Vercel serverless: Yönetim modülü — bayilerin ürün grubuna göre alımları.
// Salt-okuma. Sorgu core/panelSorgu.ts'te (tek kaynak; local sunucu AYNI modülü kullanır).
//
// Kaynak zinciri: Logo INVOICE+STLINE → BFF /dis/v1/mutabakat/fatura-satislari
//   → araclar/satisFaturaCek.ts → satis_fatura → bu uç.
//
// Bu uç TİCARİ CİRO taşıyor (hangi bayi ne kadar alıyor) — piyasa ucundan bile
// hassas. korumali() + private/no-store ZORUNLU.
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import { yonetimVerisi } from '../core/panelSorgu.js';

export default korumali(async (req: any, res: any) => {
  try {
    // Tarih filtresi istemciden gelir ama panelSorgu'da BİÇİM DOĞRULANIR
    // (yyyy-MM-dd değilse varsayılana düşer) — ham string SQL'e gitmez.
    const { baslangic, bitis } = req?.query ?? {};
    const veri = await yonetimVerisi(
      db(),
      typeof baslangic === 'string' ? baslangic : undefined,
      typeof bitis === 'string' ? bitis : undefined,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json(veri);
  } catch (e) {
    hataYanit(res, e);
  }
}, { ekran: 'yonetim' });
