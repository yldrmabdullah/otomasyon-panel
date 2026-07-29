// Şema migration'ı — TÜM .sql dosyalarını çalıştırır (idempotent). npm run db:migrate
//
// ⚠️ Eskiden yalnız schema.sql uygulanıyordu; schema_piyasa.sql (dağıtıcılar,
// bayiler_epdk, bayi_snapshot, transferler) hiç koşmuyordu → piyasa tabloları elle
// kurulmuştu ve sonradan eklenen kolonlar (bayi_snapshot.kapsam) canlıda oluşmadı.
// Yeni bir şema dosyası eklendiğinde bu listeye de eklenmeli.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, kapat } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Sıra önemli: schema.sql temel tabloları (istasyonlar vb.) kurar,
// schema_piyasa.sql onlara referans verebilir.
const DOSYALAR = ['schema.sql', 'schema_piyasa.sql'];

async function main() {
  const p = pool();
  for (const d of DOSYALAR) {
    const sql = await readFile(join(__dirname, d), 'utf8');
    await p.query(sql);
    console.log(`✔ ${d} uygulandı.`);
  }
  await kapat();
}

main().catch(async (e) => {
  console.error('Migration hatası:', e);
  await kapat();
  process.exit(1);
});
