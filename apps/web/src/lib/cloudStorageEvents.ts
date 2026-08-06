/**
 * Google Drive kartı ile OneDrive kartı birbirinden bağımsız bileşenler ama
 * depolama sağlayıcısı yalnızca biri olabilir: biri bağlanıp/kaldırılınca
 * diğerinin "kilitli" durumu da anında güncellenmeli. Sayfa yenilemeden bunu
 * yapabilmek için basit bir olay (event) kullanıyoruz.
 */
const EVENT_NAME = "projelio:cloud-storage-changed";

export function notifyCloudStorageChanged(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onCloudStorageChanged(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
