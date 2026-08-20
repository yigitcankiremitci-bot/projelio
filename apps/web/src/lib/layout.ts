// Sidebar genişliği: birden çok yerde (Sidebar, App, BottomNav'ın masaüstü FAB'ı)
// kullanıldığı için tek bir yerden yönetiliyor. Sidebar artık Grup > Organizasyon >
// Departman/İş hiyerarşisini de gösterdiği için (bkz. SidebarTree), üç seviye
// girintili satırların (özellikle departman isimlerinin) kesilmeden sığması adına
// 232 -> 272 -> (yine dar geldiği için) %20 daha artırılıp 328'e çıkarıldı.
export const SIDEBAR_WIDTH = 328;

/**
 * Sayfa içeriğinin yan boşluğu.
 *
 * Masaüstünde 28 px; dar ekranda 16. Telefonda iki yandan 28'er piksel, 390 px'lik
 * bir ekranın yaklaşık %15'ini yiyor — dört sütunlu özet ızgarasının (bkz.
 * StatGrid) sığmamasının sebeplerinden biri buydu.
 *
 * Kapak (EntityCover) ve negatif kenar boşluğuyla ekran kenarına dayanan
 * şeritler AYNI değeri kullanmak zorunda: biri 28'de kalırsa kapak başlığı ile
 * altındaki içerik farklı hizalarda durur.
 */
export const PAGE_GUTTER_DESKTOP = 28;
export const PAGE_GUTTER_MOBILE = 16;

export function pageGutter(isDesktop: boolean): number {
  return isDesktop ? PAGE_GUTTER_DESKTOP : PAGE_GUTTER_MOBILE;
}
