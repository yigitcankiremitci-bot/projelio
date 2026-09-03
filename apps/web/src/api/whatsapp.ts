import type {
  WhatsappConnectionSummary,
  WhatsappLinkCode,
  WhatsappLinkedUser,
  WhatsappMessage,
  WhatsappOverview,
  WhatsappThread,
} from "@projelio/shared";
import { api } from "./client";

/**
 * WhatsApp köprüsü uçları — havuz modeli (bkz. docs/whatsapp-qr-plan.md §12).
 *
 * QR görseli JSON içinde data-URL olarak gelir: <img> etiketi yetki başlığı
 * taşıyamadığı için görseli doğrudan adresle çekmek mümkün değil.
 */
export const whatsappApi = {
  // --- Her kullanıcı (Ayarlar) ---
  overview: () => api.get<WhatsappOverview>("/whatsapp/me"),
  linkCode: () => api.post<WhatsappLinkCode>("/whatsapp/me/link-code", {}),
  optOut: () => api.post<{ ok: true }>("/whatsapp/me/opt-out", {}),
  unlink: () => api.post<{ ok: true }>("/whatsapp/me/unlink", {}),

  // --- Müşteri konuşmaları ---
  threads: () => api.get<WhatsappThread[]>("/whatsapp/threads"),
  openThread: (body: { phone?: string; partyId?: string; displayName?: string }) => api.post<{ id: string }>("/whatsapp/threads", body),
  messages: (threadId: string, limit = 50) => api.get<WhatsappMessage[]>(`/whatsapp/threads/${threadId}/messages?limit=${limit}`),
  send: (threadId: string, body: string) => api.post<WhatsappMessage>(`/whatsapp/threads/${threadId}/messages`, { body }),
  setAutoReply: (threadId: string, enabled: boolean) => api.patch<WhatsappThread>(`/whatsapp/threads/${threadId}/auto-reply`, { enabled }),

  // --- Yönetici: numara havuzu ---
  admin: {
    list: () => api.get<WhatsappConnectionSummary[]>("/admin/whatsapp/numbers"),
    linkedUsers: () => api.get<WhatsappLinkedUser[]>("/admin/whatsapp/linked-users"),
    add: (label: string) => api.post<WhatsappConnectionSummary>("/admin/whatsapp/numbers", { label }),
    start: (id: string) => api.post<WhatsappConnectionSummary>(`/admin/whatsapp/numbers/${id}/start`, {}),
    qr: (id: string) => api.get<{ qr: string | null }>(`/admin/whatsapp/numbers/${id}/qr`),
    pairingCode: (id: string, phone: string) => api.post<{ code: string }>(`/admin/whatsapp/numbers/${id}/pairing-code`, { phone }),
    logout: (id: string) => api.post<{ ok: true }>(`/admin/whatsapp/numbers/${id}/logout`, {}),
    remove: (id: string) => api.delete<{ ok: true; movedUsers: number }>(`/admin/whatsapp/numbers/${id}`),
  },
};
