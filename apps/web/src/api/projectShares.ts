import type {
  CreateProjectShareLinkInput,
  ProjectShareLink,
  ProjectShareVisibility,
  PublicProjectAccess,
} from "@projelio/shared";
import { api } from "./client";

/**
 * Üyelik gerektirmeyen proje takip linkleri (bkz. migration 073).
 *
 * `view` ucu KİMLİK DOĞRULAMASIZ çalışır: linki açan kişinin hesabı yok. api
 * istemcisi token varsa gönderir, yoksa göndermez — sunucu ikisini de aynı
 * şekilde karşılıyor, çağrı yerinin bir şey yapması gerekmiyor.
 */
export const projectSharesApi = {
  list: (projectId: string) => api.get<ProjectShareLink[]>(`/projects/${projectId}/share-links`),

  create: (projectId: string, input: CreateProjectShareLinkInput) =>
    api.post<ProjectShareLink>(`/projects/${projectId}/share-links`, input),

  update: (
    id: string,
    input: {
      label?: string;
      visibility?: ProjectShareVisibility;
      expiresInDays?: number | null;
      /** null = e-posta kapısını kaldır. */
      recipientEmail?: string | null;
    }
  ) => api.patch<ProjectShareLink>(`/project-share-links/${id}`, input),

  revoke: (id: string) => api.delete<ProjectShareLink>(`/project-share-links/${id}`),

  /**
   * Linki açan sayfanın ilk çağrısı.
   *
   * ARTIK 404 ATMIYOR: kapalı/olmayan link de 200 ile `state: "closed"` döner,
   * sayfa hata yerine tanıtım gösteriyor. Linkte e-posta kapısı varsa
   * `state: "email_required"` gelir ve görünüm yanıtta HİÇ yer almaz.
   */
  view: (token: string) => api.get<PublicProjectAccess>(`/public/projects/${encodeURIComponent(token)}`),

  /**
   * Kapıyı açma denemesi. Adres gövdede gider — sorgu dizesine konsaydı
   * tarayıcı geçmişine ve sunucu loglarına düşerdi.
   */
  unlock: (token: string, email: string) =>
    api.post<PublicProjectAccess>(`/public/projects/${encodeURIComponent(token)}/unlock`, { email }),
};
