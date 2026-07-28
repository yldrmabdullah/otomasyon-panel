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
  dryRun: opt('DRY_RUN', '1') === '1',
};

export { req };
