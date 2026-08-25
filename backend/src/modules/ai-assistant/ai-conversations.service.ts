import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";

export interface AiConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Bir mesaja iliştirilmiş dosyanın kaydı.
 *
 * `text` yalnızca metne çevrilebilen türlerde (Word, Excel, düz metin, ses) dolu
 * olur ve modele geçmiş beslenirken kullanılır. Görsel/PDF'te yoktur: onların
 * içeriği modele yalnızca gönderildikleri turda ikili olarak gider.
 */
export interface StoredAttachment {
  name: string;
  kind: string;
  detail: string;
}

/**
 * Sohbete SABİTLENMİŞ dosya.
 *
 * Eskiden dosya tek bir mesaja bağlıydı ve geçmiş penceresi (son 8 mesaj) dolunca
 * bağlamdan düşüyordu; iş birkaç turdan uzun sürdüğünde Lio "dosyayı göremiyorum"
 * deyip aynı soruları tekrarlıyor, kullanıcı hem sonuç alamıyor hem yüzlerce kredi
 * ödüyordu. Artık dosya sohbette DURUR ve iş bitene kadar her turda gönderilir.
 *
 * `text` metne çevrilebilen türlerde dolu olur. Görsel ve PDF'te yoktur: onların
 * ikili içeriği sunucu belleğinde `id` ile tutulur (bkz. AiAttachmentsService).
 */
export interface ActiveFile {
  id: string;
  name: string;
  kind: string;
  detail: string;
  text?: string;
  /**
   * Dosya Projelio'dan getirildiyse (Lio'nun open_file aracı) kaynak dosyanın
   * kimliği. Aynı dosyayı ikinci kez açıp içeriğini iki kez ödememek için tutulur.
   */
  sourceFileId?: string;
  /**
   * Bu dosya bir koşunun ORTASINDA mı sabitlendi?
   *
   * Sabit dosyalar isteğin en başına konan önbellek önekini oluşturuyor. Koşu
   * ortasında eklenen dosya o öneğe giremez — önek bir SONRAKİ istekte yeniden
   * yazılır ve o istek önbelleği okumak yerine YAZAR (arada 10 kata varan fark
   * var). İşaret bunun için: sonraki istek pahalı ilk turu önceden görebilsin.
   * Okunduğu istekte temizlenir.
   */
  addedMidRun?: boolean;
}

export interface AiStoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  creditsCharged: number;
  createdAt: string;
  attachments?: StoredAttachment[];
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
    attachments: Array.isArray(row.attachments) ? row.attachments : undefined,
  };
}

/**
 * Arayüze giden hâl.
 *
 * Eski kayıtlarda `attachments` içinde çıkarılmış metin de vardı (bkz. migration 066);
 * artık metin sohbete sabitlenen dosyada duruyor. Bu ayıklama, eski satırların
 * balonda 20.000 karakterlik döküm göstermesini engeller.
 */
function stripAttachmentText(message: AiStoredMessage): AiStoredMessage {
  if (!message.attachments?.length) return message;
  return {
    ...message,
    attachments: message.attachments.map(({ name, kind, detail }) => ({ name, kind, detail })),
  };
}

@Injectable()
export class AiConversationsService {
  private readonly logger = new Logger(AiConversationsService.name);

  constructor(private supabase: SupabaseService) {}

  /** Sohbete sabitlenmiş dosyalar (modele her turda bunlar gönderilir). */
  async getActiveFiles(conversationId: string): Promise<ActiveFile[]> {
    const { data, error } = await this.supabase.client
      .from("ai_conversations")
      .select("active_files")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`Aktif dosyalar okunamadı: ${error.message}`);
      return [];
    }
    return Array.isArray(data?.active_files) ? data!.active_files : [];
  }

  async setActiveFiles(conversationId: string, files: ActiveFile[]): Promise<void> {
    const { error } = await this.supabase.client
      .from("ai_conversations")
      .update({ active_files: files.length ? files : null })
      .eq("id", conversationId);
    if (error) this.logger.warn(`Aktif dosyalar yazılamadı: ${error.message}`);
  }

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
      .select("id, role, content, credits_charged, created_at, attachments")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapMessage).map(stripAttachmentText);
  }

  /** Modele geri beslenecek son N mesaj (eskiden yeniye sıralı). */
  async getRecentMessages(conversationId: string, limit = HISTORY_WINDOW): Promise<AiStoredMessage[]> {
    const { data, error } = await this.supabase.client
      .from("ai_messages")
      .select("id, role, content, credits_charged, created_at, attachments")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    // Metin ayıklanır: dosya içeriği modele geçmişten DEĞİL, sohbete sabitlenmiş
    // dosyadan gidiyor. İkisini birden göndermek aynı içeriği iki kez ödemek olurdu.
    return (data ?? []).map(mapMessage).map(stripAttachmentText).reverse();
  }

  async addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    usage?: { inputTokens: number; outputTokens: number; creditsCharged: number },
    attachments?: StoredAttachment[]
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
        attachments: attachments?.length ? attachments : null,
      })
      .select("id, role, content, credits_charged, created_at, attachments")
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
