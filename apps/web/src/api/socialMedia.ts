import type {
  SocialAccount,
  SocialAccountMediaItem,
  SocialAnalyticsOverview,
  SocialCaptionSuggestion,
  SocialCompetitor,
  SocialCompetitorOverview,
  SocialDiscovery,
  SocialHashtagTrack,
  SocialIdeaReport,
  SocialInspiration,
  SocialMediaHistory,
  SocialProgressData,
  SocialInspirationInput,
  SocialContentType,
  SocialMediaOverview,
  SocialPlatform,
  SocialPost,
  SocialPostCollaboratorInput,
  SocialPostStatus,
  SocialPublishVia,
  SocialTrialReel,
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
  publishVia?: SocialPublishVia;
  externalTool?: string | null;
  /** Deneme reels; null = normal gönderi. Gönderilmezse sunucu dokunmaz (migration 139 öncesi uyum). */
  trialReel?: SocialTrialReel | null;
  /** Verilirse katkıda bulunan listesi bununla değiştirilir. */
  collaborators?: SocialPostCollaboratorInput[];
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

/** Tek yayın isteğinin tavanı: sunucunun video bekleme süresi (2 dk) + pay. */
const YAYIN_SURESI_MS = 3 * 60_000;

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

  /**
   * "Tekrar paylaş": gönderiyi yeni bir TASLAK olarak çoğaltır. Metin, görseller
   * ve hedef hesaplar taşınır; yayın damgası ve sonuç ölçümleri taşınmaz.
   */
  duplicatePost: (id: string, scheduledAt?: string) =>
    api.post<SocialPost>(`/social-posts/${id}/duplicate`, { scheduledAt }),

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
  // Video yayınında sunucu Meta'nın kodlamasını 2 dakikaya kadar bekliyor
  // (instagram-publish.service > POLL_TIMEOUT_MS); 30 sn'lik varsayılanla
  // istemci "yanıt vermedi" deyip yayın arkada sürerken kullanıcıyı yanıltıyordu.
  publishPost: (postId: string) =>
    api.post<{ published: number; failed: number }>(`/social-posts/${postId}/publish`, {}, undefined, YAYIN_SURESI_MS),

  /** Tek kanalı yeniden dener. */
  publishTarget: (targetId: string) =>
    api.post<{ ok: boolean }>(`/social-post-targets/${targetId}/publish`, {}, undefined, YAYIN_SURESI_MS),

  /**
   * Lio'nun açıklama + etiket önerisi. Video indirilip karelere bölünüyor ve
   * sesi yazıya dökülüyor — dakikalar sürebilir. Öneri kaydedilmez, döner.
   */
  lioOnerisi: (postId: string, istek?: string) =>
    api.post<SocialCaptionSuggestion>(`/social-posts/${postId}/lio-oneri`, { istek }, undefined, 5 * 60_000),

  // ---------------------------------------------------------------- Analiz ve fikirler

  /** Analiz sekmesinin tek isteği: bağlı hesaplar, gönderi metrikleri, ilhamlar, son raporlar. */
  analiz: (scope: SocialScope) => {
    if ("jobId" in scope) return api.get<SocialAnalyticsOverview>(`/jobs/${scope.jobId}/social-media/analiz`);
    const q = scope.departmentId ? `?departmentId=${encodeURIComponent(scope.departmentId)}` : "";
    return api.get<SocialAnalyticsOverview>(`/organizations/${scope.organizationId}/social-media/analiz${q}`);
  },

  /** Hesabın gönderilerini ve metriklerini Instagram'dan çeker (150 gönderiye kadar — sürebilir). */
  analizSenkron: (accountId: string) =>
    api.post<{ medya: number; metrik: number; atlandi?: true }>(
      `/social-accounts/${accountId}/analiz/senkron`,
      {},
      undefined,
      3 * 60_000
    ),

  /** Lio: "bu gönderi neden böyle gitti" — video indirilip karelere bölünür. */
  gonderiAnalizi: (mediaId: string) =>
    api.post<SocialAccountMediaItem>(`/social-account-media/${mediaId}/lio-analiz`, {}, undefined, 5 * 60_000),

  ilhamEkle: (scope: SocialScope, body: SocialInspirationInput) =>
    api.post<SocialInspiration>(`${base(scope)}/social-inspirations`, withScope(scope, body)),

  ilhamGuncelle: (id: string, body: SocialInspirationInput) =>
    api.patch<SocialInspiration>(`/social-inspirations/${id}`, body),

  ilhamSil: (id: string) => api.delete<{ ok: true }>(`/social-inspirations/${id}`),

  ilhamAnalizi: (id: string) =>
    api.post<SocialInspiration>(`/social-inspirations/${id}/lio-analiz`, {}, undefined, 5 * 60_000),

  /** Lio fikir raporu — metin modeli, birkaç bin token çıktı. */
  fikirUret: (scope: SocialScope, body: { accountId?: string; istek?: string }) =>
    api.post<SocialIdeaReport>(`${base(scope)}/social-media/fikirler`, withScope(scope, body), undefined, 3 * 60_000),

  /** İlerleyiş grafikleri: takipçi + günlük kazanılan izlenme (son `gun` gün). */
  ilerleyis: (scope: SocialScope, gun: number, accountId?: string) => {
    const q = new URLSearchParams({ gun: String(gun) });
    if (accountId) q.set("accountId", accountId);
    if (!("jobId" in scope) && scope.departmentId) q.set("departmentId", scope.departmentId);
    const yol =
      "jobId" in scope
        ? `/jobs/${scope.jobId}/social-media/analiz/ilerleyis`
        : `/organizations/${scope.organizationId}/social-media/analiz/ilerleyis`;
    return api.get<SocialProgressData>(`${yol}?${q.toString()}`);
  },

  // ---------------------------------------------------------------- Rakipler (Facebook Login)

  rakipler: (scope: SocialScope) => {
    if ("jobId" in scope) return api.get<SocialCompetitorOverview>(`/jobs/${scope.jobId}/social-media/rakipler`);
    const q = scope.departmentId ? `?departmentId=${encodeURIComponent(scope.departmentId)}` : "";
    return api.get<SocialCompetitorOverview>(`/organizations/${scope.organizationId}/social-media/rakipler${q}`);
  },

  facebookConnectUrl: (scope: SocialScope, next: string) => {
    const params = new URLSearchParams({ next });
    if (!("jobId" in scope) && scope.departmentId) params.set("departmentId", scope.departmentId);
    return api.get<{ url: string }>(`${base(scope)}/social-media/facebook/connect-url?${params.toString()}`);
  },

  facebookKaldir: (scope: SocialScope) => {
    const q = !("jobId" in scope) && scope.departmentId ? `?departmentId=${encodeURIComponent(scope.departmentId)}` : "";
    return api.delete<{ ok: true }>(`${base(scope)}/social-media/facebook${q}`);
  },

  /** Takipteki rakipleri Meta'dan okur — rakip başına bir istek, sürebilir. */
  rakipSenkron: (scope: SocialScope) =>
    api.post<{ okunan: number; atlanan: number }>(`${base(scope)}/social-media/rakipler/senkron`, withScope(scope, {}), undefined, 3 * 60_000),

  rakipTakip: (inspirationId: string, takip: boolean) =>
    api.patch<SocialCompetitor[]>(`/social-inspirations/${inspirationId}/takip`, { takip }, undefined, 2 * 60_000),

  hashtagEkle: (scope: SocialScope, hashtag: string) =>
    api.post<SocialHashtagTrack>(`${base(scope)}/social-media/hashtagler`, withScope(scope, { hashtag }), undefined, 3 * 60_000),

  hashtagAyarla: (id: string, aktif: boolean) => api.patch<{ ok: true }>(`/social-hashtag-tracks/${id}`, { aktif }),

  hashtagSil: (id: string) => api.delete<{ ok: true }>(`/social-hashtag-tracks/${id}`),

  /** Tek gönderinin metrik geçmişi (büyüme eğrisi). */
  medyaGecmisi: (mediaId: string) => api.get<SocialMediaHistory>(`/social-account-media/${mediaId}/gecmis`),

  /** "Benzer hesap bul" — Lio açık web'de arar; sunucu 3 dakikaya kadar bekliyor. */
  benzerHesapBul: (scope: SocialScope, body: { accountId?: string; istek?: string }) =>
    api.post<SocialDiscovery>(`${base(scope)}/social-media/benzer-hesaplar`, withScope(scope, body), undefined, 4 * 60_000),
};
