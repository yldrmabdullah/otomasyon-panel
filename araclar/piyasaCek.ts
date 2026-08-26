// Piyasa istihbarat — ilk toplu çekim: EPDK'dan 32 dağıtıcı + her birinin bayileri → DB.
// Throttle'a saygılı (epdkClient içinde 9sn bekle+retry). İlk yükleme uzun sürer (arka plan).
// Çalıştır: node --env-file=.env --import tsx araclar/piyasaCek.ts [--tum-durumlar]
//
// dagitici_lisans_no BİREBİR kullanılır (Türkçe DAĞ/ korunur). Bayi sorgusu null dönerse
// (o dağıtıcının bayisi yok / erişilemedi) atlanır, döngü durmaz. Bugünün snapshot'ı da yazılır.

import { epdk } from '../core/epdkClient.js';
import { dagiticilariKaydet, bayileriKaydet, transferleriTespitEt, snapshotSil,
         snapshotPencereUygula, kapat } from '../core/db.js';

// Bugünün günü (TR) — Node ortamında sabit değil, çalışma anına göre. Snapshot anahtarı.
// Kaç GÜNLÜK snapshot saklanır (takvim aralığı değil, gün sayısı — cron kaçarsa
// takvim penceresi yanlışlıkla karşılaştırma çiftini silerdi).
const SNAPSHOT_PENCERE_GUN = 10;

function bugunTr(): string {
  const tr = new Date(Date.now() + 3 * 3_600_000);
  return tr.toISOString().slice(0, 10);
}

/** Yarim kalan snapshot'i sil. Cagrildigi yerler: SIGTERM (CI timeout) ve
 *  eksik dagitici tespiti. */
async function yarimTemizle(gun: string, sebep: string): Promise<void> {
  console.error(`
[TEMIZLIK] ${sebep} -> ${gun} snapshot'i siliniyor (yarim veri birakilmaz).`);
  try {
    const n = await snapshotSil(gun);
    console.error(`[TEMIZLIK] ${n} satir silindi.`);
  } catch (e) {
    console.error(`[TEMIZLIK] BASARISIZ: ${e instanceof Error ? e.message : e}`);
    console.error(`[TEMIZLIK] ELLE SIL: DELETE FROM bayi_snapshot WHERE snapshot_gun='${gun}';`);
  }
}

async function main() {
  const tumDurumlar = process.argv.includes('--tum-durumlar');
  const snapshotGun = bugunTr();

  // GH Actions `timeout-minutes` asildiginda SIGTERM gonderir. Yakalanmazsa surec
  // ortasinda olur ve YARIM SNAPSHOT DB'de kalir.
  // 2026-07-30'da tam bu oldu: 30/32 dagiticida kesildi, 27.484 satirlik yarim
  // snapshot kaldi ve elle silinmek zorunda kalindi. Daha kotusu: oran %90,7 ile
  // butunluk esigini KIL PAYI geciyordu -> 2.823 hayalet "ayrildi" kaydi uretebilirdi.
  let kapaniyor = false;
  for (const sinyal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sinyal, () => {
      if (kapaniyor) return; // ikinci sinyalde tekrar girme
      kapaniyor = true;
      void (async () => {
        await yarimTemizle(snapshotGun, `${sinyal} alindi (CI timeout ya da elle iptal)`);
        await kapat().catch(() => {});
        process.exit(143);
      })();
    });
  }

  console.log(`Piyasa çekim başladı. Snapshot günü: ${snapshotGun}. Durum: ${tumDurumlar ? 'TÜM' : 'ONAYLANDI'}`);

  // 0) BASLANGIC TEMIZLIGI — bugune ait yarim snapshot varsa sil.
  //
  // NEDEN IKINCI KORUMA: SIGTERM handler'i (yukarida) surec duzgun sinyal alirsa
  // calisir, ama SIGKILL / runner'in aniden olmesi / islemci cokmesi durumunda
  // calismaz. O zaman yarim snapshot DB'de kalir ve ERTESI GUN butunluk kontrolu
  // bunu "onceki gun" sanip karsilastirir.
  // Cekim zaten sifirdan yazdigi icin baslangicta silmek KAYIP DEGIL: ayni gun
  // tekrar cekiliyorsa eski yarim veri gereksiz. Boylece her kosu temiz baslar.
  const eski = await snapshotSil(snapshotGun);
  if (eski > 0) {
    console.log(`Baslangic temizligi: ${snapshotGun} gunune ait ${eski} eski satir silindi (yarim kalmis onceki kosu).`);
  }

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
        // Kapsam snapshot'a yazılır → farklı kapsamdaki günler karşılaştırılmasın.
        await bayileriKaydet(bayiler, d.lisansNo, snapshotGun, tumDurumlar ? 'tum' : 'onaylandi');
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
  // -1 → bütünlük kontrolü atladı (yarım snapshot); uyarı zaten loglandı.
  const transfer = await transferleriTespitEt(snapshotGun);
  if (transfer < 0) {
    console.error('✗ Transfer tespiti yapılmadı (yukarıdaki uyarıya bak). Çıkış kodu 2.');
    await kapat();
    process.exit(2); // cron/CI bunu fark etsin — sessizce başarılı görünmesin
  }
  console.log(transfer > 0 ? `✔ ${transfer} transfer/değişim tespit edildi.` : 'Transfer tespiti: önceki gün yok ya da değişim yok.');

  // SAKLAMA PENCERESİ — transfer tespitinden SONRA (önce silinirse karşılaştırma çifti bozulur).
  // Snapshot günlük ~30.370 satır / ~6,8 MB yazıyor; sınırsız birikince Supabase 500 MB
  // ücretsiz sınırı ~35 günde dolacaktı (2026-08-26 ölçümü: 29 günde 197 MB).
  // Transfer tespiti yalnız son iki günü kıyasladığı için 10 gün fazlasıyla yeter.
  // Temizlik BAŞARISIZ OLSA BİLE çekim başarılı sayılır: veri yazıldı, yalnız yer açılmadı.
  try {
    const silinen = await snapshotPencereUygula(SNAPSHOT_PENCERE_GUN);
    if (silinen > 0)
      console.log(`✔ Saklama penceresi: ${silinen} eski snapshot satırı silindi (son ${SNAPSHOT_PENCERE_GUN} gün tutulur).`);
  } catch (e) {
    console.error(`UYARI: snapshot temizliği başarısız (çekim etkilenmedi): ${e instanceof Error ? e.message : e}`);
  }

  await kapat();
}

main().catch(async (e) => {
  console.error('Çekim hatası:', e);
  await kapat().catch(() => {});
  process.exit(1);
});
