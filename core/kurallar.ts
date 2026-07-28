// Kural motoru: ASIS verisinden alarm tespitleri üretir. Saf fonksiyon — DB/bildirimden
// bağımsız, test edilebilir. Bkz docs/bilgi/baglanti-tank-izleme.md.

import { config } from './config.js';
import { epdkNo } from './asisClient.js';
import type { AsisIstasyon, AsisOnlineDurum, AsisTank, Tespit } from './tipler.js';
import { tespitAnahtari } from './tipler.js';

function saatFarki(sonZaman: Date | null, simdi: Date): number {
  if (!sonZaman) return Infinity; // hiç veri yok → sonsuz eskilik
  return (simdi.getTime() - sonZaman.getTime()) / 3_600_000;
}

function dkFarki(sonZaman: Date | null, simdi: Date): number {
  if (!sonZaman) return Infinity;
  return (simdi.getTime() - sonZaman.getTime()) / 60_000;
}

function sureMetni(saat: number): string {
  if (!Number.isFinite(saat)) return 'hiç veri yok';
  if (saat < 1) return `${Math.round(saat * 60)} dk`;
  return `${saat.toFixed(1)} saat`;
}

/**
 * Bağlantı kopukluğu tespiti. IstasyonOnlineDurum verisinden:
 * offline VEYA son veri > eşik (KOPUK_ESIK_SAAT) → kopuk.
 */
export function baglantiKopuklari(
  durumlar: AsisOnlineDurum[],
  istasyonlar: Map<string, AsisIstasyon>, // istasyonKod → istasyon (ad/epdk için)
  simdi: Date,
): Tespit[] {
  const esik = config.esik.kopukSaat;
  const pasifSaat = config.esik.pasifGun * 24;
  const out: Tespit[] = [];
  for (const d of durumlar) {
    // ⚠️ `kayitliAktif` (ASIS IstasyonDurum) kontrol edilir, `online` DEĞİL.
    // `online` artık "SonTarih taze mi" demek — kopuk istasyon zaten online=false
    // olduğundan burada `!d.online` kullanmak TÜM kopuk alarmlarını susturur.
    // Kütükte pasif istasyon (kayitliAktif=false) için alarm üretilmez: bayiliği
    // bitmiş/kapanmış noktayı arayıp rahatsız etmek yanlış alarmdır.
    if (!d.kayitliAktif) continue;
    const fark = saatFarki(d.sonVeriZamani, simdi);
    // Pasif/ölü kayıt: son veri pasifGün'den eski → hiç çalışmıyor, gerçek kopukluk değil.
    if (fark > pasifSaat) continue;
    const kopuk = fark > esik;
    if (!kopuk) continue;

    const istKod = d.istasyonKod ?? '';
    const ist = istasyonlar.get(istKod);
    out.push({
      tip: 'baglanti_kopuk',
      istasyonKod: istKod,
      epdkKod: d.epdkKod || ist?.epdkKod || '',
      istasyonAd: ist?.ad ?? istKod,
      tankNo: null,
      sonVeriZamani: d.sonVeriZamani,
      mesaj: `İstasyon bağlantısı kopuk (${sureMetni(fark)} veri yok). Eşik: ${esik} saat.`,
    });
  }
  return out;
}

/**
 * Tank veri kesintisi tespiti. Sadece BAĞLANTISI OLAN istasyonların tanklarına bakılır
 * (kopuk istasyonda zaten bağlantı alarmı var, tank alarmı gürültü olur).
 * Tank son ölçümü > eşik (TANK_VERI_ESIK_DK) → o tank veri göndermiyor.
 */
export function tankVeriYoklari(
  tanklarByIstasyon: Map<string, AsisTank[]>,
  kopukIstasyonKodlari: Set<string>,
  istasyonlar: Map<string, AsisIstasyon>,
  simdi: Date,
): Tespit[] {
  const esikDk = config.esik.tankVeriDk;
  const pasifDk = config.esik.pasifGun * 24 * 60;
  const out: Tespit[] = [];
  for (const [istKod, tanklar] of tanklarByIstasyon) {
    if (kopukIstasyonKodlari.has(istKod)) continue; // bağlantı zaten kopuk → atla
    const ist = istasyonlar.get(istKod);
    for (const t of tanklar) {
      const fark = dkFarki(t.durumZamani, simdi);
      if (fark <= esikDk) continue;
      if (fark > pasifDk) continue; // pasif/ölü tank (günlerce veri yok) → gerçek alarm değil
      out.push({
        tip: 'tank_veri_yok',
        istasyonKod: istKod,
        epdkKod: ist?.epdkKod ?? '',
        istasyonAd: ist?.ad ?? istKod,
        tankNo: t.tankNo,
        sonVeriZamani: t.durumZamani,
        mesaj: `Tank ${t.tankNo} (${t.urunAdi || 'ürün?'}) veri göndermiyor (son ölçüm ${sureMetni(
          fark / 60,
        )} önce). Eşik: ${esikDk} dk.`,
      });
    }
  }
  return out;
}

/** Tespit → alarm anahtarı (DB'deki açık alarmla eşleştirmek için). */
export function anahtar(t: Tespit): string {
  return tespitAnahtari(t);
}

/** Tespitten EPDK no ayıkla (iletişim eşlemesi için). */
export function tespitEpdkNo(t: Tespit): string | null {
  return epdkNo(t.epdkKod);
}
