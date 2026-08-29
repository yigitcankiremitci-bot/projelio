import type {
  CreateProjectShareLinkInput,
  ProjectShareLink,
  ProjectShareVisibility,
  PublicProjectView,
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
    input: { label?: string; visibility?: ProjectShareVisibility; expiresInDays?: number | null }
  ) => api.patch<ProjectShareLink>(`/project-share-links/${id}`, input),

  revoke: (id: string) => api.delete<ProjectShareLink>(`/project-share-links/${id}`),

  /** Linki açan sayfanın tek çağrısı. 404 = link yok, iptal edilmiş ya da süresi dolmuş. */
  view: (token: string) => api.get<PublicProjectView>(`/public/projects/${encodeURIComponent(token)}`),
};
