// Bildirim soyutlaması. Kanal sağlayıcıları (mail/sms) buradan çağrılır.
// DRY_RUN=1 ise hiçbir şey göndermez, sadece loglar.

import { config } from '../config.js';
import { mailGonder } from './mail.js';
import { smsGonder } from './netgsm.js';

export interface BildirimHedefi {
  epostalar: string[];
  telefonlar: string[];
}

export interface BildirimSonuc {
  mailDenendi: number;
  smsDenendi: number;
  hatalar: string[];
}

/**
 * Teslim edilebilir e-posta mı?
 *
 * ⚠️ Kaynak veride (POL/Logo) bozuk adresler var — 2026-07-29 canlı taraması:
 * 5 bayide Türkçe karakterli yerel kısım (`haliskurşun@`, `ılgınparkakaryakıt72@`)
 * ve içinde boşluk olan adres (`cengizmalaman5@gmail .com`). Bunlar SMTP'de
 * sessizce düşer: sistem "gönderdim" sayar, bayi haber almaz. Ayıklanıp loglanır.
 *
 * Not: ASCII zorunluluğu kasıtlı. Gerçek IDN e-posta (SMTPUTF8) nadir ve bu
 * kayıtların hepsi hatalı yazım — meşru bir adresi engellemiyoruz.
 */
function teslimEdilebilirMi(e: string): boolean {
  return /^[\x21-\x7E]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e) && !e.includes('..');
}

/**
 * Bir alarm/olay için mail + SMS gönderir. Hedefler + ekip birleştirilir, tekilleştirilir.
 * Bir kanalın hatası diğerini durdurmaz; hatalar toplanır.
 */
export async function bildir(
  konu: string,
  mailGovde: string,
  smsMetin: string,
  hedef: BildirimHedefi,
): Promise<BildirimSonuc> {
  // ⭐⭐ BAYİYE GÖNDERİM AYRI ANAHTARLA AÇILIR (2026-08-04, bilinçli karar).
  //
  // Varsayılan KAPALI: secret'lar girildiği an 178 bayi telefonuna + 168 bayi
  // mailine mesaj gitmesin. Yanlış alarm bayiye gidince geri alınamıyor ve
  // CLAUDE.md kuralı bunu yasaklıyor ("yanlış alarm bayiyi yorar").
  // Ölçüm bu riski somutlaştırdı: tank alarmlarının %63'ü 30 dakikada
  // kendiliğinden kapanıyor; tek istasyon 24 saatte 51 alarm üretti.
  //
  // Açmadan önce yapılacaklar: bildirim eşiği canlıda birkaç gün izlenmeli
  // (BILDIRIM_TANK_ESIK_SAAT), sonra BAYIYE_GONDER=1.
  const bayiyeGonder = config.bildirim.bayiyeGonder;
  const bayiEpostalar = bayiyeGonder ? hedef.epostalar : [];
  const bayiTelefonlar = bayiyeGonder ? hedef.telefonlar : [];
  const hamEpostalar = tekil([...bayiEpostalar, ...config.mail.ekip]);
  // Geçersiz adres TÜM gönderimi düşürmesin (ekip maili de gitmez) → ayıkla.
  const epostalar = hamEpostalar.filter(teslimEdilebilirMi);
  const bozuk = hamEpostalar.filter((e) => !teslimEdilebilirMi(e));
  const telefonlar = tekil([...bayiTelefonlar, ...config.sms.ekipTelefon]);
  const sonuc: BildirimSonuc = { mailDenendi: 0, smsDenendi: 0, hatalar: [] };
  if (!bayiyeGonder && (hedef.epostalar.length || hedef.telefonlar.length)) {
    // Sessiz kalmasın: bayi hedefi VAR ama bilinçli olarak atlandı.
    console.log(
      `  ℹ️ bayiye gönderim KAPALI (BAYIYE_GONDER=1 ile açılır) — ` +
        `atlanan: ${hedef.epostalar.length} mail, ${hedef.telefonlar.length} telefon`,
    );
  }
  if (bozuk.length) {
    // Sessiz kalmasın: düzeltilmesi gereken veri kaydı.
    const uyari = `Geçersiz e-posta atlandı: ${bozuk.join(', ')}`;
    console.warn(`  ⚠ ${uyari}`);
    sonuc.hatalar.push(uyari);
  }

  if (config.dryRun) {
    console.log(`  [DRY_RUN] MAIL → ${epostalar.join(', ') || '(hedef yok)'} : ${konu}`);
    console.log(`  [DRY_RUN] SMS  → ${telefonlar.join(', ') || '(hedef yok)'} : ${smsMetin}`);
    sonuc.mailDenendi = epostalar.length;
    sonuc.smsDenendi = telefonlar.length;
    return sonuc;
  }

  if (epostalar.length && config.mail.gecerli) {
    try {
      await mailGonder(epostalar, konu, mailGovde);
      sonuc.mailDenendi = epostalar.length;
    } catch (e: any) {
      sonuc.hatalar.push(`mail: ${e?.message ?? e}`);
    }
  }

  if (telefonlar.length && config.sms.gecerli) {
    try {
      await smsGonder(telefonlar, smsMetin);
      sonuc.smsDenendi = telefonlar.length;
    } catch (e: any) {
      sonuc.hatalar.push(`sms: ${e?.message ?? e}`);
    }
  }

  return sonuc;
}

function tekil(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
