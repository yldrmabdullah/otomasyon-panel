// Netgsm SMS gönderimi. Basit HTTP API: https://api.netgsm.com.tr/sms/send/get
// Dönüş: "00 <bulkid>" veya "01/02/..." başarı; hata kodları için Netgsm dökümanı.
// Kod 00 ve 01/02 başarı sayılır; diğerleri hata.
import { config } from '../config.js';

const ENDPOINT = 'https://api.netgsm.com.tr/sms/send/get';

// Netgsm başarı/uyarı kodları (mesaj iletildi/kuyruğa alındı).
const BASARILI = new Set(['00', '01', '02']);

/** Telefonu Netgsm formatına indirger: sadece rakam, başındaki 0/90 temizlenir. */
function normalizeTelefon(t: string): string {
  let s = t.replace(/\D/g, '');
  if (s.startsWith('90')) s = s.slice(2);
  if (s.startsWith('0')) s = s.slice(1);
  return s; // 5xxxxxxxxx
}

export async function smsGonder(telefonlar: string[], metin: string): Promise<void> {
  const gsm = telefonlar.map(normalizeTelefon).filter((s) => s.length >= 10);
  if (gsm.length === 0) return;

  const hatalar: string[] = [];
  // Netgsm tek çağrıda çok numara alır (virgülle) ama numara başına sonuç ayrımı zor;
  // güvenli olması için numara başına gönder (küçük hacim — alarm sayısı düşük).
  for (const no of gsm) {
    const params = new URLSearchParams({
      usercode: config.sms.userCode,
      password: config.sms.password,
      gsmno: no,
      message: metin,
      msgheader: config.sms.header,
      dil: 'TR',
    });
    const url = `${ENDPOINT}?${params.toString()}`;
    const yanit = await fetch(url, { method: 'GET' });
    const govde = (await yanit.text()).trim();
    const kod = govde.split(/\s+/)[0];
    if (!BASARILI.has(kod)) {
      hatalar.push(`${no}: Netgsm kod ${govde}`);
    }
  }

  if (hatalar.length) {
    throw new Error(hatalar.join('; '));
  }
}
