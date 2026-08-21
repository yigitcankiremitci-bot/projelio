import { api } from "../api/client";

export const TOKEN_KEY = "projelio_token";

/**
 * KAYAN OTURUM.
 *
 * Token localStorage'da duruyor ve sunucudaki JWT_EXPIRES_IN kadar (varsayılan
 * 7 gün) geçerli. Yenileme olmadan bu süre token'ın ÜRETİLDİĞİ andan işliyordu:
 * uygulamayı her gün açan biri bile 7. günün sonunda giriş ekranına düşüyordu.
 *
 * Çözüm: uygulama her açıldığında token'ı yenisiyle değiştir (bkz. backend
 * /auth/refresh). Böylece süre "son kullanımdan itibaren" işler — düzenli
 * kullananın oturumu hiç kapanmaz, yalnızca uzun süre hiç girmeyeninki kapanır.
 *
 * Sessiz başarısızlık bilinçli: ağ yoksa ya da sunucu kapalıysa mevcut token
 * zaten geçerli olduğu için kullanıcıyı rahatsız etmeye gerek yok. Token
 * GERÇEKTEN geçersizse istek 401 döner ve client.ts'teki tek merkezden
 * yönetilen oturum sonlanma akışı devreye girer — buraya ayrıca bir çıkış
 * mantığı EKLENMEMELİ (bkz. client.ts handleExpiredSession).
 */
export async function refreshSession(): Promise<void> {
  if (!localStorage.getItem(TOKEN_KEY)) return;
  try {
    const { token } = await api.post<{ token: string }>("/auth/refresh", {});
    if (token) localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Yukarıdaki nedenle yutuluyor.
  }
}
