// Canlı POL smoke-test: DB'siz, sadece ASIS SOAP çağrılarını dener.
// Amaç: istemcinin canlı POL'e karşı çalıştığını doğrulamak (kurulum/regresyon kontrolü).
// Çalıştır: node --env-file=.env --import tsx core/smoke.ts  (.env'de ASIS_GUID_KEY olsun)
import { asis, epdkNo } from './asisClient.js';
import { config } from './config.js';

async function main() {
  console.log('ASIS geçerli mi:', config.asis.gecerli, '| gateway:', config.asis.gateway);
  if (!config.asis.gecerli) {
    console.error('ASIS_GUID_KEY gerekli. Örn: ASIS_GUID_KEY=... tsx core/smoke.ts');
    process.exit(1);
  }

  console.log('\n== GetStationList ==');
  const ist = await asis.istasyonlar();
  console.log(`İstasyon sayısı: ${ist.length}`);
  console.log('İlk 2:', ist.slice(0, 2).map((i) => ({ kod: i.kod, ad: i.ad, epdk: i.epdkKod, no: epdkNo(i.epdkKod) })));

  console.log('\n== Bağlantı durumu (GetStationList.SonTarih türevi) ==');
  try {
    const durum = await asis.onlineDurumlar();
    console.log(`Durum kaydı: ${durum.length}`);
    console.log('İlk 2:', durum.slice(0, 2));
    const offline = durum.filter((d) => !d.online).length;
    console.log(`Offline sayısı: ${offline}`);
  } catch (e: any) {
    console.error('IstasyonOnlineDurum HATA:', e?.message ?? e);
  }

  console.log('\n== GetTankLastLevel (ilk istasyon) ==');
  if (ist[0]) {
    try {
      const tanklar = await asis.tankSonDurum(ist[0].kod);
      console.log(`${ist[0].kod} tank sayısı: ${tanklar.length}`);
      console.log('İlk 2:', tanklar.slice(0, 2));
    } catch (e: any) {
      console.error('GetTankLastLevel HATA:', e?.message ?? e);
    }
  }

  console.log('\nSmoke bitti.');
}

main().catch((e) => {
  console.error('SMOKE HATA:', e);
  process.exit(1);
});
