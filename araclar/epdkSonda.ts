// EPDK web servisi sondası — TEK ucu çağırıp yanıtını ANALİZ eder.
//
// AMAÇ: ASIS'te belgeye güvenip üç kez yanıldık (parametre adı, KayitID=0, IrsaliyeLitre).
// EPDK'da aynı hatayı yapmamak için her yeni uç önce buradan canlı çağrılır: gerçekte
// hangi alanlar geliyor, hangileri boş, kaç kayıt, hangi parametre zorunlu.
//
// GÜVENLİK: SALT-OKUMA. Yalnız *Sorgula / *Bulten tipi SORGU uçları çağrılır.
// Bildirim/yazma ucu BU ARAÇLA ÇAĞRILMAZ (bkz. YASAK listesi).
//
// Çalıştır:
//   node --env-file=.env --import tsx araclar/epdkSonda.ts <ucAdi> [json-govde]
// Örnek:
//   node --env-file=.env --import tsx araclar/epdkSonda.ts petrolDepolamaLisansSorgula
//   node --env-file=.env --import tsx araclar/epdkSonda.ts petrolBayiSatisFiyatBulten '{"tarih":"2026-07-28"}'

import { request } from 'node:https';

const BASE = 'apigateway.epdk.gov.tr';
/** Yanıt özetinde gösterilecek azami karakter (log şişmesin). */
const OZET = 600;

/** Bilinen sorgu uçları + varsayılan gövde. Sıra önemsiz (JSON), ama ALAN ADI önemli. */
const GOVDE: Record<string, object> = {
  petrolDagiticiLisansSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolBayilikLisansiSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolDepolamaLisansSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolTasimaLisansSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolIsleme: { lisansDurumu: ['ONAYLANDI'] },
  petrolMadeniYagLisansSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolRafinericiLisansSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolIhrakiyeTeslimLisansSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolIletimLisansSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolSerbestKullaniciLisansSorgula: { lisansDurumu: ['ONAYLANDI'] },
  petrolAkaryakitHariciUrunYetkileriSorgula: { lisansDurumu: ['ONAYLANDI'] },
  // Fiyat bülteni — parametre şeması bilinmiyor, keşfedilecek (boş gövdeyle başla).
  petrolBayiSatisFiyatBulten: {},
};

/** ⛔ Bu araçla ASLA çağrılmayacak uçlar: veri GÖNDERME/bildirim yapan uçlar.
 *  Bu proje salt-okuma; EPDK'ya bildirim göndermek yasal sonuç doğurur ve
 *  ancak kullanıcının açık kararı + ayrı yetkili kimlikle yapılır. */
const YASAK = [/bildirim/i, /kaydet/i, /gonder/i, /ekle/i, /guncelle/i, /sil/i, /olustur/i];

function cagir(path: string, body: object, denemeMax = 6): Promise<{ ham: string; kod: number }> {
  const veri = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    let deneme = 0;
    const dene = () => {
      const req = request(
        {
          host: BASE,
          path,
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) },
        },
        (res) => {
          const parcalar: Buffer[] = [];
          res.on('data', (c: Buffer) => parcalar.push(c));
          res.on('end', () => {
            const ham = Buffer.concat(parcalar).toString('utf8');
            if (ham.includes('Throttling') || ham.includes('BLOCKED')) {
              if (++deneme >= denemeMax) return reject(new Error('EPDK throttle: max deneme aşıldı'));
              process.stdout.write('  · throttle, 9 sn bekliyor…\n');
              return setTimeout(dene, 9000);
            }
            resolve({ ham, kod: res.statusCode ?? 0 });
          });
        },
      );
      req.on('error', reject);
      req.write(veri);
      req.end();
    };
    dene();
  });
}

/** Bir kaydın alanlarını DOLU/BOŞ ayrımıyla listele (iç içe nesne/dizi dahil). */
function alanlar(kayit: Record<string, unknown>, girinti = '  '): void {
  for (const [ad, deger] of Object.entries(kayit)) {
    const bos =
      deger === null ||
      deger === undefined ||
      deger === '' ||
      deger === 0 ||
      (Array.isArray(deger) && deger.length === 0);
    let gorunum: string;
    if (Array.isArray(deger)) gorunum = `[${deger.length}] ${JSON.stringify(deger).slice(0, 60)}`;
    else if (deger !== null && typeof deger === 'object') gorunum = JSON.stringify(deger).slice(0, 60);
    else gorunum = String(deger).slice(0, 60);
    console.log(`${girinti}${bos ? '·' : '✓'} ${ad.padEnd(38)} ${gorunum}`);
  }
}

async function main() {
  const [uc, govdeArg] = process.argv.slice(2);
  if (!uc) {
    console.log('Kullanım: epdkSonda.ts <ucAdi> [json-govde]\n\nBilinen uçlar:');
    for (const k of Object.keys(GOVDE)) console.log(`  ${k}`);
    process.exit(1);
  }

  if (YASAK.some((y) => y.test(uc))) {
    console.error(`⛔ REDDEDİLDİ: "${uc}" bildirim/yazma ucu görünüyor.`);
    console.error('   Bu araç SALT-OKUMA. Yazma işlemi kullanıcının açık kararı olmadan yapılmaz.');
    process.exit(4);
  }

  const govde = govdeArg ? JSON.parse(govdeArg) : (GOVDE[uc] ?? {});
  console.log(`UÇ         ${uc}`);
  console.log(`GÖVDE      ${JSON.stringify(govde)}`);

  const t0 = Date.now();
  const { ham, kod } = await cagir(`/${uc}/`, govde);
  const sure = Date.now() - t0;
  console.log(`HTTP       ${kod} · ${sure} ms · ${(ham.length / 1024).toFixed(1)} KB`);

  let veri: unknown;
  try {
    veri = JSON.parse(ham);
  } catch {
    console.log(`SONUÇ      ✗ JSON değil — ham yanıt:`);
    console.log(`  ${ham.slice(0, OZET).replace(/\s+/g, ' ')}`);
    process.exit(3);
  }

  if (Array.isArray(veri)) {
    console.log(`KAYIT      ${veri.length} adet (dizi)`);
    if (veri.length === 0) {
      console.log('           → BOŞ dizi: parametre yanlış olabilir ya da gerçekten veri yok.');
    } else {
      console.log(`ALAN       ilk kaydın alanları:`);
      alanlar(veri[0] as Record<string, unknown>);
    }
  } else if (veri && typeof veri === 'object') {
    const o = veri as Record<string, unknown>;
    // EPDK hata/mesaj zarfı olabilir
    console.log(`SONUÇ      nesne döndü (dizi değil) — alanlar:`);
    alanlar(o);
    // İçinde dizi varsa onu da aç
    for (const [ad, d] of Object.entries(o)) {
      if (Array.isArray(d) && d.length > 0 && typeof d[0] === 'object') {
        console.log(`\n  ↳ ${ad}[${d.length}] ilk kayıt:`);
        alanlar(d[0] as Record<string, unknown>, '    ');
      }
    }
  } else {
    console.log(`SONUÇ      ${JSON.stringify(veri).slice(0, OZET)}`);
  }
}

main().catch((e) => {
  console.error('Sonda hatası:', e instanceof Error ? e.message : e);
  process.exit(1);
});
