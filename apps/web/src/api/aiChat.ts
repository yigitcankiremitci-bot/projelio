import { api } from "./client";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AiChatResult =
  | { type: "message"; text: string }
  | { type: "confirmation"; actionId: string; summary: string; toolName: string; text?: string };

export type AiConfirmResult = { type: "message"; text: string };

export const aiChat = {
  send: (messages: AiChatMessage[]) => api.post<AiChatResult>("/ai/chat", { messages }),
  confirm: (actionId: string, confirmed: boolean) =>
    api.post<AiConfirmResult>("/ai/confirm", { actionId, confirmed }),
};
