import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { SupabaseService } from "../../database/supabase.service";
import { TasksService } from "../tasks/tasks.service";
import { ProjectsService } from "../projects/projects.service";
import { JobsService } from "../jobs/jobs.service";
import { BudgetService } from "../budget/budget.service";
import { MembersService } from "../members/members.service";
import { AI_TOOLS, CRITICAL_TOOLS } from "./ai-assistant.tools";
import { AiCreditsService } from "./ai-credits.service";
import { AiConversationsService } from "./ai-conversations.service";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const PENDING_ACTION_TTL_MS = 10 * 60 * 1000; // 10 dakika

// --- Maliyet sınırlayıcıları --------------------------------------------
// Bu değerlerin her biri doğrudan kullanıcının kredi harcamasını etkiler.
// Yükseltmeden önce maliyet etkisini hesaplayın.

/** Modelin tek yanıtta üretebileceği azami token. Asistan yanıtları kısa olmalı. */
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS ?? 800);
/** Bir istek için azami araç turu. Her tur ayrı bir API çağrısıdır. */
const MAX_TOOL_ITERATIONS = Number(process.env.AI_MAX_TOOL_ITERATIONS ?? 4);
/** Araç sonuçlarının azami karakter uzunluğu. */
const MAX_TOOL_RESULT_CHARS = Number(process.env.AI_MAX_TOOL_RESULT_CHARS ?? 2500);
/** Sistem promptuna gömülen iş/proje sayısı (gerisi list_* araçlarıyla çekilir). */
const CONTEXT_JOB_LIMIT = 8;
const CONTEXT_PROJECT_LIMIT = 12;
/**
 * Prompt caching: araç şemaları + statik sistem promptu Anthropic tarafında önbelleğe
 * alınır. Önbelleğe yazma standart girdinin 1,25 katıdır, okuma ise yalnızca 0,10 katı —
 * yani ilk istekten sonraki her istekte bu blok %90 ucuza gelir.
 * Sorun çıkarsa AI_PROMPT_CACHING=false ile kapatılabilir.
 */
const CACHING_ENABLED = (process.env.AI_PROMPT_CACHING ?? "true").toLowerCase() !== "false";

interface TokenTotals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

type ChatRole = "user" | "assistant";
export interface ChatMessageInput {
  role: ChatRole;
  content: string;
}

/** Her yanıtla birlikte istemciye dönen kredi bilgisi. */
export interface ChatUsageInfo {
  creditsCharged: number;
  balance: number;
}

export type ChatResult = (
  | { type: "message"; text: string }
  | { type: "confirmation"; actionId: string; summary: string; toolName: string; text?: string }
) & {
  conversationId: string;
  usage: ChatUsageInfo;
};

type ProjectMembershipRole = "owner" | "member" | "subcontractor";

interface PendingAction {
  id: string;
  userId: string;
  userRole: string;
  toolName: string;
  input: Record<string, any>;
  conversationId: string;
  createdAt: number;
}

/**
 * Modele gönderilen her karakter kullanıcının kredisinden düşer. Bu yüzden araç
 * sonuçları tam veritabanı nesneleri olarak değil, yalnızca modelin karar vermek
 * için ihtiyaç duyduğu alanlarla ("kompakt") gönderilir.
 */
function shortDate(value?: string | null): string | undefined {
  return value ? String(value).slice(0, 10) : undefined;
}

/** Boş/undefined alanları atarak nesneyi küçültür. */
function pruneEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== "" && value !== 0) out[key] = value;
  }
  return out as Partial<T>;
}

function compactTask(task: any): Record<string, unknown> {
  return pruneEmpty({
    id: task.id,
    title: task.title,
    status: task.status,
    deadline: shortDate(task.deadline),
    assignedTo: task.assignedTo,
    assignee: task.assignedToName,
    budget: task.budget,
    parentTaskId: task.parentTaskId,
  });
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
    private budgetService: BudgetService,
    private membersService: MembersService,
    private creditsService: AiCreditsService,
    private conversationsService: AiConversationsService
  ) {}

  private get model(): string {
    return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  }

  private getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      this.logger.error(
        "ANTHROPIC_API_KEY bu süreçte tanımlı değil. Yüklenen .env: " +
          `${process.env.__PROJELIO_ENV_PATH ?? "(bilinmiyor)"}`
      );
      throw new BadRequestException(
        "AI asistanı yapılandırılmamış: backend/.env dosyasına ANTHROPIC_API_KEY eklemeniz gerekiyor."
      );
    }
    if (!this.anthropic) {
      this.anthropic = new Anthropic({
        apiKey,
        // Ağ dalgalanmalarında SDK kendisi tekrar denesin.
        maxRetries: 3,
        timeout: 60_000,
      });
    }
    return this.anthropic;
  }

  /**
   * Node'un native fetch'i bağlantı kuramadığında yalnızca "fetch failed" der; asıl sebep
   * (DNS, TLS, proxy, reddedilen bağlantı) iç içe geçmiş `cause` zincirinde saklıdır.
   * Bu yardımcı o zinciri açar ve kullanıcıya gösterilebilecek Türkçe bir açıklama üretir.
   */
  private describeConnectionError(err: any): { code: string; detail: string; message: string } {
    const chain: string[] = [];
    let cursor: any = err;
    let code = "";
    for (let depth = 0; cursor && depth < 6; depth++) {
      if (cursor.code && !code) code = String(cursor.code);
      if (cursor.message) chain.push(String(cursor.message));
      cursor = cursor.cause;
    }
    const detail = chain.join(" <- ");

    const hints: Record<string, string> = {
      ENOTFOUND:
        "api.anthropic.com adresi çözümlenemedi (DNS sorunu). İnternet bağlantınızı, VPN'i ya da DNS ayarlarınızı kontrol edin.",
      EAI_AGAIN: "Geçici DNS hatası. İnternet bağlantınızı veya DNS ayarlarınızı kontrol edin.",
      ECONNREFUSED: "Bağlantı reddedildi. Bir güvenlik duvarı ya da proxy engelliyor olabilir.",
      ECONNRESET: "Bağlantı karşı taraf tarafından kesildi. VPN/proxy ya da ağ filtresi engelliyor olabilir.",
      ETIMEDOUT: "Bağlantı zaman aşımına uğradı. Ağınız api.anthropic.com adresine erişemiyor olabilir.",
      UND_ERR_CONNECT_TIMEOUT:
        "Bağlantı zaman aşımına uğradı. Ağınız api.anthropic.com adresine erişemiyor olabilir.",
      CERT_HAS_EXPIRED: "TLS sertifika hatası. Kurumsal bir ağ/antivirüs trafiği araya girip bozuyor olabilir.",
      UNABLE_TO_VERIFY_LEAF_SIGNATURE:
        "TLS sertifikası doğrulanamadı. Kurumsal proxy/antivirüs araya giriyor olabilir.",
      SELF_SIGNED_CERT_IN_CHAIN:
        "TLS zincirinde kendinden imzalı sertifika var. Kurumsal proxy/antivirüs araya giriyor olabilir.",
    };

    const hint =
      hints[code] ??
      "Sunucu api.anthropic.com adresine ulaşamadı. İnternet bağlantısı, VPN, güvenlik duvarı veya proxy ayarlarını kontrol edin.";

    return { code: code || "UNKNOWN", detail, message: hint };
  }

  /** Anthropic çağrılarını tek noktadan sarmalar: hataları anlamlı mesajlara çevirir ve loglar. */
  private async callAnthropic(
    anthropic: Anthropic,
    params: Anthropic.MessageCreateParamsNonStreaming
  ): Promise<Anthropic.Message> {
    try {
      return await anthropic.messages.create(params);
    } catch (err: any) {
      const status: number | undefined = err?.status;

      if (status === 401) {
        this.logger.error("Anthropic 401: API anahtarı geçersiz.");
        throw new BadRequestException(
          "Anthropic API anahtarı geçersiz görünüyor. backend/.env içindeki ANTHROPIC_API_KEY değerini kontrol edin."
        );
      }
      if (status === 404) {
        this.logger.error(`Anthropic 404: model bulunamadı (${params.model}).`);
        throw new BadRequestException(
          `"${params.model}" modeli bulunamadı. backend/.env içindeki ANTHROPIC_MODEL değerini kontrol edin.`
        );
      }
      if (status === 400) {
        this.logger.error(`Anthropic 400: ${err?.message}`);
        // Kredi bakiyesi yetersizken Anthropic 400 döner; bu en sık karşılaşılan kurulum
        // sorunu olduğu için genel "geçersiz istek" mesajının arkasına saklanmasın.
        if (/credit balance/i.test(err?.message ?? "")) {
          throw new ServiceUnavailableException(
            "Anthropic hesabınızda API kredisi kalmamış. console.anthropic.com > Plans & Billing üzerinden kredi yükleyin."
          );
        }
        throw new BadRequestException(`Anthropic isteği reddetti: ${err?.message ?? "geçersiz istek"}`);
      }
      if (status === 429) {
        throw new ServiceUnavailableException(
          "Anthropic hız sınırına takıldı ya da kredi limitiniz dolmuş olabilir. Biraz sonra tekrar deneyin."
        );
      }
      if (status && status >= 500) {
        throw new ServiceUnavailableException("Anthropic servisi şu anda yanıt vermiyor. Biraz sonra tekrar deneyin.");
      }

      // Statü yoksa bağlantı kurulamamıştır ("fetch failed" bu dalda düşer).
      const { code, detail, message } = this.describeConnectionError(err);
      this.logger.error(`Anthropic bağlantı hatası [${code}]: ${detail}`);
      throw new ServiceUnavailableException(`${message} (teknik detay: ${code})`);
    }
  }

  /** Teşhis: yapılandırma doğru mu ve Anthropic API'ye gerçekten ulaşılabiliyor mu? */
  async health(): Promise<Record<string, unknown>> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    const base = {
      apiKeyPresent: !!apiKey,
      apiKeyPrefix: apiKey ? `${apiKey.slice(0, 12)}…${apiKey.slice(-4)}` : null,
      model: this.model,
      nodeVersion: process.version,
      proxyEnv: process.env.HTTPS_PROXY ?? process.env.https_proxy ?? null,
    };

    if (!apiKey) {
      return { ...base, reachable: false, error: "ANTHROPIC_API_KEY tanımlı değil (backend/.env)." };
    }

    try {
      const anthropic = this.getClient();
      await anthropic.messages.create({
        model: this.model,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      });
      return { ...base, reachable: true };
    } catch (err: any) {
      const status: number | undefined = err?.status;
      if (status) {
        return { ...base, reachable: false, httpStatus: status, error: err?.message };
      }
      const { code, detail, message } = this.describeConnectionError(err);
      return { ...base, reachable: false, errorCode: code, error: message, technicalDetail: detail };
    }
  }

  /**
   * Kullanıcının çalışma alanının kısa bir özetini çıkarır ve sistem promptuna gömer.
   * Böylece asistan "hangi projeler var?" diye ilk turu araç çağrısıyla harcamaz —
   * hem daha hızlı yanıt verir hem de kullanıcının kredisi boşa gitmez.
   */
  private async buildWorkspaceContext(userId: string): Promise<string> {
    try {
      const [jobs, projects] = await Promise.all([
        this.jobsService.findAllForUser(userId),
        this.projectsService.findAllForUser(userId),
      ]);

      // Yalnızca en güncel birkaç kayıt gömülür; gerisi için model list_* araçlarını
      // kullanır. Tam listeyi her isteğe eklemek gereksiz token (= kredi) harcar.
      const lines: string[] = [];
      if (jobs.length) {
        lines.push(
          `İşler (${jobs.length}): ` +
            jobs.slice(0, CONTEXT_JOB_LIMIT).map((j) => `${j.title}=${j.id}`).join(" | ") +
            (jobs.length > CONTEXT_JOB_LIMIT ? " | …(list_jobs ile tamamı)" : "")
        );
      }
      if (projects.length) {
        const active = projects.filter((p) => p.status === "active");
        const shown = (active.length ? active : projects).slice(0, CONTEXT_PROJECT_LIMIT);
        lines.push(
          `Aktif projeler (${active.length}/${projects.length}): ` +
            shown.map((p) => `${p.title}=${p.id}`).join(" | ") +
            (active.length > CONTEXT_PROJECT_LIMIT ? " | …(list_projects ile tamamı)" : "")
        );
      }
      if (!lines.length) return "Kullanıcının henüz hiç işi/projesi yok.";
      return lines.join("\n");
    } catch (err: any) {
      this.logger.warn(`Çalışma alanı özeti çıkarılamadı: ${err?.message}`);
      return "(Çalışma alanı özeti alınamadı; gerekirse list_* araçlarını kullan.)";
    }
  }

  /**
   * Sistem promptunun her kullanıcı ve her istek için AYNI olan kısmı.
   * Ayrı tutulmasının sebebi prompt caching: bu blok araç şemalarıyla birlikte
   * Anthropic tarafında önbelleğe alınır ve sonraki isteklerde %90 ucuza okunur.
   * Buraya kullanıcıya/tarihe özel hiçbir bilgi konulmamalıdır — aksi halde önbellek
   * her istekte ıskalar ve maliyet düşmez.
   */
  private static readonly STATIC_SYSTEM_PROMPT = [
    "Sen Projelio'nun içine gömülü yapay zeka asistanısın. Adın \"Projelio Asistan\".",
      "Projelio; iş (job) > proje (project) > görev (task) hiyerarşisiyle çalışan bir proje ve serbest çalışan yönetim uygulamasıdır.",
      "Projelerin bütçesi, ekip üyeleri (sahip / üye / taşeron) ve teslim tarihleri vardır. Görevlerin alt görevleri olabilir.",
      "",
      "## Rolün",
      "Kullanıcının asistanısın: sorularını yanıtlar, verilerini analiz eder ve araçlarla gerçek değişiklikler yaparsın.",
      "Sadece komut çalıştıran bir arayüz değilsin — kullanıcının işini kolaylaştıran, öngörülü bir yardımcısın.",
      "",
      "## Davranış kuralları",
      "- Her zaman Türkçe yaz. Kısa, net ve doğal konuş; gereksiz dolgu cümlesi kurma.",
      "- Bir işlemi yapmak için gereken id'yi bilmiyorsan önce ilgili list_* / get_* aracıyla bul. Kullanıcıya asla id sorma; isimden eşleştir.",
      "- Aynı isimde birden fazla kayıt varsa hangisini kastettiğini sor.",
      "- Çok adımlı isteklerde (ör. \"şu projeye 3 görev ekle\") adımları arka arkaya kendin yürüt, her adım için kullanıcıya dönme.",
      "- Bir işlemi tamamladıktan sonra ne yaptığını tek cümleyle özetle. Uzun listeler yerine önemli olanı öne çıkar.",
      "- Silme, arşivleme ve bütçe hareketi işlemleri sistem tarafından otomatik olarak kullanıcıya onaylatılır. Sen sadece aracı doğru parametrelerle çağır; \"onaylıyor musun?\" diye ayrıca sorma.",
      "- Bir araç yetki hatası dönerse bunu kullanıcıya nazikçe açıkla ve aynı işlemi tekrar deneme.",
      "- Araçlardan dönen veriye sadık kal; bilmediğin bir şeyi uydurma.",
      "- Kullanıcı belirsiz konuşursa (ör. \"şunu hallet\") en olası yorumu yap ve ne yaptığını söyle; tamamen anlaşılmazsa tek bir netleştirici soru sor.",
      "- Tarih ifadelerini çöz: \"yarın\", \"haftaya\", \"ayın 15'i\" gibi ifadeleri bugünün tarihine göre gerçek tarihe dönüştür.",
      "- Aynı bilgiyi iki kez sorgulama; bir araçtan aldığın sonucu hatırla ve tekrar çağırma.",
      "",
      "Aşağıda sana kullanıcının bugünkü bağlamı verilecek. Oradaki id'leri doğrudan kullanabilirsin;",
      "listede olmayan bir şey için list_* araçlarına başvur.",
  ].join("\n");

  /**
   * Sistem promptunun isteğe/kullanıcıya özel (önbelleklenmeyen) kısmı.
   * Kasıtlı olarak kısa tutulur.
   */
  private async buildDynamicSystemPrompt(userId: string, userRole: string): Promise<string> {
    const context = await this.buildWorkspaceContext(userId);
    const today = new Date().toISOString().slice(0, 10);
    return [
      "## Bağlam",
      `- Bugünün tarihi: ${today}`,
      `- Kullanıcının rolü: ${userRole === "admin" ? "admin (yönetici)" : "freelancer"}`,
      context,
    ].join("\n");
  }

  /**
   * Kullanıcının mesajını işler.
   *
   * Akış: bakiye kontrolü -> sohbeti bul/oluştur -> geçmişi yükle -> araç döngüsü ->
   * harcanan token'ları krediye çevirip düş -> mesajları kaydet.
   */
  async chat(
    userId: string,
    userRole: string,
    userMessage: string,
    conversationId?: string
  ): Promise<ChatResult> {
    const trimmed = userMessage?.trim();
    if (!trimmed) throw new BadRequestException("Mesaj boş olamaz.");

    // Teşhis izi: bu satır görünmüyorsa istek bu backend'e hiç ulaşmamıştır.
    this.logger.log(`AI isteği alındı · kullanıcı=${userId.slice(0, 8)}… uzunluk=${trimmed.length}`);

    // Bakiye yetersizse hiç API çağrısı yapma.
    await this.creditsService.assertCanStart(userId);

    // Sohbeti hazırla.
    let convId = conversationId;
    if (convId) {
      await this.conversationsService.assertOwner(convId, userId);
    } else {
      convId = (await this.conversationsService.create(userId)).id;
    }

    const history = await this.conversationsService.getRecentMessages(convId);
    await this.conversationsService.addMessage(convId, "user", trimmed);
    await this.conversationsService.ensureTitle(convId, trimmed);

    const anthropic = this.getClient();
    const dynamicContext = await this.buildDynamicSystemPrompt(userId, userRole);
    const workingMessages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: trimmed },
    ];

    // Tüm turlar boyunca harcanan token'lar biriktirilir; tek seferde ücretlendirilir.
    const totals: TokenTotals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

    const finish = async (
      result: { type: "message"; text: string } | Omit<Extract<ChatResult, { type: "confirmation" }>, "conversationId" | "usage">,
      assistantText: string
    ): Promise<ChatResult> => {
      const { credits, balanceAfter } = await this.creditsService.chargeUsage({
        userId,
        model: this.model,
        inputTokens: totals.input,
        outputTokens: totals.output,
        cacheWriteTokens: totals.cacheWrite,
        cacheReadTokens: totals.cacheRead,
        conversationId: convId,
      });

      // Maliyet denetimi için her isteğin gerçek token dökümü loglanır.
      this.logger.log(
        `AI kullanım · model=${this.model} in=${totals.input} out=${totals.output} ` +
          `cacheWrite=${totals.cacheWrite} cacheRead=${totals.cacheRead} → ${credits} kredi`
      );

      if (assistantText) {
        await this.conversationsService.addMessage(convId!, "assistant", assistantText, {
          inputTokens: totals.input + totals.cacheWrite + totals.cacheRead,
          outputTokens: totals.output,
          creditsCharged: credits,
        });
      }
      return {
        ...(result as any),
        conversationId: convId!,
        usage: { creditsCharged: credits, balance: balanceAfter },
      };
    };

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.callAnthropic(anthropic, {
        model: this.model,
        max_tokens: MAX_TOKENS,
        // Sistem promptu iki bloğa ayrılır: statik blok (araç şemalarıyla birlikte)
        // önbelleğe alınır, dinamik bağlam her istekte yeniden gönderilir.
        system: [
          {
            type: "text",
            text: AiAssistantService.STATIC_SYSTEM_PROMPT,
            ...(CACHING_ENABLED ? { cache_control: { type: "ephemeral" } } : {}),
          },
          { type: "text", text: dynamicContext },
        ] as any,
        tools: AI_TOOLS,
        messages: workingMessages,
      });

      const usage: any = response.usage ?? {};
      totals.input += usage.input_tokens ?? 0;
      totals.output += usage.output_tokens ?? 0;
      totals.cacheWrite += usage.cache_creation_input_tokens ?? 0;
      totals.cacheRead += usage.cache_read_input_tokens ?? 0;

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (toolUses.length === 0) {
        const finalText = text || "Tamam.";
        return finish({ type: "message", text: finalText }, finalText);
      }

      const criticalUse = toolUses.find((use) => CRITICAL_TOOLS.has(use.name));
      if (criticalUse) {
        const actionId = randomUUID();
        const input = (criticalUse.input as Record<string, any>) ?? {};
        this.pendingActions.set(actionId, {
          id: actionId,
          userId,
          userRole,
          toolName: criticalUse.name,
          input,
          conversationId: convId,
          createdAt: Date.now(),
        });
        const summary = await this.summarizeAction(criticalUse.name, input);
        return finish(
          { type: "confirmation", actionId, toolName: criticalUse.name, summary, text: text || undefined },
          text || summary
        );
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
            content: this.serializeToolResult(result),
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

    const fallback = "İsteğini tamamlayamadım. Daha spesifik bir şekilde tekrar eder misin?";
    return finish({ type: "message", text: fallback }, fallback);
  }

  /**
   * Araç sonuçlarını modele verilecek metne çevirir. Çok büyük sonuçlar kırpılır:
   * her token kullanıcının kredisinden düştüğü için gereksiz veri gönderilmez.
   */
  private serializeToolResult(result: unknown): string {
    const json = JSON.stringify(result ?? {});
    if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
    return `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… [sonuç kısaltıldı: çok fazla kayıt var, gerekirse daha dar bir filtreyle tekrar sorgula]`;
  }

  async confirmAction(
    actionId: string,
    userId: string,
    confirmed: boolean
  ): Promise<{ type: "message"; text: string; conversationId?: string }> {
    this.sweepExpiredActions();
    const pending = this.pendingActions.get(actionId);
    if (!pending || pending.userId !== userId) {
      throw new NotFoundException("Onay bekleyen işlem bulunamadı ya da süresi doldu. Lütfen isteği tekrar yaz.");
    }
    this.pendingActions.delete(actionId);

    const record = async (text: string) => {
      try {
        await this.conversationsService.addMessage(pending.conversationId, "assistant", text);
      } catch (err: any) {
        this.logger.warn(`Onay sonucu sohbete kaydedilemedi: ${err?.message}`);
      }
      return { type: "message" as const, text, conversationId: pending.conversationId };
    };

    if (!confirmed) return record("İşlem iptal edildi.");

    try {
      await this.executeTool(pending.toolName, pending.input, pending.userId, pending.userRole);
      return record(`✅ ${RESULT_LABELS[pending.toolName] ?? "İşlem tamamlandı."}`);
    } catch (err: any) {
      return record(`İşlem başarısız oldu: ${err?.message ?? "bilinmeyen hata"}`);
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

  // --- Birleşik sorgular ---------------------------------------------------

  /** Kullanıcının erişebildiği tüm projelerdeki görevlerde arama/filtreleme yapar. */
  private async searchTasks(userId: string, input: Record<string, any>): Promise<unknown> {
    const projects = input.projectId
      ? [await this.projectsService.findOne(input.projectId)]
      : await this.projectsService.findAllForUser(userId);

    if (input.projectId) {
      await this.requireProjectRole(input.projectId, userId, "freelancer", ["owner", "member", "subcontractor"]);
    }

    const limit = Math.min(Number(input.limit) || 25, 50);
    const now = new Date();
    const collected: any[] = [];

    for (const project of projects) {
      if (collected.length >= limit) break;
      // findByProject taşeron görünürlük kurallarını zaten uyguluyor.
      const tasks = await this.tasksService.findByProject(project.id, userId);
      for (const task of tasks) {
        if (input.query && !task.title?.toLowerCase().includes(String(input.query).toLowerCase())) continue;
        if (input.status && task.status !== input.status) continue;
        if (input.assignedToMe && task.assignedTo !== userId) continue;

        const deadline = task.deadline ? new Date(task.deadline) : null;
        if (input.overdue && !(deadline && deadline < now && task.status !== "completed")) continue;
        if (input.dueBefore && !(deadline && deadline <= new Date(input.dueBefore))) continue;
        if (input.dueAfter && !(deadline && deadline >= new Date(input.dueAfter))) continue;

        collected.push(
          pruneEmpty({
            id: task.id,
            title: task.title,
            status: task.status,
            deadline: shortDate(task.deadline),
            assignee: task.assignedToName,
            project: project.title,
            projectId: project.id,
            overdue: deadline && deadline < now && task.status !== "completed" ? true : undefined,
          })
        );
        if (collected.length >= limit) break;
      }
    }

    return { count: collected.length, tasks: collected };
  }

  /** Kullanıcının genel durumu: proje sayıları, geciken ve yaklaşan işler. */
  private async getWorkspaceSummary(userId: string): Promise<unknown> {
    const projects = await this.projectsService.findAllForUser(userId);
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let overdue = 0;
    let dueThisWeek = 0;
    let assignedOpen = 0;
    const overdueSamples: any[] = [];

    for (const project of projects) {
      const tasks = await this.tasksService.findByProject(project.id, userId);
      for (const task of tasks) {
        if (task.status === "completed") continue;
        const deadline = task.deadline ? new Date(task.deadline) : null;
        if (task.assignedTo === userId) assignedOpen++;
        if (deadline && deadline < now) {
          overdue++;
          if (overdueSamples.length < 8) {
            overdueSamples.push(
              pruneEmpty({
                id: task.id,
                title: task.title,
                deadline: shortDate(task.deadline),
                project: project.title,
                assignee: task.assignedToName,
              })
            );
          }
        } else if (deadline && deadline <= weekLater) {
          dueThisWeek++;
        }
      }
    }

    return {
      projectCount: projects.length,
      activeProjectCount: projects.filter((p) => p.status === "active").length,
      overdueTaskCount: overdue,
      dueThisWeekCount: dueThisWeek,
      assignedToMeOpenCount: assignedOpen,
      overdueSamples,
    };
  }

  // --- Araç çalıştırıcı ----------------------------------------------------

  private async executeTool(name: string, input: Record<string, any>, userId: string, userRole: string): Promise<unknown> {
    switch (name) {
      case "list_jobs": {
        const jobs = await this.jobsService.findAllForUser(userId);
        return jobs.map((j) => ({ id: j.id, title: j.title, projectCount: j.projectCount }));
      }

      case "list_projects": {
        const list = input.jobId
          ? await this.projectsService.findByJob(input.jobId, userId)
          : await this.projectsService.findAllForUser(userId);
        return list.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          deadline: shortDate(p.deadline),
        }));
      }

      case "get_project": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        const p = await this.projectsService.findOne(input.projectId);
        return {
          id: p.id,
          title: p.title,
          description: p.description,
          status: p.status,
          totalBudget: p.totalBudget,
          startDate: shortDate(p.startDate),
          deadline: shortDate(p.deadline),
        };
      }

      case "list_tasks": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        const tasks = await this.tasksService.findByProject(input.projectId, userId);
        return tasks.map(compactTask);
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

      case "list_project_members": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        const members = await this.membersService.findByProject(input.projectId);
        // Modele yalnızca işine yarayan alanları ver (token tasarrufu).
        return members.map((m) => ({
          userId: m.userId,
          name: m.fullName,
          username: m.username,
          role: m.role,
          title: m.title,
        }));
      }

      case "search_tasks":
        return this.searchTasks(userId, input);

      case "get_workspace_summary":
        return this.getWorkspaceSummary(userId);

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
