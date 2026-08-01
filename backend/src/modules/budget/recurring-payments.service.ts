import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RecurrenceInterval, RecurringPayment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

const INTERVALS: RecurrenceInterval[] = ["weekly", "monthly", "yearly"];

function mapPayment(row: any): RecurringPayment {
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id ?? undefined,
    projectTitle: row.projects?.title ?? undefined,
    type: row.type,
    amount: Number(row.amount),
    description: row.description ?? undefined,
    interval: row.interval,
    nextDueDate: row.next_due_date,
    anchorDay: row.anchor_day ?? undefined,
    reminderDaysBefore: row.reminder_days_before ?? 0,
    active: row.active,
    lastRunAt: row.last_run_at ?? undefined,
    createdAt: row.created_at,
  };
}

// Tarihi yerel saat diliminden bağımsız, "YYYY-MM-DD" olarak biçimlendirir.
// toISOString() UTC'ye kaydırdığı için Türkiye saatinde gece yarısına yakın
// işlemlerde bir gün geri gidebiliyor; bu yüzden elle biçimlendiriyoruz.
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Bir sonraki vade tarihini hesaplar.
//
// Ay sonu taşmasına dikkat edilir: 31 Ocak + 1 ay, JS'te doğal olarak 3 Mart'a taşar;
// bunun yerine ayın son gününe (28/29/30) sabitlenir. Ayrıca "çapa gün" (anchorDay)
// kavramı vardır: her ayın 31'i olan bir ödeme Şubat'ta 28'e çekilir, ama bir sonraki
// hesaplama yine 31'den yapılır — aksi halde ödeme kalıcı olarak 28'e kayardı.
export function advanceDueDate(current: string, interval: RecurrenceInterval, anchorDay?: number): string {
  const [year, month, day] = current.split("-").map(Number);

  if (interval === "weekly") {
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + 7);
    return toDateString(d);
  }

  const monthsToAdd = interval === "monthly" ? 1 : 12;
  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  // Ayın 0. günü = bir önceki ayın son günü.
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const desiredDay = anchorDay ?? day;
  return toDateString(new Date(targetYear, targetMonth, Math.min(desiredDay, lastDayOfTargetMonth)));
}

@Injectable()
export class RecurringPaymentsService {
  constructor(private supabase: SupabaseService) {}

  async findAllForUser(userId: string): Promise<RecurringPayment[]> {
    const { data, error } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq("owner_id", userId)
      .order("next_due_date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPayment);
  }

  async create(userId: string, data: Partial<RecurringPayment>): Promise<RecurringPayment> {
    this.assertValid(data);
    if (data.projectId) await this.assertOwnsProject(data.projectId, userId);

    const { data: row, error } = await this.supabase.client
      .from("recurring_payments")
      .insert({
        owner_id: userId,
        project_id: data.projectId ?? null,
        type: data.type ?? "expense",
        amount: data.amount ?? 0,
        description: data.description ?? null,
        interval: data.interval,
        next_due_date: data.nextDueDate,
        // Çapa gün ilk vade tarihinden türetilir.
        anchor_day: Number(data.nextDueDate!.split("-")[2]),
        reminder_days_before: data.reminderDaysBefore ?? 1,
        active: data.active ?? true,
      })
      .select("*, projects(title)")
      .single();
    if (error) throw error;
    return mapPayment(row);
  }

  async update(id: string, userId: string, data: Partial<RecurringPayment>): Promise<RecurringPayment> {
    await this.assertOwner(id, userId);
    if (data.projectId) await this.assertOwnsProject(data.projectId, userId);

    const patch: Record<string, any> = {};
    if (data.type !== undefined) patch.type = data.type;
    if (data.amount !== undefined) patch.amount = data.amount;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.interval !== undefined) {
      if (!INTERVALS.includes(data.interval)) throw new BadRequestException("Geçersiz tekrar aralığı");
      patch.interval = data.interval;
    }
    if (data.nextDueDate !== undefined) {
      patch.next_due_date = data.nextDueDate;
      patch.anchor_day = Number(data.nextDueDate.split("-")[2]);
    }
    if (data.reminderDaysBefore !== undefined) patch.reminder_days_before = data.reminderDaysBefore;
    if (data.active !== undefined) patch.active = data.active;
    if (data.projectId !== undefined) patch.project_id = data.projectId || null;

    const { data: row, error } = await this.supabase.client
      .from("recurring_payments")
      .update(patch)
      .eq("id", id)
      .select("*, projects(title)")
      .single();
    if (error) throw error;
    return mapPayment(row);
  }

  async remove(id: string, userId: string): Promise<{ success: true }> {
    await this.assertOwner(id, userId);
    const { error } = await this.supabase.client.from("recurring_payments").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  }

  // Cron için: vadesi bugün ya da geçmişte olan aktif ödemeler.
  async findDue(today: string): Promise<RecurringPayment[]> {
    const { data, error } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq("active", true)
      .lte("next_due_date", today);
    if (error) throw error;
    return (data ?? []).map(mapPayment);
  }

  // Cron için: vadesine reminder_days_before kadar kalan aktif ödemeler.
  async findUpcoming(today: string): Promise<RecurringPayment[]> {
    const { data, error } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq("active", true)
      .gt("next_due_date", today);
    if (error) throw error;
    return (data ?? []).map(mapPayment);
  }

  async markProcessed(id: string, nextDueDate: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("recurring_payments")
      .update({ next_due_date: nextDueDate, last_run_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  private assertValid(data: Partial<RecurringPayment>): void {
    if (!data.interval || !INTERVALS.includes(data.interval)) {
      throw new BadRequestException("Geçersiz tekrar aralığı");
    }
    if (!data.nextDueDate) throw new BadRequestException("İlk ödeme tarihi gerekli");
    if (!data.amount || data.amount <= 0) throw new BadRequestException("Tutar sıfırdan büyük olmalı");
  }

  private async assertOwner(id: string, userId: string): Promise<void> {
    const { data: row } = await this.supabase.client
      .from("recurring_payments")
      .select("owner_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Düzenli ödeme bulunamadı");
    if (row.owner_id !== userId) throw new ForbiddenException("Bu kaydı düzenleme yetkin yok");
  }

  private async assertOwnsProject(projectId: string, userId: string): Promise<void> {
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id !== userId) throw new ForbiddenException("Bu projeye bağlayamazsın");
  }
}
