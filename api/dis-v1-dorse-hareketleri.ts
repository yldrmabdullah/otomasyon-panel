// DIŞ API (BFF için) — mutabakat_irsaliye'den Dorse Durum Kontrol Sistemi'nin okuyacağı
// satırlar. BFF/Infrastructure/Dorseler bu ucu HttpClient ile çeker (Postgres'e doğrudan
// bağlanmaz — bkz _oturum.ts disApiKorumali() yorumu).
//
// GET /api/dis-v1-dorse-hareketleri?bas=YYYY-MM-DD&bit=YYYY-MM-DD&epdk=41436
// X-Api-Key ile korunur. Salt-okuma.
import { db, hataYanit } from './_db.js';
import { disApiKorumali } from './_oturum.js';

export default disApiKorumali(async (req: any, res: any) => {
  try {
    const q = req?.query ?? {};
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
    res.status(200).json({
      basarili: true,
      adet: sonuc.rows.length,
      veri: sonuc.rows,
    });
  } catch (e) {
    hataYanit(res, e);
  }
});
