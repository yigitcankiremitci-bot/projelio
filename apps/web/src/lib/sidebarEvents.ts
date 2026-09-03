/**
 * Sidebar'daki gezinme ağacı (bkz. useSidebarHierarchy) verisini yalnızca bir
 * kez, uygulama açılırken çekiyor: <Sidebar> route'ların dışında, uygulama
 * kabuğunda duruyor ve sayfa değiştikçe yeniden kurulmuyor. Bu yüzden bir
 * organizasyonu/işi arşivlemek ya da silmek ağacı kendiliğinden tazelemiyordu —
 * kayıt sunucuda gerçekten arşivlenmiş olmasına rağmen sidebar'da durmaya devam
 * ediyor, ancak F5'ten sonra kayboluyordu ("arşivledim ama hâlâ duruyor").
 *
 * lib/cloudStorageEvents.ts ile aynı desende basit bir window olayı: ağacı
 * ilgilendiren bir değişiklik yapan yer haber verir, sidebar veriyi yeniden çeker.
 */
const EVENT_NAME = "projelio:sidebar-changed";

export function notifySidebarChanged(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onSidebarChanged(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
