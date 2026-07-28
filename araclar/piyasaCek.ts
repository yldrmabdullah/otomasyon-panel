// Piyasa istihbarat — ilk toplu çekim: EPDK'dan 32 dağıtıcı + her birinin bayileri → DB.
// Throttle'a saygılı (epdkClient içinde 9sn bekle+retry). İlk yükleme uzun sürer (arka plan).
// Çalıştır: node --env-file=.env --import tsx araclar/piyasaCek.ts [--tum-durumlar]
//
// dagitici_lisans_no BİREBİR kullanılır (Türkçe DAĞ/ korunur). Bayi sorgusu null dönerse
// (o dağıtıcının bayisi yok / erişilemedi) atlanır, döngü durmaz. Bugünün snapshot'ı da yazılır.

import { epdk } from '../core/epdkClient.js';
import { dagiticilariKaydet, bayileriKaydet, transferleriTespitEt, kapat } from '../core/db.js';

// Bugünün günü (TR) — Node ortamında sabit değil, çalışma anına göre. Snapshot anahtarı.
function bugunTr(): string {
  const tr = new Date(Date.now() + 3 * 3_600_000);
  return tr.toISOString().slice(0, 10);
}

async function main() {
  const tumDurumlar = process.argv.includes('--tum-durumlar');
  const snapshotGun = bugunTr();
  console.log(`Piyasa çekim başladı. Snapshot günü: ${snapshotGun}. Durum: ${tumDurumlar ? 'TÜM' : 'ONAYLANDI'}`);

  // 1) Dağıtıcılar — HER ZAMAN sadece aktif (ONAYLANDI, 32 firma). Kapanmış 191 dağıtıcının
  //    tarihsel bayilerini çekmek çok uzun ve düşük değerli. tumDurumlar sadece BAYİ durumuna uygulanır
  //    (aktif dağıtıcının iptal/sonlanmış bayileri dahil).
  const dagiticilar = await epdk.dagiticilar(false);
  console.log(`Dağıtıcı (aktif): ${dagiticilar.length}. Bayi durumu: ${tumDurumlar ? 'TÜM' : 'ONAYLANDI'}`);
  await dagiticilariKaydet(dagiticilar);

  // 2) Her dağıtıcının bayileri
  let toplamBayi = 0;
  let hataliDagitici = 0;
  for (let i = 0; i < dagiticilar.length; i++) {
    const d = dagiticilar[i];
    if (!d.lisansNo) continue; // lisansNo'su boş dağıtıcı (iptal/iade) → bayi sorgulanamaz, atla
    try {
      const bayiler = await epdk.bayiler(d.lisansNo, tumDurumlar);
      if (bayiler.length > 0) {
        await bayileriKaydet(bayiler, d.lisansNo, snapshotGun);
        toplamBayi += bayiler.length;
      }
      console.log(`  [${i + 1}/${dagiticilar.length}] ${d.unvan.slice(0, 32)} → ${bayiler.length} bayi (toplam ${toplamBayi})`);
    } catch (e: any) {
      hataliDagitici++;
      console.warn(`  [${i + 1}/${dagiticilar.length}] ${d.unvan.slice(0, 32)} → HATA: ${e?.message ?? e}`);
    }
  }

  console.log(`\n✔ Çekim bitti. ${dagiticilar.length} dağıtıcı, ${toplamBayi} bayi, ${hataliDagitici} hatalı.`);

  // Transfer tespiti: bugünün snapshot'ını önceki günle karşılaştır.
  const transfer = await transferleriTespitEt(snapshotGun);
  console.log(transfer > 0 ? `✔ ${transfer} transfer/değişim tespit edildi.` : 'Transfer tespiti: önceki gün yok ya da değişim yok.');

  await kapat();
}

main().catch(async (e) => {
  console.error('Çekim hatası:', e);
  await kapat().catch(() => {});
  process.exit(1);
});
