import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";

export interface AiConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiStoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  creditsCharged: number;
  createdAt: string;
}

const MAX_TITLE_LENGTH = 60;
/**
 * Modele geri beslenen geçmiş mesaj sayısı.
 * Her mesaj her istekte yeniden gönderildiği için bu değer doğrudan maliyeti belirler:
 * pencere iki katına çıkarsa uzun sohbetlerin maliyeti de yaklaşık iki katına çıkar.
 */
export const HISTORY_WINDOW = Number(process.env.AI_HISTORY_WINDOW ?? 8);

function mapConversation(row: any): AiConversationSummary {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapMessage(row: any): AiStoredMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    creditsCharged: Number(row.credits_charged ?? 0),
    createdAt: row.created_at,
  };
}

@Injectable()
export class AiConversationsService {
  constructor(private supabase: SupabaseService) {}

  async list(userId: string): Promise<AiConversationSummary[]> {
    const { data, error } = await this.supabase.client
      .from("ai_conversations")
      .select("id, title, created_at, updated_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map(mapConversation);
  }

  async create(userId: string, title?: string): Promise<AiConversationSummary> {
    const { data, error } = await this.supabase.client
      .from("ai_conversations")
      .insert({ user_id: userId, title: title?.slice(0, MAX_TITLE_LENGTH) || "Yeni sohbet" })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw error;
    return mapConversation(data);
  }

  /** Sohbetin sahibi doğrulanır; başkasının sohbetine erişim engellenir. */
  async assertOwner(conversationId: string, userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("ai_conversations")
      .select("user_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Sohbet bulunamadı.");
    if (data.user_id !== userId) throw new ForbiddenException("Bu sohbete erişim yetkin yok.");
  }

  async getMessages(conversationId: string, userId: string): Promise<AiStoredMessage[]> {
    await this.assertOwner(conversationId, userId);
    const { data, error } = await this.supabase.client
      .from("ai_messages")
      .select("id, role, content, credits_charged, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapMessage);
  }

  /** Modele geri beslenecek son N mesaj (eskiden yeniye sıralı). */
  async getRecentMessages(conversationId: string, limit = HISTORY_WINDOW): Promise<AiStoredMessage[]> {
    const { data, error } = await this.supabase.client
      .from("ai_messages")
      .select("id, role, content, credits_charged, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapMessage).reverse();
  }

  async addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    usage?: { inputTokens: number; outputTokens: number; creditsCharged: number }
  ): Promise<AiStoredMessage> {
    const { data, error } = await this.supabase.client
      .from("ai_messages")
      .insert({
        conversation_id: conversationId,
        role,
        content,
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
        credits_charged: usage?.creditsCharged ?? 0,
      })
      .select("id, role, content, credits_charged, created_at")
      .single();
    if (error) throw error;

    await this.supabase.client
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return mapMessage(data);
  }

  /**
   * Sohbetin başlığı hâlâ varsayılansa, ilk kullanıcı mesajından bir başlık türetir.
   * (Modele ayrı bir çağrı yapmaz — gereksiz kredi harcamamak için.)
   */
  async ensureTitle(conversationId: string, firstUserMessage: string): Promise<void> {
    const { data } = await this.supabase.client
      .from("ai_conversations")
      .select("title")
      .eq("id", conversationId)
      .maybeSingle();
    if (data?.title && data.title !== "Yeni sohbet") return;

    const clean = firstUserMessage.replace(/\s+/g, " ").trim();
    const title = clean.length > MAX_TITLE_LENGTH ? `${clean.slice(0, MAX_TITLE_LENGTH - 1)}…` : clean || "Yeni sohbet";
    await this.supabase.client.from("ai_conversations").update({ title }).eq("id", conversationId);
  }

  async rename(conversationId: string, userId: string, title: string): Promise<AiConversationSummary> {
    await this.assertOwner(conversationId, userId);
    const { data, error } = await this.supabase.client
      .from("ai_conversations")
      .update({ title: title.slice(0, MAX_TITLE_LENGTH) })
      .eq("id", conversationId)
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw error;
    return mapConversation(data);
  }

  async remove(conversationId: string, userId: string): Promise<void> {
    await this.assertOwner(conversationId, userId);
    const { error } = await this.supabase.client.from("ai_conversations").delete().eq("id", conversationId);
    if (error) throw error;
  }
}
