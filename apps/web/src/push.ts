import { api } from "./api/client";
import { kabukBildirimAnahtari, kabukBildirimleriniBaslat } from "./lib/mobilKabuk";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Giriş yaptıktan sonra çağrılır: service worker kaydeder, bildirim izni ister
// ve tarayıcı push aboneliğini backend'e kaydeder. İzin verilmemişse veya
// tarayıcı desteklemiyorsa sessizce hiçbir şey yapmaz.
//
// Mobil kabukta web push yok (WebView'de PushManager bulunmuyor); orada cihaz
// FCM'ye kaydedilir ve anahtarı sunucuya gider (bkz. lib/mobilKabuk.ts).
export async function initPush(): Promise<void> {
  if (!localStorage.getItem("projelio_token")) return;
  const kabukta = kabukBildirimleriniBaslat(async (token) => {
    await api.post("/notifications/devices", { token, platform: "android" });
  });
  if (kabukta) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const { publicKey } = await api.get<{ publicKey: string }>("/notifications/vapid-public-key");
      if (!publicKey) return;

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
    await api.post("/notifications/subscribe", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch {
    // push desteklenmiyor veya izin/ağ hatası — sessizce geç
  }
}

/**
 * Çıkış yaparken çağrılır — token SİLİNMEDEN ÖNCE (istek o token'la gider).
 *
 * NEDEN: cihaz kaydı kullanıcıya bağlı. Çıkış yapan kişinin bildirimleri o
 * telefona/tarayıcıya gelmeye devam ederse, aynı cihazda sonra giriş yapan
 * başka biri onun görev ve mesaj başlıklarını görür. Sonuç beklenmez: ağ
 * yoksa çıkış yine olur; bir sonraki girişte kayıt zaten yeni kullanıcıya
 * taşınıyor (sunucu anahtara göre upsert ediyor).
 */
export function bildirimCihaziniBirak(): void {
  if (!localStorage.getItem("projelio_token")) return;
  // Yalnızca kabuk: anahtar elde hazır, istek EŞZAMANLI başlıyor ve token'ı
  // silinmeden önce okuyor. Tarayıcı aboneliğini bulmak ise asenkron; istek
  // token silindikten sonra 401 alır ve client.ts'in oturum sonlanma akışına
  // düşerdi — tarayıcıdaki kayıt bir sonraki girişte zaten devredilir.
  const token = kabukBildirimAnahtari();
  if (token) void api.post("/notifications/devices/remove", { token }).catch(() => {});
}
