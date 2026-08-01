/* Modül ikonları — inline SVG (stroke tabanlı, currentColor).
   Emoji YERİNE: emoji platformdan platforma farklı render olur, renk kontrolü
   yoktur, ekran okuyucuya çöp metin gider ve kurumsal panelde amatör durur. */

const ORTAK = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** İzleme — sinyal/anten dalgaları */
export function IkonIzleme() {
  return (
    <svg {...ORTAK}>
      <path d="M4.9 19.1a10 10 0 0 1 0-14.2" />
      <path d="M8.1 15.9a5.5 5.5 0 0 1 0-7.8" />
      <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
      <path d="M15.9 8.1a5.5 5.5 0 0 1 0 7.8" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Mevzuat — terazi */
export function IkonMevzuat() {
  return (
    <svg {...ORTAK}>
      <path d="M12 3v18" />
      <path d="M7 21h10" />
      <path d="M4.5 7h15" />
      <path d="M7.2 7 4 13.5h6.4L7.2 7Z" />
      <path d="M16.8 7 13.6 13.5H20L16.8 7Z" />
    </svg>
  );
}

/** Kullanıcılar — kişi + yetki */
export function IkonKullanici() {
  return (
    <svg {...ORTAK}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M17 8.5h4.5" />
      <path d="M19.25 6.5v4" />
    </svg>
  );
}

/** Piyasa — yakıt deposu/tank */
export function IkonPiyasa() {
  return (
    <svg {...ORTAK}>
      <rect x="3.5" y="6" width="12" height="14" rx="1.8" />
      <path d="M3.5 11h12" />
      <path d="M6.5 6V4.2h6V6" />
      <path d="M15.5 9h2.6a2 2 0 0 1 2 2v5.4a1.6 1.6 0 0 0 3.2 0" />
    </svg>
  );
}

/** Operasyon — yakıt seviyesi/damla (stok takibinin ana işi). */
export function IkonOperasyon() {
  return (
    <svg {...ORTAK}>
      <path d="M12 3.5c3.2 3.6 5.2 6.3 5.2 8.9A5.2 5.2 0 0 1 12 17.6a5.2 5.2 0 0 1-5.2-5.2c0-2.6 2-5.3 5.2-8.9Z" />
      <path d="M8.4 20.5h7.2" />
    </svg>
  );
}

/** Sorun Tespiti — büyüteç (anomali arama). */
export function IkonSorun() {
  return (
    <svg {...ORTAK}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
      <path d="M10.5 7.5v3.5" />
      <circle cx="10.5" cy="13.6" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}
