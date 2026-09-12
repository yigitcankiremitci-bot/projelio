import type {
  PasskeyAuthOptions,
  ServiceAccount,
  ServiceAccountGrant,
  ServiceAccountList,
  ServiceCredential,
  ServiceCredentialSecret,
  ServiceCredentialView,
  ServiceUnlockResult,
} from "@projelio/shared";
import { api } from "./client";

/**
 * Hesaplar modülünün uçları.
 *
 * SIR YALNIZCA `goster` ile gelir; listeler sırsızdır. Dönen değer hiçbir
 * state'e kalıcı yazılmaz (bkz. HesapKimlikModal) ve her gösterim sunucuda
 * denetim izine yazılır.
 *
 * Kapsam (şirket/departman ya da iş) yolun BAŞINDA: yetki hep oradan
 * çözülüyor. Kayıt başına uçlarda kapsam yok — kaydın kendisi taşıyor.
 */

export interface HesapGirdisi {
  name?: string;
  category?: string;
  url?: string;
  loginMethod?: string;
  plan?: string;
  ownerUserId?: string | null;
  note?: string;
  isPaid?: boolean;
  amount?: number | null;
  currency?: string;
  billingInterval?: string | null;
  nextDueDate?: string | null;
}

export interface HesapKimlikGirdisi {
  label?: string;
  username?: string;
  /** Boş bırakılırsa mevcut şifreye dokunulmaz. */
  password?: string;
  note?: string;
  totp?: string;
}

export type HesapKapsami = { organizationId: string; departmentId?: string } | { jobId: string };

/** Kapsamın adres öneki ve sorgu dizesi — dört uçta birden kullanılıyor. */
export function kapsamYolu(kapsam: HesapKapsami): { taban: string; sorgu: string } {
  if ("jobId" in kapsam) return { taban: `/jobs/${kapsam.jobId}`, sorgu: "" };
  return {
    taban: `/organizations/${kapsam.organizationId}`,
    sorgu: kapsam.departmentId ? `?departmentId=${encodeURIComponent(kapsam.departmentId)}` : "",
  };
}

export const hesaplarApi = {
  liste: (kapsam: HesapKapsami) => {
    const { taban, sorgu } = kapsamYolu(kapsam);
    return api.get<ServiceAccountList>(`${taban}/service-accounts${sorgu}`);
  },

  ekle: (kapsam: HesapKapsami, body: HesapGirdisi) => {
    const { taban, sorgu } = kapsamYolu(kapsam);
    return api.post<ServiceAccount>(`${taban}/service-accounts${sorgu}`, body);
  },

  guncelle: (id: string, body: HesapGirdisi) => api.patch<ServiceAccount>(`/service-accounts/${id}`, body),

  sil: (id: string) => api.delete<{ ok: true }>(`/service-accounts/${id}`),

  // ---------------------------------------------------------------- Paylaşım

  paylasimlar: (kapsam: HesapKapsami, accountId?: string) => {
    const { taban, sorgu } = kapsamYolu(kapsam);
    const ek = accountId ? `${sorgu ? "&" : "?"}accountId=${accountId}` : "";
    return api.get<ServiceAccountGrant[]>(`${taban}/service-account-grants${sorgu}${ek}`);
  },

  paylas: (kapsam: HesapKapsami, body: { userId: string; accountId?: string | null; expiresAt?: string | null }) => {
    const { taban, sorgu } = kapsamYolu(kapsam);
    return api.post<ServiceAccountGrant>(`${taban}/service-account-grants${sorgu}`, body);
  },

  paylasimiKaldir: (grantId: string) => api.delete<{ ok: true }>(`/service-account-grants/${grantId}`),

  // ---------------------------------------------------------------- Kilit

  sifreyleAc: (password: string) =>
    api.post<ServiceUnlockResult>("/service-accounts/unlock/password", { password }),

  gecisAnahtariSecenekleri: () =>
    api.post<PasskeyAuthOptions>("/service-accounts/unlock/passkey-options", {}),

  gecisAnahtariylaAc: (body: {
    challenge: string;
    credentialId: string;
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
  }) => api.post<ServiceUnlockResult>("/service-accounts/unlock/passkey", body),

  // ---------------------------------------------------------------- Giriş bilgileri

  kimlikler: (accountId: string) => api.get<ServiceCredential[]>(`/service-accounts/${accountId}/credentials`),

  kimlikEkle: (accountId: string, body: HesapKimlikGirdisi) =>
    api.post<ServiceCredential>(`/service-accounts/${accountId}/credentials`, body),

  kimlikGuncelle: (id: string, body: HesapKimlikGirdisi) =>
    api.patch<ServiceCredential>(`/service-credentials/${id}`, body),

  kimlikSil: (id: string) => api.delete<{ ok: true }>(`/service-credentials/${id}`),

  /** POST — her gösterim sunucuda denetim izine yazılır ve kilit jetonu ister. */
  goster: (id: string, unlockToken: string) =>
    api.post<ServiceCredentialSecret>(`/service-credentials/${id}/reveal`, { unlockToken }),

  gosterimler: (accountId: string) =>
    api.get<ServiceCredentialView[]>(`/service-accounts/${accountId}/credential-views`),
};
