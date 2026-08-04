// Ortam değişkenlerinden yapılandırma. GH Actions'ta bunlar Secrets olarak gelir.

function req(ad: string): string {
  const v = process.env[ad];
  if (!v) throw new Error(`Eksik ortam değişkeni: ${ad}`);
  return v;
}

function opt(ad: string, varsayilan = ''): string {
  return process.env[ad] ?? varsayilan;
}

function sayi(ad: string, varsayilan: number): number {
  const v = process.env[ad];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : varsayilan;
}

export const config = {
  asis: {
    gateway: opt('ASIS_GATEWAY', 'https://pol.parkoil.tr/Poservice/gateway.asmx'),
    guidKey: opt('ASIS_GUID_KEY'),
    dagiticiKod: sayi('ASIS_DAGITICI_KOD', 21),
    namespace: opt('ASIS_NAMESPACE', 'http://www.asis.com.tr/'),
    get gecerli() {
      return !!this.gateway && !!this.guidKey;
    },
  },
  db: {
    url: opt('DATABASE_URL'),
  },
  bff: {
    // Bayi iletişim (telefon/mail) canlı Logo'dan → BFF /dis/v1/bayi-iletisim.
    url: opt('BFF_URL'), // ör. https://reportapi.parkoil.com.tr
    apiKey: opt('BFF_API_KEY'), // DisSiparisApi.ApiAnahtari
    get gecerli() {
      return !!this.url && !!this.apiKey;
    },
  },
  esik: {
    kopukSaat: sayi('KOPUK_ESIK_SAAT', 3),
    tankVeriDk: sayi('TANK_VERI_ESIK_DK', 35),
    tekrarBildirimSaat: sayi('TEKRAR_BILDIRIM_SAAT', 6),

    // ⭐ BİLDİRİM EŞİĞİ — ALARM EŞİĞİNDEN AYRI (2026-08-04, ölçülerek belirlendi).
    //
    // NEDEN AYRI: panelde 35 dk doğru eşik — tank gerçekten veri göndermiyor ve
    // otomasyon ekibi bunu GÖRMELİ. Ama aynı eşikle MAİL atmak posta kutusunu
    // çöpe çevirir: alarmların %63'ü 30 dakika içinde kendiliğinden kapanıyor
    // (tank 35 dk sessiz kalıyor, sonra veri geliyor → flapping).
    //
    // 7 günlük gerçek veriyle ölçülen alarm ömrü dağılımı:
    //     eşik 35 dk → 1.915 alarm  (≈274/gün — kabul edilemez)
    //     eşik  1 sa →    ~33/gün
    //     eşik  2 sa →   192 (≈27/gün — hâlâ fazla)
    //     eşik  3 sa →    49 (≈7/gün, 44 tekil tank) ← SEÇİLDİ
    //     eşik  6 sa →    39 (fark küçük, ama 2 saat daha kör kalınır)
    // 3 saat flapping'i eliyor ama gerçek olayları kaçırmıyor. Bağlantı alarmı
    // zaten 3 saatlik eşikte (24 saatte 1 alarm) — ikisi tutarlı oldu.
    //
    // Alarm yine 35 dk'da AÇILIR ve panelde görünür; yalnız bildirim beklemeli.
    bildirimTankSaat: sayi('BILDIRIM_TANK_ESIK_SAAT', 3),
    // Son bu kadar günden daha eski veri gönderen istasyon "pasif/ölü" sayılır → alarm atlamaz.
    // (Aylardır/yıllardır veri göndermeyen kayıtlar gerçek kopukluk değil.)
    pasifGun: sayi('PASIF_ESIK_GUN', 7),
  },
  mail: {
    host: opt('SMTP_HOST'),
    port: sayi('SMTP_PORT', 587),
    user: opt('SMTP_USER'),
    pass: opt('SMTP_PASS'),
    from: opt('SMTP_FROM', 'otomasyon@parkoil.com.tr'),
    ekip: opt('EKIP_MAIL')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    get gecerli() {
      return !!this.host && !!this.user;
    },
  },
  sms: {
    userCode: opt('NETGSM_USERCODE'),
    password: opt('NETGSM_PASSWORD'),
    header: opt('NETGSM_HEADER', 'PARKOIL'),
    ekipTelefon: opt('EKIP_TELEFON')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    get gecerli() {
      return !!this.userCode && !!this.password;
    },
  },
  bildirim: {
    /** Bayilere de mail/SMS gitsin mi? VARSAYILAN KAPALI (bilinçli).
     *
     *  ⚠️ Açmadan önce bildirim eşiği canlıda izlenmeli. Ölçüm (2026-08-04):
     *  tank alarmlarının %63'ü 30 dakikada kendiliğinden kapanıyor, tek istasyon
     *  24 saatte 51 alarm üretti. Bayiye yanlış giden mesaj geri alınamaz ve
     *  CLAUDE.md kuralı bunu yasaklıyor ("yanlış alarm bayiyi yorar").
     *  Kapalıyken bildirim yalnız EKIP_MAIL / EKIP_TELEFON'a gider. */
    bayiyeGonder: opt('BAYIYE_GONDER', '0') === '1',
  },
  dryRun: opt('DRY_RUN', '1') === '1',
};

export { req };
