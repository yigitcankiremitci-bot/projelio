import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { SupabaseService } from "../../database/supabase.service";
import { TasksService } from "../tasks/tasks.service";
import { ProjectsService } from "../projects/projects.service";
import { JobsService } from "../jobs/jobs.service";
import { BudgetService } from "../budget/budget.service";
import { AI_TOOLS, CRITICAL_TOOLS } from "./ai-assistant.tools";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const MAX_TOKENS = 1024;
const MAX_TOOL_ITERATIONS = 6;
const PENDING_ACTION_TTL_MS = 10 * 60 * 1000; // 10 dakika

type ChatRole = "user" | "assistant";
export interface ChatMessageInput {
  role: ChatRole;
  content: string;
}

export type ChatResult =
  | { type: "message"; text: string }
  | { type: "confirmation"; actionId: string; summary: string; toolName: string; text?: string };

type ProjectMembershipRole = "owner" | "member" | "subcontractor";

interface PendingAction {
  id: string;
  userId: string;
  userRole: string;
  toolName: string;
  input: Record<string, any>;
  createdAt: number;
}

const RESULT_LABELS: Record<string, string> = {
  delete_task: "Görev silindi.",
  archive_task: "Görev arşivlendi.",
  delete_project: "Proje silindi.",
  archive_project: "Proje arşivlendi.",
  delete_job: "İş silindi.",
  archive_job: "İş arşivlendi.",
  add_budget_transaction: "Bütçe hareketi eklendi.",
};

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private anthropic: Anthropic | null = null;
  // MVP: onay bekleyen kritik işlemler bellekte tutulur. Tek instance için yeterlidir;
  // çoklu instance / restart senaryosu için ileride Redis'e (proje zaten ioredis kullanıyor) taşınabilir.
  private readonly pendingActions = new Map<string, PendingAction>();

  constructor(
    private supabase: SupabaseService,
    private tasksService: TasksService,
    private projectsService: ProjectsService,
    private jobsService: JobsService,
    private budgetService: BudgetService
  ) {}

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new BadRequestException(
        "AI asistanı yapılandırılmamış: backend/.env dosyasına ANTHROPIC_API_KEY eklemeniz gerekiyor."
      );
    }
    if (!this.anthropic) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.anthropic;
  }

  private buildSystemPrompt(userRole: string): string {
    return [
      "Sen Projelio uygulamasının içinde çalışan bir yapay zeka asistanısın.",
      "Projelio; iş (job) > proje (project) > görev (task) hiyerarşisiyle çalışan bir proje/serbest çalışan yönetim uygulamasıdır.",
      "Kullanıcı adına sana verilen araçları (tool) kullanarak veri okuyabilir ve değişiklik yapabilirsin.",
      "Kurallar:",
      "- Her zaman Türkçe, kısa ve net yanıt ver.",
      "- Bir işlemi yapmadan önce gerekli id'leri (projectId, taskId, jobId) bilmiyorsan önce ilgili 'list_*' veya 'get_*' aracıyla bul; kullanıcıya id sorma, isimle eşleştir.",
      "- Bir isimle birden fazla eşleşme varsa (ör. aynı isimde iki proje) kullanıcıya hangisini kastettiğini sor.",
      "- Silme, arşivleme ve bütçe hareketi ekleme gibi kritik işlemler otomatik olarak kullanıcıya onaylatılır; sen sadece doğru aracı doğru parametrelerle çağır, onay akışı sistem tarafından yönetilir.",
      "- Yetkisiz bir işlem istenirse (araç 'yetkin yok' hatası dönerse) bunu kullanıcıya nazikçe açıkla, tekrar deneme.",
      "- Elinde olmayan bilgiyi uydurma; araçlardan dönen veriye sadık kal.",
      `- Bugünün tarihi: ${new Date().toISOString().slice(0, 10)}.`,
      `- Kullanıcının uygulama rolü: ${userRole === "admin" ? "admin (yönetici)" : "freelancer"}.`,
    ].join("\n");
  }

  async chat(userId: string, userRole: string, messages: ChatMessageInput[]): Promise<ChatResult> {
    if (!messages.length) return { type: "message", text: "Nasıl yardımcı olabilirim?" };

    const anthropic = this.getClient();
    const system = this.buildSystemPrompt(userRole);
    const workingMessages: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: AI_TOOLS,
        messages: workingMessages,
      });

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (toolUses.length === 0) {
        return { type: "message", text: text || "Tamam." };
      }

      const criticalUse = toolUses.find((use) => CRITICAL_TOOLS.has(use.name));
      if (criticalUse) {
        const actionId = randomUUID();
        this.pendingActions.set(actionId, {
          id: actionId,
          userId,
          userRole,
          toolName: criticalUse.name,
          input: (criticalUse.input as Record<string, any>) ?? {},
          createdAt: Date.now(),
        });
        return {
          type: "confirmation",
          actionId,
          toolName: criticalUse.name,
          summary: await this.summarizeAction(criticalUse.name, (criticalUse.input as Record<string, any>) ?? {}),
          text: text || undefined,
        };
      }

      // Kritik olmayan araçları çalıştır, sonuçları modele geri besle ve devam et.
      workingMessages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        try {
          const result = await this.executeTool(use.name, (use.input as Record<string, any>) ?? {}, userId, userRole);
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(result ?? {}),
          });
        } catch (err: any) {
          this.logger.warn(`Tool "${use.name}" failed: ${err?.message}`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: `Hata: ${err?.message ?? "bilinmeyen hata"}`,
            is_error: true,
          });
        }
      }
      workingMessages.push({ role: "user", content: toolResults });
    }

    return {
      type: "message",
      text: "İsteğini tamamlayamadım. Daha spesifik bir şekilde tekrar eder misin?",
    };
  }

  async confirmAction(actionId: string, userId: string, confirmed: boolean): Promise<{ type: "message"; text: string }> {
    this.sweepExpiredActions();
    const pending = this.pendingActions.get(actionId);
    if (!pending || pending.userId !== userId) {
      throw new NotFoundException("Onay bekleyen işlem bulunamadı ya da süresi doldu. Lütfen isteği tekrar yaz.");
    }
    this.pendingActions.delete(actionId);

    if (!confirmed) {
      return { type: "message", text: "İşlem iptal edildi." };
    }

    try {
      await this.executeTool(pending.toolName, pending.input, pending.userId, pending.userRole);
      return { type: "message", text: `✅ ${RESULT_LABELS[pending.toolName] ?? "İşlem tamamlandı."}` };
    } catch (err: any) {
      return { type: "message", text: `İşlem başarısız oldu: ${err?.message ?? "bilinmeyen hata"}` };
    }
  }

  private sweepExpiredActions(): void {
    const now = Date.now();
    for (const [id, action] of this.pendingActions) {
      if (now - action.createdAt > PENDING_ACTION_TTL_MS) this.pendingActions.delete(id);
    }
  }

  // --- Yetki kontrolleri -------------------------------------------------

  private async requireProjectRole(
    projectId: string,
    userId: string,
    userRole: string,
    allowed: ProjectMembershipRole[]
  ): Promise<void> {
    if (userRole === "admin") return;
    const role = await this.tasksService.getMembershipRole(projectId, userId);
    if (!role || !allowed.includes(role as ProjectMembershipRole)) {
      throw new ForbiddenException("Bu proje üzerinde bu işlemi yapma yetkin yok.");
    }
  }

  private async requireJobOwner(jobId: string, userId: string, userRole: string): Promise<void> {
    if (userRole === "admin") return;
    const job = await this.jobsService.findOne(jobId);
    if (job.ownerId !== userId) {
      throw new ForbiddenException("Yalnızca bu işin sahibi altında proje oluşturabilir.");
    }
  }

  private async getTaskOrThrow(taskId: string): Promise<{ id: string; projectId: string; title: string }> {
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("id, project_id, title")
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Görev bulunamadı.");
    return { id: data.id, projectId: data.project_id, title: data.title };
  }

  private async safeLabel(fn: () => Promise<string>): Promise<string> {
    try {
      return await fn();
    } catch {
      return "seçili öğe";
    }
  }

  private async summarizeAction(name: string, input: Record<string, any>): Promise<string> {
    switch (name) {
      case "delete_task": {
        const title = await this.safeLabel(() => this.getTaskOrThrow(input.taskId).then((t) => t.title));
        return `"${title}" görevini KALICI olarak silmek üzeresin. Bu işlem geri alınamaz.`;
      }
      case "archive_task": {
        const title = await this.safeLabel(() => this.getTaskOrThrow(input.taskId).then((t) => t.title));
        return `"${title}" görevini arşivlemek üzeresin.`;
      }
      case "delete_project": {
        const title = await this.safeLabel(() => this.projectsService.findOne(input.projectId).then((p) => p.title));
        return `"${title}" projesini KALICI olarak silmek üzeresin. Projeye ait tüm görevler de etkilenir. Bu işlem geri alınamaz.`;
      }
      case "archive_project": {
        const title = await this.safeLabel(() => this.projectsService.findOne(input.projectId).then((p) => p.title));
        return `"${title}" projesini arşivlemek üzeresin.`;
      }
      case "delete_job": {
        const title = await this.safeLabel(() => this.jobsService.findOne(input.jobId).then((j) => j.title));
        return `"${title}" işini KALICI olarak silmek üzeresin. Bu işlem geri alınamaz.`;
      }
      case "archive_job": {
        const title = await this.safeLabel(() => this.jobsService.findOne(input.jobId).then((j) => j.title));
        return `"${title}" işini arşivlemek üzeresin.`;
      }
      case "add_budget_transaction": {
        const typeLabel = input.type === "income" ? "gelir" : input.type === "payout" ? "ödeme" : "gider";
        return `Projeye ${input.amount} ₺ tutarında "${typeLabel}" kaydı eklemek üzeresin${
          input.description ? ` (${input.description})` : ""
        }.`;
      }
      default:
        return "Bu işlemi onaylamak üzeresin.";
    }
  }

  // --- Araç çalıştırıcı ----------------------------------------------------

  private async executeTool(name: string, input: Record<string, any>, userId: string, userRole: string): Promise<unknown> {
    switch (name) {
      case "list_jobs":
        return this.jobsService.findAllForUser(userId);

      case "list_projects":
        return input.jobId
          ? this.projectsService.findByJob(input.jobId, userId)
          : this.projectsService.findAllForUser(userId);

      case "get_project": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        return this.projectsService.findOne(input.projectId);
      }

      case "list_tasks": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        return this.tasksService.findByProject(input.projectId, userId);
      }

      case "list_budget_transactions": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner"]);
        const [transactions, project] = await Promise.all([
          this.budgetService.findByProject(input.projectId),
          this.projectsService.findOne(input.projectId),
        ]);
        const [remainingMargin, expectedPayment] = await Promise.all([
          this.budgetService.calculateRemainingMargin(input.projectId),
          this.budgetService.calculateExpectedPayment(input.projectId, project.totalBudget),
        ]);
        return {
          transactions,
          // Anlaşılan ücret; tahsil edilen para bunun içinden düşer.
          agreedFee: project.totalBudget,
          // Eldeki net: tahsil edilen − harcanan.
          remainingMargin,
          // Müşteriden henüz tahsil edilmemiş alacak.
          expectedPayment,
        };
      }

      case "create_job":
        return this.jobsService.create(userId, { title: input.title, description: input.description });

      case "update_job":
        return this.jobsService.update(input.jobId, { title: input.title, description: input.description }, userId);

      case "archive_job":
        return this.jobsService.archive(input.jobId, userId);

      case "delete_job":
        await this.jobsService.remove(input.jobId, userId);
        return { success: true };

      case "create_project":
        await this.requireJobOwner(input.jobId, userId, userRole);
        return this.projectsService.create(userId, {
          jobId: input.jobId,
          title: input.title,
          description: input.description,
          totalBudget: input.totalBudget,
          startDate: input.startDate,
          deadline: input.deadline,
        });

      case "update_project":
        return this.projectsService.update(
          input.projectId,
          {
            title: input.title,
            description: input.description,
            totalBudget: input.totalBudget,
            startDate: input.startDate,
            deadline: input.deadline,
            status: input.status,
          },
          userId
        );

      case "archive_project":
        return this.projectsService.archive(input.projectId, userId);

      case "delete_project":
        await this.projectsService.remove(input.projectId, userId);
        return { success: true };

      case "create_task": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        return this.tasksService.create(
          input.projectId,
          {
            title: input.title,
            description: input.description,
            deadline: input.deadline,
            startDate: input.startDate,
            assignedTo: input.assignedTo,
            budget: input.budget,
            parentTaskId: input.parentTaskId,
          },
          userId
        );
      }

      case "update_task": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireProjectRole(task.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        return this.tasksService.update(
          input.taskId,
          {
            title: input.title,
            description: input.description,
            deadline: input.deadline,
            startDate: input.startDate,
            assignedTo: input.assignedTo,
            budget: input.budget,
          },
          userId
        );
      }

      case "update_task_status": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireProjectRole(task.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        return this.tasksService.updateStatus(input.taskId, input.status, userId);
      }

      case "archive_task": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireProjectRole(task.projectId, userId, userRole, ["owner"]);
        return this.tasksService.archive(input.taskId);
      }

      case "delete_task": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireProjectRole(task.projectId, userId, userRole, ["owner"]);
        await this.tasksService.remove(input.taskId);
        return { success: true };
      }

      case "add_budget_transaction": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner"]);
        // Not: mevcut "yeni bütçe hareketi" formu da userId göndermiyor — bu alan yalnızca
        // hareket belirli bir ekip üyesine yapılan ödemeyse doldurulur (bildirim tetikler).
        // AI aracı şimdilik hedef kullanıcı seçtirmiyor, bu yüzden boş bırakılıyor.
        return this.budgetService.add(input.projectId, {
          type: input.type,
          amount: input.amount,
          description: input.description,
        });
      }

      default:
        throw new BadRequestException(`Bilinmeyen araç: ${name}`);
    }
  }
}
