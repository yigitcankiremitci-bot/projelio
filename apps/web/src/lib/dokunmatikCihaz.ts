/**
 * Telefon/tablet mi? "Bilgisayardan seç" gibi metinlerin kararı buradan verilir.
 *
 * Ekran genişliğine (`useIsDesktop`) bakılmıyor: daraltılmış bir masaüstü
 * penceresi hâlâ bilgisayardır, yatay tutulan bir tablet ise geniş olsa da
 * bilgisayar değildir. Soru ekranın boyu değil, dosyanın NEREDEN geldiği —
 * onu da işaretçinin türü söylüyor. `hover: none` dokunmatik ekranlı
 * dizüstülerini dışarıda bırakır (onların faresi de var).
 */
export const DOKUNMATIK_CIHAZ =
  typeof window !== "undefined" &&
  window.matchMedia?.("(hover: none) and (pointer: coarse)").matches === true;
