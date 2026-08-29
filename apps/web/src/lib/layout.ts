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

/**
 * SABİT KATMAN SIRASI — tek kaynak.
 *
 * Ekranda sürekli duran çok sayıda `position: fixed` öğe var: alt menü, üst
 * maske, kenar çubuğu, çekmece karartması, kişi şeridi, sağ üst düğmeler, Lio
 * balonu, paneller, pencereler. Her biri kendi dosyasında elle yazılmış bir
 * sayı taşıdığı sürece "hangisi hangisinin üstünde" sorusunun cevabı hiçbir
 * yerde yazılı olmuyor ve çakışmalar ancak belirli bir ekran genişliğinde,
 * kullanıcının ekran görüntüsüyle ortaya çıkıyor.
 *
 * AYIKLANAN HATA. Telefonda kenar çubuğu ÇEKMECE olarak açılıyor (38) ama
 * bildirim çanı ve tur düğmesi 40'ta, Lio balonu 45'te duruyordu. Sonuç: dar
 * bir telefonda çekmecenin kendi kapatma düğmesi çanın ARKASINDA kaldı, Lio
 * balonu da çekmecenin menü satırlarının üstüne bindi. Oysa çekmece açıkken
 * ekranda görünmesi gereken tek şey çekmecedir; onun üstünde kalması gereken
 * hiçbir uygulama süsü yok.
 *
 * KURAL: yeni bir `position: fixed` öğe eklerken zIndex'i buraya bir satır
 * ekleyerek al, sayıyı bileşenin içine yazma. Sıralama değişmezleri
 * layout.test.ts'te sabitlenmiştir; oradaki testler kırılıyorsa katman sırası
 * bozulmuştur.
 *
 * Bu ölçek yalnızca UYGULAMA GENELİNDEKİ sabit katmanları kapsar. Bir bileşenin
 * kendi içindeki küçük yığınlar (açılır menü, kapak perdesi üstündeki başlık
 * bloğu vb.) kendi yığın bağlamlarında yaşar ve buraya girmez.
 */
export const Z = {
  /** Alt menüdeki seçim menüsünü kapatmak için ekranı kaplayan görünmez katman. */
  bottomNavBackdrop: 29,
  bottomNavFab: 30,
  bottomNav: 31,
  bottomNavMenu: 32,
  /** Kapaksız sayfalarda sabit düğmelerin altından geçen içeriği gizleyen üst maske. */
  headerMask: 35,
  /** Masaüstünde yerinde duran kenar çubuğu ve kaydırınca beliren üst şerit. */
  sidebarDocked: 36,
  stickyHeader: 36,
  /** Sol alttaki "bu sayfada kim var" şeridi. */
  presenceStrip: 39,
  /**
   * Süren yüklemelerin köşedeki göstergesi. Kişi şeridinin ÜSTÜNDE: şerit
   * yalnızca bilgi (pointerEvents: none), tepside ise "vazgeç" düğmesi var.
   */
  uploadTray: 41,
  /** Sağ üstteki bildirim çanı ve tur düğmesi, sol üstteki sidebar oku ve logo. */
  topChrome: 40,
  /** Sağ alttaki Lio balonu. */
  aiLauncher: 45,
  /**
   * Telefondaki çekmece ve karartması. BÜTÜN uygulama süslerinin ÜSTÜNDE:
   * çekmece açıkken çan, tur düğmesi, kişi şeridi ve Lio balonu onun arkasında
   * kalmalı — yoksa dar ekranlarda üst üste binerler.
   */
  drawerScrim: 48,
  drawer: 49,
  /** Lio sohbet paneli ve karartması — çekmecenin de üstünde: en son açılan yüzey. */
  aiPanelScrim: 60,
  aiPanel: 61,
  /** Lio bir kayıt oluşturduğunda beliren şerit. */
  aiActivity: 62,
  /** Ortada açılan pencereler. */
  modal: 100,
  filePreview: 110,
  /** "Geri al" bildirimi ve ilk kurulum sihirbazı: her şeyin üstünde. */
  undoToast: 120,
  onboarding: 200,
} as const;

/**
 * Sağ üstteki sabit düğmelerin (bildirim çanı, tur düğmesi) kapladığı bant.
 *
 * Sayfa içeriği bu banda giremez. Kapak başlığındaki kişi kartı, kapak
 * yüksekliği, üstten bırakılan boşluk — hepsi bu değerden türetilmeli;
 * her ekranın kendi 62'sini yazması, düğme boyutu değiştiğinde yalnızca bazı
 * sayfaların düzelmesi demekti.
 */
export const TOP_CHROME = {
  /** Düğmelerin üstten uzaklığı. */
  top: 14,
  /** En büyük düğmenin çapı (bildirim çanı). */
  size: 44,
  /** Ekran kenarından uzaklık. */
  gutter: 14,
} as const;

/** Sağ üst düğme bandının alt sınırı: altına konan her şey bu değerden sonra başlamalı. */
export const TOP_CHROME_BOTTOM = TOP_CHROME.top + TOP_CHROME.size + 4;

/**
 * Kaydırınca beliren sabit şeridin üst satırının yüksekliği.
 *
 * App.tsx'ten buraya taşındı: yalnızca şeridin kendi ölçüsü değil, kapağın
 * üstünde bırakılması gereken boşluğun da dayanağı (bkz. COVER_TOP_CLEARANCE).
 */
export const STICKY_TOP_ROW = 68;

/**
 * DAR EKRANDA KAPAĞIN ÜSTÜNDE BIRAKILAN BOŞLUK.
 *
 * AYIKLANAN HATA. Kapak sayfalarında sayfa gövdesi bilerek üst şeridin altından
 * başlıyor (App.tsx `paddingTop: isCoverPage ? 0 : HEADER_HEIGHT`): kapak
 * dekoratif bir bant, yüzen düğmeler onun üstünde durabilir. Ama kapağın YAZI
 * bloğu dibe yaslı ve içerik uzadıkça yukarı doğru büyüyor. Şirket kapağında
 * (geri bağlantısı + iki satır başlık + açıklama + künye) blok 188 px'e çıkıp
 * bandın içine girdi: "‹ Organizasyonlar" bağlantısı yüzen logonun altında
 * kayboldu, başlık sol üstteki kenar çubuğu okuyla üst üste bindi.
 *
 * İKİ SINIR birden sağlanmalı:
 *   1. TOP_CHROME_BOTTOM — logo, kenar çubuğu oku, çan ve yardım düğmesinin bandı.
 *   2. STICKY_TOP_ROW — sayfanın kendi geri bağlantısı bu çizgiyi geçtiği anda
 *      yüzen "geri hapı" devralıyor (bkz. App.tsx stage.back). Kapak bağlantısı
 *      en baştan bu çizginin ÜSTÜNDE doğarsa hap sayfa hiç kaydırılmadan açılır
 *      ve hemen altındaki başlığın üzerine oturur.
 *
 * Bu yüzden değer ikisinin de üstünde: şeridin devir çizgisinden bir tık aşağı.
 */
export const COVER_TOP_CLEARANCE = STICKY_TOP_ROW + 12;

/**
 * Sağ alttaki Lio balonunun ölçüleri ve ekran kenarlarına uzaklığı.
 *
 * Balonun kendi dosyasında (AiLauncher) durduğu sürece, onun ÜSTÜNE konması
 * gereken şeyler (Lio'nun iş bildirimi şeridi) sayıyı elle kopyalamak zorunda
 * kalıyordu; balon büyüdüğünde şerit balonun içine giriyordu. Ölçü artık burada.
 */
export const LIO_LAUNCHER = {
  /** Ekranın sağ kenarına uzaklık. */
  right: 18,
  /** Masaüstünde ekranın dibine oturur; telefonda alt menünün üstünde durur. */
  bottomDesktop: 22,
  /**
   * Telefonda alt menünün ÜSTÜNDE durması gereken mesafe.
   *
   * Alt menünün yüksekliği `68px + env(safe-area-inset-bottom)`: çentikli
   * telefonlarda ana ekran çubuğu için ~34 px daha büyüyor. Balon düz 96 px'te
   * dururken menü 102 px'e çıkıyor ve balon menünün üstüne biniyordu — bu
   * yüzden ölçü CSS'te hesaplanıyor, sayı olarak değil (bkz. lioBottomCss).
   */
  bottomMobile: 96,
  /** Dar ekranda balon küçülüyor: 132 px telefonun genişliğinin üçte birini yiyordu. */
  sizeDesktop: 132,
  sizeMobile: 88,
} as const;

/**
 * Telefondaki alt menünün yüksekliği (güvenli alan HARİÇ).
 *
 * Menü ekranın dibine sabitli ve gerçek yüksekliği
 * `BOTTOM_NAV_HEIGHT + env(safe-area-inset-bottom)`. Üstünde durması gereken
 * her şey (Lio balonu) bu değeri aşmak zorunda — sabit bir sayı yazmak,
 * çentikli telefonlarda menünün büyüdüğünü görmemek demekti.
 */
export const BOTTOM_NAV_HEIGHT = 68;

/**
 * Balonun (ve üstüne konan şeridin) alt kenar mesafesi.
 *
 * Telefonda güvenli alan eklenir; masaüstünde böyle bir şey yok. Sayı değil
 * CSS dizesi döner: `env()` yalnızca CSS'te çözülebiliyor.
 */
export function lioBottomCss(isDesktop: boolean, ek = 0): string {
  if (isDesktop) return `${LIO_LAUNCHER.bottomDesktop + ek}px`;
  return `calc(${LIO_LAUNCHER.bottomMobile + ek}px + env(safe-area-inset-bottom))`;
}

/** Lio sohbet panelinin masaüstü genişliği (telefonda tüm ekranı kaplar). */
export const AI_PANEL_WIDTH = 460;

/** Panelin renkli başlık şeridinin yüksekliği: 16 (dolgu) + 36 (avatar) + 16. */
export const AI_PANEL_HEADER_HEIGHT = 68;

/** Şerit ile balon arasındaki boşluk. */
const LIO_ACTIVITY_GAP = 10;

/**
 * Lio'nun "şunu yaptım" şeridinin (bkz. AiLiveActivity) ekrandaki yeri.
 *
 * NEDEN BURADA: şerit önce üst ortada duruyordu; sayfa başlığının, bildirim
 * çanının ve kaydırma şeridinin bulunduğu banda giriyor, üstelik Lio'nun kendi
 * işini haber verdiği hâlde Lio'dan uzakta beliriyordu. Artık haberin kaynağının
 * yanında — balonun hemen üstünde — çıkıyor.
 *
 * Panel açıkken balon zaten gizleniyor (bkz. AiLauncher): şerit masaüstünde
 * panelin soluna geçer, telefonda ise panel tüm ekranı kapladığı için başlığın
 * hemen altına oturur (altta yazı kutusu var, orası kapatılmamalı).
 */
export function lioActivityAnchor(opts: {
  isDesktop: boolean;
  panelOpen: boolean;
  /** Lio Ayarlar > Yardımcılar'dan gizlenmişse üstünde durulacak bir balon yok. */
  launcherVisible: boolean;
}): { right: number; top?: number; bottom?: string } {
  const { isDesktop, panelOpen, launcherVisible } = opts;

  if (panelOpen) {
    return isDesktop
      ? { right: AI_PANEL_WIDTH + LIO_LAUNCHER.right, bottom: lioBottomCss(true) }
      : { right: LIO_LAUNCHER.right, top: AI_PANEL_HEADER_HEIGHT + 8 };
  }

  const size = isDesktop ? LIO_LAUNCHER.sizeDesktop : LIO_LAUNCHER.sizeMobile;
  return {
    right: LIO_LAUNCHER.right,
    bottom: lioBottomCss(isDesktop, launcherVisible ? size + LIO_ACTIVITY_GAP : 0),
  };
}

/**
 * Telefondaki çekmecenin genişliği.
 *
 * İki sınır birlikte: sabit bir üst sınır (geniş telefonda gereksiz yayılmasın)
 * ve ekran genişliğine bağlı bir tavan — arkada karartmadan en az bu kadar bir
 * şerit KALMALI, çünkü çekmeceyi kapatmanın en doğal yolu dışarı dokunmak.
 * Dar bir telefonda eski sabit 352 px, 393 px'lik ekranda 41 px'lik bir şerit
 * bırakıyordu; kullanıcı çekmeceyi kapatmak için nişan almak zorundaydı.
 *
 * `100vw` bilerek kullanılıyor: Ayarlar'daki yazı boyutu <html> üzerinde CSS
 * "zoom" uyguladığı için görünüm birimleri birkaç piksel kayabiliyor (bkz.
 * Sidebar'daki yükseklik notu). Burada bunun bir zararı yok — genişlikte birkaç
 * piksellik sapma çekmeceyi biraz dar/geniş yapar, kırılan bir düzen olmaz.
 */
export const DRAWER_MAX_WIDTH = SIDEBAR_WIDTH + 24;
export const DRAWER_MIN_SCRIM = 56;
export const DRAWER_WIDTH_CSS = `min(${DRAWER_MAX_WIDTH}px, calc(100vw - ${DRAWER_MIN_SCRIM}px))`;
