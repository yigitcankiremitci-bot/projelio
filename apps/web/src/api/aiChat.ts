import { api } from "./client";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Lio'nun okuyabildiği dosya türleri. */
export type AiAttachmentKind = "image" | "pdf" | "document" | "sheet" | "text" | "audio";

/** Hazırlanmış (okunmuş) bir ek; mesaj gönderilirken yalnızca `id` iletilir. */
export interface AiAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: AiAttachmentKind;
  /** "Excel · 2 sayfa · 40 satır" gibi kısa döküm. */
  detail: string;
  /** Ek hazırlanırken şimdiden düşülen kredi (ses çözümleme). */
  creditsCharged: number;
}

/** Geçmiş mesajlarda görünen ek künyesi (içerik metni arayüze gelmez). */
export interface AiMessageAttachment {
  name: string;
  kind: AiAttachmentKind;
  detail: string;
}

export interface AiStoredMessage extends AiChatMessage {
  id: string;
  creditsCharged: number;
  createdAt: string;
  attachments?: AiMessageAttachment[];
}

/** OneDrive gezinme sonucundaki tek öğe. Google'da bunun yerine Picker açılır. */
export interface AiCloudEntry {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number;
}

export interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiUsageInfo {
  creditsCharged: number;
  balance: number;
}

/** Lio'nun hangi modelle çalışacağı. Kademe yükseldikçe kredi bedeli de artar. */
export type AiModelTier = "fast" | "smart" | "max";

export interface AiModelTierInfo {
  tier: AiModelTier;
  model: string;
  label: string;
  description: string;
  costMultiplier: number;
}

/**
 * Uzayan bir istek duraklatıldığında dönen sonuç: iş yarıda, kullanıcının
 * "devam et" demesi bekleniyor (bkz. backend runLoop/pause).
 */
export interface AiContinuation {
  type: "continuation";
  runId: string;
  /**
   * "estimate" = henüz hiçbir kredi harcanmadan verilen ön uyarı.
   * "budget"   = iş sürerken eşiğin aşılmak üzere olması.
   * "iterations" = adım sınırına gelinmesi.
   */
  reason: "estimate" | "budget" | "iterations";
  text: string;
  spentCredits: number;
  estimatedNextCredits: number;
  doneSummary: string;
  tier: AiModelTier;
}

/** Kredi tükendiği için yarıda kesilen istek. */
export interface AiOutOfCredits {
  type: "out_of_credits";
  text: string;
  balance: number;
  requiredCredits: number;
  doneSummary: string;
}

export type AiChatResult = (
  | { type: "message"; text: string }
  | AiOutOfCredits
  | { type: "confirmation"; actionId: string; summary: string; toolName: string; text?: string }
  | AiContinuation
) & {
  conversationId: string;
  usage: AiUsageInfo;
  /** Sohbette hâlâ açık olan dosyalar — her turda modele gönderiliyorlar. */
  activeFiles: AiActiveFile[];
};

/**
 * Sohbete sabitlenmiş dosya.
 *
 * İş bitene kadar her turda modele gönderilir; bu yüzden her tur ücretlendirilir.
 * Kullanıcının hangi dosyanın hâlâ "taşındığını" görüp kaldırabilmesi için
 * arayüzde ayrı bir şerit olarak gösterilir.
 */
export interface AiActiveFile {
  id: string;
  name: string;
  kind: AiAttachmentKind;
  detail: string;
}

/**
 * Onay yanıtı artık tam bir sohbet sonucudur.
 *
 * Onay verildikten sonra istek kaldığı yerden devam ettiği için sonuç yine
 * "devam edeyim mi?", "kredi bitti" ya da yeni bir onay olabilir — bu yüzden
 * gönderme akışıyla aynı işleyiciden geçer.
 */
export type AiConfirmResult = AiChatResult;

export interface AiCredits {
  balance: number;
  lifetimePurchased: number;
  lifetimeSpent: number;
  minBalanceToStart: number;
  /** Tek bir istek bu krediyi aşacaksa Lio durup onay ister. */
  confirmThreshold: number;
}

export interface AiCreditTransaction {
  id: string;
  type: "topup" | "usage" | "refund" | "adjustment" | "welcome";
  credits: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

export interface AiCreditPackage {
  key: string;
  label: string;
  credits: number;
  priceTry: number;
  description: string;
}

export type AiCreditOrderStatus = "pending_payment" | "paid" | "cancelled" | "failed";

export interface AiCreditOrder {
  id: string;
  userId: string;
  packageKey: string;
  credits: number;
  priceAmount: number;
  currency: string;
  status: AiCreditOrderStatus;
  paidAt?: string;
  /** Dolu ise kredi bakiyeye geçmiştir; "paid" tek başına yeterli değil. */
  creditedAt?: string;
  note?: string;
  createdAt: string;
  userFullName?: string;
  userEmail?: string;
}

export interface AiUserBalanceRow {
  userId: string;
  fullName: string;
  username: string;
  email: string;
  balance: number;
  lifetimePurchased: number;
  lifetimeSpent: number;
}

export interface AiProviderBalance {
  toppedUpUsd: number;
  spentUsd: number;
  spentUsdSource: "manual_checkpoint" | "anthropic_api" | "internal_estimate";
  internalEstimateUsd: number;
  remainingUsd: number;
  remainingCredits: number;
  lastTopups: { amountUsd: number; description?: string; createdAt: string }[];
  lastCheckpoint?: { amountUsd: number; createdAt: string };
}

/**
 * Sağlayıcı sağlık/durum bilgisi (`GET /ai/health`, yalnızca admin).
 *
 * Lio çok sağlayıcılıdır: hangi sağlayıcıların tanımlı ve etkin olduğu
 * sunucudaki AI_PROVIDERS değişkeniyle belirlenir. Panel bunu yalnızca
 * GÖSTERİR — açıp kapatmak sunucu ayarıdır, arayüzden yapılmaz.
 */
export interface AiProviderInfo {
  id: string;
  label: string;
  kind: string;
  /** API anahtarı tanımlı mı? */
  configured: boolean;
  /** AI_PROVIDERS listesinde sayılıyor ve anahtarı var mı? */
  active: boolean;
  models: Array<{
    key: string;
    id: string;
    label: string;
    description: string;
    tier: string;
    vision: boolean;
    contextWindow: number;
    price: { input: number; output: number; cachedInput?: number };
  }>;
  capabilities: { promptCaching: boolean; tools: boolean; vision: boolean };
}

export interface AiHealth {
  apiKeyPresent: boolean;
  apiKeyPrefix: string | null;
  model: string;
  /** Birincil sağlayıcının kimliği; hiç yapılandırılmamışsa null. */
  provider: string | null;
  providers: AiProviderInfo[];
  reachable: boolean;
  error?: string;
  httpStatus?: number;
  transcriptionConfigured: boolean;
}

/** Admin model ayarları (`GET /ai/admin/model-settings`). */
export interface AiModelSettingsResponse {
  defaultTier: string;
  tiers: Array<{ tier: string; modelKey: string | null; updatedAt: string | null }>;
  tierInfo: Array<{ tier: string; label: string; description: string; costMultiplier: number; model: string }>;
  available: Array<{
    key: string;
    providerId: string;
    providerLabel: string;
    id: string;
    label: string;
    description: string;
    tier: string;
    vision: boolean;
    contextWindow: number;
    price: { input: number; output: number; cachedInput?: number };
  }>;
  health: AiHealth;
}

export const aiChat = {
  // Kademe/model GÖNDERİLMEZ: hangi modelin çalışacağına yönetici karar verir
  // (bkz. backend ai-model-settings.service.ts). Sunucu gövdedeki tier alanını
  // zaten yok sayıyor; buradan da göndermiyoruz.
  send: (message: string, conversationId?: string, attachmentIds?: string[]) =>
    api.post<AiChatResult>("/ai/chat", { message, conversationId, attachmentIds }),
  confirm: (actionId: string, confirmed: boolean) =>
    api.post<AiConfirmResult>("/ai/confirm", { actionId, confirmed }),
  // Duraklatılmış bir isteği sürdürür/durdurur. Kademe değiştirilemez.
  continueRun: (runId: string, confirmed: boolean, approveAll?: boolean) =>
    api.post<AiChatResult>("/ai/continue", { runId, confirmed, approveAll }),
  getModels: () => api.get<{ maxAttachments: number }>("/ai/models"),
  /** Sağlayıcı durumu — yalnızca admin çağırabilir. */
  getHealth: () => api.get<AiHealth>("/ai/health"),
  /** Model ayarları (yalnızca admin): hangi kademede hangi model çalışıyor. */
  getModelSettings: () => api.get<AiModelSettingsResponse>("/ai/admin/model-settings"),
  setModelSetting: (body: { tier?: string; modelKey?: string | null; defaultTier?: string }) =>
    api.post<{ defaultTier: string; tiers: Array<{ tier: string; modelKey: string | null }> }>(
      "/ai/admin/model-settings",
      body
    ),

  // --- Dosya ekleri ---
  // Dosya, mesajdan AYRI olarak önce okunur: ses çözümleme gibi ücretli işler bir
  // kez yapılır ve kullanıcı göndermeden önce ne okunduğunu görür.
  uploadAttachment: (file: File, conversationId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (conversationId) form.append("conversationId", conversationId);
    return api.uploadFile<AiAttachment>("/ai/attachments", form);
  },
  attachProjelioFile: (fileId: string, conversationId?: string) =>
    api.post<AiAttachment>("/ai/attachments/from-file", { fileId, conversationId }),
  attachCloudFile: (sourceFileId: string, conversationId?: string) =>
    api.post<AiAttachment>("/ai/attachments/from-cloud", { sourceFileId, conversationId }),
  browseCloudFiles: (folderId?: string) =>
    api.get<{ provider: "google" | "microsoft"; entries: AiCloudEntry[] }>(
      `/ai/attachments/browse${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`
    ),
  attachmentSource: () => api.get<{ provider: "google" | "microsoft" | null }>("/ai/attachments/source"),

  /**
   * Metni doğal sese çevirir (ücretli, isteğe bağlı).
   *
   * Tarayıcının ücretsiz sentezine alternatif. Ses base64 olarak dönüyor:
   * ikili gövde döndürmek istemci tarafında ayrı bir fetch yolu ve CORS'ta
   * açılmış başlıklar gerektirirdi; kredi bilgisi de aynı yanıtta gelmeli.
   */
  speak: (text: string, conversationId?: string, voice?: string) =>
    api.post<{
      audioBase64: string;
      mimeType: string;
      chars: number;
      truncated: boolean;
      voice: string;
      creditsCharged: number;
      balance: number;
    }>("/ai/speak", { text, conversationId, voice }),

  /** Seçilebilir doğal sesler. */
  getVoices: () =>
    api.get<{ defaultVoice: string; voices: { id: string; label: string; description: string }[] }>(
      "/ai/voices"
    ),

  /** Sesli komut: kayıt yazıya çevrilir, metin yazı kutusuna konur. */
  transcribe: (file: File, conversationId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (conversationId) form.append("conversationId", conversationId);
    return api.uploadFile<{
      text: string;
      durationSeconds: number;
      creditsCharged: number;
      balance: number;
    }>("/ai/transcribe", form);
  },
  removeAttachment: (id: string) => api.delete<{ ok: boolean }>(`/ai/attachments/${id}`),

  // Sohbete sabitlenmiş dosyalar
  getActiveFiles: (conversationId: string) =>
    api.get<{ files: AiActiveFile[] }>(`/ai/conversations/${conversationId}/files`),
  clearActiveFiles: (conversationId: string) =>
    api.delete<{ files: AiActiveFile[] }>(`/ai/conversations/${conversationId}/files`),

  listConversations: () => api.get<AiConversation[]>("/ai/conversations"),
  createConversation: () => api.post<AiConversation>("/ai/conversations", {}),
  getMessages: (conversationId: string) =>
    api.get<AiStoredMessage[]>(`/ai/conversations/${conversationId}/messages`),
  deleteConversation: (conversationId: string) => api.delete<void>(`/ai/conversations/${conversationId}`),

  getCredits: () => api.get<AiCredits>("/ai/credits"),
  getTransactions: (limit = 50) => api.get<AiCreditTransaction[]>(`/ai/credits/transactions?limit=${limit}`),

  // Kredi yükleme (self-servis). Sipariş oluşturmak krediyi YÜKLEMEZ; ödeme
  // doğrulanana kadar sipariş "ödeme bekliyor" durumunda kalır.
  getCreditPackages: () =>
    api.get<{ packages: AiCreditPackage[]; paymentConfigured: boolean }>("/ai/credit-packages"),
  getCreditOrders: () => api.get<AiCreditOrder[]>("/ai/credit-orders"),
  createCreditOrder: (packageKey: string) =>
    api.post<{ order: AiCreditOrder; checkoutUrl: string | null }>("/ai/credit-orders", { packageKey }),
  cancelCreditOrder: (id: string) => api.post<AiCreditOrder>(`/ai/credit-orders/${id}/cancel`, {}),

  // Yönetim
  getAllCreditOrders: (status?: AiCreditOrderStatus) =>
    api.get<AiCreditOrder[]>(`/ai/admin/credit-orders${status ? `?status=${status}` : ""}`),
  markCreditOrderPaid: (id: string, reference?: string, note?: string) =>
    api.post<AiCreditOrder>(`/ai/admin/credit-orders/${id}/mark-paid`, { reference, note }),
  retryCreditOrder: (id: string) => api.post<AiCreditOrder>(`/ai/admin/credit-orders/${id}/retry-credit`, {}),

  topUp: (userId: string, credits: number, description?: string) =>
    api.post<AiCredits>("/ai/admin/credits/topup", { userId, credits, description }),
  getMarginReport: (days = 30) => api.get<Record<string, unknown>>(`/ai/admin/margin?days=${days}`),
  getUsersCredits: () => api.get<AiUserBalanceRow[]>("/ai/admin/users-credits"),

  getProviderBalance: () => api.get<AiProviderBalance>("/ai/admin/provider-balance"),
  topUpProviderBalance: (amountUsd: number, description?: string) =>
    api.post<AiProviderBalance>("/ai/admin/provider-balance/topup", { amountUsd, description }),
  setProviderCostCheckpoint: (amountUsd: number, description?: string) =>
    api.post<AiProviderBalance>("/ai/admin/provider-balance/checkpoint", { amountUsd, description }),
};
