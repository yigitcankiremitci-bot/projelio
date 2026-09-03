import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "./notifications.service";

/** Hatırlatma ne kadar geç kalırsa kalsın gönderilsin; ama bu kadar eskiyse artık gönderme. */
const MAX_LATE_MS = 6 * 60 * 60 * 1000;

/**
 * Görevin bitiş saati (bkz. 057 — tasks.deadline_time) yaklaştığında atananlara
 * bildirim gönderir.
 *
 * Neden 5 dakikada bir: hatırlatma ön süresi göreve özel (0, 15, 60, 1440 dk…),
 * yani "her saat başı" gibi sabit bir ızgaraya oturmuyor. 5 dakikalık tarama,
 * en kötü ihtimalle 5 dakikalık bir gecikme demek — kullanıcı için fark edilmez,
 * sunucu için ucuz (kısmi indeks yalnızca hatırlatması bekleyen satırları tutar).
 *
 * Neden zaman hesabı SQL'de değil burada: `deadline` bir timestamp, `deadline_time`
 * ayrı bir time kolonu; ikisini birleştirip ön süreyi çıkarmak PostgREST filtre
 * diliyle okunaksız oluyor. Aday kümesi tarihe göre dar tutulup (birkaç gün)
 * kesin karşılaştırma JS'te yapılıyor.
 *
 * NOT: hesap sunucu yerel saatine göre. Kullanıcı bazlı saat dilimi henüz yok;
 * eklendiğinde tek değişecek yer `dueMoment`.
 */
@Injectable()
export class DeadlineReminderProcessor {
  private readonly logger = new Logger(DeadlineReminderProcessor.name);

  /**
   * Bir tur bitmeden yenisi başlamasın.
   *
   * NEDEN: tur, hatırlatma sayısı kadar bildirim yazıp damga güncelliyor; yoğun
   * bir günde bu 5 dakikayı aşabilir. Turlar üst üste bindiğinde ikisi de aynı
   * "damgalanmamış" satırları görür ve AYNI HATIRLATMA İKİ KEZ gider. Aynı koruma
   * whatsapp-send ve social-publish işleyicilerinde de var; burada eksikti.
   */
  private running = false;

  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  @Cron("*/5 * * * *")
  async checkUpcomingDeadlines() {
    if (this.running) return;
    this.running = true;
    try {
      await this.checkTaskReminders();
      await this.checkPersonalTodoReminders();
    } catch (e) {
      // Tur düşerse bir sonraki tur devam etsin; bayrak finally'de bırakılıyor.
      this.logger.error(`Hatırlatma turu düştü: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /** Proje/departman görevleri (bkz. 057). Bildirim tüm atananlara gider. */
  private async checkTaskReminders() {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 8); // en uzun ön süre 7 gün (10080 dk) + pay
    const to = new Date(now);
    to.setDate(to.getDate() + 8);

    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("id, title, deadline, deadline_time, reminder_lead_minutes, project_id, department_id, task_assignees(user_id)")
      .not("reminder_lead_minutes", "is", null)
      .is("reminder_sent_at", null)
      .is("archived_at", null)
      .neq("status", "completed")
      .gte("deadline", from.toISOString())
      .lte("deadline", to.toISOString());

    if (error) {
      this.logger.error(`Hatırlatma taraması başarısız: ${error.message}`);
      return;
    }
    if (!data?.length) return;

    // Damgalanacak görevler biriktirilir, tur sonunda TEK sorguda yazılır.
    // Önceden satır başına ayrı UPDATE atılıyordu: 500 hatırlatma = 500 ardışık
    // gidiş-dönüş, ki bu 5 dakikalık cron penceresini aşıp turların üst üste
    // binmesine yol açabiliyordu.
    const damgalanacak: string[] = [];

    for (const task of data as any[]) {
      const dueMoment = combine(task.deadline, task.deadline_time);
      if (!dueMoment) continue;

      const fireAt = new Date(dueMoment.getTime() - (task.reminder_lead_minutes ?? 0) * 60_000);
      if (fireAt > now) continue;
      // Sunucu bir süre kapalı kaldıysa geçmişte kalmış onlarca hatırlatma birden
      // düşmesin: çok eskiyenler sessizce "gönderildi" sayılıp kapatılır.
      const tooLate = now.getTime() - fireAt.getTime() > MAX_LATE_MS;

      if (!tooLate) {
        const recipients = ((task.task_assignees ?? []) as { user_id: string }[]).map((a) => a.user_id);
        const timeLabel = String(task.deadline_time).slice(0, 5);
        const link = task.project_id
          ? `/projects/${task.project_id}`
          : task.department_id
            ? `/departments/${task.department_id}?tab=tasks`
            : undefined;

        for (const userId of recipients) {
          // notifyUserSafe: hata yutulup loglanır. Önceden `void notifyUser`
          // kullanılıyordu ve o, reddi YUTMUYORDU — veritabanı bir an hata
          // verdiğinde yakalanmamış promise reddi süreci düşürebiliyordu.
          this.notificationsService.notifyUserSafe(
            userId,
            "task_reminder",
            "Görev hatırlatması",
            task.reminder_lead_minutes === 0
              ? `"${task.title}" görevinin bitiş saati: ${timeLabel}.`
              : `"${task.title}" görevi ${timeLabel}'de bitiyor.`,
            link
          );
        }
      }

      // Başarılı da olsa, çok geç kaldığı için atlandı da olsa damgalanır:
      // aksi halde aynı görev her taramada yeniden ele alınırdı.
      damgalanacak.push(task.id);
    }

    if (damgalanacak.length) {
      const { error: damgaHatasi } = await this.supabase.client
        .from("tasks")
        .update({ reminder_sent_at: new Date().toISOString() })
        .in("id", damgalanacak);
      // Damga atılamazsa aynı hatırlatma bir sonraki turda tekrar gider; sessiz
      // kalmasın ki tekrarın sebebi log'dan görülebilsin.
      if (damgaHatasi) this.logger.error(`Hatırlatma damgası yazılamadı: ${damgaHatasi.message}`);
    }
  }

  /**
   * Kişisel görevler (bkz. 059). Yalnızca sahibine gider — kişisel bir kartı
   * zaten başkası göremiyor.
   */
  private async checkPersonalTodoReminders() {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 8);
    const to = new Date(now);
    to.setDate(to.getDate() + 8);

    const { data, error } = await this.supabase.client
      .from("personal_todos")
      .select("id, user_id, title, due_date, due_time, reminder_lead_minutes")
      .not("reminder_lead_minutes", "is", null)
      .is("reminder_sent_at", null)
      .is("archived_at", null)
      .neq("status", "completed")
      .gte("due_date", from.toISOString().slice(0, 10))
      .lte("due_date", to.toISOString().slice(0, 10));

    if (error) {
      this.logger.error(`Kişisel hatırlatma taraması başarısız: ${error.message}`);
      return;
    }
    if (!data?.length) return;

    // Görev hatırlatmalarıyla aynı gerekçe: damgalar tek sorguda yazılır.
    const damgalanacak: string[] = [];

    for (const todo of data as any[]) {
      const dueMoment = combine(todo.due_date, todo.due_time);
      if (!dueMoment) continue;

      const fireAt = new Date(dueMoment.getTime() - (todo.reminder_lead_minutes ?? 0) * 60_000);
      if (fireAt > now) continue;

      if (now.getTime() - fireAt.getTime() <= MAX_LATE_MS) {
        const timeLabel = String(todo.due_time).slice(0, 5);
        this.notificationsService.notifyUserSafe(
          todo.user_id,
          "task_reminder",
          "Görev hatırlatması",
          todo.reminder_lead_minutes === 0
            ? `"${todo.title}" görevinin bitiş saati: ${timeLabel}.`
            : `"${todo.title}" görevi ${timeLabel}'de bitiyor.`,
          "/tasks"
        );
      }

      damgalanacak.push(todo.id);
    }

    if (damgalanacak.length) {
      const { error: damgaHatasi } = await this.supabase.client
        .from("personal_todos")
        .update({ reminder_sent_at: new Date().toISOString() })
        .in("id", damgalanacak);
      if (damgaHatasi) this.logger.error(`Kişisel hatırlatma damgası yazılamadı: ${damgaHatasi.message}`);
    }
  }
}

/** `deadline` gününü `deadline_time` saatiyle birleştirip tam anı verir. */
function combine(deadline?: string, time?: string): Date | null {
  if (!deadline || !time) return null;
  const day = new Date(deadline);
  if (Number.isNaN(day.getTime())) return null;
  const [h, m] = String(time).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}
