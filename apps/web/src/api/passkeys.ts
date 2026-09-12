import type { Passkey, PasskeyRegistrationOptions } from "@projelio/shared";
import { api } from "./client";

/**
 * Geçiş anahtarları — kullanıcının cihazları.
 *
 * Hesaplar modülünden AYRI dosyada çünkü kayıt modüle değil KULLANICIYA ait:
 * yönetimi Ayarlar'da (bkz. PasskeysCard), kullanımı Hesaplar modülünün
 * kilidinde. Aynı anahtar ileride girişte de kullanılabilir.
 */
export const passkeysApi = {
  liste: () => api.get<Passkey[]>("/passkeys"),

  /** POST: her çağrı sunucuda tek kullanımlık bir meydan okuma satırı yazar. */
  kayitSecenekleri: (password?: string) => api.post<PasskeyRegistrationOptions>("/passkeys/registration-options", { password }),

  kaydet: (body: { challenge: string; clientDataJSON: string; attestationObject: string; label?: string }) =>
    api.post<Passkey>("/passkeys/register", body),

  sil: (id: string) => api.delete<{ ok: true }>(`/passkeys/${id}`),
};
