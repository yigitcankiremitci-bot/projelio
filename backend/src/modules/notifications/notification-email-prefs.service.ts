import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { NotificationEmailFrequency, NotificationEmailPrefs } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { zamanDilimiGecerliMi } from "./notification-email.zaman";

/**
 * Bildirim e-postası tercihleri (bkz. migration 102).
 *
 * SATIR YOKKEN DE BİR TERCİH VARDIR: tablo boşken herkes günlük özeti 09:00'da
 * alır. Tersi, özelliği fiilen kapalı tutardı — kimse ayarlara girip açmaz ve
 * bildirimler yine hiçbir yere ulaşmazdı. Bu yüzden okuma "satır yoksa
 * varsayılan", yazma ise upsert.
 */

export const SIKLIKLAR: NotificationEmailFrequency[] = ["anlik", "gunluk", "kapali"];

export const VARSAYILAN_TERCIH: NotificationEmailPrefs = {
  frequency: "gunluk",
  dailyHour: 9,
  timezone: "Europe/Istanbul",
  includeTasks: true,
};

/** Veritabanı satırı — işleyicinin ayrıca damgalara ihtiyacı var. */
export interface TercihSatiri extends NotificationEmailPrefs {
  userId: string;
  lastEmailedAt: string | null;
  lastDigestOn: string | null;
}

export function satiriCevir(row: any): TercihSatiri {
  return {
    userId: row.user_id,
    frequency: SIKLIKLAR.includes(row.frequency) ? row.frequency : VARSAYILAN_TERCIH.frequency,
    dailyHour: Number.isInteger(row.daily_hour) ? row.daily_hour : VARSAYILAN_TERCIH.dailyHour,
    timezone: row.timezone || VARSAYILAN_TERCIH.timezone,
    includeTasks: row.include_tasks !== false,
    lastEmailedAt: row.last_emailed_at ?? null,
    lastDigestOn: row.last_digest_on ?? null,
  };
}

@Injectable()
export class NotificationEmailPrefsService {
  private readonly logger = new Logger(NotificationEmailPrefsService.name);

  constructor(private supabase: SupabaseService) {}

  /**
   * Kullanıcının tercihi; satır yoksa varsayılan.
   *
   * Tablo okunamıyorsa (ör. migration 102 henüz uygulanmadı) da varsayılan
   * döner ve hata YUTULUR: ayarlar sayfasının tamamı, henüz uygulanmamış bir
   * migration yüzünden açılamaz hâle gelmemeli.
   */
  async findForUser(userId: string): Promise<NotificationEmailPrefs> {
    try {
      const { data, error } = await this.supabase.client
        .from("notification_email_prefs")
        .select("user_id, frequency, daily_hour, timezone, include_tasks, last_emailed_at, last_digest_on")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...VARSAYILAN_TERCIH };
      const { userId: _id, lastEmailedAt: _a, lastDigestOn: _b, ...tercih } = satiriCevir(data);
      return tercih;
    } catch (err) {
      this.logger.warn(
        `Bildirim e-postası tercihi okunamadı (${userId}), varsayılana düşülüyor: ${err instanceof Error ? err.message : err}`
      );
      return { ...VARSAYILAN_TERCIH };
    }
  }

  /**
   * Tercihi kaydeder (yoksa oluşturur).
   *
   * Doğrulama burada, uçta değil: aynı kontrol hem HTTP ucundan hem de ileride
   * başka bir çağrandan (ör. Lio'nun "bildirimlerimi sabah 7'ye al" aracı)
   * geçmeli. Geçersiz bir saat dilimi kaydedilirse o kullanıcının günlük özeti
   * HER turda hata verirdi (bkz. notification-email.zaman.ts).
   */
  async save(userId: string, girdi: Partial<NotificationEmailPrefs>): Promise<NotificationEmailPrefs> {
    const mevcut = await this.findForUser(userId);
    const yeni: NotificationEmailPrefs = {
      frequency: girdi.frequency ?? mevcut.frequency,
      dailyHour: girdi.dailyHour ?? mevcut.dailyHour,
      timezone: (girdi.timezone ?? mevcut.timezone).trim(),
      includeTasks: girdi.includeTasks ?? mevcut.includeTasks,
    };

    if (!SIKLIKLAR.includes(yeni.frequency)) {
      throw new BadRequestException("Geçersiz bildirim e-postası sıklığı.");
    }
    if (!Number.isInteger(yeni.dailyHour) || yeni.dailyHour < 0 || yeni.dailyHour > 23) {
      throw new BadRequestException("Günlük özet saati 0 ile 23 arasında olmalı.");
    }
    if (!zamanDilimiGecerliMi(yeni.timezone)) {
      throw new BadRequestException("Geçersiz saat dilimi.");
    }

    const { error } = await this.supabase.client.from("notification_email_prefs").upsert(
      {
        user_id: userId,
        frequency: yeni.frequency,
        daily_hour: yeni.dailyHour,
        timezone: yeni.timezone,
        include_tasks: yeni.includeTasks,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;
    return yeni;
  }

  /**
   * Gönderim sonrası damgalar.
   *
   * `lastEmailedAt` bir SU SEVİYESİ: bundan yeni bildirimler bir sonraki
   * e-postaya girer. Gönderim anını değil, TARAMA anını yazıyoruz — tarama ile
   * gönderim arasında doğan bir bildirim, aksi hâlde hiç e-postalanmadan
   * "gönderilmiş" sayılırdı.
   */
  async damgala(userId: string, damga: { taramaAni: Date; ozetGunu?: string }): Promise<void> {
    const alanlar: Record<string, unknown> = {
      user_id: userId,
      last_emailed_at: damga.taramaAni.toISOString(),
    };
    if (damga.ozetGunu) alanlar.last_digest_on = damga.ozetGunu;
    const { error } = await this.supabase.client
      .from("notification_email_prefs")
      .upsert(alanlar, { onConflict: "user_id" });
    if (error) throw error;
  }
}
