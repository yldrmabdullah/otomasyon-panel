// Şema migration'ı: schema.sql'i çalıştırır (idempotent). npm run db:migrate
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, kapat } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  await pool().query(sql);
  console.log('✔ Şema uygulandı.');
  await kapat();
}

main().catch(async (e) => {
  console.error('Migration hatası:', e);
  await kapat();
  process.exit(1);
});
