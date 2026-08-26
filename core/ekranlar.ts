// Ekran (modül) yetkisi — TEK KAYNAK. Hem sunucu (api/*) hem panel (panel/src/*)
// bu listeyi kullanır.
//
// NEDEN BURADA: modül listesi eskiden yalnız App.tsx'te vardı ve sunucu tarafı
// "hangi ekranlar var" bilgisine hiç sahip değildi. Yetki eklenince liste iki yere
// yazılsaydı sessizce kayardı: panelde gizli ama API'si açık bir ekran = yetki
// kontrolü YOK demektir (kullanıcı /api/piyasa'yı doğrudan çağırabilir).
//
// YETKİ MODELİ (iki dik eksen):
//  · rol      → 'admin' kullanıcı yönetebilir; 'izleyici' yönetemez.
//  · ekranlar → hangi modülleri GÖREBİLİR. admin her zaman hepsini görür.
// Bu ayrım sayesinde "her ekranı gören ama kullanıcı açamayan" kişi mümkün.

/** Yetkilendirilebilir ekran kimlikleri. */
export const EKRANLAR = ['izleme', 'operasyon', 'sorun', 'mevzuat', 'piyasa', 'yonetim'] as const;
export type Ekran = (typeof EKRANLAR)[number];

/** Ekran adları — Kullanıcılar ekranındaki onay kutuları ve hata mesajları için. */
export const EKRAN_AD: Record<Ekran, string> = {
  izleme: 'İzleme',
  operasyon: 'Operasyon',
  sorun: 'Sorun Tespiti',
  mevzuat: 'Mevzuat',
  piyasa: 'Piyasa',
  yonetim: 'Yönetim',
};

/** Ekran kısa açıklaması (menü alt satırı + yetki seçicideki ipucu). */
export const EKRAN_ALT: Record<Ekran, string> = {
  izleme: 'Bağlantı & tank',
  operasyon: 'Stok & alarm & kalite',
  sorun: 'İrsaliye & dolum anomalisi',
  mevzuat: 'EPDK & mutabakat',
  piyasa: 'Dağıtıcı & bayi',
  yonetim: 'Bayi alımları & ciro',
};

export function ekranMi(s: unknown): s is Ekran {
  return typeof s === 'string' && (EKRANLAR as readonly string[]).includes(s);
}

/**
 * Gelen ham listeyi güvenli hale getir: yalnız bilinen ekranlar, tekrarsız, sabit sırada.
 * null/undefined → null ("hepsi" anlamına gelir, bkz. `gorebilir`).
 * Bilinmeyen değerler SESSİZCE atılır — istemci uydurma ekran adı gönderemez.
 */
export function ekranlariTemizle(ham: unknown): Ekran[] | null {
  if (ham === null || ham === undefined) return null;
  if (!Array.isArray(ham)) return null;
  const küme = new Set(ham.filter(ekranMi));
  return EKRANLAR.filter((e) => küme.has(e));
}

/**
 * Bu kullanıcı bu ekranı görebilir mi?
 *
 * · admin → her zaman evet (kullanıcı yönetimi de dahil her şeye erişir).
 * · ekranlar NULL → evet. Kolon sonradan eklendi; mevcut kullanıcılar yetkisiz
 *   kalmamalı. "Henüz sınırlandırılmamış" demek.
 * · ekranlar [] → hayır. Boş dizi bilinçli olarak "hiçbir ekran" demek; NULL ile
 *   karıştırılmamalı.
 */
export function gorebilir(
  kullanici: { rol: string; ekranlar?: string[] | null },
  ekran: Ekran,
): boolean {
  if (kullanici.rol === 'admin') return true;
  const e = kullanici.ekranlar;
  if (e === null || e === undefined) return true;
  return e.includes(ekran);
}

/** Kullanıcının görebildiği ekranların listesi (menü çizimi için). */
export function gorunurEkranlar(kullanici: { rol: string; ekranlar?: string[] | null }): Ekran[] {
  return EKRANLAR.filter((e) => gorebilir(kullanici, e));
}
