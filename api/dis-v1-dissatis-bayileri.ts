// DIŞ API (BFF için) — uzlastirma_dissatis'ten "geçmişte gerçek dış satış yapmış" epdk_kod
// listesi. BFF'nin DisSatisSyncServisi bu ucu HttpClient ile çekip, DisSatisElleAyarlandi=false
// olan bayilerde Bayi.DisSatisYapabilir'i otomatik işaretler (elle müdahale önceliklidir —
// 2026-09-03 kullanıcı kararı, bkz ana repo API/Parkoil.Bff.Domain/Entities/Bayi.cs).
//
// GET /api/dis-v1-dissatis-bayileri
// X-Api-Key ile korunur. Salt-okuma. Dönem/ürün detayı YOK — yalnız "en az bir kez dış
// satışı görülmüş epdk_kod" özeti (BFF'nin ihtiyacı bu; ham tabloyu birebir aynalamaz).
import { db, hataYanit } from './_db.js';
import { disApiKorumali } from './_oturum.js';

export default disApiKorumali(async (_req: any, res: any) => {
  try {
    const sonuc = await db().query(
      `SELECT epdk_kod,
              SUM(dis_satis_lt) AS toplam_dis_satis_lt,
              SUM(satis_adedi) AS toplam_satis_adedi,
              MIN(donem_bas) AS ilk_donem_bas,
              MAX(donem_bit) AS son_donem_bit
       FROM uzlastirma_dissatis
       WHERE dis_satis_lt > 0
       GROUP BY epdk_kod
       ORDER BY epdk_kod`,
    );

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({
      basarili: true,
      adet: sonuc.rows.length,
      veri: sonuc.rows,
    });
  } catch (e) {
    hataYanit(res, e);
  }
});
