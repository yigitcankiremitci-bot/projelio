import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { NotificationEmailFrequency, NotificationEmailPrefs } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { zamanDilimiGecerliMi } from "./notification-email.zaman";

/**
 * Bildirim e-postası tercihleri (bkz. migration 102, 103).
 *
 * SATIR YOKKEN DE BİR TERCİH VARDIR: tablo boşken herkes günlük özeti 09:00'da
 * alır. Tersi, özelliği fiilen kapalı tutardı — kimse ayarlara girip açmaz ve
 * bildirimler yine hiçbir yere ulaşmazdı. Bu yüzden okuma "satır yoksa
 * varsayılan", yazma ise upsert.
 */

export const VARSAYILAN_TERCIH: NotificationEmailPrefs = {
  instantEnabled: false,
  dailyEnabled: true,
  dailyHour: 9,
  timezone: "Europe/Istanbul",
  includeTasks: true,
};

/** Veritabanı satırı — işleyicinin ayrıca iki su seviyesine ihtiyacı var. */
export interface TercihSatiri extends NotificationEmailPrefs {
  userId: string;
  /** Anlık kanalın su seviyesi. */
  lastInstantAt: string | null;
  /** Son günlük özetin kapsadığı an — bir sonraki özetin pencere başlangıcı. */
  lastDigestAt: string | null;
  /** Son günlük özetin yerel günü; aynı günde ikinci gönderimi engeller. */
  lastDigestOn: string | null;
}

export function satiriCevir(row: any): TercihSatiri {
  return {
    userId: row.user_id,
    instantEnabled: row.instant_enabled === true,
    dailyEnabled: row.daily_enabled !== false,
    dailyHour: Number.isInteger(row.daily_hour) ? row.daily_hour : VARSAYILAN_TERCIH.dailyHour,
    timezone: row.timezone || VARSAYILAN_TERCIH.timezone,
    includeTasks: row.include_tasks !== false,
    lastInstantAt: row.last_instant_at ?? null,
    lastDigestAt: row.last_digest_at ?? null,
    lastDigestOn: row.last_digest_on ?? null,
  };
}

/** Satırı, istemciye dönen sade tercihe indirger (damgalar dışarı çıkmaz). */
export function satirdanTercih(satir: TercihSatiri): NotificationEmailPrefs {
  return {
    instantEnabled: satir.instantEnabled,
    dailyEnabled: satir.dailyEnabled,
    dailyHour: satir.dailyHour,
    timezone: satir.timezone,
    includeTasks: satir.includeTasks,
  };
}

/**
 * 102'nin tek kolonlu sıklığını iki anahtara çevirir.
 *
 * NEDEN DURUYOR: tarayıcıda açık kalmış, güncellenmemiş bir istemci hâlâ
 * `frequency` gönderiyor olabilir. İsteği reddetmek yerine anlamını korumak
 * doğru davranış — aksi hâlde kullanıcı "ayarım kaydedilmiyor" derdi.
 */
function sikliktanAnahtarlar(frequency: unknown): Partial<NotificationEmailPrefs> | null {
  const deger = frequency as NotificationEmailFrequency;
  if (deger === "anlik") return { instantEnabled: true, dailyEnabled: false };
  if (deger === "gunluk") return { instantEnabled: false, dailyEnabled: true };
  if (deger === "kapali") return { instantEnabled: false, dailyEnabled: false };
  return null;
}

@Injectable()
export class NotificationEmailPrefsService {
  private readonly logger = new Logger(NotificationEmailPrefsService.name);

  constructor(private supabase: SupabaseService) {}

  private readonly KOLONLAR =
    "user_id, instant_enabled, daily_enabled, daily_hour, timezone, include_tasks, last_instant_at, last_digest_at, last_digest_on";

  /**
   * Kullanıcının tercihi; satır yoksa varsayılan.
   *
   * Tablo okunamıyorsa (ör. migration henüz uygulanmadı) da varsayılan döner ve
   * hata YUTULUR: ayarlar sayfasının tamamı, uygulanmamış bir migration
   * yüzünden açılamaz hâle gelmemeli.
   */
  async findForUser(userId: string): Promise<NotificationEmailPrefs> {
    try {
      const { data, error } = await this.supabase.client
        .from("notification_email_prefs")
        .select(this.KOLONLAR)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...VARSAYILAN_TERCIH };
      return satirdanTercih(satiriCevir(data));
    } catch (err) {
      this.logger.warn(
        `Bildirim e-postası tercihi okunamadı (${userId}), varsayılana düşülüyor: ${err instanceof Error ? err.message : err}`
      );
      return { ...VARSAYILAN_TERCIH };
    }
  }

  /** İşleyicinin ihtiyacı olan tam satır (damgalar dahil); satır yoksa varsayılan. */
  async satirBul(userId: string): Promise<TercihSatiri> {
    const tercih = await this.findForUser(userId);
    try {
      const { data } = await this.supabase.client
        .from("notification_email_prefs")
        .select(this.KOLONLAR)
        .eq("user_id", userId)
        .maybeSingle();
      if (data) return satiriCevir(data);
    } catch {
      // findForUser zaten logladı; damgasız devam etmek gönderimi engellemez.
    }
    return { ...tercih, userId, lastInstantAt: null, lastDigestAt: null, lastDigestOn: null };
  }

  /**
   * Tercihi kaydeder (yoksa oluşturur).
   *
   * Doğrulama burada, uçta değil: aynı kontrol hem HTTP ucundan hem de ileride
   * başka bir çağrandan (ör. Lio'nun "bildirimlerimi sabah 7'ye al" aracı)
   * geçmeli. Geçersiz bir saat dilimi kaydedilirse o kullanıcının günlük özeti
   * HER turda hata verirdi (bkz. notification-email.zaman.ts).
   */
  async save(
    userId: string,
    girdi: Partial<NotificationEmailPrefs> & { frequency?: NotificationEmailFrequency }
  ): Promise<NotificationEmailPrefs> {
    const mevcut = await this.findForUser(userId);
    // Eski istemci yalnızca `frequency` gönderiyorsa onu anahtarlara çevir;
    // yeni alanlar gönderildiyse onlar kazanır.
    const eskiden = girdi.frequency !== undefined ? sikliktanAnahtarlar(girdi.frequency) : null;
    if (girdi.frequency !== undefined && !eskiden) {
      throw new BadRequestException("Geçersiz bildirim e-postası sıklığı.");
    }

    const yeni: NotificationEmailPrefs = {
      instantEnabled: girdi.instantEnabled ?? eskiden?.instantEnabled ?? mevcut.instantEnabled,
      dailyEnabled: girdi.dailyEnabled ?? eskiden?.dailyEnabled ?? mevcut.dailyEnabled,
      dailyHour: girdi.dailyHour ?? mevcut.dailyHour,
      timezone: (girdi.timezone ?? mevcut.timezone).trim(),
      includeTasks: girdi.includeTasks ?? mevcut.includeTasks,
    };

    if (typeof yeni.instantEnabled !== "boolean" || typeof yeni.dailyEnabled !== "boolean") {
      throw new BadRequestException("Bildirim e-postası anahtarları doğru/yanlış olmalı.");
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
        instant_enabled: yeni.instantEnabled,
        daily_enabled: yeni.dailyEnabled,
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
   * Her iki kanalı da kapatır — e-postadaki tek tık "aboneliği bırak" bağlantısı
   * buraya düşer (bkz. notification-email-unsubscribe.controller.ts).
   *
   * Satır yoksa AÇILIR: varsayılan "günlük açık" olduğu için, satırı olmayan
   * kullanıcının kapatma isteği kaydedilmezse hiçbir şey değişmezdi.
   */
  async hepsiniKapat(userId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("notification_email_prefs")
      .upsert({ user_id: userId, instant_enabled: false, daily_enabled: false }, { onConflict: "user_id" });
    if (error) throw error;
  }

  /**
   * Gönderim sonrası damgalar.
   *
   * İKİ AYRI SU SEVİYESİ (bkz. migration 103): anlık gönderim günlük özetin
   * penceresini kaydırmamalı, yoksa iki kanal birden açıkken akşamki özet boş
   * çıkardı. Damga TARAMA anını yazıyor, gönderim anını değil — ikisi arasında
   * doğan bir bildirim aksi hâlde hiç gönderilmeden "gönderildi" sayılırdı.
   */
  async damgala(
    userId: string,
    damga: { taramaAni: Date; kanal: "anlik" | "gunluk"; ozetGunu?: string }
  ): Promise<void> {
    const alanlar: Record<string, unknown> = { user_id: userId };
    if (damga.kanal === "anlik") {
      alanlar.last_instant_at = damga.taramaAni.toISOString();
    } else {
      alanlar.last_digest_at = damga.taramaAni.toISOString();
      if (damga.ozetGunu) alanlar.last_digest_on = damga.ozetGunu;
    }
    const { error } = await this.supabase.client
      .from("notification_email_prefs")
      .upsert(alanlar, { onConflict: "user_id" });
    if (error) throw error;
  }
}
