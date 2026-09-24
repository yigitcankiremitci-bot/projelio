import type { ReactNode } from "react";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Modül kartlarındaki küçük simgesel görsel. Her modülün KENDİ çizimi var —
 * önceden bütün kartlarda aynı yıldız duruyordu ve on modüllük bir ızgarada
 * hangisinin hangisi olduğu ancak başlık okunarak anlaşılıyordu.
 *
 * Çizimler iki tonlu: hat ana renkten (primary), vurgu parçası accent'ten.
 * Sabit hex yok; kullanıcı accent'i değiştirince simgeler de onunla döner,
 * koyu temada da ayrıca bir şey tanımlamak gerekmiyor.
 *
 * Yeni modül eklendiğinde buraya bir satır eklenmezse kart çökmez, departman
 * önekine göre bir aile simgesine, o da yoksa genel simgeye düşer.
 */

interface Paint {
  /** Hat (stroke) özellikleri — ana renk. */
  s: Record<string, string | number>;
  /** Vurgu hattı — accent. */
  as: Record<string, string | number>;
  /** Ana renk dolgu. */
  P: string;
  /** Vurgu dolgu. */
  A: string;
  /** Kart zemini — üst üste binen şekillerin arkasını örtmek için. */
  S: string;
}

type Draw = (p: Paint) => ReactNode;

const target: Draw = ({ s, as, A }) => (
  <>
    <circle cx="16" cy="16" r="11" {...s} />
    <circle cx="16" cy="16" r="6.5" {...s} />
    <circle cx="16" cy="16" r="2.6" fill={A} />
    <path d="M16 16 25 7M21.5 6.5H25.5V10.5" {...as} />
  </>
);

const eye: Draw = ({ s, P, A }) => (
  <>
    <path d="M3 16c3.5-6 8-9 13-9s9.5 3 13 9c-3.5 6-8 9-13 9s-9.5-3-13-9z" {...s} />
    <circle cx="16" cy="16" r="5" fill={A} />
    <circle cx="16" cy="16" r="1.9" fill={P} />
  </>
);

const flagHill: Draw = ({ s, A }) => (
  <>
    <path d="M4 27c4-4 8-6 12-6s8 2 12 6M16 21V5" {...s} />
    <path d="M16 6h9.5l-2.6 3.5 2.6 3.5H16z" fill={A} />
  </>
);

const gantt: Draw = ({ s, P, A }) => (
  <>
    <path d="M5 5v22h22" {...s} />
    <rect x="9" y="8" width="10" height="3.6" rx="1.8" fill={A} />
    <rect x="13" y="14" width="11" height="3.6" rx="1.8" fill={P} />
    <rect x="9" y="20" width="7" height="3.6" rx="1.8" fill={A} opacity={0.55} />
  </>
);

const layers: Draw = ({ s, A }) => (
  <>
    <path d="M16 5 4 11l12 6 12-6z" fill={A} />
    <path d="M4 16.5l12 6 12-6M4 21.5l12 6 12-6" {...s} />
  </>
);

const checklist: Draw = ({ s, as }) => (
  <>
    <rect x="6" y="5" width="20" height="22" rx="3" {...s} />
    <path d="M10 12l2 2 3.5-3.5M10 20l2 2 3.5-3.5" {...as} />
    <path d="M19 12.5h3.5M19 20.5h3.5" {...s} />
  </>
);

const trayOut: Draw = ({ s, as }) => (
  <>
    <path d="M4 18v7a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2v-7M4 18h6l2 3h8l2-3h6" {...s} />
    <path d="M16 15V4.5M11.5 9 16 4.5 20.5 9" {...as} />
  </>
);

const folder: Draw = ({ s, A }) => (
  <>
    <path d="M4 9a2 2 0 0 1 2-2h6l3 3h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...s} />
    <rect x="8" y="15" width="16" height="3.4" rx="1.7" fill={A} />
  </>
);

const wallet: Draw = ({ s, A }) => (
  <>
    <path d="M5 11l14.5-5 2.2 5M5 11h20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" {...s} />
    <rect x="19" y="15.5" width="8" height="5.5" rx="2.75" fill={A} />
  </>
);

const barsLens: Draw = ({ s, A }) => (
  <>
    <path d="M5 26v-5M9.5 26v-9M14 26v-6M23.5 16.5 28 21" {...s} />
    <circle cx="20" cy="12" r="5.5" {...s} />
    <circle cx="20" cy="12" r="2.5" fill={A} />
  </>
);

const reportPie: Draw = ({ s, A }) => (
  <>
    <path d="M8 4h11l6 6v18H8zM19 4v6h6" {...s} />
    <circle cx="16" cy="19.5" r="5" {...s} />
    <path d="M16 19.5v-5a5 5 0 0 1 5 5z" fill={A} />
  </>
);

const clipboard: Draw = ({ s, A }) => (
  <>
    <rect x="7" y="6" width="18" height="22" rx="3" {...s} />
    <rect x="12" y="3.5" width="8" height="4.5" rx="1.6" fill={A} />
    <path d="M11.5 18l3 3 6-6.5" {...s} />
  </>
);

const orgTree: Draw = ({ s, A }) => (
  <>
    <circle cx="16" cy="7" r="3.6" fill={A} />
    <path d="M16 10.6V21M16 15H7v6M16 15h9v6" {...s} />
    <circle cx="7" cy="24" r="3" {...s} />
    <circle cx="16" cy="24" r="3" {...s} />
    <circle cx="25" cy="24" r="3" {...s} />
  </>
);

const buildingLens: Draw = ({ s, as }) => (
  <>
    <path d="M4 27V9l8-4v22M12 13h5M3 27h13M7.5 11v1M7.5 16v1M7.5 21v1" {...s} />
    <circle cx="21.5" cy="18" r="5" {...as} />
    <path d="M25 21.5 28.5 25" {...as} />
  </>
);

const stackedDocs: Draw = ({ s, as, S }) => (
  <>
    <rect x="11" y="4" width="15" height="19" rx="2" {...s} />
    <rect x="6" y="9" width="15" height="19" rx="2" {...s} fill={S} />
    <path d="M10 15h7M10 19h7M10 23h4" {...as} />
  </>
);

const compass: Draw = ({ s, P, A }) => (
  <>
    <circle cx="16" cy="16" r="11" {...s} />
    <path d="M21 11l-2.8 7.2L11 21l2.8-7.2z" fill={A} />
    <circle cx="16" cy="16" r="1.5" fill={P} />
  </>
);

const personPlus: Draw = ({ s, as }) => (
  <>
    <circle cx="13" cy="11" r="5" {...s} />
    <path d="M4 27c0-5 4-8 9-8s9 3 9 8" {...s} />
    <path d="M25 9v8M21 13h8" {...as} />
  </>
);

const gradCap: Draw = ({ s, A }) => (
  <>
    <path d="M3 12l13-6 13 6-13 6z" fill={A} />
    <path d="M8 15v6c2.5 2 5 3 8 3s5.5-1 8-3v-6M27 13v7" {...s} />
  </>
);

const gauge: Draw = ({ s, as, P }) => (
  <>
    <path d="M5 23a11 11 0 1 1 22 0M8.3 15.2l1.5 1.1M16 12v1.8M23.7 15.2l-1.5 1.1" {...s} />
    <path d="M16 23l5.5-6.5" {...as} />
    <circle cx="16" cy="23" r="2.2" fill={P} />
  </>
);

const idCard: Draw = ({ s, A }) => (
  <>
    <rect x="4" y="7" width="24" height="18" rx="3" {...s} />
    <circle cx="11" cy="14" r="3" fill={A} />
    <path d="M7 21c.8-2 2.2-3 4-3s3.2 1 4 3M18.5 13h5.5M18.5 17h5.5M18.5 21h3" {...s} />
  </>
);

const bubbles: Draw = ({ s, A, S }) => (
  <>
    <rect x="12" y="12" width="17" height="12" rx="3" fill={A} />
    <path d="M24 23.5v4l-4.5-4z" fill={A} />
    <path d="M5 5h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-4 3.5V17H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" {...s} fill={S} />
  </>
);

const arrowsInOut: Draw = ({ s, as }) => (
  <>
    <path d="M5 11h19M20 7l4 4-4 4" {...s} />
    <path d="M27 21H8M12 17l-4 4 4 4" {...as} />
  </>
);

const receipt: Draw = ({ s, A }) => (
  <>
    <path d="M8 4h16v24l-2.7-2-2.6 2-2.7-2-2.7 2-2.6-2L8 28zM12 10h8M12 14h8" {...s} />
    <rect x="12" y="18" width="8" height="3.5" rx="1.75" fill={A} />
  </>
);

const percentSeal: Draw = ({ s, as, P }) => (
  <>
    <circle cx="16" cy="16" r="11" {...s} />
    <path d="M11 21l10-10" {...as} />
    <circle cx="11.5" cy="11.5" r="2" fill={P} />
    <circle cx="20.5" cy="20.5" r="2" fill={P} />
  </>
);

const pieSlice: Draw = ({ s, A }) => (
  <>
    <path d="M14 7a10 10 0 1 0 10 10H14z" {...s} />
    <path d="M17 4a10 10 0 0 1 10 10H17z" fill={A} />
  </>
);

const sprout: Draw = ({ s, A }) => (
  <>
    <path d="M16 28V15M16 17c-6 0-9-3-9-8 5 0 9 2.5 9 8zM9 28h14" {...s} />
    <path d="M16 15c0-5 3-8 9-8 0 5-3 8-9 8z" fill={A} />
  </>
);

const warning: Draw = ({ s, as, A }) => (
  <>
    <path d="M16 4l13 23H3z" {...s} />
    <path d="M16 12v7" {...as} />
    <circle cx="16" cy="23" r="1.5" fill={A} />
  </>
);

const scales: Draw = ({ s, P, A }) => (
  <>
    <path d="M16 5v21M10 27h12M6 9h20M6 9l-3.5 8M6 9l3.5 8M26 9l-3.5 8M26 9l3.5 8" {...s} />
    <path d="M2.5 17a3.5 2.2 0 0 0 7 0z" fill={A} />
    <path d="M22.5 17a3.5 2.2 0 0 0 7 0z" fill={P} />
  </>
);

const cashFlow: Draw = ({ s, A }) => (
  <>
    <path d="M3 19c4 0 4-6 8.5-6s4.5 6 9 6 4.5-6 8.5-6" {...s} />
    <circle cx="11.5" cy="7.5" r="3" fill={A} />
    <circle cx="20.5" cy="25.5" r="3" fill={A} opacity={0.55} />
  </>
);

const lineChart: Draw = ({ s, as, P }) => (
  <>
    <path d="M5 5v22h22" {...s} />
    <path d="M9 21l5-6 4 3 7-9" {...as} />
    <circle cx="25" cy="9" r="2.2" fill={P} />
  </>
);

const calendarCoin: Draw = ({ s, A }) => (
  <>
    <rect x="5" y="7" width="22" height="20" rx="3" {...s} />
    <path d="M5 13h22M11 4v5M21 4v5" {...s} />
    <circle cx="16" cy="20" r="3.8" fill={A} />
  </>
);

const podium: Draw = ({ s, A }) => (
  <>
    <rect x="12" y="11" width="8" height="16" fill={A} />
    <path d="M4 27v-9h8M20 21h8v6M3 27h26" {...s} />
    <path d="M16 3.5l1.3 2.6 2.9.4-2.1 2 .5 2.8L16 10l-2.6 1.3.5-2.8-2.1-2 2.9-.4z" fill={A} />
  </>
);

const audience: Draw = ({ s, A }) => (
  <>
    <circle cx="16" cy="10" r="3.8" fill={A} />
    <path d="M9.5 23c0-3.8 2.9-6.5 6.5-6.5s6.5 2.7 6.5 6.5z" fill={A} />
    <circle cx="6.5" cy="13" r="2.6" {...s} />
    <circle cx="25.5" cy="13" r="2.6" {...s} />
    <path d="M2 23c0-2.8 2-4.8 4.5-4.8M30 23c0-2.8-2-4.8-4.5-4.8M4 27h24" {...s} />
  </>
);

const searchCursor: Draw = ({ s, as, A }) => (
  <>
    <rect x="3" y="6" width="26" height="10" rx="5" {...s} />
    <circle cx="9" cy="11" r="2" {...as} />
    <path d="M14 11h9" {...s} />
    <path d="M18 16v11l2.9-2.7 2.3 4.4 1.9-1-2.3-4.3H27z" fill={A} />
  </>
);

const envelope: Draw = ({ s, A }) => (
  <>
    <rect x="4" y="9" width="24" height="17" rx="3" {...s} />
    <path d="M5 11l11 8 11-8" {...s} />
    <circle cx="26" cy="8.5" r="3.8" fill={A} />
  </>
);

const megaphone: Draw = ({ s, as }) => (
  <>
    <path d="M5 13v6h4l11 6V7L9 13zM9 19l2 7h3l-1.5-6" {...s} />
    <path d="M24 12c1.5 1 2.5 2.5 2.5 4s-1 3-2.5 4" {...as} />
  </>
);

const cube: Draw = ({ s, A }) => (
  <>
    <path d="M16 4l11 6-11 6-11-6z" fill={A} />
    <path d="M16 4l11 6v12l-11 6-11-6V10zM5 10l11 6 11-6M16 16v12" {...s} />
  </>
);

const rocket: Draw = ({ s, A }) => (
  <>
    <path d="M16 3.5c5 3 7 8 6 15.5H10c-1-7.5 1-12.5 6-15.5zM10 18.5l-4 4V25h5M22 18.5l4 4V25h-5" {...s} />
    <circle cx="16" cy="11.5" r="2.5" fill={A} />
    <path d="M13.5 22.5 16 28.5l2.5-6z" fill={A} />
  </>
);

const heartBubble: Draw = ({ s, A }) => (
  <>
    <path d="M6 5h20a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-9l-5 4v-4H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" {...s} />
    <path d="M16 19s-5.5-3.2-5.5-6.6a2.9 2.9 0 0 1 5.5-1.3 2.9 2.9 0 0 1 5.5 1.3C21.5 15.8 16 19 16 19z" fill={A} />
  </>
);

const gem: Draw = ({ s, A }) => (
  <>
    <path d="M12 13l4-7 4 7z" fill={A} />
    <path d="M9 6h14l5 7-12 14L4 13zM4 13h24M12 13l4 14 4-14" {...s} />
  </>
);

const magnet: Draw = ({ s, A }) => (
  <>
    <rect x="7" y="5" width="5" height="4.5" fill={A} />
    <rect x="20" y="5" width="5" height="4.5" fill={A} />
    <path d="M7 5v10a9 9 0 0 0 18 0V5h-5v10a4 4 0 0 1-8 0V5z" {...s} />
  </>
);

const funnel: Draw = ({ s, A }) => (
  <>
    <path d="M4 6h24l-4 5H8z" fill={A} />
    <path d="M4 6h24l-9 11v8l-6 3V17z" {...s} />
  </>
);

const rings: Draw = ({ s, as }) => (
  <>
    <circle cx="12" cy="16" r="7" {...s} />
    <circle cx="20" cy="16" r="7" {...as} />
  </>
);

const globePin: Draw = ({ s, A }) => (
  <>
    <circle cx="14" cy="18" r="10" {...s} />
    <ellipse cx="14" cy="18" rx="4.5" ry="10" {...s} />
    <path d="M4 18h20" {...s} />
    <path d="M24 2.5a4 4 0 0 1 4 4c0 3-4 7-4 7s-4-4-4-7a4 4 0 0 1 4-4z" fill={A} />
  </>
);

const addressBook: Draw = ({ s, A }) => (
  <>
    <rect x="7" y="4" width="19" height="24" rx="3" {...s} />
    <path d="M4 10h5M4 16h5M4 22h5M11 23c.6-3 2.8-5 5.5-5s4.9 2 5.5 5" {...s} />
    <circle cx="16.5" cy="12.5" r="3.5" fill={A} />
  </>
);

const cart: Draw = ({ s, A }) => (
  <>
    <rect x="11" y="10" width="11" height="6" rx="1" fill={A} opacity={0.5} />
    <path d="M3 5h4l3 14h14l3-10H8.5" {...s} />
    <circle cx="12" cy="25" r="2.2" fill={A} />
    <circle cx="22" cy="25" r="2.2" fill={A} />
  </>
);

const warehouse: Draw = ({ s, A }) => (
  <>
    <path d="M4 28V9l12-5 12 5v19" {...s} />
    <rect x="13" y="13.5" width="6" height="6" rx="0.8" {...s} />
    <rect x="9" y="20.5" width="6" height="6" rx="0.8" fill={A} />
    <rect x="17" y="20.5" width="6" height="6" rx="0.8" {...s} />
  </>
);

const truck: Draw = ({ s, A, S }) => (
  <>
    <rect x="3" y="8" width="15" height="13" rx="1.5" fill={A} />
    <path d="M18 12h6l4 5v4H18z" {...s} />
    <circle cx="8.5" cy="23" r="2.6" {...s} fill={S} />
    <circle cx="22.5" cy="23" r="2.6" {...s} fill={S} />
  </>
);

const medal: Draw = ({ s, as }) => (
  <>
    <path d="M11 19.5 9 28l7-3 7 3-2-8.5" {...s} />
    <circle cx="16" cy="12.5" r="8" {...s} />
    <path d="M12.5 12.5l2.5 2.5 4.5-5" {...as} />
  </>
);

const codeWindow: Draw = ({ s, as }) => (
  <>
    <rect x="3" y="6" width="26" height="20" rx="3" {...s} />
    <path d="M3 11h26M12 15l-3 3 3 3M20 15l3 3-3 3" {...s} />
    <path d="M17.5 14l-3 8" {...as} />
  </>
);

const laptop: Draw = ({ s, A }) => (
  <>
    <rect x="6" y="6" width="20" height="14" rx="2" {...s} />
    <rect x="9" y="9" width="14" height="8" rx="1" fill={A} />
    <path d="M3 23h26v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...s} />
  </>
);

const shieldLock: Draw = ({ s, A }) => (
  <>
    <path d="M16 3.5l10 4v7.5c0 6.5-4.5 11-10 13-5.5-2-10-6.5-10-13V7.5z" {...s} />
    <rect x="12" y="15" width="8" height="6.5" rx="1.5" fill={A} />
    <path d="M13.5 15v-2a2.5 2.5 0 0 1 5 0v2" {...s} />
  </>
);

const bulb: Draw = ({ s, A }) => (
  <>
    <path d="M11 19.5a7.5 7.5 0 1 1 10 0c-1 1-1.5 2-1.5 3h-7c0-1-.5-2-1.5-3zM12.5 26h7M14 29h4" {...s} />
    <circle cx="16" cy="13.5" r="3" fill={A} />
  </>
);

const headset: Draw = ({ s, A }) => (
  <>
    <path d="M6 18v-3a10 10 0 0 1 20 0v3M26 25c0 2-2 3.5-5 3.5h-3" {...s} />
    <rect x="4" y="17" width="5" height="8" rx="2" fill={A} />
    <rect x="23" y="17" width="5" height="8" rx="2" fill={A} />
  </>
);

const contract: Draw = ({ s, as }) => (
  <>
    <path d="M7 4h13l5 5v19H7zM11 11h8M11 15h10" {...s} />
    <path d="M11 23c1.5-2 2.5-2 3 0s1.5 2 3 0 2-1 3 0" {...as} />
  </>
);

const copyright: Draw = ({ s, as }) => (
  <>
    <circle cx="16" cy="16" r="11" {...s} />
    <path d="M20 12.5a5 5 0 1 0 0 7" {...as} />
  </>
);

const courthouse: Draw = ({ s, A }) => (
  <>
    <path d="M4 11l12-6 12 6z" fill={A} />
    <path d="M7 14v10M13 14v10M19 14v10M25 14v10M4 27h24" {...s} />
  </>
);

const priceTag: Draw = ({ s, A }) => (
  <>
    <path d="M5 5h9.5L28 18.5 18.5 28 5 14.5z" {...s} />
    <circle cx="10.5" cy="10.5" r="2.5" fill={A} />
  </>
);

const key: Draw = ({ s, A }) => (
  <>
    <circle cx="10" cy="16" r="6" {...s} />
    <circle cx="10" cy="16" r="2.2" fill={A} />
    <path d="M16 16h12M24.5 16v4.5M20.5 16v3" {...s} />
  </>
);

const personKey: Draw = ({ s, as, A }) => (
  <>
    <circle cx="12" cy="10" r="4.5" {...s} />
    <path d="M4 26c0-4.5 3.5-7.5 8-7.5" {...s} />
    <circle cx="20.5" cy="19.5" r="3.5" fill={A} />
    <path d="M23 22l5.5 5.5M26.5 25.5l-2 2" {...as} />
  </>
);

const calendarPlay: Draw = ({ s, A }) => (
  <>
    <rect x="4" y="6" width="24" height="21" rx="3" {...s} />
    <path d="M4 12h24M10 3.5v5M22 3.5v5" {...s} />
    <path d="M14 15.5v8l6.5-4z" fill={A} />
  </>
);

const ticket: Draw = ({ s, as }) => (
  <>
    <path d="M4 10a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6z" {...s} />
    <path d="M19.5 9.5v13" {...as} strokeDasharray="2 2.4" />
  </>
);

const sparkle: Draw = ({ s, A }) => (
  <>
    <path d="M16 5c.8 5.2 2.8 7.2 8 8-5.2.8-7.2 2.8-8 8-.8-5.2-2.8-7.2-8-8 5.2-.8 7.2-2.8 8-8z" fill={A} />
    <path d="M24.5 21.5v5M22 24h5" {...s} />
  </>
);

const BY_KEY: Record<string, Draw> = {
  // Yönetim
  yonetim_hedef_belirleme: target,
  yonetim_vizyon_sablonu: eye,
  yonetim_misyon_sablonu: flagHill,
  yonetim_proje_yonetimi: gantt,
  yonetim_program_yonetimi: layers,
  yonetim_gorev_yonetimi: checklist,
  yonetim_cikti_yonetimi: trayOut,
  yonetim_dosya_yonetimi: folder,
  yonetim_butce_yonetimi: wallet,
  yonetim_analiz: barsLens,
  yonetim_raporlama: reportPie,
  yonetim_denetim: clipboard,
  holding_analiz: orgTree,
  holding_denetim: buildingLens,
  holding_raporlama: stackedDocs,
  kimlik_ve_yon: compass,

  // İnsan kaynakları
  ik_ise_alim_oryantasyon: personPlus,
  ik_egitim_gelisim: gradCap,
  ik_performans_izleme: gauge,
  ik_bordro_ozluk: idCard,
  ik_ic_iletisim_kultur: bubbles,

  // Finans muhasebe
  fm_alacak_borc: arrowsInOut,
  fm_fatura: receipt,
  fm_vergi_takip: percentSeal,
  fm_butce_hazirlama: pieSlice,
  fm_sermaye_yatirim_takip: sprout,
  fm_risk_yonetimi: warning,
  fm_gelir_gider: scales,
  fm_nakit_akis: cashFlow,
  fm_analiz_rapor: lineChart,
  fm_finansal_planlama: calendarCoin,

  // Pazarlama ve büyüme
  pd_rakip_sektor_analizi: podium,
  pd_hedef_kitle: audience,
  pd_dijital_pazarlama: searchCursor,
  pd_dijital_pazarlama_seo_sem: searchCursor,
  pd_email: envelope,
  pd_reklam: megaphone,
  pd_urun_stratejileri: cube,
  pd_buyume_hedefleri: rocket,
  pd_sosyal_medya: heartBubble,
  pd_marka_kimligi: gem,
  pd_musteri_kazanim_optimizasyonu: magnet,
  icerik_takvimi: calendarPlay,

  // Satış ve iş geliştirme — müşteri modülü üç anahtarla da görünebiliyor,
  // hepsi aynı ortak `party` varlığı olduğu için aynı simge.
  spd_satis_planlama_b2b_b2c: funnel,
  spd_ortaklik_dagitim: rings,
  spd_pazar_arastirma: globePin,
  spd_musteri_modulu: addressBook,
  mid_musteri_modulu: addressBook,
  crm_musteri: addressBook,

  // Operasyon / üretim
  oud_tedarik: cart,
  oud_depo: warehouse,
  oud_sevkiyat_yonetimi: truck,
  oud_kalite_kontrol: medal,

  // Bilgi teknolojileri
  bt_yazilim: codeWindow,
  bt_donanim: laptop,
  bt_ag_guvenlik: shieldLock,

  // Müşteri ilişkileri
  mid_sikayet_oneri: bulb,
  mid_teknik_destek: headset,
  talep_yonetimi: ticket,

  // Hukuk ve uyum
  hud_sozlesme: contract,
  hud_marka_patent_telif: copyright,
  hud_mevzuatlar: courthouse,

  // Ürün ve hesaplar
  uyd_urunler: priceTag,
  urun_yonetimi: priceTag,
  hesaplar: key,
  ekip_hesaplari: personKey,
};

// Tanınmayan anahtar için departman önekine göre aile simgesi.
const BY_PREFIX: [string, Draw][] = [
  ["yonetim_", compass],
  ["holding_", orgTree],
  ["ik_", idCard],
  ["fm_", lineChart],
  ["pd_", megaphone],
  ["spd_", funnel],
  ["oud_", warehouse],
  ["bt_", codeWindow],
  ["mid_", headset],
  ["hud_", courthouse],
];

function drawFor(moduleKey: string): Draw {
  const exact = BY_KEY[moduleKey];
  if (exact) return exact;
  const family = BY_PREFIX.find(([prefix]) => moduleKey.startsWith(prefix));
  return family ? family[1] : sparkle;
}

/** Testler ve olası başka yüzeyler için: bu anahtarın kendine özgü bir çizimi var mı. */
export function hasOwnEmblem(moduleKey: string): boolean {
  return moduleKey in BY_KEY;
}

interface Props {
  moduleKey: string;
  /** Karonun kenar uzunluğu (px). Çizim bunun ~%64'ü. */
  size?: number;
  /**
   * Köşe yuvarlaklığı. Verilmezse boyuttan türetilir. Satırın soluna tam boy
   * yaslanan simgede (bkz. ListRowLink iconBleed) yalnızca sol köşeler
   * yuvarlanır ve çerçeve kalkar — satırın kendi çerçevesi zaten var.
   */
  radius?: string;
}

export default function ModuleEmblem({ moduleKey, size = 40, radius }: Props) {
  const c = useThemeColors();
  const stroke = {
    fill: "none",
    stroke: c.primary,
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const paint: Paint = {
    s: stroke,
    as: { ...stroke, stroke: c.accent, strokeWidth: 2.2 },
    P: c.primary,
    A: c.accent,
    S: c.surface,
  };
  const glyph = Math.round(size * 0.64);

  return (
    <span
      className="module-emblem"
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius ?? Math.round(size * 0.28),
        // Zemin iki rengin çok açık bir karışımı: kartın beyazından ayrışacak
        // kadar, başlığın önüne geçmeyecek kadar.
        background: `linear-gradient(140deg, color-mix(in srgb, ${c.accent} 16%, ${c.surface}), color-mix(in srgb, ${c.primary} 7%, ${c.surface}))`,
        border: radius ? "none" : `1px solid color-mix(in srgb, ${c.accent} 20%, ${c.border})`,
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 32 32">
        {drawFor(moduleKey)(paint)}
      </svg>
    </span>
  );
}
