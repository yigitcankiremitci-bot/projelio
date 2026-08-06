import { api } from "./client";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiStoredMessage extends AiChatMessage {
  id: string;
  creditsCharged: number;
  createdAt: string;
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

export type AiChatResult = (
  | { type: "message"; text: string }
  | { type: "confirmation"; actionId: string; summary: string; toolName: string; text?: string }
) & {
  conversationId: string;
  usage: AiUsageInfo;
};

export interface AiConfirmResult {
  type: "message";
  text: string;
  conversationId?: string;
}

export interface AiCredits {
  balance: number;
  lifetimePurchased: number;
  lifetimeSpent: number;
  minBalanceToStart: number;
}

export interface AiCreditTransaction {
  id: string;
  type: "topup" | "usage" | "refund" | "adjustment" | "welcome";
  credits: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
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
  remainingUsd: number;
  remainingCredits: number;
  lastTopups: { amountUsd: number; description?: string; createdAt: string }[];
}

export const aiChat = {
  send: (message: string, conversationId?: string) =>
    api.post<AiChatResult>("/ai/chat", { message, conversationId }),
  confirm: (actionId: string, confirmed: boolean) =>
    api.post<AiConfirmResult>("/ai/confirm", { actionId, confirmed }),

  listConversations: () => api.get<AiConversation[]>("/ai/conversations"),
  createConversation: () => api.post<AiConversation>("/ai/conversations", {}),
  getMessages: (conversationId: string) =>
    api.get<AiStoredMessage[]>(`/ai/conversations/${conversationId}/messages`),
  deleteConversation: (conversationId: string) => api.delete<void>(`/ai/conversations/${conversationId}`),

  getCredits: () => api.get<AiCredits>("/ai/credits"),
  getTransactions: (limit = 50) => api.get<AiCreditTransaction[]>(`/ai/credits/transactions?limit=${limit}`),

  // Yönetim
  topUp: (userId: string, credits: number, description?: string) =>
    api.post<AiCredits>("/ai/admin/credits/topup", { userId, credits, description }),
  getMarginReport: (days = 30) => api.get<Record<string, unknown>>(`/ai/admin/margin?days=${days}`),
  getUsersCredits: () => api.get<AiUserBalanceRow[]>("/ai/admin/users-credits"),

  getProviderBalance: () => api.get<AiProviderBalance>("/ai/admin/provider-balance"),
  topUpProviderBalance: (amountUsd: number, description?: string) =>
    api.post<AiProviderBalance>("/ai/admin/provider-balance/topup", { amountUsd, description }),
};
