import { pool, kapat } from './core/db.js';
import { sozlesmeBitecekBizim, sozlesmeBitecekRakip, gunlukTransferler } from './core/panelSorgu.js';
async function main() {
  const b = await sozlesmeBitecekBizim(pool());
  console.log('BIZIM 30 gun:', b.length, 'bayi');
  for (const x of b) console.log('  ', JSON.stringify(x));

  const r = await sozlesmeBitecekRakip(pool());
  console.log('\nRAKIP 7 gun:', r.satirlar.length, 'bayi ·', r.dagiticiOzet.length, 'dagitici');
  for (const x of r.dagiticiOzet.slice(0, 5)) console.log('   ', x.n, String(x.dagitim_sirketi).slice(0, 34));
  console.log('   ornek:', JSON.stringify(r.satirlar[0]));

  const t = await gunlukTransferler(pool());
  console.log('\nBUGUNUN TRANSFERLERI:', JSON.stringify(t.ozet));
  for (const x of t.tumu.slice(0, 5))
    console.log(`   ${x.bizi_ilgilendiren ? '★' : ' '} ${x.tip} · ${String(x.lisans_sahibi).slice(0,28)} · ${String(x.eski_deger).slice(0,16)} → ${String(x.yeni_deger).slice(0,16)}`);
  await kapat();
}
main().catch(e => { console.error('HATA:', e.message); process.exit(1); });
