import type {
  SocialAccount,
  SocialContentType,
  SocialMediaOverview,
  SocialPlatform,
  SocialPost,
  SocialPostStatus,
} from "@projelio/shared";
import { api } from "./client";

/**
 * Sosyal Medya modülünün uçları.
 *
 * Kapsam (organizasyon / iş) yalnızca listeleme ve oluşturmada yolun başında
 * durur; tekil kayıt işlemlerinde kaydın sahibi sunucuda kaydın kendisinden
 * okunur — ön yüzün kapsamı tekrar taşımasına gerek yok.
 */

export type SocialScope = { organizationId: string; departmentId?: string } | { jobId: string };

export interface SocialAccountInput {
  platform?: SocialPlatform;
  handle?: string;
  displayName?: string;
  profileUrl?: string;
  followerCount?: number;
  audienceNote?: string;
  toneNote?: string;
  postingFrequency?: string;
  color?: string;
  ownerUserId?: string | null;
  active?: boolean;
  departmentId?: string;
}

export interface SocialPostInput {
  title?: string;
  caption?: string;
  hashtags?: string;
  linkUrl?: string;
  firstComment?: string;
  contentType?: SocialContentType;
  campaign?: string;
  status?: SocialPostStatus;
  scheduledAt?: string | null;
  assigneeId?: string | null;
  reach?: number | null;
  engagement?: number | null;
  clicks?: number | null;
  resultNote?: string;
  departmentId?: string;
  accountIds?: string[];
  captionOverrides?: Record<string, string>;
}

function base(scope: SocialScope): string {
  return "jobId" in scope ? `/jobs/${scope.jobId}` : `/organizations/${scope.organizationId}`;
}

/** Departman bağlamı sorguda gider: aynı modül iki departmanda etkin olabilir. */
function overviewPath(scope: SocialScope): string {
  if ("jobId" in scope) return `/jobs/${scope.jobId}/social-media`;
  const q = scope.departmentId ? `?departmentId=${encodeURIComponent(scope.departmentId)}` : "";
  return `/organizations/${scope.organizationId}/social-media${q}`;
}

/** Oluşturma gövdesine departman bağlamını ekler (iş kapsamında anlamsız). */
function withScope<T extends object>(scope: SocialScope, body: T): T & { departmentId?: string } {
  return "jobId" in scope ? body : { ...body, departmentId: scope.departmentId };
}

export const socialMediaApi = {
  /** Modül açılışının tek isteği: hesaplar + gönderiler. */
  overview: (scope: SocialScope) => api.get<SocialMediaOverview>(overviewPath(scope)),

  createAccount: (scope: SocialScope, body: SocialAccountInput) =>
    api.post<SocialAccount>(`${base(scope)}/social-accounts`, withScope(scope, body)),

  updateAccount: (id: string, body: SocialAccountInput) =>
    api.patch<SocialAccount>(`/social-accounts/${id}`, body),

  /** Arşivler — geçmiş gönderilerin hangi hesaba gittiği kaybolmasın. */
  archiveAccount: (id: string) => api.delete<{ ok: true }>(`/social-accounts/${id}`),

  /** Tek gönderi — yayın sonrası kanal durumlarını tazelemek için. */
  getPost: (postId: string) => api.get<SocialPost>(`/social-posts/${postId}`),

  createPost: (scope: SocialScope, body: SocialPostInput) =>
    api.post<SocialPost>(`${base(scope)}/social-posts`, withScope(scope, body)),

  updatePost: (id: string, body: SocialPostInput) => api.patch<SocialPost>(`/social-posts/${id}`, body),

  /** Takvimde sürükleme: yalnızca tarih gider, formun tamamı değil. */
  reschedule: (id: string, scheduledAt: string | null) =>
    api.patch<SocialPost>(`/social-posts/${id}/schedule`, { scheduledAt }),

  archivePost: (id: string) => api.delete<{ ok: true }>(`/social-posts/${id}`),

  restorePost: (id: string) => api.patch<SocialPost>(`/social-posts/${id}/restore`, {}),

  /** Dosya Drive/OneDrive'da kalır; burada yalnızca gönderiye bağlanır. */
  attachMedia: (postId: string, fileId: string, altText?: string) =>
    api.post<SocialPost>(`/social-posts/${postId}/media`, { fileId, altText }),

  detachMedia: (mediaId: string) => api.delete<{ ok: true }>(`/social-media/${mediaId}`),

  // ---------------------------------------------------------------- Instagram

  /** Entegrasyon bu kurulumda yapılandırılmış mı (ortam değişkenleri). */
  instagramStatus: () => api.get<{ configured: boolean }>("/social-media/instagram/status"),

  /**
   * Bağlantı akışının başlangıç adresi.
   *
   * `next` dönüşte kullanıcının geleceği ön yüz yolu; state içinde taşınır,
   * böylece Meta'dan dönen istek hangi ekrandan başlandığını biliyor.
   */
  instagramConnectUrl: (scope: SocialScope, next: string) => {
    const params = new URLSearchParams({ next });
    if (!("jobId" in scope) && scope.departmentId) params.set("departmentId", scope.departmentId);
    return api.get<{ configured: boolean; url: string | null }>(
      `${base(scope)}/social-media/instagram/connect-url?${params.toString()}`
    );
  },

  /** Bağlantıyı koparır; hesap kaydı ve geçmişi kalır. */
  disconnectInstagram: (accountId: string) => api.post<{ ok: true }>(`/social-accounts/${accountId}/disconnect`, {}),

  /** "Şimdi paylaş" — yayımlanmamış bütün kanallar denenir. */
  publishPost: (postId: string) =>
    api.post<{ published: number; failed: number }>(`/social-posts/${postId}/publish`, {}),

  /** Tek kanalı yeniden dener. */
  publishTarget: (targetId: string) => api.post<{ ok: boolean }>(`/social-post-targets/${targetId}/publish`, {}),
};
