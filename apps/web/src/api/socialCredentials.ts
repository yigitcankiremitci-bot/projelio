import type {
  SocialCredential,
  SocialCredentialGrant,
  SocialCredentialList,
  SocialCredentialSecret,
  SocialCredentialView,
} from "@projelio/shared";
import { api } from "./client";

/**
 * Sosyal hesap giriş bilgileri.
 *
 * socialMedia.ts'ten AYRI dosyada: bu uçların hepsi bir sırla ilgili ve
 * yalnızca hesap şifresi ekranından çağrılıyor. Modülün geri kalanı bu
 * dosyayı hiç import etmiyor — sırra dokunan kod yolu tek yerde kalsın.
 *
 * Şifre YALNIZCA `reveal` ile gelir; listeler sırsızdır. Dönen değer hiçbir
 * state'e kalıcı yazılmaz (bkz. SocialCredentialsModal).
 */

export interface SocialCredentialInput {
  label?: string;
  username?: string;
  /** Boş bırakılırsa mevcut şifreye dokunulmaz. */
  password?: string;
  note?: string;
}

export const socialCredentialsApi = {
  list: (accountId: string) => api.get<SocialCredentialList>(`/social-accounts/${accountId}/credentials`),

  create: (accountId: string, body: SocialCredentialInput) =>
    api.post<SocialCredential>(`/social-accounts/${accountId}/credentials`, body),

  update: (id: string, body: SocialCredentialInput) =>
    api.patch<SocialCredential>(`/social-credentials/${id}`, body),

  remove: (id: string) => api.delete<{ ok: true }>(`/social-credentials/${id}`),

  /** POST — her gösterim sunucuda denetim izine yazılır. */
  reveal: (id: string) => api.post<SocialCredentialSecret>(`/social-credentials/${id}/reveal`, {}),

  grants: (id: string) => api.get<SocialCredentialGrant[]>(`/social-credentials/${id}/grants`),

  grant: (id: string, userId: string, expiresAt: string | null) =>
    api.post<SocialCredentialGrant>(`/social-credentials/${id}/grants`, { userId, expiresAt }),

  revokeGrant: (grantId: string) => api.delete<{ ok: true }>(`/social-credential-grants/${grantId}`),

  /** Denetim izi: şifreyi kim, ne zaman gördü. Yalnızca yöneticiye açık. */
  views: (id: string) => api.get<SocialCredentialView[]>(`/social-credentials/${id}/views`),
};
