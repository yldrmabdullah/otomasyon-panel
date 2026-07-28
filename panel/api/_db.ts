// Serverless fonksiyonlar için paylaşılan Postgres havuzu.
// Vercel her fonksiyonu ayrı izole eder ama sıcak invocation'da modül önbelleklenir.
import pg from 'pg';

const { Pool } = pg;
let havuz: pg.Pool | null = null;

export function db(): pg.Pool {
  if (!havuz)
    havuz = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
    });
  return havuz;
}

/** Hata gövdesini tek biçimde döndür — panel `{hata}` alanını bekliyor. */
export function hataYanit(res: { status: (n: number) => { json: (o: unknown) => void } }, e: unknown) {
  const mesaj = e instanceof Error ? e.message : String(e);
  res.status(500).json({ hata: mesaj });
}
