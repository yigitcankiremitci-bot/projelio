import type { MailAccount, MailFolder, MailListPage, MailMessageDetail } from "@projelio/shared";
import { api } from "./client";

/**
 * E-posta modülünün gelen kutusu uçları.
 *
 * İletiler Projelio'da saklanmıyor; her çağrı arka planda Microsoft Graph'a
 * gidiyor (bkz. backend/src/modules/mailbox). Bu yüzden liste ve ileti
 * istekleri ağ gecikmesi taşır — arayüz yükleniyor durumlarını gizlememeli.
 */

export type MailScope = { organizationId: string; departmentId?: string } | { jobId: string };

function base(scope: MailScope): string {
  return "jobId" in scope ? `/jobs/${scope.jobId}` : `/organizations/${scope.organizationId}`;
}

function scopeQuery(scope: MailScope, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  if (!("jobId" in scope) && scope.departmentId) params.set("departmentId", scope.departmentId);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

export const mailboxApi = {
  /** Entegrasyon bu kurulumda yapılandırılmış mı. */
  status: () => api.get<{ configured: boolean }>("/mail/status"),

  listAccounts: (scope: MailScope) =>
    api.get<MailAccount[]>(`${base(scope)}/mail/accounts${scopeQuery(scope)}`),

  /**
   * Bağlama akışının başlangıç adresi.
   *
   * `shared` verilirse kullanıcının kendi kutusu değil, erişimi olan paylaşılan
   * bir kutu (info@ gibi) bağlanır.
   */
  connectUrl: (scope: MailScope, next: string, shared?: string) =>
    api.get<{ configured: boolean; url: string | null }>(
      `${base(scope)}/mail/connect-url${scopeQuery(scope, { next, shared })}`
    ),

  updateAccount: (accountId: string, body: { signature?: string; displayName?: string; active?: boolean }) =>
    api.patch<MailAccount>(`/mail/accounts/${accountId}`, body),

  /** Kutuyu modülden kaldırır; Microsoft bağlantısına dokunmaz. */
  unlink: (accountId: string) => api.delete<{ ok: true }>(`/mail/accounts/${accountId}`),

  folders: (accountId: string) => api.get<MailFolder[]>(`/mail/accounts/${accountId}/folders`),

  messages: (accountId: string, options: { folderId?: string; skip?: number; search?: string } = {}) => {
    const params = new URLSearchParams();
    if (options.folderId) params.set("folderId", options.folderId);
    if (options.skip) params.set("skip", String(options.skip));
    if (options.search) params.set("search", options.search);
    const q = params.toString();
    return api.get<MailListPage>(`/mail/accounts/${accountId}/messages${q ? `?${q}` : ""}`);
  },

  message: (accountId: string, messageId: string) =>
    api.get<MailMessageDetail>(`/mail/accounts/${accountId}/messages/${encodeURIComponent(messageId)}`),

  markRead: (accountId: string, messageId: string, isRead: boolean) =>
    api.patch<{ ok: true }>(`/mail/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/read`, {
      isRead,
    }),

  /** Lio taslak yazar — göndermez. */
  draft: (accountId: string, messageId: string, body: { instruction?: string; tone?: string }) =>
    api.post<{ text: string }>(
      `/mail/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/draft`,
      body
    ),

  reply: (
    accountId: string,
    messageId: string,
    body: { text: string; mode?: "reply" | "replyAll" | "forward"; to?: string[] }
  ) =>
    api.post<{ ok: true }>(
      `/mail/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/reply`,
      body
    ),
};
