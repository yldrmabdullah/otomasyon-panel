// Bayi iletişim — canlı Logo'dan BFF /dis/v1/bayi-iletisim üzerinden.
// EPDK no → iletişim haritası. Her job koşusunda bir kez çekilir (bayi gelince/gidince taze).
// BFF kapalı/erişilemezse boş harita döner → alarm yine ekip hedefine gider (bayi hedefi boş).

import { config } from './config.js';

export interface BayiIletisim {
  epdkNo: string;
  logoKod: string;
  ad: string;
  telefon: string | null;
  cepTelefon: string | null;
  eposta: string | null;
  aktif: boolean;
}

/** EPDK no → iletişim. BFF yapılandırılmamış/hatalıysa boş harita (job durmaz). */
export async function iletisimHaritasiGetir(): Promise<Map<string, BayiIletisim>> {
  const harita = new Map<string, BayiIletisim>();
  if (!config.bff.gecerli) return harita;

  try {
    const url = `${config.bff.url.replace(/\/$/, '')}/dis/v1/bayi-iletisim`;
    const yanit = await fetch(url, { headers: { 'X-Api-Key': config.bff.apiKey } });
    if (!yanit.ok) {
      console.warn(`  iletişim çekme HTTP ${yanit.status} — bayi hedefi boş kalacak`);
      return harita;
    }
    const doc = (await yanit.json()) as { basarili?: boolean; veri?: BayiIletisim[] };
    for (const b of doc.veri ?? []) {
      if (b.epdkNo) harita.set(b.epdkNo, b);
    }
  } catch (e: any) {
    console.warn(`  iletişim çekme hatası: ${e?.message ?? e} — bayi hedefi boş kalacak`);
  }
  return harita;
}

/** EPDK kodundan no ayıkla ('BAY/939-82/47293' → '47293'; zaten no ise aynen). */
export function iletisimEpdkNo(epdk: string | null | undefined): string | null {
  if (!epdk) return null;
  const son = epdk.trim().replace(/\/$/, '').split('/').pop()?.trim();
  return son && son.length ? son : null;
}
