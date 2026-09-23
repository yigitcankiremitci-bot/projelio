import type { EkipHesabi, EkipHesabiGirdisi, EkipHesabiSecenekleri } from "@projelio/shared";
import { api } from "./client";

/**
 * Ekip Hesapları uçları (bkz. backend modules/ekip-hesaplari).
 * Şirket yolun başında: yetki hep oradan çözülüyor.
 */
export const ekipHesaplariApi = {
  secenekler: (organizationId: string) =>
    api.get<EkipHesabiSecenekleri>(`/organizations/${organizationId}/ekip-hesaplari/secenekler`),
  liste: (organizationId: string) => api.get<EkipHesabi[]>(`/organizations/${organizationId}/ekip-hesaplari`),
  kullaniciAdiUygun: (organizationId: string, username: string) =>
    api.get<{ uygun: boolean }>(
      `/organizations/${organizationId}/ekip-hesaplari/kullanici-adi?username=${encodeURIComponent(username)}`
    ),
  olustur: (organizationId: string, girdi: EkipHesabiGirdisi) =>
    api.post<{ hesap: EkipHesabi; epostaGonderildi: boolean }>(`/organizations/${organizationId}/ekip-hesaplari`, girdi),
  baglantiGonder: (id: string) => api.post<{ epostaGonderildi: boolean }>(`/ekip-hesaplari/${id}/baglanti`, {}),
};
