// Sidebar genişliği: birden çok yerde (Sidebar, App, BottomNav'ın masaüstü FAB'ı)
// kullanıldığı için tek bir yerden yönetiliyor. Sidebar artık Grup > Organizasyon >
// Departman/İş hiyerarşisini de gösterdiği için (bkz. SidebarTree), üç seviye
// girintili satırların (özellikle departman isimlerinin) kesilmeden sığması adına
// 232 -> 272 -> (yine dar geldiği için) %20 daha artırılıp 328'e çıkarıldı.
export const SIDEBAR_WIDTH = 328;
