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
 * Bir alarm/olay için mail + SMS gönderir. Hedefler + ekip birleştirilir, tekilleştirilir.
 * Bir kanalın hatası diğerini durdurmaz; hatalar toplanır.
 */
export async function bildir(
  konu: string,
  mailGovde: string,
  smsMetin: string,
  hedef: BildirimHedefi,
): Promise<BildirimSonuc> {
  const epostalar = tekil([...hedef.epostalar, ...config.mail.ekip]);
  const telefonlar = tekil([...hedef.telefonlar, ...config.sms.ekipTelefon]);
  const sonuc: BildirimSonuc = { mailDenendi: 0, smsDenendi: 0, hatalar: [] };

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
