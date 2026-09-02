import type { WhatsappLinkCode, WhatsappOverview } from "@projelio/shared";
import { api } from "./client";

/**
 * WhatsApp köprüsü uçları (bkz. docs/whatsapp-qr-plan.md).
 *
 * QR görseli JSON içinde data-URL olarak gelir: <img> etiketi yetki başlığı
 * taşıyamadığı için görseli doğrudan adresle çekmek mümkün değil.
 */
export const whatsappApi = {
  /** Ayarlar ekranının tek çağrısı: organizasyon başına bağlantı + kendi durumum. */
  overview: () => api.get<WhatsappOverview>("/whatsapp/me"),

  // --- Organizasyon sahibi ---
  start: (organizationId: string) =>
    api.post<{ ok: true }>(`/organizations/${organizationId}/whatsapp/connection/start`, {}),

  qr: (organizationId: string) =>
    api.get<{ qr: string | null }>(`/organizations/${organizationId}/whatsapp/connection/qr`),

  pairingCode: (organizationId: string, phone: string) =>
    api.post<{ code: string }>(`/organizations/${organizationId}/whatsapp/connection/pairing-code`, { phone }),

  logout: (organizationId: string) =>
    api.post<{ ok: true }>(`/organizations/${organizationId}/whatsapp/connection/logout`, {}),

  // --- Her kullanıcı ---
  linkCode: (organizationId: string) => api.post<WhatsappLinkCode>("/whatsapp/me/link-code", { organizationId }),

  optOut: (organizationId: string) => api.post<{ ok: true }>("/whatsapp/me/opt-out", { organizationId }),
};
