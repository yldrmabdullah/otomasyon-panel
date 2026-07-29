// Serverless fonksiyonlar için Postgres havuzu.
//
// ⚠️ HAVUZ KURULUMU core/db.ts'te — BURADA TEKRARLANMAZ.
// Eskiden burada ayrı bir `new Pool()` vardı ve `sslmode` ayıklamasını yapmıyordu:
// Supabase pooler self-signed sertifika kullanıyor; connection string'de `sslmode`
// kalırsa `ssl` objesiyle çakışıp **"self-signed certificate in certificate chain"**
// hatası veriyor. Canlıda giriş tamamen çöktü (2026-07-29 deploy). Aynı çözümü iki
// yerde tutmak yerine tek kaynağa bağlandı — kopyalanan çözüm er ya da geç ayrışıyor.
export { pool as db } from '../core/db.js';

/** Hata gövdesini tek biçimde döndür — panel `{hata}` alanını bekliyor. */
export function hataYanit(res: { status: (n: number) => { json: (o: unknown) => void } }, e: unknown) {
  const mesaj = e instanceof Error ? e.message : String(e);
  res.status(500).json({ hata: mesaj });
}
