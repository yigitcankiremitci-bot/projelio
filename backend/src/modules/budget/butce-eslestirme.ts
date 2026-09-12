import type { BudgetScopeType, BudgetTransaction, RecurringPayment } from "@projelio/shared";

/**
 * Veritabanı satırı → API tipi eşleştirmeleri.
 *
 * Ayrı dosyada: aynı satır artık altı ayrı yerden okunuyor (proje, iş,
 * departman, şirket, holding bütçeleri ve kişisel Kasa) ve her birinde
 * kopyalanan bir eşleştirme, yeni bir sütun eklendiğinde beşinde unutulurdu.
 */

/**
 * Hareket sorgularının ortak seçimi.
 *
 * Tek yerde: aynı satır altı ayrı servisten okunuyor ve her kopya, yeni bir
 * ilişki eklendiğinde birinde unutulmak demekti. `users!...created_by_fkey`
 * açıkça adlandırılmış çünkü budget_transactions'ta users'a ÜÇ ayrı yabancı
 * anahtar var (owner_id, user_id, created_by) ve PostgREST hangisini
 * kastettiğini kendi başına bilemez.
 */
export const SECIM =
  "*, projects(title), departments(name), jobs(title), organizations(name), groups(name), tasks(title), party(display_name), users!budget_transactions_created_by_fkey(full_name)";

/**
 * Kaydın hangi kademeye ait olduğu, kimlik sütunlarından türetilir.
 *
 * Sunucu doldurur; istemcinin altı alanı tek tek yoklaması gerekmesin diye.
 * Hiçbiri dolu değilse kayıt kişisel Kasa'ya aittir (yalnızca owner_id taşır) —
 * bkz. 020_budget_ledger_and_recurring.sql.
 */
export function kapsamTuru(row: any): BudgetScopeType {
  if (row.group_id) return "group";
  if (row.organization_id) return "organization";
  if (row.job_id) return "job";
  if (row.department_id) return "department";
  if (row.project_id) return "project";
  if (row.operation_id) return "operation";
  return "personal";
}

export function mapTransaction(row: any): BudgetTransaction {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    operationId: row.operation_id ?? undefined,
    jobId: row.job_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    groupId: row.group_id ?? undefined,
    projectTitle: row.projects?.title ?? undefined,
    departmentName: row.departments?.name ?? undefined,
    jobTitle: row.jobs?.title ?? undefined,
    organizationName: row.organizations?.name ?? undefined,
    groupName: row.groups?.name ?? undefined,
    scopeType: kapsamTuru(row),
    ownerId: row.owner_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdByName: row.users?.full_name ?? undefined,
    userId: row.user_id ?? undefined,
    type: row.type,
    amount: Number(row.amount),
    // Eski kayıtlarda sütun yoktu; boş gelen her şey ₺ sayılır (defter o güne
    // kadar tek para birimliydi, bkz. migration 104).
    currency: row.currency || "TRY",
    category: row.category ?? undefined,
    counterpartyId: row.counterparty_id ?? undefined,
    taskId: row.task_id ?? undefined,
    taskTitle: row.tasks?.title ?? undefined,
    // Eski kayıtlarda sütun yoktu; hepsi elle girilmişti (bkz. migration 105).
    source: row.source ?? "manual",
    counterpartyName: row.party?.display_name ?? undefined,
    description: row.description ?? undefined,
    occurredAt: row.occurred_at,
    recurringPaymentId: row.recurring_payment_id ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapRecurringPayment(row: any): RecurringPayment {
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id ?? undefined,
    projectTitle: row.projects?.title ?? undefined,
    departmentId: row.department_id ?? undefined,
    jobId: row.job_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    groupId: row.group_id ?? undefined,
    scopeType: kapsamTuru(row),
    taskId: row.task_id ?? undefined,
    taskTitle: row.tasks?.title ?? undefined,
    type: row.type,
    amount: Number(row.amount),
    currency: row.currency || "TRY",
    category: row.category ?? undefined,
    description: row.description ?? undefined,
    interval: row.interval,
    nextDueDate: row.next_due_date,
    anchorDay: row.anchor_day ?? undefined,
    reminderDaysBefore: row.reminder_days_before,
    active: row.active,
    lastRunAt: row.last_run_at ?? undefined,
    createdAt: row.created_at,
  };
}
