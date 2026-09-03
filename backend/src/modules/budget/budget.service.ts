import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { BudgetOverview, BudgetTransaction, ProjectBudgetSummary, RecurringPayment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireAmount, requireOneOf, optionalOneOf } from "../../common/validation/input";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * budget_transactions.type için izin verilen değerler. 001_init_schema.sql'deki
 * CHECK kısıtıyla BİREBİR aynı olmalı — biri değişirse diğeri de değişmeli.
 */
const TRANSACTION_TYPES = ["income", "expense", "payout"] as const;

function mapTransaction(row: any): BudgetTransaction {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    projectTitle: row.projects?.title ?? undefined,
    ownerId: row.owner_id ?? undefined,
    userId: row.user_id ?? undefined,
    type: row.type,
    amount: Number(row.amount),
    description: row.description ?? undefined,
    occurredAt: row.occurred_at,
    recurringPaymentId: row.recurring_payment_id ?? undefined,
    createdAt: row.created_at,
  };
}

@Injectable()
export class BudgetService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  // Proje bütçesi: finansal veri hassas olduğu için görüntüleme yalnızca proje/iş
  // sahibine ve "bütçeyi görebilir" izni açık onaylı üyelere açık (bkz. departman
  // bütçesindeki assertCanManageDepartment ile aynı gerekçe/desen).
  private async assertCanViewBudget(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) return;
    if (project.job_id) {
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", project.job_id).maybeSingle();
      if (job?.owner_id === userId) return;
    }
    const { data: membership } = await this.supabase.client
      .from("project_members")
      .select("can_view_budget")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (membership?.can_view_budget) return;
    throw new ForbiddenException("Bu projenin bütçesini görüntüleme yetkiniz yok");
  }

  // Kayıt ekleme/silme yalnızca proje ya da (varsa) iş sahibine açık.
  private async assertCanManageBudget(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) return;
    if (project.job_id) {
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", project.job_id).maybeSingle();
      if (job?.owner_id === userId) return;
    }
    throw new ForbiddenException("Bu projenin bütçesine kayıt eklemeyi yalnızca proje veya iş sahibi yapabilir");
  }

  async findByProject(projectId: string, requestingUserId?: string): Promise<BudgetTransaction[]> {
    await this.assertCanViewBudget(projectId, requestingUserId);

    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select("*, projects(title)")
      .eq("project_id", projectId)
      .order("occurred_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  async add(projectId: string, data: Partial<BudgetTransaction>, requestingUserId?: string): Promise<BudgetTransaction> {
    await this.assertCanManageBudget(projectId, requestingUserId);

    // Proje bazlı kayıtta defter sahibi, projenin sahibidir.
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        project_id: projectId,
        owner_id: project?.owner_id ?? null,
        user_id: data.userId ?? null,
        type: requireOneOf(data.type ?? "expense", TRANSACTION_TYPES, "İşlem türü"),
        amount: requireAmount(data.amount ?? 0),
        description: data.description ?? null,
        occurred_at: data.occurredAt ?? new Date().toISOString().slice(0, 10),
      })
      .select("*, projects(title)")
      .single();
    if (error) throw error;
    const tx = mapTransaction(row);
    if (tx.userId) {
      this.notificationsService.notifyUserSafe(
        tx.userId,
        "budget_changed",
        "Bütçe Güncellendi",
        `${tx.type}: ${tx.amount} ₺`
      );
    }
    return tx;
  }

  // --- Departman bütçesi (Bütçe sekmesi) ---
  // Finansal veri hassas olduğu için yalnızca organizasyon sahibi ya da o
  // departmanın onaylı yöneticisi kayıt ekleyip silebilir (bkz. ModuleRecordsService
  // ile aynı desen).
  //
  // GÖRÜNTÜLEME de aynı daire ile sınırlı. Eskiden findByDepartment hiç userId
  // almıyordu: departman id'sini bilen HERHANGİ bir oturumlu kullanıcı — kadroda
  // olmayan biri dahil — organizasyonun gelir/gider defterini okuyabiliyordu.
  // Taşeron ve çalışan bu sekmeyi hiç görmemeli (bkz. department-access.ts).
  private async assertCanManageDepartment(departmentId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (!dept) throw new NotFoundException("Departman bulunamadı");
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    if (org?.owner_id === userId) return;
    const { data: managerRow } = await this.supabase.client
      .from("department_members")
      .select("id")
      .eq("department_id", departmentId)
      .eq("user_id", userId)
      .eq("role", "manager")
      .eq("status", "approved")
      .maybeSingle();
    if (managerRow) return;
    throw new ForbiddenException("Bu bütçeyi yalnızca organizasyon sahibi veya departman yöneticisi düzenleyebilir");
  }

  // Görüntüleme yetkisi yönetme yetkisiyle aynı daire: organizasyon sahibi +
  // departman yöneticisi. Ayrı bir mesajla 403 döner ki arayüz "bu sekmeyi
  // göremezsin" ile "kayıt ekleyemezsin" durumlarını ayırt edebilsin.
  private async assertCanViewDepartmentBudget(departmentId: string, userId?: string): Promise<void> {
    if (!userId) return;
    try {
      await this.assertCanManageDepartment(departmentId, userId);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw new ForbiddenException("Bu departmanın bütçesini görüntüleme yetkiniz yok");
      }
      throw err;
    }
  }

  async findByDepartment(departmentId: string, requestingUserId?: string): Promise<BudgetTransaction[]> {
    await this.assertCanViewDepartmentBudget(departmentId, requestingUserId);
    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select("*")
      .eq("department_id", departmentId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  async addForDepartment(departmentId: string, data: Partial<BudgetTransaction>, requestingUserId?: string): Promise<BudgetTransaction> {
    await this.assertCanManageDepartment(departmentId, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        department_id: departmentId,
        type: requireOneOf(data.type ?? "expense", TRANSACTION_TYPES, "İşlem türü"),
        amount: requireAmount(data.amount ?? 0),
        description: data.description ?? null,
        occurred_at: data.occurredAt ?? new Date().toISOString().slice(0, 10),
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapTransaction(row);
  }

  async removeForDepartment(id: string, requestingUserId?: string): Promise<{ success: true }> {
    const { data: row } = await this.supabase.client
      .from("budget_transactions")
      .select("department_id")
      .eq("id", id)
      .maybeSingle();
    if (!row || !row.department_id) throw new NotFoundException("Kayıt bulunamadı");
    await this.assertCanManageDepartment(row.department_id, requestingUserId);
    const { error } = await this.supabase.client.from("budget_transactions").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  }

  // Projeden elde kalan net: tahsil edilen - harcanan.
  // NOT: anlaşılan ücret (totalBudget) buraya EKLENMEZ; tahsil edilen para zaten
  // o ücretin bir parçasıdır, eklemek aynı parayı iki kez saymak olurdu.
  async calculateRemainingMargin(projectId: string, requestingUserId?: string): Promise<number> {
    const txs = await this.findByProject(projectId, requestingUserId);
    return sumByType(txs, "income") - sumSpent(txs);
  }

  // Henüz tahsil edilmemiş alacak. agreedFee istemciden değil her zaman DB'deki
  // güncel proje bütçesinden okunur — istemcide eski/senkron olmayan bir değer
  // (ör. bütçe az önce başka biri tarafından değiştirildiyse) yanlış sonuç üretmesin diye.
  async calculateExpectedPayment(projectId: string, requestingUserId?: string): Promise<number> {
    const [txs, project] = await Promise.all([
      this.findByProject(projectId, requestingUserId),
      this.supabase.client.from("projects").select("total_budget").eq("id", projectId).maybeSingle(),
    ]);
    const agreedFee = Number(project.data?.total_budget ?? 0);
    return Math.max(0, agreedFee - sumByType(txs, "income"));
  }

  // --- Anasayfa bütçe sekmesi (kullanıcının kendi defteri) ---

  // Kullanıcının sahibi olduğu projeler. Bütçe hassas bir veri olduğu için genel
  // defterde yalnızca kendi projeleri toplanır; üyesi olduğu başkasının projesi
  // buraya karışmaz (o proje kendi detay sayfasında ayrıca görülebiliyor).
  private async ownedProjects(userId: string): Promise<{ id: string; title: string; total_budget: number }[]> {
    const { data, error } = await this.supabase.client
      .from("projects")
      .select("id, title, total_budget")
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (error) throw error;
    return data ?? [];
  }

  // Kullanıcının tüm hareketleri: kendi projelerine ait olanlar + projesiz genel kayıtlar.
  async findAllForUser(userId: string, limit = 200): Promise<BudgetTransaction[]> {
    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select("*, projects(title)")
      .eq("owner_id", userId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  async getOverview(userId: string): Promise<BudgetOverview> {
    const [projects, transactions] = await Promise.all([
      this.ownedProjects(userId),
      this.findAllForUser(userId, 1000),
    ]);

    const byProject = new Map<string, BudgetTransaction[]>();
    const general: BudgetTransaction[] = [];
    for (const tx of transactions) {
      if (!tx.projectId) {
        general.push(tx);
        continue;
      }
      const list = byProject.get(tx.projectId) ?? [];
      list.push(tx);
      byProject.set(tx.projectId, list);
    }

    const projectSummaries: ProjectBudgetSummary[] = projects.map((p) => {
      const txs = byProject.get(p.id) ?? [];
      const agreedFee = Number(p.total_budget);
      const received = sumByType(txs, "income");
      const expense = sumSpent(txs);
      return {
        projectId: p.id,
        projectTitle: p.title,
        agreedFee,
        received,
        // Tahsil edilen, anlaşılan ücretin içinden düşer — üstüne eklenmez.
        expected: Math.max(0, agreedFee - received),
        overpaid: Math.max(0, received - agreedFee),
        expense,
        netEarned: received - expense,
        fullyCollected: agreedFee > 0 && received >= agreedFee,
      };
    });

    const generalIncome = sumByType(general, "income");
    const generalExpense = sumSpent(general);

    const totalAgreedFee = projectSummaries.reduce((sum, p) => sum + p.agreedFee, 0);
    const totalReceived = projectSummaries.reduce((sum, p) => sum + p.received, 0) + generalIncome;
    const totalExpected = projectSummaries.reduce((sum, p) => sum + p.expected, 0);
    const totalExpense = projectSummaries.reduce((sum, p) => sum + p.expense, 0) + generalExpense;

    return {
      totalAgreedFee,
      totalReceived,
      totalExpected,
      totalExpense,
      netEarned: totalReceived - totalExpense,
      generalIncome,
      generalExpense,
      // Tahsil edilmeyi bekleyen en büyük alacak en üstte.
      projects: projectSummaries.sort((a, b) => b.expected - a.expected || b.agreedFee - a.agreedFee),
    };
  }

  // Anasayfadan eklenen kayıt: proje seçimi opsiyonel.
  async createForUser(userId: string, data: Partial<BudgetTransaction>): Promise<BudgetTransaction> {
    if (data.projectId) await this.assertOwnsProject(data.projectId, userId);

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        project_id: data.projectId ?? null,
        owner_id: userId,
        user_id: data.userId ?? null,
        type: requireOneOf(data.type ?? "expense", TRANSACTION_TYPES, "İşlem türü"),
        amount: requireAmount(data.amount ?? 0),
        description: data.description ?? null,
        occurred_at: data.occurredAt ?? new Date().toISOString().slice(0, 10),
      })
      .select("*, projects(title)")
      .single();
    if (error) throw error;
    return mapTransaction(row);
  }

  // Cron tarafından çağrılır: vadesi gelen düzenli ödemeyi deftere işler.
  async createRecurringTransaction(payment: RecurringPayment, occurredAt: string): Promise<BudgetTransaction> {
    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        project_id: payment.projectId ?? null,
        owner_id: payment.ownerId,
        type: payment.type,
        amount: payment.amount,
        description: payment.description ?? null,
        occurred_at: occurredAt,
        recurring_payment_id: payment.id,
      })
      .select("*, projects(title)")
      .single();
    if (error) throw error;
    return mapTransaction(row);
  }

  // --- Tek kayıt üzerinde düzenleme/silme (defterin hangisi olduğundan bağımsız) ---
  //
  // Bir bütçe kaydı üç yerden birine ait olabilir: bir projeye, bir departmana ya
  // da doğrudan kullanıcının kendi defterine. Yetki kuralı üçünde de zaten
  // tanımlıydı ama yalnızca EKLEME ve SİLME yollarında kullanılıyordu; kaydı
  // düzenlemenin hiçbir yolu yoktu (yanlış tutar giren kullanıcı silip yeniden
  // yazmak zorundaydı). Buradaki tek kapı, kaydın bağlamına bakıp doğru kuralı
  // uyguluyor; böylece proje, departman ve kişisel defter aynı uçtan yönetiliyor.
  private async assertCanManageTransaction(id: string, userId?: string): Promise<any> {
    const { data: row } = await this.supabase.client
      .from("budget_transactions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    if (row.project_id) {
      await this.assertCanManageBudget(row.project_id, userId);
      return row;
    }
    if (row.department_id) {
      await this.assertCanManageDepartment(row.department_id, userId);
      return row;
    }
    if (userId && row.owner_id !== userId) throw new ForbiddenException("Bu kaydı düzenleme yetkin yok");
    return row;
  }

  async updateTransaction(
    id: string,
    data: Partial<BudgetTransaction>,
    userId?: string
  ): Promise<BudgetTransaction> {
    await this.assertCanManageTransaction(id, userId);

    const patch: Record<string, unknown> = {};
    if (data.type !== undefined) patch.type = optionalOneOf(data.type, TRANSACTION_TYPES, "İşlem türü");
    if (data.amount !== undefined) patch.amount = requireAmount(data.amount);
    // Boş açıklama "temizle" demektir; undefined ise alan hiç gönderilmemiştir.
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.occurredAt !== undefined) patch.occurred_at = data.occurredAt.slice(0, 10);
    // Kaydı başka bir projeye taşımak: hedef projenin de kullanıcıya ait olması şart.
    if (data.projectId !== undefined) {
      if (data.projectId && userId) await this.assertOwnsProject(data.projectId, userId);
      patch.project_id = data.projectId || null;
    }

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .update(patch)
      .eq("id", id)
      .select("*, projects(title)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapTransaction(row);
  }

  async removeTransaction(id: string, userId?: string): Promise<{ success: true }> {
    await this.assertCanManageTransaction(id, userId);
    const { error } = await this.supabase.client.from("budget_transactions").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  }

  async removeForUser(id: string, userId: string): Promise<{ success: true }> {
    const { data: row } = await this.supabase.client
      .from("budget_transactions")
      .select("owner_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    if (row.owner_id !== userId) throw new ForbiddenException("Bu kaydı silme yetkin yok");

    const { error } = await this.supabase.client.from("budget_transactions").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  }

  private async assertOwnsProject(projectId: string, userId: string): Promise<void> {
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id !== userId) throw new ForbiddenException("Bu projeye kayıt ekleyemezsin");
  }
}

function sumByType(txs: BudgetTransaction[], type: BudgetTransaction["type"]): number {
  return txs.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount, 0);
}

// Gider + hakediş/ödeme birlikte "harcanan" sayılır.
function sumSpent(txs: BudgetTransaction[]): number {
  return txs.filter((t) => t.type === "expense" || t.type === "payout").reduce((sum, t) => sum + t.amount, 0);
}
