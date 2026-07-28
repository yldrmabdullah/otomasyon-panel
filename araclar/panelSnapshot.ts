// Panel için statik snapshot üretici (local geliştirme). DB'den okuyup panel/public/api/*
// dosyalarını yazar — Vite dev server bunları /api/* olarak sunar. Vercel'de yerine api/*.ts
// serverless çalışır; bu araç yalnız local'de "gerçek veriyle göster" içindir.
//
// Sorgular core/panelSorgu.ts'te — serverless endpoint'ler AYNI modülü kullanır,
// böylece local ile prod aynı veriyi gösterir (eskiden senkronsuz iki gerçek vardı).
//
// Çalıştır: node --env-file=.env --import tsx araclar/panelSnapshot.ts

import { pool, kapat } from '../core/db.js';
import { piyasaVerisi, durumVerisi, bayiVerisi } from '../core/panelSorgu.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const DIZIN = 'panel/public/api';

async function main() {
  mkdirSync(DIZIN, { recursive: true });
  const p = pool();

  const piyasa = await piyasaVerisi(p);
  writeFileSync(`${DIZIN}/piyasa`, JSON.stringify(piyasa));

  const bayiler = await bayiVerisi(p);
  writeFileSync(`${DIZIN}/bayiler`, JSON.stringify(bayiler));

  const durum = await durumVerisi(p);
  writeFileSync(`${DIZIN}/durum`, JSON.stringify(durum));

  console.log(
    `✔ Snapshot: ${piyasa.dagiticiBayiDagilim.length} dağıtıcı, ${bayiler.length} bayi, ` +
      `${piyasa.kaybedilen.length} kaybedilen, ${piyasa.sozlesmeBitecek.length} sözleşme-bitecek, ` +
      `${durum.istasyonlar.length} istasyon.`,
  );
  await kapat();
}

main().catch(async (e) => { console.error('Snapshot hatası:', e); await kapat().catch(() => {}); process.exit(1); });
