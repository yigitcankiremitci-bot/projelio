import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SupportRequest } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";

/** Formdan gelen metinlerin üst sınırları — sunucu tarafında da uygulanır. */
const MAX_NAME = 80;
const MAX_SUBJECT = 120;
const MAX_MESSAGE = 4000;
const MAX_REPLY = 4000;

function mapRequest(row: any): SupportRequest {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    subject: row.subject,
    message: row.message,
    status: row.status,
    reply: row.reply ?? undefined,
    repliedAt: row.replied_at ?? undefined,
    createdAt: row.created_at,
    // Panoda "kim yazmış" sütunu için; ilişki seçilmediğinde (kullanıcının
    // kendi listesi) boş kalır.
    userFullName: row.users?.full_name ?? undefined,
    userEmail: row.users?.email ?? undefined,
  };
}

function required(value: unknown, field: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new BadRequestException(`${field} boş olamaz.`);
  if (text.length > max) throw new BadRequestException(`${field} en fazla ${max} karakter olabilir.`);
  return text;
}

@Injectable()
export class SupportService {
  constructor(
    private supabase: SupabaseService,
    private notifications: NotificationsService
  ) {}

  /** Kullanıcı yeni talep bırakır. */
  async create(
    userId: string,
    data: { name?: string; subject?: string; message?: string }
  ): Promise<SupportRequest> {
    const name = required(data.name, "İsim", MAX_NAME);
    const subject = required(data.subject, "Konu", MAX_SUBJECT);
    const message = required(data.message, "Mesaj", MAX_MESSAGE);

    const { data: row, error } = await this.supabase.client
      .from("support_requests")
      // user_id İSTEMCİDEN ALINMAZ: oturumdaki kimlik kullanılır, yoksa
      // kullanıcı başkasının adına talep açabilirdi.
      .insert({ user_id: userId, name, subject, message })
      .select()
      .single();
    if (error) throw error;
    return mapRequest(row);
  }

  /** Kullanıcının kendi talepleri — yanıtı buradan da okuyabilir. */
  async findMine(userId: string): Promise<SupportRequest[]> {
    const { data, error } = await this.supabase.client
      .from("support_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRequest);
  }

  /**
   * Admin panosu. Bekleyenler önce: pano bir "yapılacaklar listesi", yanıtlanmış
   * talepler onun altında arşiv gibi durur.
   */
  async findAll(): Promise<SupportRequest[]> {
    const { data, error } = await this.supabase.client
      .from("support_requests")
      .select("*, users:user_id (full_name, email)")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRequest);
  }

  /**
   * Admin yanıtlar ve kullanıcıya bildirim gider.
   *
   * Bildirim yazma işleminden SONRA: bildirim gönderimi (soket + push) dış
   * servislere dokunuyor, orada oluşacak bir hata yanıtın kaydedilmesini
   * geri almamalı. Bu yüzden hatası yutuluyor — yanıt veritabanında duruyor,
   * kullanıcı Ayarlar > Destek'ten yine görebiliyor.
   */
  async reply(requestId: string, adminId: string, replyText?: string): Promise<SupportRequest> {
    const reply = required(replyText, "Yanıt", MAX_REPLY);

    const { data: row, error } = await this.supabase.client
      .from("support_requests")
      .update({ reply, replied_by: adminId, replied_at: new Date().toISOString(), status: "answered" })
      .eq("id", requestId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Destek talebi bulunamadı.");

    const request = mapRequest(row);
    try {
      await this.notifications.notifyUser(
        request.userId,
        "support_reply",
        "Destek talebin yanıtlandı",
        reply,
        // Çan bu tipte yönlendirme yapmaz, yanıtı modalda açar; bağlantı yine de
        // veriliyor ki push bildirimine tıklayan kullanıcı taleplerine ulaşsın.
        "/settings?sekme=destek"
      );
    } catch {
      // Bildirim gönderilemedi; yanıt kaydedildi (bkz. yukarıdaki not).
    }
    return request;
  }
}
