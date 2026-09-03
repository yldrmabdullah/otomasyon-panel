// DIŞ API (BFF için) — Dorse Durum Kontrol Sistemi'nin okuyacağı iki farklı veri kümesini
// TEK serverless fonksiyonda toplar (Vercel Hobby plan fonksiyon limiti 12 — ayrı dosya
// başına ayrı fonksiyon sayıldığı için `?tip=` ile dallandırıldı, ayrı dosyalara BÖLÜNMEDİ).
// BFF/Infrastructure/Dorseler (MutabakatIrsaliyeIstemcisi) bu ucu HttpClient ile çeker
// (Postgres'e doğrudan bağlanmaz — bkz _oturum.ts disApiKorumali() yorumu).
//
// GET /api/dis-v1?tip=dorse-hareketleri&bas=YYYY-MM-DD&bit=YYYY-MM-DD&epdk=41436
//   → mutabakat_irsaliye satırları (UE2/A4 POL Excel importları, plaka dahil).
// GET /api/dis-v1?tip=dissatis-bayileri
//   → uzlastirma_dissatis'ten "geçmişte gerçek dış satış yapmış" epdk_kod özeti
//     (dönem/ürün detayı yok — BFF'nin DisSatisSyncServisi'nin ihtiyacı bu kadarı).
//
// X-Api-Key ile korunur. Salt-okuma.
import { db, hataYanit } from './_db.js';
import { disApiKorumali } from './_oturum.js';

export default disApiKorumali(async (req: any, res: any) => {
  try {
    const q = req?.query ?? {};
    const tip = typeof q.tip === 'string' ? q.tip : null;

    if (tip === 'dissatis-bayileri') {
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
      return res.status(200).json({ basarili: true, adet: sonuc.rows.length, veri: sonuc.rows });
    }

    if (tip === 'dorse-hareketleri') {
      const bas = typeof q.bas === 'string' && q.bas ? q.bas : null;
      const bit = typeof q.bit === 'string' && q.bit ? q.bit : null;
      const epdk = typeof q.epdk === 'string' && q.epdk ? q.epdk : null;

      const kosullar: string[] = [];
      const parametreler: unknown[] = [];
      if (bas) { parametreler.push(bas); kosullar.push(`irsaliye_tarihi >= $${parametreler.length}`); }
      if (bit) { parametreler.push(bit); kosullar.push(`irsaliye_tarihi < $${parametreler.length}`); }
      if (epdk) { parametreler.push(`%${epdk}`); kosullar.push(`epdk_no LIKE $${parametreler.length}`); }
      const where = kosullar.length ? `WHERE ${kosullar.join(' AND ')}` : '';

      const sonuc = await db().query(
        `SELECT irsaliye_no, irsaliye_tarihi, epdk_no, istasyon_ad, urun, fatura_no,
                fatura_miktar, istasyon_dolum, kalan_miktar, koy_pompasi, tanker, dis_satis,
                dagiticiya_iade, fark_yuzde, evrak_durum, plaka_dorse, plaka_cekici,
                bolge, mintika, kaynak_dosya, guncelleme
         FROM mutabakat_irsaliye
         ${where}
         ORDER BY irsaliye_tarihi DESC, irsaliye_no
         LIMIT 5000`,
        parametreler,
      );
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ basarili: true, adet: sonuc.rows.length, veri: sonuc.rows });
    }

    return res.status(400).json({
      basarili: false,
      hata: 'gecersiz_tip',
      mesaj: "tip parametresi 'dorse-hareketleri' veya 'dissatis-bayileri' olmalı",
    });
  } catch (e) {
    hataYanit(res, e);
  }
});
