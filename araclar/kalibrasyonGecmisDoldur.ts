// Kalibrasyon GEÇMİŞ doldurma — ASIS GetTankLevelList (artımlı mm geçmişi) ile tüm filonun
// SON N GÜNÜNÜ tek seferde çekip kalibrasyon_mm_seri'ye yükler. Bir kez çalıştırılır (elle);
// günlük akış için kalibrasyonSeviyeCek.ts (GetTankLastLevel) yeterli.
//
// NEDEN GEREKLİ: GetTankLastLevel anlık tek nokta verir → tank seviyesi değişmezse nokta
// artmaz, cetvel için 3+ nokta birikmesi haftalar sürebilir. GetTankLevelList ise GEÇMİŞ
// mm serisini verir; son 30 günün cursor'ından (GetTankLevelRecord) başlayıp arşiv sonuna
// kadar sayfalayınca tüm filonun son N günü HEMEN birikir → tanklar hızla cetvele ulaşır.
//
// ⚠️ GetTankLevelList cursor TUHAF: cursor=0'dan başlamak tek istasyonun aylarını geziyor
// (seviyeCek.ts kanıtı). ÇÖZÜM: GetTankLevelRecord ile tarih→cursor al, oradan ilerlet.
//
// Çalıştır:  node --env-file=.env --import tsx araclar/kalibrasyonGecmisDoldur.ts [GUN=30]

import { config } from '../core/config.js';
import { kalibrasyonSeriKaydet, kapat } from '../core/db.js';
import type { AsisTank } from '../core/tipler.js';

const K = config.asis;
const GUN = Number(process.argv[2] ?? 30);
// Opsiyonel 2. argüman: yalnız bu istasyon kodu yazılır (ör. 210277 AVLAMAZ). Boşsa tüm filo.
const SADECE_IST = (process.argv[3] ?? '').trim() || null;

function xmlKacir(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function isoLocal(d: Date): string {
  const tr = new Date(d.getTime() + 3 * 3_600_000);
  return tr.toISOString().slice(0, 19);
}
async function cagir(metot: string, icGovde: string): Promise<string> {
  const zarf =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
    `<${metot} xmlns="${K.namespace}">${icGovde}</${metot}></soap:Body></soap:Envelope>`;
  const r = await fetch(K.gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: K.namespace + metot },
    body: zarf,
  });
  if (!r.ok) throw new Error(`${metot} HTTP ${r.status}`);
  return r.text();
}
const al = (blok: string, ad: string) => blok.match(new RegExp(`<${ad}>([^<]*)</${ad}>`))?.[1] ?? '';
const sayiNull = (s: string): number | null => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

async function main() {
  const bas = new Date(Date.now() - GUN * 86_400_000);
  const bit = new Date();
  console.log(`Kalibrasyon geçmiş doldurma: son ${GUN} gün (${isoLocal(bas).slice(0, 10)} → bugün)`);

  // 1) Tarih → başlangıç cursor'ı
  const recDoc = await cagir('GetTankLevelRecord',
    `<DagiticiKod>${K.dagiticiKod}</DagiticiKod><guidKey>${xmlKacir(K.guidKey)}</guidKey>` +
    `<baslangic>${isoLocal(bas)}</baslangic><bitis>${isoLocal(bit)}</bitis>`);
  let cursor = Number(al(recDoc, 'KayitID') ?? 0);
  console.log(`  başlangıç cursor: ${cursor}`);
  if (cursor <= 0) throw new Error('GetTankLevelRecord cursor 0 döndü — tarih aralığında veri yok?');

  // 2) Cursor'dan arşiv sonuna kadar sayfala
  let toplamYazilan = 0, sayfa = 0;
  const gorulenTank = new Set<string>();
  const basGun = isoLocal(bas).slice(0, 10);

  while (true) {
    sayfa++;
    const doc = await cagir('GetTankLevelList',
      `<KayitID>${cursor}</KayitID><dagiticiKod>${K.dagiticiKod}</dagiticiKod><guidKey>${xmlKacir(K.guidKey)}</guidKey>`);
    const bloklar = [...doc.matchAll(/<TankLevel>([\s\S]*?)<\/TankLevel>/g)].map((m) => m[1]);
    if (bloklar.length === 0) { console.log(`  sayfa ${sayfa}: 0 kayıt — arşiv sonu.`); break; }

    // Sadece istenen tarih penceresindeki kayıtları al (eski arşiv kuyruğunu atla)
    const tanklar: AsisTank[] = [];
    let enBuyukDurum = cursor;
    for (const b of bloklar) {
      const durum = Number(al(b, 'TTankDurumID') ?? 0);
      if (durum > enBuyukDurum) enBuyukDurum = durum;
      const zaman = al(b, 'DurumTarihi');
      if (!zaman || zaman.slice(0, 10) < basGun) continue; // pencere dışı (eski)
      const mm = sayiNull(al(b, 'YakitSeviyeMM'));
      if (mm === null || mm <= 0) continue;
      const ist = al(b, 'IstasyonKod'); const tn = al(b, 'TankNo');
      if (!ist || !tn) continue;
      if (SADECE_IST && ist !== SADECE_IST) continue; // yalnız hedef istasyon
      gorulenTank.add(`${ist}|${tn}`);
      tanklar.push({
        istasyonKod: ist, tankNo: tn, urunAdi: al(b, 'UrunAdi'),
        kapasiteLt: sayiNull(al(b, 'Kapasitesi')) ?? 0,
        yakitLt: sayiNull(al(b, 'YakitSeviyeLT')) ?? 0,
        suLt: 0, durumZamani: new Date(zaman),
        yakitMm: mm, suMm: sayiNull(al(b, 'SuSeviyeMM')),
        sicaklik: sayiNull(al(b, 'Sicaklik')), kalibrasyonYuzdesi: sayiNull(al(b, 'KalibrasyonYuzdesi')),
      });
    }
    if (tanklar.length > 0) toplamYazilan += await kalibrasyonSeriKaydet(tanklar);
    console.log(`  sayfa ${sayfa} (cursor ${cursor}): ${bloklar.length} kayıt, ${tanklar.length} pencerede, ${gorulenTank.size} tank toplam`);

    if (enBuyukDurum <= cursor) { console.log('  cursor ilerlemedi — durduruldu.'); break; }
    cursor = enBuyukDurum;
    if (sayfa >= 200) { console.log('  200 sayfa sınırı — durduruldu.'); break; }
  }

  console.log(`  ✔ ${toplamYazilan} ölçüm yazıldı, ${gorulenTank.size} farklı tank`);
  await kapat();
}

main().catch(async (e) => {
  console.error('Geçmiş doldurma hatası:', e instanceof Error ? e.message : e);
  await kapat().catch(() => {});
  process.exit(1);
});
