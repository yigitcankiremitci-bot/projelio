/**
 * Açık soketin kimliği — API isteklerine `X-Socket-Id` başlığı olarak eklenir.
 *
 * NEDEN AYRI DOSYA: `api/client.ts` bu değeri okumak zorunda, `lib/socket.ts`
 * ise API_URL için client'ı okuyor. İkisi birbirini import ederse döngü oluşur;
 * değer bu küçük ara modülde durur.
 *
 * Sunucu bu kimlikten aktörün hangi sayfada (odada) olduğunu bulur ve
 * değişikliği oradaki diğer kullanıcılara yayar (bkz. backend
 * realtime.interceptor.ts).
 */
let socketId: string | undefined;

export function setSocketId(id: string | undefined): void {
  socketId = id;
}

export function getSocketId(): string | undefined {
  return socketId;
}
