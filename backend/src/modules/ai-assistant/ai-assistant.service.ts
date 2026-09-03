import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  forwardRef,
  Inject,
} from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { SupabaseService } from "../../database/supabase.service";
import { TasksService } from "../tasks/tasks.service";
import { ProjectsService } from "../projects/projects.service";
import { JobsService } from "../jobs/jobs.service";
import { BudgetService } from "../budget/budget.service";
import { MembersService } from "../members/members.service";
import { TaskCommentsService } from "../task-comments/task-comments.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PlanningService } from "../planning/planning.service";
import { OutputsService } from "../outputs/outputs.service";
import { AI_TOOLS, CRITICAL_TOOLS, toolsForChannel } from "./ai-assistant.tools";
import { describeModuleFields, hasRecordConfig, normalizeModuleData } from "./ai-modules";
import { taskTarget } from "./ai-task-target";
import { getModuleRecordConfig } from "@projelio/shared";
import { CatalogService } from "../catalog/catalog.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { DepartmentsService } from "../departments/departments.service";
import { DepartmentMembersService } from "../department-members/department-members.service";
import { OrganizationModulesService } from "../organization-modules/organization-modules.service";
import { JobModulesService } from "../job-modules/job-modules.service";
import { ModuleRecordsService } from "../module-records/module-records.service";
import { GroupsService } from "../groups/groups.service";
import { OperationsService } from "../operations/operations.service";
import { ProductsService, type ProductWriteInput } from "../products/products.service";
import { SupportService } from "../support/support.service";
import { AiExportsService } from "./ai-exports.service";
import { type ExportFormat, type ExportTable } from "./ai-export-builder";
import {
  distinctValues,
  MAX_IMPORT_ROWS,
  normalizeKey,
  planRecordImport,
  planTaskImport,
  type SheetData,
} from "./ai-sheet-import";
import { AiCreditsService, InsufficientCreditsException } from "./ai-credits.service";
import {
  AiConversationsService,
  type ActiveFile,
  type AiStoredMessage,
  type StoredAttachment,
} from "./ai-conversations.service";
import { AiAttachmentsService, type PreparedAttachment } from "./ai-attachments.service";
import { estimateTranscriptionCredits } from "./ai-credits.config";
import { FilesService } from "../files/files.service";
import { PersonalTodosService } from "../personal-todos/personal-todos.service";
import { AiTranscriptionService } from "./ai-transcription.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { WhatsappLioService } from "../whatsapp/whatsapp-lio.service";
import type { LioActivityPayload } from "@projelio/shared";
import {
  BASE_PROMPT_TOKENS,
  CREDIT_CONFIRM_THRESHOLD,
  MODEL_TIERS,
  calculateUsageCost,
  resolveTier,
  type ModelTier,
} from "./ai-credits.config";
import { LlmProviderRegistry, type ProviderChoice } from "./providers/provider-registry";
import type { LlmRequest, LlmResponse } from "./providers/llm-provider";

const DEFAULT_MODEL = MODEL_TIERS.fast.model;
const PENDING_ACTION_TTL_MS = 10 * 60 * 1000; // 10 dakika
/** Duraklatılmış bir koşunun devam onayı için bekleme süresi. */
const PENDING_RUN_TTL_MS = 15 * 60 * 1000;
/**
 * Devam onaylarıyla birlikte tek bir isteğin çıkabileceği azami tur sayısı.
 * Kullanıcı "devam et" dedikçe koşu uzayabilir, ama sonsuza kadar değil: modelin
 * kendi kuyruğunu kovaladığı patolojik durumlarda bu tavan devreye girer.
 */
const MAX_TOTAL_ITERATIONS = Number(process.env.AI_MAX_TOTAL_ITERATIONS ?? 24);

// --- Bakiye rezervasyonu -------------------------------------------------
// Bir turun bedelini ÖNDEN kestirmek için kullanılan kaba dönüşümler. Hepsi
// ihtiyatlı tarafta: fazla tahmin "biraz erken durdum", az tahmin "kullanıcı
// eksi bakiyede kaldı" demek. İkincisi kabul edilemez.

/** Türkçe metinde bir token kabaca 3 karakter. */
const CHARS_PER_TOKEN = 3;
/** Bir görselin yaklaşık token bedeli (Anthropic'in tek görsel üst sınırına yakın). */
const IMAGE_TOKENS = 2_000;
/** PDF'te kabaca kaç bayta bir token düştüğü — metin yoğun belgelere göre. */
const PDF_BYTES_PER_TOKEN = 50;
/** Tek bir PDF için tahminin tavanı; ötesi zaten bağlam sınırına takılır. */
const MAX_PDF_TOKENS = 150_000;
/**
 * Bir tura izin verilecek en küçük çıktı sınırı.
 *
 * Bakiye azaldığında isteği tamamen reddetmek yerine çıktı sınırı KISILIR
 * (bkz. planTurn): kullanıcı "yeterli kredin yok" duvarına ancak bu asgari yanıtı
 * bile karşılayamadığında çarpar. Daha aşağısı anlamlı bir cümle bile kurdurmaz.
 */
const MIN_OUTPUT_TOKENS = 400;
/**
 * "Bu tur ne tutar?" tahmininde varsayılan çıktı uzunluğu.
 *
 * Rezervasyon en kötü hâli (MAX_TOKENS) kullanır; kullanıcıya "devam edeyim mi?"
 * diye sorup sormamaya karar verirken ise GERÇEKÇİ bir sayı gerekiyor. En kötü
 * hâlle sorulsaydı her Dengeli sohbette gereksiz onay penceresi çıkardı.
 */
const TYPICAL_OUTPUT_TOKENS = 600;
/**
 * Anthropic önbelleğinin ömrü 5 dakika. Bu süreye yaklaşmış bir sohbette önbelleğin
 * hâlâ sıcak olduğunu varsaymak, turun bedelini 10 kat düşük tahmin etmek demek —
 * "600 kredi üstünde sor" kuralının ilk kaçırdığı şey tam olarak buydu. Pay
 * bırakılarak 4 dakika kullanılıyor.
 */
const CACHE_WARM_WINDOW_MS = 4 * 60 * 1000;

// --- Maliyet sınırlayıcıları --------------------------------------------
// Bu değerlerin her biri doğrudan kullanıcının kredi harcamasını etkiler.
// Yükseltmeden önce maliyet etkisini hesaplayın.

/**
 * Modelin tek yanıtta üretebileceği azami token.
 *
 * 800'DEN 2000'E ÇIKARILDI. 800, sohbet cümleleri için bol ama TOPLU ARAÇ ÇAĞRISI
 * için değildi: "şu Excel'deki 20 kalemi görev/alt görev olarak ekle" isteğinde
 * create_tasks çağrısının JSON'u sınıra çarpıp yarıda kesiliyor, model her turda
 * yeniden deniyor ve istek hiçbir şey yapmadan yüzlerce kredi harcayarak bitiyordu.
 *
 * Maliyeti artırmaz: bu bir TAVANDIR, üretilmeyen token ücretlendirilmez. Yalnızca
 * bakiye rezervasyonunu yükseltir (bkz. reserveFor) — orada en kötü hâl hesaplanıyor.
 */
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS ?? 2000);
/**
 * Bir istek için azami araç turu. Her tur ayrı bir API çağrısıdır.
 * 4'ten 8'e çıkarıldı: çok adımlı istekler (ör. "3 görev ekle, birini ata, özet ver")
 * eskiden bu sınıra çarpıp "isteğini tamamlayamadım" ile bitiyordu. Tur sayısı arttıkça
 * maliyet de artar, ama bir isteğin YARIM kalıp kullanıcının aynı şeyi tekrar sorması
 * (= 2 kat kredi) daha pahalıya gelir. create_tasks gibi toplu araçlar da tur sayısını
 * azaltarak bu limitin pratikte daha az zorlanmasını sağlar.
 */
const MAX_TOOL_ITERATIONS = Number(process.env.AI_MAX_TOOL_ITERATIONS ?? 8);
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

/**
 * SDK 0.32 birleşik bir "içerik bloğu" tipi dışa açmıyor; MessageParam'ın content
 * dizisinden türetiliyor. PDF (document) bloğu bu sürümde hiç tipli değil, o yüzden
 * gönderilirken ayrıca zorlanıyor (bkz. activeFileBlock).
 */
type ContentBlockParam = Extract<Anthropic.MessageParam["content"], any[]>[number];

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

/**
 * Uzayan bir isteğin duraklatılma sebebi.
 * - `estimate`: HENÜZ HİÇBİR ŞEY HARCANMADAN, isteğin tahmini bedeli eşiği aşıyor.
 * - `budget`: harcama sürerken CREDIT_CONFIRM_THRESHOLD'u aşmak üzere.
 * - `iterations`: tur sınırına gelindi, iş hâlâ bitmedi.
 */
export type ContinuationReason = "estimate" | "budget" | "iterations";

export type ChatResult = (
  | { type: "message"; text: string }
  | { type: "confirmation"; actionId: string; summary: string; toolName: string; text?: string }
  | {
      /**
       * Kredi tükendiği için iş yarıda kesildi. Duraklatmadan (continuation) farkı:
       * bu durumda "devam edeyim mi?" diye sormanın anlamı yok — kredi yüklenmeden
       * devam edilemez.
       */
      type: "out_of_credits";
      text: string;
      balance: number;
      requiredCredits: number;
      doneSummary: string;
    }
  | {
      type: "continuation";
      runId: string;
      reason: ContinuationReason;
      text: string;
      /** Bu istek için şimdiye kadar düşülen toplam kredi. */
      spentCredits: number;
      /** Devam edilirse bir sonraki turun yaklaşık bedeli. */
      estimatedNextCredits: number;
      /** Şimdiye kadar gerçekten yapılan kalıcı değişiklikler. */
      doneSummary: string;
      tier: ModelTier;
    }
) & {
  conversationId: string;
  usage: ChatUsageInfo;
  /**
   * Sohbette hâlâ açık olan dosyaların künyesi.
   *
   * Her yanıtla dönmesinin sebebi arayüzün bunu görünür kılması: kullanıcı hangi
   * dosyanın "hâlâ taşındığını" (ve dolayısıyla her turda ödendiğini) görebilmeli,
   * gerekirse kendisi kaldırabilmeli.
   */
  activeFiles: ActiveFileInfo[];
};

/** Aktif dosyanın arayüze giden hâli — çıkarılmış metin dışarı çıkmaz. */
export interface ActiveFileInfo {
  id: string;
  name: string;
  kind: string;
  detail: string;
}

type ProjectMembershipRole = "owner" | "member" | "subcontractor";

interface PendingAction {
  id: string;
  userId: string;
  userRole: string;
  toolName: string;
  input: Record<string, any>;
  conversationId: string;
  createdAt: number;
  /**
   * Onayın kesintiye uğrattığı koşu.
   *
   * Eskiden onay istendiğinde isteğin GERİ KALANI düşüyordu: "eski görevleri sil,
   * sonra şunları ekle" dendiğinde silme onaylanıyor, ekleme hiç yapılmıyordu.
   * Kullanıcı işin bittiğini sanıyor, aslında yarısı yapılmış oluyordu. Artık koşu
   * dondurulur ve onaydan sonra kaldığı yerden sürer.
   */
  runId: string;
  /** Onay bekleyen turun tam asistan içeriği — devam ederken aynen geri beslenir. */
  assistantContent: any[];
  /** Onaya düşen tool_use bloğunun kimliği (aynı turda başka araçlar da olabilir). */
  criticalUseId: string;
}

/**
 * Duraklatılmış bir asistan koşusu.
 *
 * Kredi eşiğine ya da tur sınırına gelindiğinde koşu SİLİNMEZ, dondurulur: o ana
 * kadarki mesaj yığını burada durur, kullanıcı onay verirse aynı yerden devam edilir.
 * Sıfırdan başlatmak, o ana kadar ödenen kredinin çöpe gitmesi demek olurdu.
 */
interface PendingRun {
  id: string;
  userId: string;
  userRole: string;
  conversationId: string;
  tier: ModelTier;
  /** Kullanıcının açıkça seçtiği model ("saglayici:model"); yoksa kademe kararı geçerli. */
  preferredModel?: string | null;
  messages: Anthropic.MessageParam[];
  /**
   * Bağlamın dosyadan BAĞIMSIZ kısmı (tarih, rol, iş/proje özeti).
   *
   * Açık dosya bildirimi buraya gömülmez, her turda ayrıca eklenir: dosya
   * koşunun ortasında bırakılabiliyor (release_files) ve o andan sonra
   * "şu dosyalar elinde" demeye devam etmek modeli yanıltırdı.
   */
  baseContext: string;
  /** Bu koşuda çalıştırılan araçlar — "ne yapıldı" özetini kurmak için. */
  executed: string[];
  /** Bu koşuda şimdiye kadar düşülen kredi (segmentler arası taşınır). */
  spentCredits: number;
  /** Toplam tur sayısı (segmentler arası taşınır). */
  iterationsUsed: number;
  /**
   * Kullanıcının bu koşu için onayladığı harcama tavanı. Her "devam et" bir eşik
   * daha ekler; aksi halde onaydan hemen sonra tekrar sormak zorunda kalırdık.
   */
  creditCeiling: number;
  /**
   * Bu segmentin başındaki bakiye. Segment içinde henüz tahsilat yapılmadığı için
   * (ücret tur sonunda tek seferde düşülür) kalan kredi bu sayıdan hesaplanır.
   */
  startingBalance: number;
  /** Sohbete sabitlenmiş dosyalar — her turda modele bunlar gönderilir. */
  activeFiles: ActiveFile[];
  /** Sabit dosya bloğunun token karşılığı — önbelleğe alınan kısmın büyüklüğü. */
  pinnedTokens: number;
  /**
   * Bu isteğin ilk turu önbelleği YAZACAK mı (okumak yerine)?
   *
   * Yazmak girdinin 1,25 katı, okumak 0,10 katı — arada 12 kat var. Üç durumda
   * yazma beklenir: sohbet yeni, yeni dosya eklendi (önek değişti) ya da son
   * mesajın üzerinden önbellek ömrü kadar zaman geçti. Üçüncüsü ilk sürümde
   * atlanmıştı ve tek bir turun 1.070 krediye çıkmasına rağmen eşiğin
   * tetiklenmemesine yol açtı.
   */
  expectsCacheWrite: boolean;
  /** Duraklatma anındaki tur tahmini — devam onayında tavanı buna göre açmak için. */
  pausedEstimate: number;
  /**
   * Bu istek için tekrar onay sorulsun mu?
   *
   * Kullanıcı "bir daha sorma" dediğinde kapanır. Uzun bir toplu işte üç ayrı
   * pencereyle karşılaşmak (tahmin, bütçe, adım sınırı) işi bitirmekten çok
   * kesintiye uğratıyordu; onay bir kez alınıp iş sonuna kadar götürülebilmeli.
   * Bakiye koruması bundan BAĞIMSIZ çalışmaya devam eder.
   */
  askAgain: boolean;
  /** Bu segmentte açılmış kredi tutmaları; segment biterken hepsi kaldırılır. */
  holds: string[];
  /**
   * İsteğin geldiği kanal. Araç seti buna göre süzülür (toolsForChannel):
   * WhatsApp'ta kritik araçlar modele HİÇ verilmez, çünkü onay diyaloğu
   * web ekranına bağlı. Varsayılan "web" — mevcut çağıranlar değişmez.
   */
  channel: "web" | "whatsapp";
  /** WhatsApp'ta kullanıcı veri değiştirmeyi kapatmış olabilir (§3.8). */
  allowWrites: boolean;
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

/**
 * Dakikaları saate çevirirken kullanılan yuvarlama.
 *
 * Modele "5.25 saat" demek yeterli; "5.2483333" hem token yakar hem cümleye
 * o hassasiyetle geçtiğinde kullanıcıya saçma görünür.
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
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
  archive_output: "Çıktı arşivlendi.",
  delete_output: "Çıktı silindi.",
  archive_module_record: "Modül kaydı arşivlendi.",
  disable_module: "Modül kapatıldı.",
  archive_group: "Grup arşivlendi.",
  delete_group: "Grup silindi.",
  archive_organization: "Organizasyon arşivlendi.",
  delete_organization: "Organizasyon silindi.",
  archive_department: "Departman arşivlendi.",
  delete_department: "Departman silindi.",
  archive_operation: "Rutin arşivlendi.",
  delete_operation: "Rutin silindi.",
  archive_product: "Ürün arşivlendi.",
  delete_product: "Ürün silindi.",
  create_support_request: "Destek talebin Projelio ekibine iletildi.",
};

/**
 * Duraklatma mesajlarında "şimdiye kadar ne yapıldı" özetini kurmak için kullanılır.
 * Yalnızca KALICI değişiklik yapan araçlar burada listelenir; okuma araçları özete
 * girmemeli, yoksa hiçbir şey değişmediği halde iş yapılmış gibi görünür.
 */
/** Ek türlerinin modele ve kullanıcıya gösterilen Türkçe adı. */
const ATTACHMENT_LABELS: Record<string, string> = {
  image: "Görsel",
  pdf: "PDF",
  document: "Word belgesi",
  sheet: "Tablo",
  text: "Metin dosyası",
  audio: "Ses kaydı (yazıya çevrildi)",
};

/**
 * Bir sohbette aynı anda sabit tutulabilecek azami dosya.
 *
 * Sabit dosyalar HER TURDA gönderiliyor; sayı arttıkça sohbetin tur başına bedeli
 * de artar. Beş dosya pratikte yeterli, fazlası kullanıcıyı farkında olmadan
 * pahalı bir sohbete kilitler.
 */
const MAX_ACTIVE_FILES = 5;

/** Yalnızca dosya gönderilip hiçbir şey yazılmadığında kullanılan varsayılan istek. */
const EMPTY_MESSAGE_WITH_FILE = "Bu dosyayı incele ve ne olduğunu özetle.";

/**
 * WhatsApp kanalının ek talimatı. Statik (önbelleğe alınan) blokta DEĞİL,
 * dinamik bağlamda: statik blok araç şemalarıyla birlikte önbelleğe alınıyor
 * ve web isteklerinin çoğunluğu o öneki paylaşıyor — kanala göre değişen bir
 * metni oraya koymak her WhatsApp isteğinde önbelleği ıskalatırdı.
 *
 * Biçim kuralı bir RİCA'dır; model yine de markdown üretirse son savunma
 * whatsapp-lio-format.ts'te.
 */
const WHATSAPP_CHANNEL_PROMPT = [
  "### Bu istek WhatsApp'tan geldi",
  "",
  "SADECE YAZIM BİÇİMİ değişir; araçların ve yetkilerin web'dekiyle AYNI şekilde çalışır.",
  "Elindeki her aracı burada da normal şekilde kullan.",
  "",
  "Biçim:",
  "- Düz metin üret: başlık, kalın yazı, tablo ve markdown kullanma. Kısa madde listesi olur.",
  "- Kısa tut: en fazla 800 karakter. Sığmayacaksa en önemlisini yaz ve ayrıntı için uygulamaya yönlendir.",
  "- Dosya bağlantısı verme; WhatsApp'ta açılmaz.",
  "",
  "İŞ YAPMA (en önemli kural):",
  "- Bir şey eklemen/değiştirmen isteniyorsa İLGİLİ ARACI ÇAĞIR. Aracı çağırmadan",
  "  \"ekledim\", \"kaydettim\", \"hatırlatma kurdum\" DEME — araç sonucu dönmeden iş yapılmış değildir.",
  "- Kanal, iş yapmana engel DEĞİLDİR. \"WhatsApp'tan olmaz, uygulamadan yapın\" deme;",
  "  yalnızca aşağıdaki iki durumda uygulamaya yönlendir.",
  "- Aracı çağırıp HATA aldıysan ne olduğunu açıkça söyle; sebebini uydurma.",
  "",
  "Uygulamaya yönlendireceğin İKİ durum (yalnızca bunlar):",
  "1. Silme, arşivleme ve bütçe hareketi araçları bu kanalda gerçekten YOK.",
  "   İstenirse yapamayacağını söyle; yapmış gibi davranma.",
  "2. O iş için elinde hiçbir araç yoksa.",
].join("\n");

const ACTION_LABELS: Record<string, string> = {
  create_job: "iş oluşturuldu",
  update_job: "iş güncellendi",
  create_project: "proje oluşturuldu",
  update_project: "proje güncellendi",
  create_task: "görev oluşturuldu",
  create_tasks: "toplu görev eklendi",
  // (sayı almayanlar için bkz. COUNTLESS_ACTIONS)
  update_task: "görev güncellendi",
  update_task_status: "görev durumu değiştirildi",
  add_task_comment: "yorum eklendi",
  set_period_plan: "dönem planı kaydedildi",
  create_time_blocks: "zaman bloğu eklendi",
  update_time_block_status: "zaman bloğu güncellendi",
  complete_ritual: "planlama oturumu kapatıldı",
  create_output: "çıktı oluşturuldu",
  update_output: "çıktı güncellendi",
  create_todo: "yapılacak eklendi",
  create_todos: "toplu yapılacak eklendi",
  update_todo: "yapılacak güncellendi",
  set_todo_status: "yapılacak durumu değiştirildi",
  update_assigned_todo_prefs: "pano kartı güncellendi",
  reorder_todos: "yapılacaklar sıralandı",
  archive_todo: "yapılacak kaldırıldı",
  restore_todo: "yapılacak geri alındı",
  create_module_record: "modül kaydı eklendi",
  update_module_record: "modül kaydı güncellendi",
  archive_module_record: "modül kaydı arşivlendi",
  enable_module: "modül açıldı",
  disable_module: "modül kapatıldı",
  create_group: "grup oluşturuldu",
  update_group: "grup güncellendi",
  create_organization: "organizasyon oluşturuldu",
  update_organization: "organizasyon güncellendi",
  create_department: "departman açıldı",
  update_department: "departman güncellendi",
  create_operation: "rutin oluşturuldu",
  update_operation: "rutin güncellendi",
  create_product: "ürün eklendi",
  update_product: "ürün güncellendi",
  export_report: "rapor dosyası üretildi",
  import_tasks_from_sheet: "dosyadan toplu görev eklendi",
  import_module_records_from_sheet: "dosyadan toplu modül kaydı eklendi",
};

export function toActiveFileInfo(files: { id: string; name: string; kind: string; detail: string }[]) {
  return files.map(({ id, name, kind, detail }) => ({ id, name, kind, detail }));
}

/**
 * Dosya ses mi?
 *
 * MIME'a tek başına güvenilmiyor: Drive ve OneDrive bazı dosyaları
 * "application/octet-stream" olarak bildiriyor ve o durumda tek ipucu uzantı
 * kalıyor (bkz. ai-attachments.service.ts EXTENSION_MIMES). Buradaki kontrol
 * ücretli bir çözümlemeyi engellediği için ihtiyatlı davranır.
 */
function isAudioFile(mimeType: string, name: string): boolean {
  if (mimeType?.startsWith("audio/") || mimeType === "video/mp4" || mimeType === "video/webm") return true;
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return ["mp3", "m4a", "wav", "ogg", "webm", "mp4", "aac", "flac", "aiff", "wma"].includes(ext);
}

/** Hazırlanmış eki sohbete sabitlenecek kayda çevirir. */
function toActiveFile(
  attachment: PreparedAttachment,
  extra: { sourceFileId?: string; addedMidRun?: boolean } = {}
): ActiveFile {
  return {
    id: attachment.id,
    name: attachment.name,
    kind: attachment.kind,
    detail: attachment.detail,
    text: attachment.text,
    ...extra,
  };
}

/** Koşu-ortası işaretini düşürür: işaret yalnızca bir sonraki isteğe kadar yaşar. */
function clearMidRunFlag(file: ActiveFile): ActiveFile {
  if (!file.addedMidRun) return file;
  const { addedMidRun, ...rest } = file;
  return rest;
}

/**
 * Sayı ÖNEKİ almayan eylemler.
 *
 * Sayaç araç ÇAĞRISINI sayıyor, kaydı değil. Tek kayıt oluşturan araçlarda ikisi
 * aynı şey ("2 görev oluşturuldu" doğru), ama toplu araçta değil: iki create_tasks
 * çağrısı yirmi görev demek olabilir. "2 toplu görev eklendi" hem yanlış hem de
 * Türkçe olarak tuhaf; o yüzden bu etiketler sayısız yazılır.
 */
const COUNTLESS_ACTIONS = new Set([
  "toplu görev eklendi",
  "toplu yapılacak eklendi",
  "yapılacaklar sıralandı",
  "dosyadan toplu görev eklendi",
  "dosyadan toplu modül kaydı eklendi",
]);

function summarizeExecuted(executed: string[]): string {
  const counts = new Map<string, number>();
  for (const name of executed) {
    const label = ACTION_LABELS[name];
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (counts.size === 0) return "Henüz kalıcı bir değişiklik yapılmadı";
  return [...counts.entries()]
    .map(([label, n]) => (n > 1 && !COUNTLESS_ACTIONS.has(label) ? `${n} ${label}` : label))
    .join(", ");
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  // MVP: onay bekleyen kritik işlemler bellekte tutulur. Tek instance için yeterlidir;
  // çoklu instance / restart senaryosu için ileride paylaşımlı bir depoya taşınabilir.
  // (ioredis bağımlılıkta duruyor ama kullanılmıyor; Redis servisi de sağlanmış değil.)
  private readonly pendingActions = new Map<string, PendingAction>();
  /** Kullanıcının "devam edeyim mi?" sorusuna cevabını bekleyen koşular. */
  private readonly pendingRuns = new Map<string, PendingRun>();

  constructor(
    private supabase: SupabaseService,
    private tasksService: TasksService,
    private projectsService: ProjectsService,
    private jobsService: JobsService,
    private budgetService: BudgetService,
    private membersService: MembersService,
    private taskCommentsService: TaskCommentsService,
    private notificationsService: NotificationsService,
    private planningService: PlanningService,
    private outputsService: OutputsService,
    private creditsService: AiCreditsService,
    private conversationsService: AiConversationsService,
    private attachmentsService: AiAttachmentsService,
    private transcriptionService: AiTranscriptionService,
    // Lio'nun search_files/open_file araçları için: dosya arama ve indirme
    // yetkisi tek yerde, FilesService'te duruyor.
    private filesService: FilesService,
    // Yapılacaklar sayfası (kişisel pano) araçları için.
    private personalTodosService: PersonalTodosService,
    // WhatsApp araçları (müşteriye yaz, konuşmayı oku, otomatik yanıt). İki
    // yönlü bağımlılık: WhatsApp modülü otomatik yanıt için draftText()'i
    // çağırıyor, bu yüzden forwardRef.
    @Inject(forwardRef(() => WhatsappLioService)) private whatsappLio: WhatsappLioService,
    // Modül araçları: katalog (hangi modüller var), organizasyon/iş modülleri
    // (hangileri açık) ve kayıtlar (modülün defteri). Yetki kontrolleri bu
    // servislerin İÇİNDE — Lio ayrı bir yol açmıyor, kullanıcının kendi
    // yetkisiyle aynı kapıdan geçiyor.
    private catalogService: CatalogService,
    private organizationsService: OrganizationsService,
    // Departman araçları: görev bir projeye ya da bir departmana açılabiliyor
    // (bkz. Task.departmentId). Yetki kontrolleri yine bu servislerin içinde.
    private departmentsService: DepartmentsService,
    private departmentMembersService: DepartmentMembersService,
    private organizationModulesService: OrganizationModulesService,
    private jobModulesService: JobModulesService,
    private moduleRecordsService: ModuleRecordsService,
    // Kapsayıcılar ve ticari kayıtlar: grup > organizasyon > departman
    // hiyerarşisi, işe bağlı rutinler ve organizasyonun ürünleri. Yetki
    // kontrolleri yine servislerin İÇİNDE (sahiplik/yöneticilik), Lio her
    // çağrıda kullanıcının kimliğini geçiriyor.
    private groupsService: GroupsService,
    private operationsService: OperationsService,
    private productsService: ProductsService,
    // Destek talebi: kullanıcının Projelio ekibine yazdığı mesaj.
    private supportService: SupportService,
    // Rapor/dışa aktarma dosyalarını üretir ve indirilebilir tutar.
    private exportsService: AiExportsService,
    private realtime: RealtimeGateway,
    private providers: LlmProviderRegistry
  ) {}

  /** Kademe belirtilmeyen yerler (ör. draftText) için varsayılan model. */
  private get model(): string {
    return this.modelForTier("fast");
  }

  /**
   * Kademeden gerçek model adına çevirir.
   *
   * ANTHROPIC_MODEL yalnızca "hızlı" kademeyi ezer: o değişken zaten "ucuz modeli
   * değiştir" için konmuştu. Kullanıcı bilerek üst kademe seçtiyse env'in onu geri
   * ucuz modele düşürmesi, ödediği kredinin karşılığını vermemek olurdu.
   */
  private modelForTier(tier: ModelTier, preferred?: string | null): string {
    // ANTHROPIC_MODEL geriye dönük çalışır ama yalnızca birincil sağlayıcı
    // Anthropic'ken anlamlıdır; başka sağlayıcı öndeyken onun modeli geçerli.
    const primary = this.providers.primaryForTier(tier, preferred);
    if (tier === "fast" && (!primary || primary.definition.id === "anthropic")) {
      return process.env.ANTHROPIC_MODEL?.trim() || primary?.model || DEFAULT_MODEL;
    }
    return primary?.model ?? MODEL_TIERS[tier]?.model ?? DEFAULT_MODEL;
  }

  /**
   * Yapılandırılmış sağlayıcıları sırayla dener ve ilk başarılı yanıtı döndürür.
   *
   * Hata çevirisi ESKİDEN callAnthropic içindeydi; sağlayıcı bağımsız olması
   * için buraya alındı. Yedeğe geçme kararı ham hata üzerinden registry'de
   * verilir, kullanıcıya gösterilecek mesaj ise yalnızca hepsi düştüğünde
   * burada üretilir.
   */
  private async callModel(
    tier: ModelTier,
    build: (choice: ProviderChoice) => LlmRequest,
    preferred?: string | null
  ): Promise<{ response: LlmResponse; model: string; providerLabel: string }> {
    try {
      const { response, choice } = await this.providers.send(tier, build, { preferred });
      return { response, model: choice.model, providerLabel: choice.definition.label };
    } catch (err: any) {
      throw this.toUserFacingError(err);
    }
  }

  /** Sağlayıcı hatasını kullanıcıya gösterilebilir bir istisnaya çevirir. */
  private toUserFacingError(err: any): Error {
    const status: number | undefined = err?.status;

    if (status === 401) {
      this.logger.error(`Sağlayıcı 401: API anahtarı geçersiz. ${err?.message ?? ""}`);
      return new BadRequestException(
        "AI sağlayıcısının API anahtarı geçersiz görünüyor. backend/.env içindeki anahtarı kontrol edin."
      );
    }
    if (status === 404) {
      this.logger.error(`Sağlayıcı 404: model bulunamadı. ${err?.message ?? ""}`);
      return new BadRequestException(
        "Seçilen model sağlayıcıda bulunamadı. Model ayarlarını kontrol edin."
      );
    }
    if (status === 400) {
      this.logger.error(`Sağlayıcı 400: ${err?.message}`);
      // Kredi bakiyesi yetersizken sağlayıcı 400 döner; bu en sık karşılaşılan kurulum
      // sorunu olduğu için genel "geçersiz istek" mesajının arkasına saklanmasın.
      if (/credit balance|insufficient|quota/i.test(err?.message ?? "")) {
        return new ServiceUnavailableException(
          "AI sağlayıcısı hesabınızda kredi kalmamış. Sağlayıcı panelinden kredi yükleyin."
        );
      }
      // Ham sağlayıcı metni kullanıcıya GİTMEZ: 400 mesajları isteğin iç yapısını
      // anlatır ("messages.0.content.0.text: field required", model adı, jeton
      // sınırı…). Kullanıcı için anlamsız, bizim uygulama detayımızı dışarı veriyor.
      // Teşhis için gereken metin bir satır yukarıda zaten loglanıyor.
      return new BadRequestException(
        "Bu istek işlenemedi. Mesajı kısaltıp ya da ekleri azaltıp tekrar dener misin?"
      );
    }
    if (status === 429) {
      return new ServiceUnavailableException(
        "AI sağlayıcısının hız sınırına takıldı ya da kredi limitiniz dolmuş olabilir. Biraz sonra tekrar deneyin."
      );
    }
    if (status && status >= 500) {
      return new ServiceUnavailableException("AI servisi şu anda yanıt vermiyor. Biraz sonra tekrar deneyin.");
    }
    if (err instanceof BadRequestException || err instanceof ServiceUnavailableException) {
      return err;
    }

    // Statü yoksa bağlantı kurulamamıştır ("fetch failed" bu dalda düşer).
    const { code, detail, message } = this.describeConnectionError(err);
    this.logger.error(`AI sağlayıcı bağlantı hatası [${code}]: ${detail}`);
    return new ServiceUnavailableException(`${message} (teknik detay: ${code})`);
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

  /** Teşhis: yapılandırma doğru mu ve seçili sağlayıcıya gerçekten ulaşılabiliyor mu? */
  async health(): Promise<Record<string, unknown>> {
    const primary = this.providers.primaryForTier("fast");
    const apiKey = primary ? process.env[primary.definition.apiKeyEnv]?.trim() : undefined;
    const base = {
      apiKeyPresent: !!apiKey,
      apiKeyPrefix: apiKey ? `${apiKey.slice(0, 12)}…${apiKey.slice(-4)}` : null,
      model: this.model,
      // Hangi sağlayıcılar tanımlı, hangileri sırada — yanlış AI_PROVIDERS
      // yazımı en sık karşılaşılacak kurulum hatası, teşhiste görünsün.
      provider: primary?.definition.id ?? null,
      providers: this.providers.describe(),
      nodeVersion: process.version,
      proxyEnv: process.env.HTTPS_PROXY ?? process.env.https_proxy ?? null,
      // Ses ekleri ayrı bir sağlayıcıya gidiyor; anahtarı yoksa yalnızca ses çalışmaz,
      // asistanın geri kalanı etkilenmez. Teşhiste bu ayrım görünsün.
      transcriptionConfigured: this.transcriptionService.configured,
    };

    if (!primary || !apiKey) {
      return {
        ...base,
        reachable: false,
        error: primary
          ? `${primary.definition.apiKeyEnv} tanımlı değil (backend/.env).`
          : "Yapılandırılmış AI sağlayıcısı yok (AI_PROVIDERS / API anahtarlarını kontrol edin).",
      };
    }

    try {
      await primary.provider.send({
        model: primary.model,
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
      "Kurumsal tarafta ikinci bir hiyerarşi var: organizasyon > departman (Pazarlama, Muhasebe…) > görev. " +
        "Yani bir görev İKİ yerden birine açılır: bir PROJEYE ya da bir DEPARTMANA. İkisi birbirinin alt kırılımı değildir.",
      "",
      "## Rolün",
      "Kullanıcının asistanısın: sorularını yanıtlar, verilerini analiz eder ve araçlarla gerçek değişiklikler yaparsın.",
      "Sadece komut çalıştıran bir arayüz değilsin — kullanıcının işini kolaylaştıran, öngörülü bir yardımcısın.",
      "",
      "## Davranış kuralları",
      "- Her zaman Türkçe yaz. Kısa, net ve doğal konuş; gereksiz dolgu cümlesi kurma.",
      "",
      "### Türkçe kuralları",
      "Yazdığın Türkçe, İngilizceden çevrilmiş gibi DEĞİL, Türkçe düşünen birinin yazdığı gibi olmalı.",
      "- SEN diye hitap et, siz değil. Tek bir yanıtın içinde ikisini karıştırma: " +
        "\"ekledim, istersen bakabilirsin\" evet; \"ekledim, isterseniz bakabilirsiniz\" hayır.",
      "- Özel ada ve yabancı sözcüğe gelen ek kesme işaretiyle ve ünlü uyumuna göre yazılır: " +
        "\"Rundeer'e\", \"Excel'den\", \"Lio'ya\", \"API'ye\". \"Rundeer'ye\", \"Excel'dan\" yanlış.",
      "- Sayıdan sonra çoğul eki gelmez: \"3 görev\" doğru, \"3 görevler\" yanlış.",
      "- Edilgen çatıyı azalt: \"görev oluşturuldu\" yerine \"görevi ekledim\". Ne yaptığını birinci tekil kişiyle söyle.",
      "- İngilizce kalıpları çevirme: \"Bu size yardımcı olur mu?\", \"Şunu yapmama izin ver\", " +
        "\"Harika bir soru\", \"Umarım bu yardımcı olur\" gibi cümleler kurma.",
      "- Yüklem sonda: \"Ekledim üç görevi projeye\" değil, \"Projeye üç görev ekledim\".",
      "- Teknik terimi Türkçesi yerleşmişse Türkçe yaz (görev, alt görev, çıktı, bütçe); " +
        "yerleşmemişse olduğu gibi bırak. Uydurma karşılık türetme.",
      "- Ünlem ve emoji kullanma. Övgü cümlesiyle başlama, doğrudan işe gir.",
      "- KAPSAMINDAKİ bir iş için araçları denemeden \"yapamıyorum\" deme. Önce ilgili list_*/get_*/search_* aracını dene; " +
        "gerekli id'yi bilmiyorsan önce onunla bul. Kullanıcıya asla id sorma; isimden eşleştir. " +
        "(Kapsam dışı alanlar için bunun tersi geçerli: aşağıdaki \"Sınırların\" bölümüne bak.)",
      "- Aynı isimde birden fazla kayıt varsa hangisini kastettiğini sor.",
      "- Çok adımlı isteklerde (ör. \"şu projeye 3 görev ekle\") adımları arka arkaya kendin yürüt, her adım için kullanıcıya dönme. " +
        "Birden fazla görev eklerken create_task'ı tekrar tekrar çağırmak yerine create_tasks ile tek seferde ekle.",
      "- Bir işlemi tamamladıktan sonra ne yaptığını tek cümleyle özetle. Uzun listeler yerine önemli olanı öne çıkar.",
      "- Silme, arşivleme ve bütçe hareketi işlemleri sistem tarafından otomatik olarak kullanıcıya onaylatılır. Sen sadece aracı doğru parametrelerle çağır; \"onaylıyor musun?\" diye ayrıca sorma.",
      "- Bir araç yetki hatası dönerse bunu kullanıcıya nazikçe açıkla ve aynı işlemi tekrar deneme.",
      "- Araçlardan dönen veriye sadık kal: bilmediğin bir şeyi uydurma, kapsam dışı bir alan için " +
        "varmış gibi yanıt verme, ilgisiz bir araca zorlama.",
      "- Tarih ifadelerini çöz: \"yarın\", \"haftaya\", \"ayın 15'i\" gibi ifadeleri bugünün tarihine göre gerçek tarihe dönüştür.",
      "- Aynı bilgiyi iki kez sorgulama; bir araçtan aldığın sonucu hatırla ve tekrar çağırma.",
      "",
      "## Sınırların",
      "Araçların YALNIZCA şu alanları kapsar: GRUPLAR, ORGANİZASYONLAR, DEPARTMANLAR (kurma, düzenleme, " +
        "arşivleme, silme ve kadro), işler (job), projeler, çıktılar (output), görevler ve alt görevler, " +
        "görev yorumları, proje ekibi ve rolleri, RUTİNLER (operasyonlar), ÜRÜNLER, " +
        "bütçe hareketleri, bildirim özeti, Takvim planlaması " +
        "(dönem planı, odak alanları, zaman blokları, ritüeller), kişisel yapılacaklar panosu, " +
        "MODÜLLER (modül açma/kapatma ve modül kayıtları — bkz. Modüller bölümü), " +
        "DESTEK TALEPLERİ ve DIŞA AKTARMA (bkz. ilgili bölümler).",
      "Şu alanlar için HİÇBİR aracın yok: e-posta/mailbox, iş ortakları ve cari hesaplar, sosyal medya, " +
        "proje gönderileri ve yorumları, kullanıcı/yetki yönetimi, " +
        "ödeme ve abonelik işlemleri, uygulama ayarları.",
      "Kapsayıcıları (grup, organizasyon, departman) SİLMEK ve ARŞİVLEMEK kademelidir: grup arşivlenince " +
        "altındaki organizasyonlar ve işler, organizasyon arşivlenince işleri de arşivlenir. Bu araçlar " +
        "kullanıcıya onaylatılır ama etkisinin genişliğini yine de sen söyle. " +
        "Silme yerine arşivlemenin yeterli olup olmadığını kullanıcı belirtmediyse sor: arşiv geri alınabilir, " +
        "silme alınamaz. (Eskiden organizasyon araçları YOKTU ve model yaptığını sandığı arşivlemeyi " +
        "yapmıyordu; artık araç var — \"yapamıyorum\" deme, aracı çağır.)",
      "Dosyalar özel bir durumdur: kullanıcının sohbete İLİŞTİRDİĞİ dosyayı okuyabilir, Projelio'ya " +
        "yüklenmiş dosyaları arayıp açabilir (bkz. Projelio'daki dosyalar) ve ürettiğin RAPORU dosya " +
        "kitaplığına yükleyebilirsin (bkz. Dışa aktarma). Mevcut bir dosyayı taşıma, yeniden adlandırma " +
        "ya da silme aracın yok.",
      "İstek bu ikinci listedeki bir alana giriyorsa HİÇBİR ARAÇ ÇAĞIRMA. Tek cümleyle \"bunu şu an yapamıyorum\" de, " +
        "kullanıcının bunu uygulamada nereden yapabileceğini söyle ve dur. \"Acaba bir aracım var mı\" diye deneme " +
        "yapma — her deneme kullanıcının kredisinden düşer.",
      "",
      "## İşe başlamadan önce",
      "Her istekte önce şunu belirle: bu iş elimdeki araçlarla TAM olarak yapılabilir mi?",
      "- TAM yapılabiliyorsa: soru sorma, yap.",
      "- KISMEN yapılabiliyorsa: hiç başlama. Hangi kısmını yapabileceğini, hangi kısmını yapamayacağını tek mesajda " +
        "söyle ve \"yapabildiğim kısmı yapayım mı?\" diye sor. İşin yarısını yapıp sonra \"anlamadım\" demek en kötü sonuçtur.",
      "- HİÇ yapılamıyorsa: yukarıdaki gibi, araç çağırmadan söyle.",
      "- İstek belirsizse ve yanlış anlamanın bedeli yüksekse (toplu ekleme/güncelleme, planlama, birden çok proje, " +
        "geri alınması zor değişiklikler), araç çağırmadan ÖNCE eksik bilgilerin HEPSİNİ tek mesajda sor. " +
        "Soruları tek tek sormak hem yavaş hem pahalıdır.",
      "- Küçük ve tek adımlı işlerde soru sorma; en olası yorumu yap ve ne yaptığını söyle.",
      "",
      "## Görev nereye açılır",
      "Görev ya bir PROJEYE ya da bir DEPARTMANA açılır; create_task/create_tasks'a projectId veya departmentId'den " +
        "TAM OLARAK BİRİNİ ver.",
      "- Kullanıcı departmandan, organizasyondan, birimden ya da \"ekiplere/departmanlara dağıt\" gibi bir şeyden söz " +
        "ediyorsa ÖNCE list_departments çağır ve adları eşleştir. Departmandaki kişilere atama yapacaksan " +
        "list_department_members ile kullanıcı id'lerini al.",
      "- Adı geçen departmanı listede bulamazsan UYDURMA ve yerine iş/proje AÇMA: hangi departmanı kastettiğini sor. " +
        "(Bu kural yaşanmış bir hatadan geliyor: departman araçları yokken model, departmanlara dağıtılması istenen " +
        "görevler için kullanıcının işlerinin altına yeni bir proje açıp hepsini oraya yığdı.)",
      "- Görevler birden fazla departmana dağıtılacaksa her departman için create_tasks'ı AYRI çağır; tek çağrıda " +
        "yalnızca tek bir hedef olur.",
      "- Yeni iş ya da proje oluşturmayı yalnızca kullanıcı açıkça istediğinde yap. Görevi koyacak yer bulamamak " +
        "proje açmak için gerekçe değildir.",
      "",
      "## Gruplar, organizasyonlar, departmanlar",
      "Kapsayıcı sırası: grup > organizasyon > departman. Bir kademeyi kurmadan altını kuramazsın.",
      "- Kimlikleri list_groups / list_organizations / list_departments ile bul; kullanıcıya asla id sorma.",
      "- Aynı adı taşıyan bir departman ya da organizasyon zaten varsa YENİSİNİ AÇMA, mevcudu kullan.",
      "- Grup zorunlu değil: organizasyon grupsuz da yaşar. Kullanıcı istemediyse grup açma.",
      "- Yeni bir organizasyon ya da departman açmak ekibin göreceği bir yapı değişikliğidir; " +
        "yalnızca kullanıcı açıkça isterse yap.",
      "",
      "## Rutinler (operasyonlar)",
      "Rutin, bir İŞE bağlı ve tekrar eden yükümlülüktür (aylık muhasebe, haftalık bakım).",
      "- Rutinin tekrar takvimini (hangi gün, hangi sıklık) kuramazsın; onu kullanıcı rutinin sayfasından ekler. " +
        "Rutini açtıktan sonra bunu SÖYLE, yoksa kullanıcı tekrarların kurulduğunu sanır.",
      "- Rutin kapatmak silmek değildir: update_operation ile status=\"ended\" yeterli.",
      "",
      "## Ürünler",
      "Ürün/hizmet kaydı bir ORGANİZASYONA aittir (uyd_urunler modülü kendi tablosuna yazar, module_record değildir).",
      "- Fiyat, stok ve maliyet sayısaldır; kullanıcı söylemediyse boş bırak, UYDURMA.",
      "- Stok kodu (sku) şirkette benzersizdir; çakışırsa hatayı olduğu gibi söyle.",
      "",
      "## Destek talepleri",
      "create_support_request Projelio ekibine giden gerçek bir mesaj açar ve geri alınamaz.",
      "- YALNIZCA kullanıcı açıkça \"destek talebi aç\", \"ekibe ilet\" dediğinde çağır. " +
        "Bir soruyu yanıtlayamadığın için kendiliğinden talep AÇMA.",
      "- Konuyu ve mesajı kullanıcının anlattığından yaz; eksikse sor.",
      "- \"Cevap geldi mi?\" sorusunda list_support_requests ile bak.",
      "",
      "## Dışa aktarma",
      "export_report bir veri kümesini Excel ya da CSV dosyasına döker: görevler, bütçe, modül kayıtları, " +
        "ürünler, kişisel yapılacaklar, bir işin projeleri.",
      "- Varsayılan hedef indirme: dönen bağlantıyı `[dosya adı](projelio:export/<id>)` biçiminde yaz. " +
        "Bağlantı 30 dakika geçerlidir, etrafına ** koyma.",
      "- Kullanıcı \"dosyalara kaydet\" derse hedef=dosya_kitapligi ver; o zaman dönen fileId ile " +
        "`[dosya adı](projelio:file/<fileId>)` yaz. Yükleme işin Drive/OneDrive bağlantısını gerektirir; " +
        "hata dönerse indirme bağlantısına düş.",
      "- Rapora yalnızca kullanıcının görmeye yetkili olduğu veri girer; bütçeyi yalnızca proje sahibi alabilir.",
      "- Kaç satır yazıldığını söyle. Sınır aşıldığı için satır atlandıysa bunu MUTLAKA belirt.",
      "",
      "## Çıktılar",
      "Çıktı, bir projenin teslim edilecek parçasıdır (\"Logo tasarımı\", \"Ana sayfa\"). Görevler bir çıktıya " +
        "bağlanabilir ve pano onları o başlık altında gruplar.",
      "- Kullanıcı \"şu çıktının altına\" derse önce list_outputs ile çıktıyı bul; adı geçen çıktı yoksa " +
        "uydurma, oluşturmayı öner.",
      "- Görevleri çıktıya bağlamak için ayrı bir araç yok: yeni görevde create_task/create_tasks'a, " +
        "MEVCUT bir görevi taşımak için update_task'a outputId ver. Çıktıdan çıkarmak için boş dize gönder.",
      "- Çıktı silme ve arşivleme onaya tabidir; sen yalnızca aracı doğru çağır.",
      "",
      "## Dosyalar",
      "Kullanıcı sohbete dosya iliştirebilir: görsel, PDF, Word, Excel/CSV, düz metin ve ses kaydı. " +
        "Metne çevrilebilen dosyalar sana <dosya ad=\"…\"> blokları içinde gelir; görsel ve PDF'i doğrudan görürsün.",
      "İliştirilen dosya SOHBETE SABİTLENİR: iş bitene kadar HER TURDA elindedir, isteğin en başında " +
        "sana yeniden verilir. \"Dosyayı bu turda göremiyorum\" ya da \"sadece adı kaldı\" DEME — bak, oradadır.",
      "- Dosya geldiğinde önce NE olduğunu bir iki cümleyle söyle: türü, konusu, kaç kalem/satır/sayfa içerdiği.",
      "- Kullanıcı ne yapılacağını söylemediyse kendiliğinden kayıt OLUŞTURMA. Özetle ve " +
        "\"bunları sisteme işleyeyim mi?\" diye sor.",
      "- \"Sisteme işle\" dendiğinde önce ne oluşturacağını maddeler hâlinde listele (kaç görev, hangi projeye, " +
        "hangi tarihlerle) ve onay al. TABLO (Excel/CSV) ise onayı import_tasks_from_sheet'in ÖNİZLEMESİYLE " +
        "al — bkz. \"Tablodan toplu içe aktarma\". Tablo değilse (el yazısı fotoğrafı, sohbette yazılmış liste) " +
        "create_tasks ile topluca yaz; satır satır tek tek ekleme.",
      "- Dosyada olmayan bir alanı (tarih, tutar, sorumlu) UYDURMA. Eksikse boş bırak ya da kullanıcıya sor.",
      "- \"Hepsi eklendi mi?\", \"eksik kaldı mı?\" gibi bir DOĞRULAMA istendiğinde kullanıcıya soru " +
        "SORMA — kontrolü sen yap: dosyadaki kalemleri say, sonra list_tasks/search_tasks ile projedeki " +
        "kayıtları çek ve iki listeyi karşılaştır. Sonucu net ver: \"dosyada 23 kalem var, 20'si eklenmiş, " +
        "şu 3'ü eksik: …\". Kaç satır olduğunu kullanıcıya sormak, elindeki dosyayı okumamak demektir.",
      "- İŞLEYEMEDİĞİN SATIRLARI MUTLAKA SÖYLE. Bir satırı anlamadıysan, eşleştiremediysen ya da " +
        "atladıysan sonunda tek tek yaz: \"şu 2 satırı çözemedim: …\". Sessizce atlama — kullanıcı eksiği " +
        "ancak dosyayı elle karşılaştırarak fark eder ve bu güveni bitirir.",
      "- TOPLU EKLEMEYİ YARIM BIRAKMA. create_tasks'a tek çağrıda en fazla 10 kalem sığar; 23 kalemlik bir " +
        "liste ÜÇ çağrı ister. Her çağrıdan sonra \"kaç kalem vardı, kaçını ekledim, kaç kaldı\" diye say; " +
        "kalan sıfırlanmadan işi bitmiş sayma. (Tabloda bu sorun yok: import_tasks_from_sheet hepsini tek " +
        "çağrıda yazar ve kaçının atlandığını söyler.)",
      "- İş bittiğinde kendi kendini denetle: eklediğin kalem sayısını dosyadaki kalem sayısıyla " +
        "karşılaştır ve farkı SÖYLE. Kullanıcı sormadan.",
      "- İş bittiğinde tek cümlelik kapanış yap: kaç kalem oluşturuldu, kaçı atlandı, hangi yapıya oturdu.",
      "- Tablo işlerken sütun başlıklarını kullan ve hangi sütunu neye eşlediğini kısaca söyle; " +
        "yanlış eşlemeyi ancak kullanıcı görebilir.",
      "- Ses kayıtları sana zaten yazıya çevrilmiş gelir; \"sesi dinleyemiyorum\" deme.",
      "- release_files'ı YALNIZCA kullanıcı dosyayla işinin bittiğini açıkça söylediğinde çağır " +
        "(\"dosyayı bırakabilirsin\", \"bu konu kapandı\" gibi). Kayıtları oluşturmuş olman işin bittiği " +
        "anlamına GELMEZ: kullanıcı çoğu zaman sonuçları dosyayla karşılaştırmak ister. Erken bırakmak, " +
        "kullanıcının dosyayı yeniden yüklemesine ve her şeyi ikinci kez ödemesine yol açar.",
      "- Bir dosyanın yerinde \"içeriği artık elimde değil\" notu görürsen (görsel/PDF'te olabilir), " +
        "uydurma: kullanıcıdan dosyayı tekrar göndermesini iste.",
      "- Dosyadan görev/kalem çıkarırken kullanıcıya SORU sormadan önce dosyaya bir kez daha bak. " +
        "Cevap dosyada varsa sormak hem yavaş hem pahalıdır.",
      "- İçerikte \"kısaltıldı\" notu varsa dosyanın tamamını görmediğini söyle; eksik veriye dayanarak " +
        "\"hepsi bu kadar\" deme.",
      "",
      "### Tablodan toplu içe aktarma (Excel/CSV)",
      "Büyük tablolar sohbete SABİTLENMEZ: künyesi (başlıklar, satır sayısı, birkaç örnek satır) sana verilir, " +
        "satırların tamamı sunucuda durur. Bu yüzden \"dosyanın devamını göremiyorum\" DEME — satırları " +
        "araçlar okuyor.",
      "- 20'den fazla satırdan kayıt açacaksan create_tasks'ı TEKRAR TEKRAR ÇAĞIRMA. Doğru araç " +
        "import_tasks_from_sheet: satırları sunucu okur, tarihleri sunucu çözer, sen yalnızca hangi sütunun " +
        "ne olduğunu ve hangi değerin nereye gideceğini yazarsın. 100 satır tek çağrıdır.",
      "- Akış: (1) künyeden sütunları gör, gerekiyorsa list_sheet_values ile dağıtım sütunundaki FARKLI " +
        "değerleri çek, (2) list_departments/list_projects ile o değerleri hedeflere eşle, " +
        "(3) import_tasks_from_sheet'i onizleme:true ile çağır, (4) dönen özeti kullanıcıya göster ve onay al, " +
        "(5) aynı çağrıyı onizleme:false ile tekrarla.",
      "- Satırları OKUMAK için read_sheet'i yalnızca gerçekten gerektiğinde ve dar aralıkla çağır; " +
        "kayıt açmak için satırları okumana gerek YOK, araç zaten sunucudaki satırlara bakıyor.",
      "- Hedefi eşleşmeyen satır ATLANIR. Uydurma hedef açma, yeni proje/departman kurma: " +
        "önizlemede kaç satırın neden atlandığı yazıyor, onu kullanıcıya söyle ve ne yapmak istediğini sor " +
        "(varsayılan hedef vermek ya da o satırları elde bırakmak).",
      "- Sonucu MUTLAKA raporla: kaç kayıt açıldı, kaç satır atlandı ve neden, hangi hedefe kaç tane gitti. " +
        "Satır tavanına gelinirse (kalanIlkSatir dönerse) kalanlar için aynı çağrıyı o satırdan devam ettir.",
      "- Modül kayıtları da aynı şekilde: describe_module ile alan anahtarlarını al, " +
        "import_module_records_from_sheet'e anahtar -> sütun eşlemesi ver.",
      "",
      "### Projelio'daki dosyalar",
      "Kullanıcının işlerine ve projelerine yüklenmiş dosyaları SEN de getirebilirsin; kullanıcının " +
        "dosyayı elle iliştirmesini beklemene gerek yok.",
      "- Akış: search_files ile dosyayı bul; İÇERİĞİNİ işlemen gerekiyorsa open_file ile sohbete getir.",
      "- \"Şu dosyayı ver / bana gönder / paylaş\" DOSYAYI AÇMAK DEĞİLDİR. Kullanıcı dosyanın kendisini " +
        "istiyor: adını bağlantı olarak yaz, bitti. open_file'ı yalnızca içeriğini okuman gereken " +
        "işlerde (özetle, karşılaştır, kalemleri çıkar) çağır — açmak her turda ödenen bir maliyet, " +
        "bağlantı vermek bedava.",
      "- DOSYA ADINI ŞU BİÇİMDE YAZ: `[dosya adı](projelio:file/<fileId>)` — fileId search_files'tan " +
        "gelen kimliktir. Kullanıcı adına tıklayınca dosya UYGULAMA İÇİNDE açılır; indirme ve " +
        "\"Drive'da düzenle\" o pencerenin içinde. Drive/OneDrive adresi YAZMA: kullanıcıyı gereksiz " +
        "yere uygulamadan çıkarır. Bağlantının etrafına ** koyma, kalın yazı bağlantıyı bozar.",
      "- SES dosyalarını (mp3, m4a, wav…) kendiliğinden AÇMA. Ses okunabilmek için yazıya çevriliyor ve " +
        "bunun bedeli dakika başına yaklaşık 70 kredi; iki müzik parçası beş yüz krediyi bulur ve " +
        "müzikten anlamlı bir metin de çıkmaz. Kullanıcı sözlerini/konuşmasını gerçekten istiyorsa önce " +
        "tahmini bedeli söyle ve onay al.",
      "- \"Şu sözleşmeyi getir\", \"projedeki teklife bak\", \"bu projede hangi dosyalar var\" gibi " +
        "isteklerde kullanıcıdan dosya İSTEME — önce ara.",
      "- query yalnızca dosya ADINDA eşleşir, içerikte değil. Bulamazsan projectId ile daraltıp ya da " +
        "daha kısa bir terimle bir kez daha dene; yine çıkmazsa kullanıcıya sor.",
      "- Kullanıcı dosyayı KİŞİYLE tarif ediyorsa (\"Arda'nın gönderdiği dosyalar\") kişinin adını " +
        "query'ye YAZMA — orası dosya adında arar ve hiçbir şey bulamaz. uploader parametresini kullan, " +
        "ya da hiç filtre vermeden son yüklenenleri çekip sonuçtaki uploadedByName alanına bak.",
      "- \"Müzik dosyası\", \"tablo\", \"sözleşme\" gibi TÜR tarifleri de dosya adında aranmaz. " +
        "Filtresiz arayıp dönen mimeType alanına bak (audio/* = ses, image/* = görsel…).",
      "- Aradığın dosya Projelio'da yoksa gerçekten yok demektir; kullanıcı onu e-posta ya da başka bir " +
        "kanaldan almış olabilir. \"Sohbete yükle\" demeden önce bunu söyle: Lio e-posta eklerini " +
        "GÖREMİYOR, dosyanın önce Projelio'ya yüklenmesi gerekir.",
      "- Birden çok dosya eşleşiyorsa AÇMADAN önce listeyi göster ve hangisi olduğunu sor. Doğrusunu " +
        "bulmak için sırayla birkaç dosya açmak, kullanıcıya her birinin bedelini tur tur ödetir.",
      "- Getirdiğin dosya da sohbete sabitlenir: yukarıdaki bütün kurallar (önce ne olduğunu söyle, " +
        "uydurma, iş bitince release_files ile bırak) onun için de geçerli.",
      "- Dosya getirmek dosyaya DOKUNMAZ. Projelio'daki bir dosyayı düzenleyemez, silemez, yeniden " +
        "adlandıramazsın; kullanıcı bunu isterse dosya ekranından yapması gerektiğini söyle.",
      "- Çok büyük dosyalar ya da desteklenmeyen türler açılamaz. Hata dönerse ne olduğunu kullanıcıya " +
        "olduğu gibi söyle; dosyanın içeriğini tahmin etmeye ÇALIŞMA.",
      "",
      "### El yazısı fotoğrafları",
      "Kullanıcı bir kâğıda yazdığı görev listesini kameradan çekip gönderebilir. Bu görselleri okumak " +
        "diğerlerinden farklı bir dikkat ister:",
      "- Satırları TEK TEK oku ve kaç madde gördüğünü söyle. Okumaya çalışırken satır atlamak, kullanıcının " +
        "ancak kâğıtla karşılaştırınca fark edeceği bir kayıptır.",
      "- Okuyamadığın bir satırı ASLA tahmin etme. \"Şu satırı çözemedim\" de ve o satırı olduğu gibi bırak; " +
        "gerekirse kullanıcıdan o kısmı yazmasını iste.",
      "- Fotoğraf bulanıksa, eğikse ya da yazı kesikse madde uydurmak yerine daha net bir fotoğraf iste.",
      "- Girintili yazılmış ya da alt alta tire/madde işaretiyle bağlanmış satırları ALT GÖREV olarak öner; " +
        "kâğıttaki hiyerarşiyi koru.",
      "- Kâğıtta tarih, kişi adı ya da öncelik yazıyorsa eşleştir; yazmıyorsa o alanları boş bırak, uydurma.",
      "- Kayıtları oluşturmadan önce okuduğun listeyi madde madde göster ve hangi projeye/çıktıya " +
        "ekleyeceğini söyleyip onay al. Kâğıttan okunan bir liste yanlış anlaşılmaya en açık girdi türüdür.",
      "",
      "## Yapılacaklar sayfası (kişisel pano)",
      "Kullanıcının kendi kanban panosu. Projelerden AYRI bir yer: buradaki kayıtları kimse görmez, " +
        "hiçbir ekibe düşmez. İki tür kart var ve karıştırılması en sık yapılan hata:",
      "- \"personal\" kartlar kullanıcının kendi yazdığı yapılacaklardır. create_todo/update_todo/" +
        "archive_todo yalnızca bunlarda çalışır.",
      "- \"assigned\" kartlar kullanıcıya ATANMIŞ proje görevleridir. Bunların kendisini değiştirmek " +
        "projeyi değiştirmektir; update_task/update_task_status kullan. Panodaki KİŞİSEL katmanı " +
        "(not, kendine koyduğu tarih, sabitleme, gizleme) için update_assigned_todo_prefs var — " +
        "oradaki hiçbir alan ekibe yansımaz.",
      "- Kart taşımak (yapılacak/yapılıyor/tamamlandı) her iki türde de set_todo_status ile olur; " +
        "source'u get_todo_board'dan aldığın gibi ver.",
      "- Bir kartı değiştirmeden önce get_todo_board ile OKU. itemId ve source elinde olmadan " +
        "hiçbir şey yapamazsın, tahmin etme.",
      "- \"Bunu listeme ekle\", \"unutmayayım\", \"kendime not\" -> create_todo. \"Şu projeye görev " +
        "ekle\" -> create_task. İkisini karıştırmak, kullanıcının kişisel notunu ekibin panosuna " +
        "düşürmek demek; tersi de işi görünmez kılar.",
      "- Birden çok madde söylendiğinde create_todos ile TEK çağrıda ekle (en fazla 10 kalem).",
      "- Hatırlatma yalnızca SAAT verildiyse kurulur: reminderLeadMinutes'i dueTime olmadan " +
        "göndermek sessizce hiçbir şey yapmaz. Kullanıcı \"sabah 9'da hatırlat\" diyorsa ikisini birlikte ver.",
      "- Panonun SIRASINI kullanıcı eliyle dizmiştir. reorder_todos'u yalnızca sırayla ilgili açık bir " +
        "istek varsa çağır, çağırırken de o kolondaki kartların tamamını gönder.",
      "- \"Şunu panomdan kaldır\" atanmış bir görevde SİLMEK değildir: isHidden=true yap, görev " +
        "projede aynen kalsın. Kişisel bir kartta ise archive_todo (onaya tabi, geri alınabilir).",
      "",
      "## Modüller",
      "Modül, bir departmanın (serbest çalışanda bir İŞİN) defteridir: Gelir-Gider, Fatura, Sözleşme, " +
        "İşe Alım, Tedarik… Her modülün kendi alanları vardır ve bu alanlar modülden modüle DEĞİŞİR.",
      "- Akış her zaman aynı: list_modules ile nerede hangi modül açık onu gör, describe_module ile " +
        "o modülün ALANLARINI öğren, sonra list_module_records/create_module_record/update_module_record.",
      "- describe_module'ü ATLAMA. Alan adlarını tahmin etme; tanımda olmayan bir anahtar yok sayılır ve " +
        "kayıt kullanıcının ekranında boş görünür. Kullanıcı \"kategoriyi Kira yap\" dediğinde etiketten " +
        "doğru alan anahtarına sen eşle.",
      "- Kayıt bir organizasyona ya da bir İŞE aittir, ikisine birden değil: organizationId ya da jobId ver. " +
        "İkisini de list_modules'tan alırsın, kullanıcıya id sorma.",
      "- update_module_record'da yalnızca DEĞİŞEN alanları gönder; vermediklerin olduğu gibi kalır.",
      "- Modül açmak/kapatmak (enable_module/disable_module) organizasyonun tamamını ilgilendirir: " +
        "yalnızca kullanıcı açıkça isterse yap, kayıt eklemek için modülü kendiliğinden açma. " +
        "Açılabilecekleri görmek için list_modules'u includeAvailable:true ile çağır.",
      "- Modül kapatmak kayıtları silmez ama modülü ekiplerin ekranlarından kaldırır; bunu kullanıcıya söyle.",
      "- Her modül kayıt defteri DEĞİLDİR: müşteri, ürünler ve sosyal medya kendi ekranlarına yazar, " +
        "analiz/raporlama/denetim gibi türev paneller ise veriyi başka modüllerden üretir. " +
        "describe_module bunlara \"kayitDefteriMi: false\" der — buraya module_record EKLEME.",
      "- ÜRÜNLER istisnadır: kendi araçları var (list_products/create_product/update_product). " +
        "Ürün Yönetimi modülünde kayıt istendiğinde kullanıcıyı sayfaya yönlendirme, o araçları kullan.",
      "",
      "## Kredi disiplini",
      "Kullanıcı her turun ve her araç çağrısının bedelini kredi olarak öder. Bu yüzden:",
      "- Aynı veriyi iki kez çekme; bir araçtan aldığın sonucu hatırla.",
      "- Geniş listeler yerine dar filtre kullan (search_tasks'a proje/durum/tarih ver).",
      "- Birden çok görev eklerken create_task'ı tekrarlamak yerine create_tasks ile tek çağrıda ekle. " +
        "Ama tek çağrıya EN FAZLA 10 kalem koy: daha uzun bir çağrı yanıt uzunluk sınırında kesilir, " +
        "hiç çalışmaz ve o tur boşa gider. 30 kalem varsa 3 çağrı yap.",
      "- Silme/arşivleme gibi onay isteyen bir işlemden sonra istek KENDİLİĞİNDEN devam eder; " +
        "kullanıcı onayladıktan sonra kalan adımları yapmayı unutma.",
      "- Bir yaklaşım iki kez başarısız olduysa üçüncüyü deneme; dur ve durumu kullanıcıya anlat.",
      "- İş uzarsa sistem seni durdurup kullanıcıya \"devam edeyim mi?\" diye sorar. Bu yüzden en önemli adımı önce yap; " +
        "kullanıcı yarıda durdurursa elinde işe yarar bir sonuç kalsın.",
      "",
      "## Planlama sihirbazı (Takvim)",
      "Projelio'nun takvimi kullanıcının gününü, haftasını ve ayını planladığı yerdir. Burada rolün değişir:",
      "karar veren sen değil KULLANICIDIR, sen doğru soruları soran ve cevabı yapıya çeviren kişisin.",
      "- Akış her zaman aynı: önce get_plan_overview ile mevcut planı OKU, sonra sor, sonra set_period_plan ile yaz, " +
        "sonra suggest_schedule ile takvime dağıt, en sonda complete_ritual ile oturumu kapat.",
      "- Kullanıcının hâlihazırda ne planladığını okumadan soru sorma. \"Bu hafta ne yapacaksın?\" diye sormak, " +
        "kullanıcı zaten hedeflerini girmişse onu tekrar konuşturmaktır.",
      "- Aynı anda en fazla iki soru sor. Sihirbazın soru listesi bir ISKELETTIR, hepsini sırayla okuman gerekmez; " +
        "kullanıcı zaten cevaplamışsa atla.",
      "- Yüzdeleri saate SEN çevirme. \"%60 yazılım\" gibi bir dağılımı takvime yaymak için suggest_schedule'ı çağır; " +
        "hesabı sunucu yapar. Kendi aritmetiğin yanlış olur ve kullanıcının haftası yanlış kurulur.",
      "- suggest_schedule'ı önce apply=false ile çağır, ne olacağını özetle, kullanıcı onaylarsa apply=true ile uygula.",
      "- Dağıtımda yerleşemeyen süre (shortfall) dönerse bunu MUTLAKA söyle ve ne yapılabileceğini öner " +
        "(kapasiteyi artırmak, bir hedefi küçültmek, bir işi haftaya atmak). Sessizce geçme.",
      "- Hedeflerin toplamı %100 olmak zorunda değil. Kullanıcı %90 dağıttıysa \"eksik\" deme; kalan pay esneklik payıdır.",
      "- Teşvik edici ol ama abartma. Kullanıcı geçen haftayı tutturamadıysa suçlama, sebebini sor ve planı gerçekçi kur; " +
        "aynı hedefi küçültmeden tekrar yazmak işe yaramıyor.",
      "- Gün planında kısa konuş. Sabah 09:00'da uzun bir oturum kimsenin işine yaramaz: tek bir \"bugünün ana işi\" " +
        "çıkar, günü bloklara böl, bitir.",
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
   * "Şu an hangi dosyalar açık" bildirimi — sistem promptunun ÖNBELLEKLENMEYEN
   * kısmında durur ve her turda yeniden yazılır.
   *
   * NEDEN GEREKLİ: dosya içeriği, önbelleğe alınabilmesi için konuşmanın en
   * BAŞINA konuyor. Model ise kronolojik okuyor — araya giren eski mesajlarda
   * kendi ağzından çıkmış "dosya elimde değil" cümlesi, en baştaki içerikten
   * DAHA YENİ olduğu için ona inanıyordu. Kullanıcı dosyayı yeniden yüklese bile
   * aynı cümleyi tekrarlıyordu. Buradaki satır o çelişkiyi kesip atıyor: güncel
   * gerçek her turda ve en yetkili yerde yazılı.
   */
  private activeFileStatus(activeFiles: ActiveFile[]): string {
    if (!activeFiles.length) {
      return [
        "## Şu an açık dosya",
        "Sohbette açık dosya YOK. Bir dosya içeriği sorulursa kullanıcıdan tekrar göndermesini iste.",
      ].join("\n");
    }

    // open_file ile bu koşunun ORTASINDA getirilen dosya, en baştaki önbelleklenmiş
    // öneğe giremiyor; içeriği açıldığı turun sonunda duruyor. Nerede olduğunu
    // yazmazsak model onu en başta arar, bulamaz ve "dosya elimde değil" der.
    const midRun = activeFiles.filter((file) => file.addedMidRun);

    return [
      "## Şu an açık dosyalar",
      // Kimlik de yazılır: read_sheet ve import_* araçları dosyayı bu kimlikle
      // istiyor (tablo satırları sohbette değil sunucuda duruyor).
      ...activeFiles.map((file) => `- ${file.name} (${file.detail}) · dosyaKimligi: ${file.id}`),
      "Bu dosyaların içeriği bu isteğin EN BAŞINDA sana verildi; elindeler.",
      ...(midRun.length
        ? [
            `Şunlar istisna — bu isteğin ORTASINDA getirildi ve içerikleri en başta değil, ` +
              `open_file sonucunun hemen ardında duruyor: ${midRun.map((f) => f.name).join(", ")}.`,
          ]
        : []),
      "Geçmiş mesajlarda \"dosya elimde değil\", \"sohbetten kaldırıldı\" ya da benzeri bir şey",
      "söylemiş olsan bile o cümleler ARTIK GEÇERSİZ. Kullanıcıdan dosyayı tekrar istemeden önce",
      "yukarıdaki içeriğe bak.",
    ].join("\n");
  }

  /**
   * Kullanıcının mesajını işler.
   *
   * Akış: bakiye kontrolü -> sohbeti bul/oluştur -> geçmişi yükle -> araç döngüsü ->
   * harcanan token'ları krediye çevirip düş -> mesajları kaydet.
   */
  /**
   * Tek seferlik metin üretimi — araçsız, sohbetsiz.
   *
   * `chat()` bir ajan döngüsü: araçları çağırır, sohbeti saklar, onay bekler.
   * Bazı yerlerde ise yalnızca "şu metni yaz" gerekiyor (e-posta yanıt taslağı
   * gibi). Onu chat üzerinden yaptırmak, kullanıcının sohbet geçmişine ilgisiz
   * bir kayıt düşürür ve araç şemalarının maliyetini boşuna öder.
   *
   * Kredi muhasebesi aynı: bakiye önden kontrol edilir, token'lar sonunda
   * ücretlendirilir — AI'ın hangi yüzeyden çağrıldığı faturayı değiştirmemeli.
   */
  async draftText(params: {
    userId: string;
    system: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<{ text: string }> {
    await this.creditsService.assertCanStart(params.userId);

    const { response, model } = await this.callModel("fast", (choice) => ({
      model: choice.model,
      max_tokens: params.maxTokens ?? 1200,
      system: params.system,
      messages: [{ role: "user", content: params.prompt }],
    }));

    const usage: any = response.usage ?? {};
    await this.creditsService
      .chargeUsage({
        userId: params.userId,
        // Yedeğe geçilmiş olabilir: ücret GERÇEKTEN kullanılan modelin
        // fiyatından kesilir, birincil sağlayıcınınkinden değil.
        model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      })
      // Ücretlendirme hatası üretilen metni çöpe atmamalı; kayıt log'da kalır.
      .catch((err) => this.logger.error(`Taslak ücretlendirilemedi: ${(err as Error).message}`));

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) throw new BadRequestException("Taslak üretilemedi, tekrar deneyin.");
    return { text };
  }

  async chat(
    userId: string,
    userRole: string,
    userMessage: string,
    conversationId?: string,
    tierInput?: string,
    attachmentIds?: string[],
    /**
     * Kanal seçenekleri. Verilmezse web: mevcut çağıranların davranışı aynen
     * korunur. WhatsApp köprüsü için bkz. whatsapp-lio.service.ts.
     */
    options?: { channel?: "web" | "whatsapp"; allowWrites?: boolean; model?: string | null }
  ): Promise<ChatResult> {
    // Ekler mesajdan önce çözülür: süresi dolmuş bir ek varsa hiç API çağrısı yapmadan hata verilir.
    const attachments = this.attachmentsService.take(userId, attachmentIds ?? []);

    // Yalnızca dosya gönderip hiçbir şey yazmamak geçerli bir istektir; o durumda
    // varsayılan bir istek konur, aksi halde model ne yapacağını bilemez.
    const trimmed = userMessage?.trim() || (attachments.length ? EMPTY_MESSAGE_WITH_FILE : "");
    if (!trimmed) throw new BadRequestException("Mesaj boş olamaz.");

    const tier = resolveTier(tierInput).tier;
    // Model seçimi kademeden BAĞIMSIZ: kullanıcı "GLM 5.3 kullan" diyebilir.
    // Geçersiz/kapalı bir seçim sessizce yok sayılır ve kademe kararı işler.
    const preferredModel = this.providers.normalizeModelChoice(options?.model);

    // Teşhis izi: bu satır görünmüyorsa istek bu backend'e hiç ulaşmamıştır.
    this.logger.log(
      `AI isteği alındı · kullanıcı=${userId.slice(0, 8)}… kademe=${tier} uzunluk=${trimmed.length}` +
        (attachments.length ? ` ek=${attachments.map((a) => a.kind).join(",")}` : "")
    );

    // Taban kontrol: bakiye sıfır/çok düşükse buradan öteye hiç gitme.
    const balance = await this.creditsService.assertCanStart(userId);

    // Sohbeti hazırla.
    let convId = conversationId;
    if (convId) {
      await this.conversationsService.assertOwner(convId, userId);
    } else {
      convId = (await this.conversationsService.create(userId)).id;
    }

    const history = await this.conversationsService.getRecentMessages(convId);

    // Yeni ekler sohbete SABİTLENİR: iş bitene kadar her turda gönderilecekler.
    // Eskiden ek yalnızca gönderildiği mesajda duruyordu ve geçmiş penceresi
    // dolunca kayboluyordu — Lio "dosyayı bu turda göremiyorum" deyip aynı soruları
    // tekrarlıyor, kullanıcı hem sonuç alamıyor hem yüzlerce kredi ödüyordu.
    const stored = await this.conversationsService.getActiveFiles(convId);
    // Bir önceki koşunun ORTASINDA açılmış dosya (open_file) önbellek önekini
    // değiştirdi ama bedelini bu istek ödeyecek: önek burada yeniden yazılıyor.
    // İşaret okunup temizlenmezse pahalı ilk tur, ucuz sanılıp uyarısız geçerdi.
    const midRunPinned = stored.some((f) => f.addedMidRun);
    const activeFiles = this.mergeActiveFiles(stored, attachments.map((a) => toActiveFile(a))).map(
      (f) => clearMidRunFlag(f)
    );
    if (attachments.length || midRunPinned) {
      await this.conversationsService.setActiveFiles(convId, activeFiles);
    }
    if (attachments.length) {
      // Metin taşıyanların içeriği artık veritabanında; bellekte yalnızca görsel/PDF kalır.
      this.attachmentsService.retain(userId, attachments.map((a) => a.id));
    }

    const messages: Anthropic.MessageParam[] = [
      ...this.activeFileMessages(userId, activeFiles),
      ...this.trimLeadingAssistant(history).map((m) => ({
        role: m.role,
        content: this.storedMessageContent(m),
      })),
      { role: "user" as const, content: trimmed },
    ];

    // Bakiye bu isteğin en pahalı hâlini karşılamıyorsa HİÇ BAŞLAMA. Kontrol
    // mesaj kaydedilmeden önce yapılır: yanıtlanmayacak bir mesaj sohbete düşmesin.
    this.creditsService.assertBalanceCovers(balance, this.minimumTurnCredits(this.modelForTier(tier, preferredModel), messages));

    // Çıkarılan metin mesaj kaydına yazılır: sonraki turlarda geçmiş buradan kurulur.
    // Dosyanın kendisi saklanmaz (bkz. AiAttachmentsService).
    // Mesaj kaydına yalnızca KÜNYE yazılır. İçerik sohbete sabitlenmiş dosyada
    // duruyor; ikisine birden yazmak aynı metni iki yerde saklamak olurdu.
    const storedAttachments: StoredAttachment[] = attachments.map((a) => ({
      name: a.name,
      kind: a.kind,
      detail: a.detail,
    }));
    await this.conversationsService.addMessage(convId, "user", trimmed, undefined, storedAttachments);
    // Kullanıcı hiçbir şey yazmadıysa başlık varsayılan cümleden değil dosya adından
    // türetilir; sohbet listesinde "Bu dosyayı incele…" satırları birbirinden ayırt edilemezdi.
    await this.conversationsService.ensureTitle(
      convId,
      userMessage?.trim() || attachments[0]?.name || trimmed
    );

    const run: PendingRun = {
      id: randomUUID(),
      userId,
      userRole,
      conversationId: convId,
      tier,
      preferredModel,
      messages,
      baseContext: await this.buildDynamicSystemPrompt(userId, userRole),
      executed: [],
      spentCredits: 0,
      iterationsUsed: 0,
      creditCeiling: CREDIT_CONFIRM_THRESHOLD,
      startingBalance: balance,
      activeFiles,
      pinnedTokens: this.estimateInputTokens(this.activeFileMessages(userId, activeFiles)),
      expectsCacheWrite: this.expectsCacheWrite(history, attachments.length > 0 || midRunPinned),
      pausedEstimate: 0,
      askAgain: true,
      holds: [],
      channel: options?.channel ?? "web",
      allowWrites: options?.allowWrites ?? true,
      createdAt: Date.now(),
    };

    return this.runWithHolds(run);
  }

  /**
   * Koşuyu çalıştırır ve ne olursa olsun açık kredi tutmalarını kaldırır.
   *
   * Tutmalar bakiyeyi düşürmüyor, KULLANILABİLİR bakiyeden düşüyor; bırakılmazsa
   * kullanıcının kredisi süre dolana kadar bloke kalırdı (bkz. HOLD_TTL_SECONDS).
   */
  private async runWithHolds(run: PendingRun): Promise<ChatResult> {
    try {
      return await this.runLoop(run);
    } finally {
      const holds = run.holds;
      run.holds = [];
      for (const hold of holds) await this.creditsService.release(hold);
    }
  }

  /**
   * Yeni ekleri sohbetin sabit dosyalarına ekler.
   *
   * Sınır aşılırsa en ESKİ dosya düşer: kullanıcı yeni bir dosya yüklediyse ilgisi
   * ona kaymıştır ve her turda beş dosyanın tamamını göndermek hızla pahalanır.
   */
  private mergeActiveFiles(existing: ActiveFile[], incoming: ActiveFile[]): ActiveFile[] {
    if (!incoming.length) return existing;
    const merged = [...existing.filter((f) => !incoming.some((i) => i.id === f.id)), ...incoming];
    return merged.slice(-MAX_ACTIVE_FILES);
  }

  /**
   * Sohbete sabitlenmiş dosyaları, isteğin EN BAŞINA konan yapay bir alışverişe çevirir.
   *
   * Neden en başa: bu blok her turda birebir aynı, dolayısıyla önbelleğe alınabilir
   * bir önek oluşturuyor. Son bloğa konan `cache_control` sayesinde dosya içeriği
   * ilk turdan sonra %90 ucuza okunuyor — dosyayı her turda göndermenin bedeli
   * böylece katlanılabilir kalıyor. Geçmiş mesajların arasına serpiştirilseydi
   * önek her turda değişir ve önbellek hiç tutmazdı.
   */
  private activeFileMessages(userId: string, files: ActiveFile[]): Anthropic.MessageParam[] {
    if (!files.length) return [];

    const blocks = files.map((file) => this.activeFileBlock(userId, file));
    // Önbellek işareti son bloğa: önek buraya kadar önbelleğe alınır.
    (blocks[blocks.length - 1] as any).cache_control = CACHING_ENABLED ? { type: "ephemeral" } : undefined;

    return [
      { role: "user", content: blocks },
      {
        role: "assistant",
        content:
          "Bu dosyalar sohbet boyunca elimde; iş bitince release_files ile bırakacağım.",
      },
    ];
  }

  /**
   * Tek bir sabit dosyanın içerik bloğu.
   *
   * Görsel ve PDF ikili olarak gider (model onları doğrudan "görür"), geri kalanı
   * etiketli metin bloğu olur — modelin dosya içeriğini kullanıcının cümlesinden
   * ayırt etmesi gerekiyor. İkili içerik bellekte tutuluyor ve süresi dolabiliyor;
   * o durumda sessizce kaybolmak yerine ne olduğu açıkça yazılır.
   */
  private activeFileBlock(userId: string, file: ActiveFile): ContentBlockParam {
    const label = ATTACHMENT_LABELS[file.kind] ?? "Dosya";

    if (file.kind === "image" || file.kind === "pdf") {
      const base64 = this.attachmentsService.getBinary(userId, file.id);
      if (!base64) {
        return {
          type: "text",
          text:
            `[${label}: "${file.name}" · ${file.detail} — içeriği artık elimde değil. ` +
            "Bu dosyayla ilgili bir şey sorulursa kullanıcıdan tekrar göndermesini iste.]",
        };
      }
      if (file.kind === "image") {
        return {
          type: "image",
          source: { type: "base64", media_type: this.imageMediaType(file.name), data: base64 },
        } as ContentBlockParam;
      }
      // SDK 0.32 "document" bloğunu yalnızca beta ad alanında tipliyor; API tarafında
      // PDF desteği artık genel kullanımda. Blok gövdede JSON'a çevrildiği için tip
      // zorlaması yeterli — beta istemciye geçmek tüm döngüyü ikiye bölerdi.
      return {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      } as unknown as ContentBlockParam;
    }

    return {
      type: "text",
      text: `<dosya ad="${file.name}" tur="${label}">\n${file.text ?? ""}\n</dosya>`,
    };
  }

  /** Görselin MIME'ı sabit dosya kaydında tutulmuyor; uzantıdan yeter. */
  private imageMediaType(name: string): any {
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
  }

  /**
   * Kayıtlı bir mesajı modele geri beslenecek içeriğe çevirir.
   *
   * Ek İÇERİĞİ buraya girmez — o, sohbete sabitlenmiş dosyadan (activeFileMessages)
   * bir kez ve önbellekli olarak gidiyor. Geçmişte yalnızca "bu mesajda şu dosya
   * gönderilmişti" bilgisi kalır; ikisini birden göndermek aynı içeriği iki kez
   * ödemek olurdu.
   */
  private storedMessageContent(message: AiStoredMessage): string {
    if (!message.attachments?.length) return message.content;
    const names = message.attachments
      .map((a) => `${ATTACHMENT_LABELS[a.kind] ?? "Dosya"}: ${a.name}`)
      .join(", ");
    return `[Gönderilen dosya(lar): ${names}]\n${message.content}`;
  }

  /**
   * Duraklatılmış bir koşuyu kullanıcının kararına göre sonuçlandırır.
   *
   * `tierInput` verilirse koşu o kademeyle devam eder: küçük modelin tıkandığı bir
   * işte kullanıcı "devam et ama daha güçlü modelle" diyebilsin. Mesaj yığını
   * modelden bağımsız olduğu için kademe koşunun ortasında değişebilir.
   */
  async continueRun(
    runId: string,
    userId: string,
    confirmed: boolean,
    tierInput?: string,
    approveAll?: boolean
  ): Promise<ChatResult> {
    this.sweepExpiredRuns();
    const run = this.pendingRuns.get(runId);
    if (!run || run.userId !== userId) {
      throw new NotFoundException("Devam edilecek işlem bulunamadı ya da süresi doldu. Lütfen isteği tekrar yaz.");
    }
    this.pendingRuns.delete(runId);

    if (!confirmed) {
      // Durdurmak kredi harcamaz; yapılanın ne olduğunu söylemek ise şart —
      // kullanıcı yarım kalan işi elle tamamlayacaksa nereden devam edeceğini bilmeli.
      const text =
        `Durdurdum. ${summarizeExecuted(run.executed)}. ` +
        `Bu istek toplam ${this.formatCredits(run.spentCredits)} kredi harcadı.`;
      await this.safeRecord(run.conversationId, text);
      const { balance } = await this.creditsService.getBalance(userId);
      return {
        type: "message",
        text,
        conversationId: run.conversationId,
        usage: { creditsCharged: 0, balance },
        activeFiles: toActiveFileInfo(run.activeFiles),
      };
    }

    const balance = await this.creditsService.assertCanStart(userId);
    if (tierInput) run.tier = resolveTier(tierInput).tier;
    // Devam ederken de aynı rezervasyon geçerli: kredi yetmiyorsa sürdürmek,
    // kullanıcıyı yarım işle borç bakiyesine sokmak olurdu.
    this.creditsService.assertBalanceCovers(balance, this.minimumTurnCredits(this.modelForTier(run.tier, run.preferredModel), run.messages));
    run.startingBalance = balance;
    // Her onay bir eşik daha harcama izni verir. Tavan, duraklatmaya sebep olan
    // TAHMİNİ de kapsamalı: 868 kredilik bir tur için onay alıp tavanı yalnızca
    // 600 açmak, onaydan hemen sonra aynı soruyu tekrar sormak olurdu.
    run.creditCeiling =
      run.spentCredits + Math.max(CREDIT_CONFIRM_THRESHOLD, run.pausedEstimate + CREDIT_CONFIRM_THRESHOLD);
    run.pausedEstimate = 0;
    // Kullanıcı "bu istek boyunca tekrar sorma" dediyse kalan adımlar sorulmadan
    // yürür. Kredi bittiğinde yine durulur — o koruma onaya bağlı değil.
    if (approveAll) run.askAgain = false;
    return this.runWithHolds(run);
  }

  /**
   * Asistanın araç döngüsü.
   *
   * `chat()` ve `continueRun()` aynı döngüyü kullanır; fark yalnızca koşunun
   * sıfırdan mı yoksa dondurulmuş bir noktadan mı başladığıdır. Döngü dört yerde
   * biter: model araç çağırmayı bıraktığında, kritik bir işlem onay beklediğinde,
   * harcama eşiğine gelindiğinde ve tur sınırına gelindiğinde.
   */
  private async runLoop(run: PendingRun): Promise<ChatResult> {
    // `let`: sağlayıcı yedeğe geçerse gerçekte kullanılan model değişir ve kredi
    // hesabı (calculateUsageCost) o modelin fiyatından yapılmalıdır.
    let model = this.modelForTier(run.tier, run.preferredModel);
    const totals: TokenTotals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    /** Son turun kredi bedeli — "devam edersem ne kadar tutar" tahmini bundan çıkar. */
    let lastStepCredits = 0;
    /**
     * Uzunluk sınırında boş dönen tur sayısı.
     *
     * Bir kez oluyorsa modele "çıktın kesildi, işi küçült" deyip tekrar denemeye
     * değer: o turun bedeli zaten ödendi, pes etmek parayı çöpe atmak olur. İkinci
     * kez olduysa artık toparlanmıyor demektir; ısrar etmek katlanan bir zarar.
     */
    let truncatedRetries = 0;
    /** Son tur önbelleği yazdı mı? Sonraki turun tahmini buna göre değişiyor. */
    let lastTurnWroteCache = false;

    const segmentCredits = (): number =>
      calculateUsageCost(model, {
        inputTokens: totals.input,
        outputTokens: totals.output,
        cacheWriteTokens: totals.cacheWrite,
        cacheReadTokens: totals.cacheRead,
      }).credits;

    const finish = async (
      result:
        | { type: "message"; text: string }
        | Omit<Extract<ChatResult, { type: "confirmation" }>, "conversationId" | "usage" | "activeFiles">
        | Omit<Extract<ChatResult, { type: "continuation" }>, "conversationId" | "usage" | "activeFiles">
        | Omit<Extract<ChatResult, { type: "out_of_credits" }>, "conversationId" | "usage" | "activeFiles">,
      assistantText: string
    ): Promise<ChatResult> => {
      // assistantText yeniden atanabiliyor (toplam kredi notu eklenirken).
      const { credits, balanceAfter } = await this.creditsService.chargeUsage({
        userId: run.userId,
        model,
        inputTokens: totals.input,
        outputTokens: totals.output,
        cacheWriteTokens: totals.cacheWrite,
        cacheReadTokens: totals.cacheRead,
        conversationId: run.conversationId,
      });
      run.spentCredits += credits;

      // Çok segmentli isteklerde (onay/duraklatma yaşanmışsa) kullanıcı tek tek
      // balonlardaki sayıları toplamak zorunda kalmasın: son cümleye isteğin
      // TOPLAM bedeli eklenir. Tek segmentli isteklerde balondaki sayı zaten aynı
      // olduğu için eklenmez, gereksiz tekrar olurdu.
      const multiSegment = run.spentCredits - credits > 0;
      if (multiSegment && (result as any).text) {
        const note = ` (Bu isteğin toplam bedeli: ${this.formatCredits(run.spentCredits)} kredi.)`;
        (result as any).text = `${(result as any).text}${note}`;
        assistantText = `${assistantText}${note}`;
      }

      // Maliyet denetimi için her segmentin gerçek token dökümü loglanır.
      this.logger.log(
        `AI kullanım · model=${model} in=${totals.input} out=${totals.output} ` +
          `cacheWrite=${totals.cacheWrite} cacheRead=${totals.cacheRead} → ${credits} kredi ` +
          `(koşu toplamı ${run.spentCredits}, tur ${run.iterationsUsed})`
      );

      if (assistantText) {
        await this.conversationsService.addMessage(run.conversationId, "assistant", assistantText, {
          inputTokens: totals.input + totals.cacheWrite + totals.cacheRead,
          outputTokens: totals.output,
          creditsCharged: credits,
        });
      }
      return {
        ...(result as any),
        conversationId: run.conversationId,
        usage: { creditsCharged: credits, balance: balanceAfter },
        activeFiles: toActiveFileInfo(run.activeFiles),
      };
    };

    /**
     * Koşuyu dondurup kullanıcıya "devam edeyim mi?" diye sorar.
     *
     * Duraklatma noktası kasıtlı olarak araç sonuçlarının modele geri beslenmesinden
     * SONRA: mesaj yığını orada tutarlıdır (her tool_use'un bir tool_result'ı vardır),
     * dolayısıyla onay gelirse hiçbir tur tekrarlanmadan devam edilebilir.
     */
    const pause = async (reason: ContinuationReason, estimateOverride?: number): Promise<ChatResult> => {
      run.createdAt = Date.now();
      this.pendingRuns.set(run.id, run);

      const done = summarizeExecuted(run.executed);
      const spent = run.spentCredits + segmentCredits();
      const estimate = Math.max(
        1,
        Math.round(estimateOverride ?? this.nextTurnEstimate(model, run, lastStepCredits, lastTurnWroteCache))
      );

      // Üç farklı durum, üç farklı cümle: hiç başlamadan uyarı, yarıda bütçe
      // uyarısı ve adım sınırı. Aynı metni kullanmak kullanıcıyı yanıltıyordu.
      const text =
        reason === "estimate"
          ? [
              `Bu istek tahminen ${this.formatCredits(estimate)} kredi tutacak — bu, tek seferde harcanması için`,
              `yüksek bir tutar (eşik ${this.formatCredits(run.creditCeiling)} kredi).`,
              "Henüz hiçbir kredi harcamadım. Devam edeyim mi?",
            ].join(" ")
          : reason === "budget"
            ? [
                `Bu istek şu ana kadar ${this.formatCredits(spent)} kredi harcadı ve henüz bitmedi.`,
                `Şimdiye kadar: ${done}.`,
                `Devam edersem her adım yaklaşık ${this.formatCredits(estimate)} kredi daha götürür.`,
                "Devam edeyim mi?",
              ].join(" ")
            : [
                `Bu istek ${run.iterationsUsed} adım sürdü ve hâlâ bitmedi (${this.formatCredits(spent)} kredi).`,
                `Şimdiye kadar: ${done}.`,
                `Devam edersem her adım yaklaşık ${this.formatCredits(estimate)} kredi daha götürür.`,
                "Devam edeyim mi?",
              ].join(" ");

      return finish(
        {
          type: "continuation",
          runId: run.id,
          reason,
          text,
          spentCredits: spent,
          estimatedNextCredits: estimate,
          doneSummary: done,
          tier: run.tier,
        },
        text
      );
    };

    /**
     * Kredi tükendi: iş yarıda kesilir, o ana kadar harcanan düşülür.
     *
     * Duraklatmadan (pause) farkı, kullanıcıya sorulacak bir şey olmaması —
     * kredi yüklenmeden devam edilemez. Yapılanların özeti yine verilir ki
     * kullanıcı nerede kaldığını bilsin.
     */
    const outOfCredits = async (required: number, remaining: number): Promise<ChatResult> => {
      const done = summarizeExecuted(run.executed);
      const text =
        `AI kredin bu isteği sürdürmeye yetmiyor, bu yüzden burada durdum. ${done}. ` +
        `Kalan kredin ${this.formatCredits(Math.max(0, remaining))}, devam etmek için ` +
        `en az ${this.formatCredits(required)} gerekiyor. ` +
        "Ayarlar > AI Kredileri sayfasından kredi yükleyip tekrar yazabilirsin.";
      return finish(
        {
          type: "out_of_credits",
          text,
          balance: Math.max(0, remaining),
          requiredCredits: Math.ceil(required),
          doneSummary: done,
        },
        text
      );
    };

    // "Bir daha sorma" denmiş bir işte segmentlere bölmenin anlamı yok: bölmenin
    // tek sebebi kullanıcıya soru sormaktı. O durumda tek sınır mutlak tavandır.
    // (Döngüyü sonlandırıp yeniden çağırmak tahsilatı atlardı — ücret yalnızca
    // finish() içinde işleniyor.)
    const stepLimit = run.askAgain ? MAX_TOOL_ITERATIONS : MAX_TOTAL_ITERATIONS;

    for (let step = 0; step < stepLimit; step++) {
      // Kredi koruması bütçe kontrolünden ÖNCE gelir: biri "kullanıcı izin verdi mi",
      // diğeri "kullanıcının parası var mı" sorusudur ve ikincisi tartışmaya kapalıdır.
      //
      // Kontrol veritabanında ATOMİK yapılır: turun en pahalı hâli kadar kredi
      // tutulur (hold). Aynı kullanıcının paralel isteği bu tutmayı gördüğü için
      // ikisi birden aynı bakiyeyi harcayamaz. Tutma bakiyeyi düşürmez; segment
      // biterken kaldırılır ve gerçek tüketim normal yoldan işlenir.
      // Tutulan miktar KÜMÜLATİFTİR: "şu ana kadar borçlandığım" + "bir sonraki turun
      // en pahalı hâli". Her tura ayrı tutma açıp biriktirmek, gerçekte 20 kredi harcanan
      // bir sohbette 8 turun en kötü hâlini (yüzlerce kredi) bloke ederdi; kullanıcı
      // parası dururken "kredin yetmiyor" duyardı. Yeni tutma açıldıktan SONRA eskisi
      // bırakılır — sıra tersine dönerse aradaki boşlukta paralel bir istek sızabilirdi.
      const remaining = run.startingBalance - segmentCredits();
      const plan = this.planTurn(model, run.messages, remaining);
      if (!plan) return outOfCredits(this.minimumTurnCredits(model, run.messages), remaining);

      const previousHolds = [...run.holds];
      try {
        const hold = await this.creditsService.reserve(run.userId, segmentCredits() + plan.required);
        if (hold) run.holds.push(hold);
      } catch (err) {
        if (err instanceof InsufficientCreditsException) {
          return outOfCredits(this.minimumTurnCredits(model, run.messages), remaining);
        }
        throw err;
      }
      for (const stale of previousHolds) {
        run.holds = run.holds.filter((id) => id !== stale);
        await this.creditsService.release(stale);
      }

      // Bütçe kontrolü bir sonraki API çağrısından ÖNCE yapılır: token'lar orada
      // harcanacak, dolayısıyla durulacak yer burasıdır.
      //
      // İLK TUR DA KONTROL EDİLİR. Eskiden "önceki turun bedeli" ölçüt olduğu için
      // ilk tur hiç denetlenmiyordu; oysa sabit dosyalı bir Dengeli/Güçlü isteğinde
      // TEK BİR TUR 1100 krediyi bulabiliyor. Kullanıcı hiçbir şey sorulmadan o
      // parayı harcamış oluyordu — üstelik iş de bitmemiş olabiliyordu.
      const nextEstimate = this.nextTurnEstimate(model, run, lastStepCredits, lastTurnWroteCache);
      if (run.askAgain && run.spentCredits + segmentCredits() + nextEstimate > run.creditCeiling) {
        run.pausedEstimate = nextEstimate;
        // Henüz hiçbir şey harcanmadıysa bu bir ÖN uyarıdır, yarıda kesme değil.
        return pause(run.spentCredits + segmentCredits() > 0 ? "budget" : "estimate", nextEstimate);
      }
      if (run.iterationsUsed >= MAX_TOTAL_ITERATIONS) break;

      const creditsBefore = segmentCredits();
      const { response, model: usedModel } = await this.callModel(run.tier, (choice) => ({
        model: choice.model,
        // Çıktı sınırı kalan krediye göre kısılabilir (bkz. planTurn).
        max_tokens: plan.maxTokens,
        // Sistem promptu iki bloğa ayrılır: statik blok (araç şemalarıyla birlikte)
        // önbelleğe alınır, dinamik bağlam her istekte yeniden gönderilir.
        system: [
          {
            type: "text",
            text: AiAssistantService.STATIC_SYSTEM_PROMPT,
            // Önbellek işareti yalnızca destekleyen sağlayıcıya konur; desteklemeyen
            // sağlayıcılarda bu alan bilinmeyen bir anahtar olarak reddedilebilir.
            ...(CACHING_ENABLED && choice.provider.capabilities.promptCaching
              ? { cache_control: { type: "ephemeral" } }
              : {}),
          },
          // Açık dosya bildirimi HER TURDA yeniden yazılır: koşunun ortasında
          // release_files çağrılırsa bir sonraki tur doğru durumu görmeli.
          {
            type: "text",
            text:
              `${run.baseContext}\n\n${this.activeFileStatus(run.activeFiles)}` +
              (run.channel === "whatsapp" ? `\n\n${WHATSAPP_CHANNEL_PROMPT}` : ""),
          },
        ] as any,
        tools: toolsForChannel(run.channel, { allowWrites: run.allowWrites }),
        messages: run.messages,
      }), run.preferredModel);
      // Yedeğe geçilmiş olabilir; sonraki kredi hesapları gerçek modeli kullansın.
      model = usedModel;
      run.iterationsUsed += 1;

      const usage: any = response.usage ?? {};
      totals.input += usage.input_tokens ?? 0;
      totals.output += usage.output_tokens ?? 0;
      totals.cacheWrite += usage.cache_creation_input_tokens ?? 0;
      totals.cacheRead += usage.cache_read_input_tokens ?? 0;
      lastTurnWroteCache = (usage.cache_creation_input_tokens ?? 0) > 0;
      lastStepCredits = Math.max(0, segmentCredits() - creditsBefore);

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      // Yanıt uzunluk sınırına takıldı mı? Bu bilgi kritik: yarım kalmış bir araç
      // çağrısının parametreleri eksiktir ve çalıştırılırsa yanlış veri yazar.
      const truncated = response.stop_reason === "max_tokens";

      if (toolUses.length === 0) {
        if (text) return finish({ type: "message", text }, text);

        this.logger.warn(
          `Model boş yanıt döndü · sohbet=${run.conversationId} kesildi=${truncated} tur=${run.iterationsUsed}`
        );

        // Uzunluk sınırında boş dönmek, modelin çok büyük bir araç çağrısı yazmaya
        // kalkışıp yarıda kesilmesi demek (API yarım kalan bloğu hiç döndürmüyor).
        // O turun bedeli zaten ödendi; pes etmek yerine bir kez daha, işi küçültmesi
        // söylenerek denenir. Aksi halde kullanıcı yüzlerce kredi ödeyip elinde
        // hiçbir şey olmadan kalıyordu.
        if (truncated && truncatedRetries < 1) {
          truncatedRetries += 1;
          run.messages.push({
            role: "user",
            content:
              "Yanıtın uzunluk sınırında kesildi ve bana hiçbir şey ulaşmadı. " +
              "Aynı işi ÇOK DAHA KÜÇÜK parçalara böl: tek araç çağrısında en fazla 10 kalem gönder, " +
              "gerekiyorsa aracı arka arkaya çağır. Uzun açıklama yazma, doğrudan aracı çağır.",
          });
          continue;
        }

        // Model hiçbir şey üretmedi. Ne söyleneceği YAPILAN İŞE bağlı:
        //
        // - Hiçbir değişiklik yoksa bu gerçek bir başarısızlıktır (eskiden buraya
        //   "Tamam." yazılıyordu; kullanıcı işin yapıldığını sanıp gidiyordu).
        // - Ama işler yapıldıysa "yanıt üretemedim" demek YANLIŞ olur: kullanıcı
        //   işin başarısız olduğunu sanıp aynı isteği tekrar yazar ve iki kez öder.
        //   Bu durumda son cümlenin eksikliği yalnızca bir özet eksikliğidir.
        const done = summarizeExecuted(run.executed);
        const didWork = run.executed.some((name) => ACTION_LABELS[name]);
        const failText = didWork
          ? `Son adımda özet cümlesi üretemedim, ama yapılanlar duruyor: ${done}. ` +
            "Eksik kalan bir şey varsa söyle, tamamlayayım."
          : truncated
            ? `Yanıtım uzunluk sınırına takıldığı için isteği tamamlayamadım. ${done}. ` +
              "İsteği daha küçük parçalara bölerek tekrar yazar mısın?"
            : `Bu isteğe yanıt üretemedim. ${done}. Ne yapmamı istediğini biraz daha açık yazar mısın?`;
        return finish({ type: "message", text: failText }, failText);
      }

      if (truncated) {
        // Kesilmiş araç çağrısı ÇALIŞTIRILMAZ. Modele ne olduğu söylenip işi
        // küçültmesi istenir; körlemesine tekrar denemek aynı duvara toslamaktı.
        run.messages.push({ role: "assistant", content: response.content });
        run.messages.push({
          role: "user",
          content: toolUses.map((use) => ({
            type: "tool_result" as const,
            tool_use_id: use.id,
            content:
              "Bu çağrı uzunluk sınırında yarıda kesildi, bu yüzden çalıştırılmadı. " +
              "Aynı işi daha KÜÇÜK parçalara bölerek tekrar çağır (ör. create_tasks'a bir seferde en fazla 10 kalem ver).",
            is_error: true,
          })),
        });
        this.logger.warn(`Araç çağrısı uzunluk sınırında kesildi · araç=${toolUses.map((u) => u.name).join(",")}`);
        continue;
      }

      const criticalUse = toolUses.find((use) => CRITICAL_TOOLS.has(use.name));
      // WhatsApp'ta onay diyaloğu gösterilemez. toolsForChannel bu araçları
      // zaten modele vermiyor, yani buraya normalde düşülmez; düşülürse
      // (araç adı değişti, süzgeç bozuldu) koşuyu ONAY BEKLER hâlde bırakmak
      // kullanıcıya sonsuza kadar cevapsız kalmak demek olurdu. Araç sonucu
      // olarak reddedip modele devam ettiriyoruz: Lio "bunu uygulamadan
      // yapmalısınız" diyebilsin.
      if (criticalUse && run.channel === "whatsapp") {
        this.logger.error(
          `WhatsApp kanalında kritik araç istendi (süzgeç kaçırdı): ${criticalUse.name}`
        );
        run.messages.push({ role: "assistant", content: response.content });
        run.messages.push({
          role: "user",
          content: toolUses.map((use) => ({
            type: "tool_result" as const,
            tool_use_id: use.id,
            content:
              "Bu işlem WhatsApp üzerinden yapılamaz. Kullanıcıya işlemi Projelio uygulamasından " +
              "yapması gerektiğini söyle; yapılmış gibi davranma.",
            is_error: true,
          })),
        });
        continue;
      }
      if (criticalUse) {
        const actionId = randomUUID();
        const input = (criticalUse.input as Record<string, any>) ?? {};
        // Koşu dondurulur: onaydan sonra buradan devam edilecek.
        run.createdAt = Date.now();
        this.pendingRuns.set(run.id, run);
        this.pendingActions.set(actionId, {
          id: actionId,
          userId: run.userId,
          userRole: run.userRole,
          toolName: criticalUse.name,
          input,
          conversationId: run.conversationId,
          createdAt: Date.now(),
          runId: run.id,
          assistantContent: response.content as any[],
          criticalUseId: criticalUse.id,
        });
        const summary = await this.summarizeAction(criticalUse.name, input, run.userId);
        return finish(
          { type: "confirmation", actionId, toolName: criticalUse.name, summary, text: text || undefined },
          text || summary
        );
      }

      // Kritik olmayan araçları çalıştır, sonuçları modele geri besle ve devam et.
      run.messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      // open_file ile getirilen dosyaların içerik blokları. Araç sonuçlarının
      // ARDINA konuyorlar (bkz. openProjelioFile).
      const openedBlocks: ContentBlockParam[] = [];
      for (const use of toolUses) {
        // release_files sohbetin durumunu değiştiriyor, veriyi değil; bu yüzden
        // executeTool'a değil buraya ait — orada conversationId bilgisi yok.
        if (use.name === "release_files") {
          await this.releaseActiveFiles(run);
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: "Dosyalar bırakıldı; bundan sonra içerikleri sana gönderilmeyecek.",
          });
          continue;
        }
        // open_file de sohbetin durumunu değiştiriyor (dosyayı sabitliyor);
        // release_files ile aynı sebeple executeTool'un dışında duruyor.
        if (use.name === "open_file") {
          try {
            const opened = await this.openProjelioFile(
              run,
              String((use.input as any)?.fileId ?? ""),
              (use.input as any)?.transcribe === true
            );
            run.executed.push(use.name);
            toolResults.push({ type: "tool_result", tool_use_id: use.id, content: opened.note });
            openedBlocks.push(...opened.blocks);
          } catch (err: any) {
            this.logger.warn(`open_file başarısız: ${err?.message}`);
            toolResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: `Dosya getirilemedi: ${err?.message ?? "bilinmeyen hata"}`,
              is_error: true,
            });
          }
          continue;
        }
        try {
          const result = await this.executeTool(
            use.name,
            (use.input as Record<string, any>) ?? {},
            run.userId,
            run.userRole
          );
          // Yalnızca BAŞARILI çağrılar özete girer; hata alan bir araç iş yapmadı.
          run.executed.push(use.name);
          await this.emitActivity(run.userId, use.name, (use.input as Record<string, any>) ?? {}, result);
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
      // Getirilen dosyaların içeriği araç sonuçlarının ARDINA eklenir; tool_result
      // blokları kullanıcı turunun başında olmak zorunda.
      run.messages.push({ role: "user", content: [...toolResults, ...openedBlocks] });
    }

    // Tur sınırına gelindi ve iş bitmedi. Eskiden burada "İsteğini tamamlayamadım"
    // deyip her şey çöpe gidiyordu: yapılan değişiklikler duruyor ama kullanıcı ne
    // olduğunu bilmiyor, aynı isteği baştan yazıyor ve krediyi iki kez ödüyordu.
    if (run.iterationsUsed < MAX_TOTAL_ITERATIONS) return pause("iterations");

    const fallback =
      `Bu isteği tamamlayamadım, adım sınırına takıldım. ${summarizeExecuted(run.executed)}. ` +
      "Kalan kısmı için isteği daha küçük parçalara bölerek yazar mısın?";
    return finish({ type: "message", text: fallback }, fallback);
  }

  /**
   * Bir turun çıktı sınırını ve rezerve edilecek krediyi birlikte belirler.
   *
   * Rezerv "en pahalı hâl" üzerinden hesaplanır: tüm girdi önbelleksiz gitmiş ve
   * model çıktı sınırını sonuna kadar kullanmış gibi. Gerçek bedel neredeyse her
   * zaman bunun altında kalır — kasıt da bu, çünkü az tahmin kullanıcıyı eksi
   * bakiyede bırakır.
   *
   * Fakat sabit bir tavanla hesaplamak, bakiyesi azalan kullanıcıyı gereğinden
   * erken reddediyordu. Bunun yerine ÇIKTI SINIRI kalan krediye göre kısılır:
   * kredi azaldıkça Lio kısa konuşur, tamamen susmaz. Duvar ancak asgari yanıt
   * bile karşılanamadığında çıkar.
   *
   * `null` dönmesi "bu tur hiç yapılamaz" demektir.
   */
  private planTurn(
    model: string,
    messages: Anthropic.MessageParam[],
    remaining: number
  ): { maxTokens: number; required: number } | null {
    const inputTokens = BASE_PROMPT_TOKENS + this.estimateInputTokens(messages);
    const costFor = (outputTokens: number) =>
      calculateUsageCost(model, { inputTokens, outputTokens }).credits;

    const full = costFor(MAX_TOKENS);
    if (full <= remaining) return { maxTokens: MAX_TOKENS, required: full };

    // Maliyet çıktı token'ında doğrusal; kalan krediyle alınabilecek çıktı
    // doğrudan hesaplanır (ikili aramaya gerek yok).
    const inputOnly = costFor(0);
    const perThousand = costFor(1000) - inputOnly;
    const affordable = perThousand > 0 ? Math.floor(((remaining - inputOnly) / perThousand) * 1000) : 0;

    let maxTokens = Math.max(MIN_OUTPUT_TOKENS, Math.min(MAX_TOKENS, affordable));
    let required = costFor(maxTokens);
    if (required > remaining) {
      // Yuvarlama payı: asgariye in, o da tutmuyorsa tur yapılamaz.
      maxTokens = MIN_OUTPUT_TOKENS;
      required = costFor(maxTokens);
    }
    return required <= remaining ? { maxTokens, required } : null;
  }

  /**
   * Bir sonraki turun GERÇEKÇİ kredi tahmini.
   *
   * Rezervasyondan (planTurn) farkı, en kötü hâli değil beklenen hâli hesaplaması:
   * bu sayı "kullanıcıya devam edeyim mi diye sorayım mı?" kararında kullanılıyor
   * ve en kötü hâlle sorulsaydı her sohbette gereksiz onay penceresi çıkardı.
   *
   * Kritik nokta ÖNBELLEK: sabit dosyalı bir sohbette önbelleği YAZMAK ile OKUMAK
   * arasında 10 kata varan fark var. Bunu hesaba katmayan eski kontrol, tek bir
   * turda 1100 kredi harcanmasına rağmen 600 eşiğini hiç tetiklemiyordu.
   */
  private estimateTurnCredits(model: string, run: PendingRun, writesCache: boolean): number {
    const cachedTokens = BASE_PROMPT_TOKENS + run.pinnedTokens;
    const freshTokens = Math.max(0, this.estimateInputTokens(run.messages) - run.pinnedTokens);

    if (!CACHING_ENABLED) {
      return calculateUsageCost(model, {
        inputTokens: cachedTokens + freshTokens,
        outputTokens: TYPICAL_OUTPUT_TOKENS,
      }).credits;
    }

    return calculateUsageCost(model, {
      inputTokens: freshTokens,
      ...(writesCache ? { cacheWriteTokens: cachedTokens } : { cacheReadTokens: cachedTokens }),
      outputTokens: TYPICAL_OUTPUT_TOKENS,
    }).credits;
  }

  /**
   * İlk turun önbelleği yazıp yazmayacağı.
   *
   * Kesin bilinemez (önbellek Anthropic tarafında), ama üç işaret güvenilir:
   * sohbet yeni, önek değişti ya da son mesajın üzerinden önbellek ömrü geçti.
   * Şüphede kalınca YAZAR varsayılır — düşük tahmin kullanıcıyı habersiz yüksek
   * harcamaya sokar, yüksek tahmin en fazla gereksiz bir onay penceresi açar.
   */
  private expectsCacheWrite(history: AiStoredMessage[], prefixChanged: boolean): boolean {
    if (prefixChanged || history.length === 0) return true;
    const last = history[history.length - 1]?.createdAt;
    if (!last) return true;
    const age = Date.now() - new Date(last).getTime();
    return !Number.isFinite(age) || age > CACHE_WARM_WINDOW_MS;
  }

  /**
   * "Bir sonraki tur ne tutar?" — duraklatma kararında ve mesajında kullanılır.
   *
   * Ölçülen son tur varsa ondan gidilir; ama o tur önbelleği YAZDIYSA ondan
   * gitmek yanıltıcı olur: sonraki tur artık okuyacak ve 10 kat ucuz olacaktır.
   * Kullanıcıya "her adım ~1.070 kredi" deyip ardından 190 kredilik adımlar
   * atmak, verilen sayıyı da güveni de anlamsızlaştırıyordu.
   */
  private nextTurnEstimate(
    model: string,
    run: PendingRun,
    lastStepCredits: number,
    lastTurnWroteCache: boolean
  ): number {
    if (lastStepCredits > 0 && !lastTurnWroteCache) return lastStepCredits;
    if (lastStepCredits > 0) return this.estimateTurnCredits(model, run, false);
    return this.estimateTurnCredits(model, run, run.expectsCacheWrite);
  }

  /** Bir turun asgari bedeli — "başlamak için en az ne gerekiyor" mesajları için. */
  private minimumTurnCredits(model: string, messages: Anthropic.MessageParam[]): number {
    return calculateUsageCost(model, {
      inputTokens: BASE_PROMPT_TOKENS + this.estimateInputTokens(messages),
      outputTokens: MIN_OUTPUT_TOKENS,
    }).credits;
  }

  /**
   * Mesaj yığınının kaba token karşılığı.
   *
   * Blok blok yürünmesinin sebebi görsel ve PDF: ikisi de gövdede base64 olarak
   * duruyor ama token bedelleri karakter sayısıyla ORANTILI DEĞİL. Ham uzunluğu
   * bölmek 5 MB'lık bir görseli iki milyon token gibi gösterip her isteği
   * "kredin yetmiyor" ile reddettirirdi.
   */
  private estimateInputTokens(messages: Anthropic.MessageParam[]): number {
    let tokens = 0;
    for (const message of messages) {
      if (typeof message.content === "string") {
        tokens += Math.ceil(message.content.length / CHARS_PER_TOKEN);
        continue;
      }
      for (const block of (message.content ?? []) as any[]) {
        if (block?.type === "text") {
          tokens += Math.ceil(String(block.text ?? "").length / CHARS_PER_TOKEN);
        } else if (block?.type === "image") {
          tokens += IMAGE_TOKENS;
        } else if (block?.type === "document") {
          const base64Length = String(block?.source?.data ?? "").length;
          const bytes = Math.ceil(base64Length * 0.75);
          tokens += Math.min(Math.ceil(bytes / PDF_BYTES_PER_TOKEN), MAX_PDF_TOKENS);
        } else {
          // tool_use / tool_result: gövdesi neyse JSON uzunluğundan gidilir.
          tokens += Math.ceil(JSON.stringify(block ?? {}).length / CHARS_PER_TOKEN);
        }
      }
    }
    return tokens;
  }

  /**
   * Projelio'daki bir dosyayı sohbete getirir (open_file).
   *
   * İçerik İKİ YERE birden konur ve bu bilinçli:
   *
   *  1. Sohbete SABİTLENİR — sonraki isteklerde içerik yine isteğin en başına
   *     konur ve önbellekten ucuza okunur (bkz. activeFileMessages).
   *  2. Bu koşuya araç sonucunun ardından eklenir. Sabit dosya bloğu isteğin en
   *     BAŞINDA duruyor ve koşu ortasında oraya bir şey eklenemez: eklenseydi o
   *     ana kadar yazılmış önbellek öneki bozulur, turun tamamı yeniden ödenirdi.
   *     Bu yüzden dosya, açıldığı turda mesaj yığınının SONUNA iliştirilir —
   *     model dosyayı hemen görür, kullanıcı da aynı içeriği iki kez ödemez.
   */
  private async openProjelioFile(
    run: PendingRun,
    fileId: string,
    transcribe: boolean
  ): Promise<{ note: string; blocks: ContentBlockParam[] }> {
    if (!fileId) throw new BadRequestException("fileId gerekli.");

    // Aynı dosyayı ikinci kez açmak, indirme + çıkarma bedelini ve her turdaki
    // token bedelini boşuna ikiye katlardı.
    const already = run.activeFiles.find((f) => f.sourceFileId === fileId);
    if (already) {
      // Görsel ve PDF'in ikili içeriği bellekte SÜRELİ duruyor. Süresi dolduysa
      // dosya listede görünmeye devam eder ama model onu artık göremez; "zaten
      // açık" demek, olmayan bir içeriği var saymak olurdu. O durumda kayıt
      // düşürülür ve dosya yeniden getirilir.
      const stillReadable =
        already.kind === "image" || already.kind === "pdf"
          ? Boolean(this.attachmentsService.getBinary(run.userId, already.id))
          : true;
      if (stillReadable) {
        return {
          note: `"${already.name}" zaten bu sohbette açık ve içeriği elinde; tekrar açmana gerek yok.`,
          blocks: [],
        };
      }
      run.activeFiles = run.activeFiles.filter((f) => f.id !== already.id);
      this.attachmentsService.releaseMany(run.userId, [already.id]);
    }

    // SES DOSYASI KORUMASI. Ses ekleri modele metin olarak verilebilmek için
    // önce yazıya çevriliyor ve bu ÜCRETLİ: dakikası ~72 kredi, dört dakikalık
    // bir parça ~290. "Arda'nın gönderdiği iki müzik dosyasını ver" gibi bir
    // istekte kullanıcının istediği şey dosyanın KENDİSİ — sözleri değil; iki
    // parçayı çözümlemek beş yüz krediyi hiçbir karşılık vermeden yakardı.
    // Bu yüzden ses, ancak model bilerek transcribe=true derse açılır. Kontrol
    // indirmeden ÖNCE yapılır; findById yetkiyi de doğruluyor.
    const { file: meta } = await this.filesService.findById(fileId, run.userId);
    if (!transcribe && isAudioFile(meta.mimeType, meta.name)) {
      const estimate = meta.sizeBytes ? Math.round(estimateTranscriptionCredits(meta.sizeBytes)) : undefined;
      return {
        note:
          `"${meta.name}" bir ses dosyası. İçeriğini okuyabilmem için önce yazıya çevrilmesi gerekiyor ` +
          `ve bu ücretli${estimate ? ` — bu dosya için tahminen ${estimate} kredi` : ""}. ` +
          "Kullanıcı dosyanın KENDİSİNİ istiyorsa açma: adını ve search_files'tan gelen webViewLink " +
          "bağlantısını ver, yeter. Sözlerini/içeriğini gerçekten istiyorsa önce bedeli söyleyip onay al, " +
          "sonra open_file'ı transcribe=true ile çağır.",
        blocks: [],
      };
    }

    const summary = await this.attachmentsService.prepareFromProjelioFile(
      run.userId,
      fileId,
      run.conversationId
    );
    const [prepared] = this.attachmentsService.take(run.userId, [summary.id]);

    // Blok, retain()'den ÖNCE kurulur: retain metin sürümünü bellekten düşürüyor.
    const blocks = [this.activeFileBlock(run.userId, toActiveFile(prepared))];

    const before = run.activeFiles;
    run.activeFiles = this.mergeActiveFiles(before, [
      toActiveFile(prepared, { sourceFileId: fileId, addedMidRun: true }),
    ]);
    await this.conversationsService.setActiveFiles(run.conversationId, run.activeFiles);
    this.attachmentsService.retain(run.userId, [prepared.id]);

    // Sınıra takılıp düşen dosya olduysa modele SÖYLENİR; yoksa bir sonraki turda
    // artık gönderilmeyen bir dosyayı elinde sanıp içeriğini uydurmaya çalışır.
    const dropped = before.filter((f) => !run.activeFiles.some((k) => k.id === f.id));
    if (dropped.length) {
      this.attachmentsService.releaseMany(run.userId, dropped.map((f) => f.id));
    }

    this.logger.log(
      `Lio dosya getirdi · kullanıcı=${run.userId.slice(0, 8)}… dosya=${prepared.name} tür=${prepared.kind}`
    );

    return {
      note:
        `"${prepared.name}" (${prepared.detail}) sohbete getirildi; içeriği bu mesajın devamında. ` +
        (dropped.length
          ? `Aynı anda en fazla ${MAX_ACTIVE_FILES} dosya taşınabildiği için şunlar sohbetten düştü: ` +
            `${dropped.map((f) => f.name).join(", ")}. `
          : "") +
        (prepared.creditsCharged ? `Hazırlama bedeli ${prepared.creditsCharged} kredi. ` : "") +
        "Dosya iş bitene kadar her turda elinde olacak; bittiğinde release_files ile bırak.",
      blocks,
    };
  }

  /**
   * Sohbete sabitlenmiş dosyaları bırakır.
   *
   * Bırakıldıktan sonra içerik bir daha modele gönderilmez — asıl kazanç bu:
   * biten bir işin dosyası her turda tekrar tekrar ödenmeye devam etmemeli.
   */
  private async releaseActiveFiles(run: PendingRun): Promise<void> {
    if (!run.activeFiles.length) return;
    this.attachmentsService.releaseMany(run.userId, run.activeFiles.map((f) => f.id));
    run.activeFiles = [];
    await this.conversationsService.setActiveFiles(run.conversationId, []);
  }

  /**
   * Geçmişin başındaki asistan mesajlarını atar.
   *
   * Pencere son N mesajı aldığı için geçmiş bir asistan yanıtıyla başlayabiliyor.
   * Sabit dosya bloğu da bir asistan cümlesiyle bittiği için ikisi arka arkaya
   * gelirdi; ayrıca bir konuşmanın kullanıcı sözüyle başlaması modelin sırayı
   * doğru okuması için daha güvenli.
   */
  private trimLeadingAssistant(history: AiStoredMessage[]): AiStoredMessage[] {
    let start = 0;
    while (start < history.length && history[start].role === "assistant") start += 1;
    return history.slice(start);
  }

  /**
   * Lio bir kayıt oluşturduğunda/değiştirdiğinde kullanıcının ekranını oraya taşır.
   *
   * İki sinyal birden gider:
   *  1. Kişiye ("lio-activity") — arayüz soldaki sayfayı ilgili yere götürür.
   *  2. Etkilenen sayfaya ("room-changed") — o sayfayı açık tutan herkes tazelenir.
   *
   * Hiçbir hata asıl işi bozmamalı: bildirim gönderilemezse iş yine yapılmıştır,
   * yalnızca kullanıcı sonucu canlı görmez.
   */
  private async emitActivity(
    userId: string,
    toolName: string,
    input: Record<string, any>,
    result: unknown
  ): Promise<void> {
    try {
      const activity = await this.describeActivity(toolName, input ?? {}, result);
      if (!activity) return;

      this.realtime.emitToUser(userId, "lio-activity", activity);
      if (activity.room) {
        this.realtime.notifyRoom(activity.room, {
          method: "AI",
          path: activity.path ?? "",
          actorId: userId,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Lio canlı bildirimi gönderilemedi (${toolName}): ${err?.message}`);
    }
  }

  /**
   * Araç çağrısını "kullanıcı nereye baksın?" bilgisine çevirir.
   *
   * SİLME araçları bilerek dışarıda: kayıt artık yok, oraya gitmek boş sayfa
   * açardı. Oluşturma ve güncelleme ise hedefi belli olduğu için taşınabilir.
   */
  private async describeActivity(
    toolName: string,
    input: Record<string, any>,
    result: any
  ): Promise<LioActivityPayload | null> {
    const at = new Date().toISOString();
    const make = (
      label: string,
      path?: string,
      room?: string,
      entityId?: string
    ): LioActivityPayload => ({ tool: toolName, label, path, room, entityId, createdAt: at });

    const projectActivity = (label: string, projectId?: string, entityId?: string) =>
      projectId ? make(label, `/projects/${projectId}`, `project:${projectId}`, entityId) : null;

    // Departman görevinin sayfası projede değil, departmanın Görevler sekmesinde
    // (bkz. tasks.service.ts taskPath). Oda adı da oradan: "department:<id>".
    const departmentActivity = (label: string, departmentId?: string, entityId?: string) =>
      departmentId
        ? make(label, `/departments/${departmentId}?tab=tasks`, `department:${departmentId}`, entityId)
        : null;

    switch (toolName) {
      // Yapılacaklar sayfasının canlı odası yok (pano kişisel, kimseyle
      // paylaşılmıyor); bildirim yalnızca kullanıcıyı sayfaya götürüyor.
      case "create_todo":
      case "create_todos":
      case "update_todo":
      case "set_todo_status":
      case "update_assigned_todo_prefs":
      case "reorder_todos":
      case "archive_todo":
      case "restore_todo": {
        const label = ACTION_LABELS[toolName];
        if (!label) return null;
        return make(`${label[0].toLocaleUpperCase("tr")}${label.slice(1)}`, "/tasks");
      }

      case "create_job":
      case "update_job":
      case "archive_job": {
        const id = result?.id ?? input.jobId;
        if (!id) return null;
        const title = result?.title ? `: ${result.title}` : "";
        const label =
          toolName === "create_job"
            ? `İş oluşturuldu${title}`
            : toolName === "update_job"
              ? `İş güncellendi${title}`
              : `İş arşivlendi${title}`;
        return make(label, `/jobs/${id}`, `job:${id}`, id);
      }

      case "create_project":
      case "update_project":
      case "archive_project": {
        const id = result?.id ?? input.projectId;
        if (!id) return null;
        const title = result?.title ? `: ${result.title}` : "";
        const label =
          toolName === "create_project"
            ? `Proje oluşturuldu${title}`
            : toolName === "update_project"
              ? `Proje güncellendi${title}`
              : `Proje arşivlendi${title}`;
        return make(label, `/projects/${id}`, `project:${id}`, id);
      }

      case "create_group":
      case "update_group":
      case "archive_group": {
        const id = result?.groupId ?? input.groupId;
        if (!id) return null;
        const label =
          toolName === "create_group"
            ? "Grup oluşturuldu"
            : toolName === "update_group"
              ? "Grup güncellendi"
              : "Grup arşivlendi";
        return make(label, `/groups/${id}`, `group:${id}`, id);
      }

      case "create_organization":
      case "update_organization":
      case "archive_organization": {
        const id = result?.organizationId ?? input.organizationId;
        if (!id) return null;
        const ad = result?.ad ? `: ${result.ad}` : "";
        const label =
          toolName === "create_organization"
            ? `Organizasyon oluşturuldu${ad}`
            : toolName === "update_organization"
              ? `Organizasyon güncellendi${ad}`
              : "Organizasyon arşivlendi";
        return make(label, `/organizations/${id}`, `organization:${id}`, id);
      }

      case "create_department":
      case "update_department":
      case "archive_department": {
        const id = result?.departmentId ?? input.departmentId;
        const label =
          toolName === "create_department"
            ? `Departman açıldı${result?.ad ? `: ${result.ad}` : ""}`
            : toolName === "update_department"
              ? "Departman güncellendi"
              : "Departman arşivlendi";
        // Yeni açılan departmanda kullanıcı organizasyon sayfasına değil
        // departmanın kendi sayfasına gitmeli; arşivlenende de sayfa duruyor.
        return id ? make(label, `/departments/${id}`, `department:${id}`, id) : null;
      }

      case "create_operation":
      case "update_operation":
      case "archive_operation": {
        const id = result?.operationId ?? input.operationId;
        if (!id) return null;
        const label =
          toolName === "create_operation"
            ? `Rutin oluşturuldu${result?.ad ? `: ${result.ad}` : ""}`
            : toolName === "update_operation"
              ? "Rutin güncellendi"
              : "Rutin arşivlendi";
        return make(label, `/operations/${id}`, `operation:${id}`, id);
      }

      case "create_product":
      case "update_product": {
        // Ürünün kendi sayfası yok; listesi organizasyonun Ürünler sekmesinde.
        const organizationId = input.organizationId ?? (await this.organizationIdOfProduct(result?.productId));
        if (!organizationId) return null;
        const label =
          toolName === "create_product"
            ? `Ürün eklendi${result?.ad ? `: ${result.ad}` : ""}`
            : "Ürün güncellendi";
        return make(
          label,
          `/organizations/${organizationId}?tab=products`,
          `organization:${organizationId}`,
          result?.productId
        );
      }

      case "create_task": {
        const label = `Görev oluşturuldu${result?.title ? `: ${result.title}` : ""}`;
        return input.departmentId
          ? departmentActivity(label, input.departmentId, result?.id)
          : projectActivity(label, input.projectId, result?.id);
      }

      case "create_tasks": {
        const count = Number(result?.createdCount ?? 0);
        if (!count) return null;
        const label = `${count} görev eklendi`;
        return input.departmentId
          ? departmentActivity(label, input.departmentId)
          : projectActivity(label, input.projectId);
      }

      case "import_tasks_from_sheet": {
        // Önizleme hiçbir şey yazmıyor; bildirim yalnızca gerçekten yazılınca.
        const count = Number(result?.olusturulan ?? 0);
        if (!count) return null;
        const label = `Dosyadan ${count} görev eklendi`;
        // Tek hedefe gittiyse oraya götür; dağıtıldıysa götürülecek tek sayfa yok.
        if (input.hedef?.projectId) return projectActivity(label, input.hedef.projectId);
        if (input.hedef?.departmentId) return departmentActivity(label, input.hedef.departmentId);
        return make(label);
      }

      case "import_module_records_from_sheet": {
        const count = Number(result?.olusturulan ?? 0);
        if (!count) return null;
        const label = `Dosyadan ${count} modül kaydı eklendi`;
        const moduleKey = input.moduleKey;
        if (input.jobId && moduleKey) {
          return make(label, `/jobs/${input.jobId}/modules/${moduleKey}`, `job:${input.jobId}/module/${moduleKey}`);
        }
        if (input.departmentId && moduleKey) {
          return make(
            label,
            `/departments/${input.departmentId}/modules/${moduleKey}`,
            `department:${input.departmentId}/module/${moduleKey}`
          );
        }
        return make(label);
      }

      case "add_budget_transaction":
        return projectActivity("Bütçe hareketi eklendi", input.projectId);

      case "create_output":
        return projectActivity(
          `Çıktı oluşturuldu${result?.title ? `: ${result.title}` : ""}`,
          input.projectId,
          result?.id
        );

      case "update_output":
        // Çıktının projesi girdide yok; sonuçtan okunuyor.
        return projectActivity("Çıktı güncellendi", result?.projectId, input.outputId);

      case "update_task":
      case "update_task_status":
      case "add_task_comment": {
        // Görevin hangi projede/departmanda olduğu girdide yok; tek satırlık bir
        // okuma ile bulunur. Model çağrısının yanında bu maliyet ihmal edilebilir.
        const scope = await this.getTaskOrThrow(input.taskId);
        const projectId = result?.projectId ?? scope.projectId;
        const label =
          toolName === "add_task_comment"
            ? "Göreve yorum eklendi"
            : toolName === "update_task_status"
              ? "Görev durumu değişti"
              : "Görev güncellendi";
        return projectId
          ? projectActivity(label, projectId, input.taskId)
          : departmentActivity(label, scope.departmentId, input.taskId);
      }

      // Modül kaydı. Modül sayfasının yolu departman ya da iş üzerinden geçiyor
      // (bkz. App.tsx /departments/:id/modules/:key, /jobs/:id/modules/:key);
      // ikisi de yoksa götürülecek bir sayfa yok, bildirim atlanır.
      case "create_module_record":
      case "update_module_record": {
        const moduleKey = input.moduleKey ?? result?.moduleKey;
        if (!moduleKey) return null;
        const label = toolName === "create_module_record" ? "Modüle kayıt eklendi" : "Modül kaydı güncellendi";
        // Güncellemede hedef girdide yok (yalnızca recordId var); kaydın
        // kendisinden okunuyor — bkz. update_task'taki aynı desen.
        let jobId = input.jobId as string | undefined;
        let departmentId = input.departmentId as string | undefined;
        if (!jobId && !departmentId && result?.id) {
          const record = await this.moduleRecordsService.findOne(result.id);
          jobId = record.jobId;
          departmentId = record.departmentId;
        }
        if (jobId) {
          return make(label, `/jobs/${jobId}/modules/${moduleKey}`, `job:${jobId}/module/${moduleKey}`, result?.id);
        }
        // Organizasyon kaydının departmanı yoksa götürülecek bir modül sayfası
        // yok: modül yolu departmandan geçiyor (bkz. App.tsx).
        if (departmentId) {
          return make(
            label,
            `/departments/${departmentId}/modules/${moduleKey}`,
            `department:${departmentId}/module/${moduleKey}`,
            result?.id
          );
        }
        return null;
      }

      case "set_period_plan":
      case "create_time_blocks":
      case "update_time_block_status":
      case "complete_ritual": {
        const label =
          toolName === "set_period_plan"
            ? "Dönem planı kaydedildi"
            : toolName === "create_time_blocks"
              ? "Takvime zaman bloğu eklendi"
              : toolName === "update_time_block_status"
                ? "Zaman bloğu güncellendi"
                : "Planlama oturumu tamamlandı";
        return make(label, "/calendar");
      }

      default:
        return null;
    }
  }

  /** Kullanıcıya gösterilen kredi sayısı: küsurat kimsenin işine yaramıyor. */
  private formatCredits(value: number): string {
    return Math.round(value).toLocaleString("tr-TR");
  }

  /** Sohbete not düşmek asıl işi bozmamalı; kayıt başarısız olursa yalnızca loglanır. */
  private async safeRecord(conversationId: string, text: string): Promise<void> {
    try {
      await this.conversationsService.addMessage(conversationId, "assistant", text);
    } catch (err: any) {
      this.logger.warn(`Mesaj sohbete kaydedilemedi: ${err?.message}`);
    }
  }

  private sweepExpiredRuns(): void {
    const now = Date.now();
    for (const [id, run] of this.pendingRuns) {
      if (now - run.createdAt > PENDING_RUN_TTL_MS) this.pendingRuns.delete(id);
    }
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

  /**
   * Kritik bir işlemi kullanıcının kararına göre sonuçlandırır ve İSTEĞİN GERİ
   * KALANINI sürdürür.
   *
   * Eskiden onay istendiğinde koşu bitiyordu: "eski görevleri sil, sonra şunları
   * ekle" dendiğinde silme onaylanıyor, ekleme hiç yapılmıyordu — kullanıcı işin
   * bittiğini sanıyor, aslında yarısı yapılmış oluyordu. Artık onay bir ara
   * duraktır: sonuç modele araç çıktısı olarak beslenir ve döngü kaldığı yerden
   * devam eder.
   */
  async confirmAction(actionId: string, userId: string, confirmed: boolean): Promise<ChatResult> {
    this.sweepExpiredActions();
    this.sweepExpiredRuns();

    const pending = this.pendingActions.get(actionId);
    if (!pending || pending.userId !== userId) {
      throw new NotFoundException("Onay bekleyen işlem bulunamadı ya da süresi doldu. Lütfen isteği tekrar yaz.");
    }
    this.pendingActions.delete(actionId);

    const run = this.pendingRuns.get(pending.runId);
    if (!run) {
      // Koşu düşmüş (süre doldu ya da sunucu yeniden başladı): en azından onaylanan
      // işlemi yap. İsteğin geri kalanı sürdürülemez, bu açıkça söylenir.
      return this.confirmWithoutRun(pending, confirmed);
    }
    this.pendingRuns.delete(pending.runId);

    // Devam etmek yeni turlar demek; bakiye yine önden denetlenir.
    const balance = await this.creditsService.assertCanStart(userId);
    run.startingBalance = balance;
    run.holds = [];

    const toolUses = (pending.assistantContent ?? []).filter((block: any) => block?.type === "tool_use");
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const use of toolUses) {
      if (use.id === pending.criticalUseId) {
        if (!confirmed) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content:
              "Kullanıcı bu işlemi ONAYLAMADI. Bu işlemi yapma ve tekrar deneme; " +
              "isteğin geri kalanına devam et ya da neyin eksik kaldığını söyle.",
          });
          continue;
        }
        try {
          const critical = await this.executeTool(
            pending.toolName,
            pending.input,
            pending.userId,
            pending.userRole
          );
          run.executed.push(pending.toolName);
          await this.emitActivity(pending.userId, pending.toolName, pending.input, critical);
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: RESULT_LABELS[pending.toolName] ?? "İşlem tamamlandı.",
          });
        } catch (err: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: `Hata: ${err?.message ?? "bilinmeyen hata"}`,
            is_error: true,
          });
        }
        continue;
      }

      // Aynı turda kritik olmayan başka araçlar da çağrılmış olabilir; onlar
      // onay beklerken bekletilmişti, şimdi çalıştırılır.
      try {
        const result = await this.executeTool(use.name, use.input ?? {}, run.userId, run.userRole);
        run.executed.push(use.name);
        await this.emitActivity(run.userId, use.name, use.input ?? {}, result);
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: this.serializeToolResult(result) });
      } catch (err: any) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: `Hata: ${err?.message ?? "bilinmeyen hata"}`,
          is_error: true,
        });
      }
    }

    run.messages.push({ role: "assistant", content: pending.assistantContent as any });
    run.messages.push({ role: "user", content: toolResults });

    return this.runWithHolds(run);
  }

  /** Koşu düşmüşse yalnızca onaylanan işlemi yapar; devam edilemediği söylenir. */
  private async confirmWithoutRun(pending: PendingAction, confirmed: boolean): Promise<ChatResult> {
    const record = async (text: string): Promise<ChatResult> => {
      await this.safeRecord(pending.conversationId, text);
      const { balance } = await this.creditsService.getBalance(pending.userId);
      return {
        type: "message",
        text,
        conversationId: pending.conversationId,
        usage: { creditsCharged: 0, balance },
        activeFiles: [],
      };
    };

    if (!confirmed) return record("İşlem iptal edildi.");

    try {
      await this.executeTool(pending.toolName, pending.input, pending.userId, pending.userRole);
      return record(
        `✅ ${RESULT_LABELS[pending.toolName] ?? "İşlem tamamlandı."} ` +
          "(Bu isteğin geri kalanına devam edemedim, süresi dolmuştu — kalan kısmı tekrar yazar mısın?)"
      );
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

  private async getTaskOrThrow(
    taskId: string
  ): Promise<{ id: string; projectId?: string; departmentId?: string; title: string }> {
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("id, project_id, department_id, title")
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Görev bulunamadı.");
    return {
      id: data.id,
      projectId: data.project_id ?? undefined,
      departmentId: data.department_id ?? undefined,
      title: data.title,
    };
  }

  /**
   * Bir görev üzerinde işlem yetkisi.
   *
   * Görev projeye YA DA departmana ait olabiliyor (bkz. Task.departmentId).
   * Yalnızca projeye bakan eski kontrol departman görevinde her zaman
   * "bu proje üzerinde yetkin yok" diyordu — yanlış hem sonuç hem cümle.
   *
   * `manage` = arşivleme/silme: projede proje sahibi, departmanda yönetici
   * (ya da organizasyon sahibi) demek.
   */
  private async requireTaskAccess(
    task: { projectId?: string; departmentId?: string },
    userId: string,
    userRole: string,
    manage = false
  ): Promise<void> {
    if (task.projectId) {
      const allowed: ProjectMembershipRole[] = manage ? ["owner"] : ["owner", "member", "subcontractor"];
      await this.requireProjectRole(task.projectId, userId, userRole, allowed);
      return;
    }
    if (task.departmentId) {
      if (userRole === "admin") return;
      const access = await this.departmentsService.getAccess(task.departmentId, userId);
      if (!access.canView || (manage && !access.canManage)) {
        throw new ForbiddenException("Bu departman görevi üzerinde bu işlemi yapma yetkin yok.");
      }
      return;
    }
    throw new BadRequestException("Görevin bağlı olduğu proje ya da departman bulunamadı.");
  }

  private async safeLabel(fn: () => Promise<string>): Promise<string> {
    try {
      return await fn();
    } catch {
      return "seçili öğe";
    }
  }

  private async summarizeAction(name: string, input: Record<string, any>, userId: string): Promise<string> {
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
      case "archive_output":
      case "delete_output": {
        const title = await this.safeLabel(async () => {
          // Çıktının adını göstermek için tek satırlık okuma; onay penceresinde
          // "şu çıktı silinecek" demek "bir çıktı silinecek"ten çok daha güvenli.
          const { data } = await this.supabase.client
            .from("outputs")
            .select("title")
            .eq("id", input.outputId)
            .maybeSingle();
          return (data?.title as string | undefined) ?? "";
        });
        return name === "delete_output"
          ? `"${title}" çıktısı silinecek. Onaylıyor musun?`
          : `"${title}" çıktısı arşivlenecek. Onaylıyor musun?`;
      }

      case "archive_todo": {
        // Başlık kullanıcının KENDİ kaydından okunuyor (findOne sahipliği
        // doğruluyor): başkasının kimliği verilse onay metninde o kaydın
        // başlığı görünürdü.
        const title = await this.safeLabel(() =>
          this.personalTodosService.findOne(userId, input.todoId).then((t) => t.title)
        );
        return `"${title}" yapılacağını listenden kaldırmak üzeresin. (Geri alınabilir.)`;
      }

      case "archive_module_record": {
        // Onay metninde kaydın KENDİSİ görünmeli: "bir kayıt arşivlenecek"
        // kullanıcıya neyi onayladığını söylemez.
        const label = await this.safeLabel(async () => {
          const record = await this.moduleRecordsService.findOne(input.recordId);
          const moduleName = await this.moduleDisplayName(record.moduleKey);
          const config = getModuleRecordConfig(record.moduleKey, moduleName);
          const summary = config.summary(record.data);
          return summary ? `${moduleName} · ${summary}` : moduleName;
        });
        return `"${label}" kaydını arşivlemek üzeresin. Listeden düşer, veritabanında kalır (geri alınabilir).`;
      }

      case "disable_module": {
        const label = await this.safeLabel(() => this.moduleDisplayName(input.moduleKey));
        return (
          `"${label}" modülünü kapatmak üzeresin. Kayıtlar silinmez ama modül ` +
          `${input.jobId ? "işin" : "organizasyonun"} ekranlarından kaldırılır.`
        );
      }

      case "archive_group":
      case "delete_group": {
        const label = await this.safeLabel(() => this.groupsService.findOne(input.groupId).then((g) => g.name));
        return name === "delete_group"
          ? `"${label}" grubunu KALICI olarak silmek üzeresin. Bu işlem geri alınamaz.`
          : `"${label}" grubunu arşivlemek üzeresin. Gruba bağlı organizasyonlar ve işler de arşivlenir.`;
      }

      case "archive_organization":
      case "delete_organization": {
        const label = await this.safeLabel(() =>
          this.organizationsService.findOne(input.organizationId).then((o) => o.name)
        );
        return name === "delete_organization"
          ? `"${label}" organizasyonunu KALICI olarak silmek üzeresin. Departmanları, ürünleri ve ` +
              "modül kayıtları da gider. Bu işlem geri alınamaz."
          : `"${label}" organizasyonunu arşivlemek üzeresin. Bağlı işler de (projeleri ve görevleriyle) arşivlenir.`;
      }

      case "archive_department":
      case "delete_department": {
        const label = await this.safeLabel(() =>
          this.departmentsService.findOne(input.departmentId).then((d) => d.name)
        );
        return name === "delete_department"
          ? `"${label}" departmanını KALICI olarak silmek üzeresin. Görevleri ve modül kayıtları da gider.`
          : `"${label}" departmanını arşivlemek üzeresin. Kayıtlar durur, departman ekranlardan kalkar.`;
      }

      case "archive_operation":
      case "delete_operation": {
        const label = await this.safeLabel(() =>
          this.operationsService.findOne(input.operationId).then((o) => o.title)
        );
        return name === "delete_operation"
          ? `"${label}" rutinini KALICI olarak silmek üzeresin. Tekrarları ve geçmişi de gider.`
          : `"${label}" rutinini arşivlemek üzeresin. (Geri alınabilir.)`;
      }

      case "archive_product":
      case "delete_product": {
        const label = await this.safeLabel(() => this.productsService.findOne(input.productId).then((p) => p.name));
        return name === "delete_product"
          ? `"${label}" ürününü KALICI olarak silmek üzeresin. Fotoğrafları da gider.`
          : `"${label}" ürününü arşivlemek üzeresin. (Geri alınabilir.)`;
      }

      case "create_support_request": {
        // Onay penceresinde MESAJIN KENDİSİ görünmeli: gönderildikten sonra
        // geri alınamıyor ve karşı tarafta bir insan okuyor.
        const mesaj = String(input.message ?? "");
        const kisa = mesaj.length > 300 ? `${mesaj.slice(0, 300)}…` : mesaj;
        return `Projelio ekibine destek talebi gönderilecek.\nKonu: ${input.subject}\nMesaj: ${kisa}`;
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

  /**
   * Kullanıcının erişebildiği görevlerde arama/filtreleme yapar.
   *
   * PROJE görevleri kadar DEPARTMAN görevlerini de tarar: görev iki kaptan
   * birinde yaşıyor (bkz. Task.departmentId) ve yalnızca projelere bakan bir
   * arama, Lio'nun az önce departmana açtığı görevi bir daha bulamamasına yol
   * açardı ("eklendi" dedikten sonra "böyle bir görev yok" demek).
   * projectId verildiyse arama tek projeye kilitlenir, departmanlar taranmaz.
   */
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

    const matches = (task: any): boolean => {
      if (input.query && !task.title?.toLowerCase().includes(String(input.query).toLowerCase())) return false;
      if (input.status && task.status !== input.status) return false;
      if (input.assignedToMe && task.assignedTo !== userId) return false;

      const deadline = task.deadline ? new Date(task.deadline) : null;
      if (input.overdue && !(deadline && deadline < now && task.status !== "completed")) return false;
      if (input.dueBefore && !(deadline && deadline <= new Date(input.dueBefore))) return false;
      if (input.dueAfter && !(deadline && deadline >= new Date(input.dueAfter))) return false;
      return true;
    };

    const collect = (task: any, scope: Record<string, unknown>) => {
      const deadline = task.deadline ? new Date(task.deadline) : null;
      collected.push(
        pruneEmpty({
          id: task.id,
          title: task.title,
          status: task.status,
          deadline: shortDate(task.deadline),
          assignee: task.assignedToName,
          ...scope,
          overdue: deadline && deadline < now && task.status !== "completed" ? true : undefined,
        })
      );
    };

    for (const project of projects) {
      if (collected.length >= limit) break;
      // findByProject taşeron görünürlük kurallarını zaten uyguluyor.
      const tasks = await this.tasksService.findByProject(project.id, userId);
      for (const task of tasks) {
        if (!matches(task)) continue;
        collect(task, { project: project.title, projectId: project.id });
        if (collected.length >= limit) break;
      }
    }

    if (!input.projectId && collected.length < limit) {
      const departments = await this.departmentsService.findAllForUser(userId);
      for (const department of departments) {
        if (collected.length >= limit) break;
        // Kadroda olmayan bir departman listeye zaten gelmez; yine de görevleri
        // okurken TasksService kendi denetimini yapıyor. Erişim reddi tüm aramayı
        // düşürmemeli: o departman atlanır, kalanlar taranmaya devam eder.
        let tasks: any[];
        try {
          tasks = await this.tasksService.findByDepartment(department.id, userId);
        } catch {
          continue;
        }
        for (const task of tasks) {
          if (!matches(task)) continue;
          collect(task, { department: department.name, departmentId: department.id });
          if (collected.length >= limit) break;
        }
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

    const say = (tasks: any[], scope: Record<string, unknown>) => {
      for (const task of tasks) {
        if (task.status === "completed") continue;
        const deadline = task.deadline ? new Date(task.deadline) : null;
        // Çoklu atama (bkz. migration 053): birincil olmayan atananlar da sayılır.
        const assignedToMe = task.assignees?.length
          ? task.assignees.some((a: any) => a.userId === userId)
          : task.assignedTo === userId;
        if (assignedToMe) assignedOpen++;
        if (deadline && deadline < now) {
          overdue++;
          if (overdueSamples.length < 8) {
            overdueSamples.push(
              pruneEmpty({
                id: task.id,
                title: task.title,
                deadline: shortDate(task.deadline),
                ...scope,
                assignee: task.assignedToName,
              })
            );
          }
        } else if (deadline && deadline <= weekLater) {
          dueThisWeek++;
        }
      }
    };

    for (const project of projects) {
      say(await this.tasksService.findByProject(project.id, userId), { project: project.title });
    }

    // Departman görevleri de özete girer: aksi halde kullanıcının işinin yarısı
    // ("muhasebede 6 geciken görev") özet tablosunda hiç görünmez ve Lio eksik
    // bir tabloya bakıp "gecikmen yok" der.
    const departments = await this.departmentsService.findAllForUser(userId);
    for (const department of departments) {
      try {
        say(await this.tasksService.findByDepartment(department.id, userId), { department: department.name });
      } catch {
        // Kadroda olmadığı için okunamayan departman özeti düşürmemeli.
        continue;
      }
    }

    // Kişisel pano da özete girer. Girmeseydi "bugün ne yapmalıyım" sorusu
    // kullanıcının kendi yazdığı yapılacakları hiç görmeden yanıtlanır ve
    // eksik bir tabloya bakıp "işin yok" demiş olurduk.
    const personal = await this.personalTodosService
      .getBoard(userId, { source: "personal" })
      .catch(() => []);
    const openTodos = personal.filter((t) => t.status !== "completed");
    const today = new Date().toISOString().slice(0, 10);

    return {
      projectCount: projects.length,
      activeProjectCount: projects.filter((p) => p.status === "active").length,
      departmentCount: departments.length,
      overdueTaskCount: overdue,
      dueThisWeekCount: dueThisWeek,
      assignedToMeOpenCount: assignedOpen,
      overdueSamples,
      personalTodoOpenCount: openTodos.length,
      // Bugüne ve geçmişe ait kişisel yapılacaklar; kullanıcı "bugün" derken
      // çoğu zaman bunları kastediyor.
      personalTodosDueToday: openTodos
        .filter((t) => t.effectiveDueDate && shortDate(t.effectiveDueDate)! <= today)
        .slice(0, 10)
        .map((t) => ({ itemId: t.itemId, title: t.title, dueDate: shortDate(t.effectiveDueDate) })),
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

      case "list_departments": {
        const departments = input.organizationId
          ? await this.departmentsService.findByOrganization(input.organizationId, userId)
          : await this.departmentsService.findAllForUser(userId);
        if (!departments.length) return [];
        // Organizasyon adı departman kaydında yok, yalnızca id var. Model "hangi
        // organizasyonun departmanı" bilgisini görmeli: kullanıcı çoğu zaman
        // departmanı organizasyon adıyla anıyor ("şirketteki muhasebe").
        const organizations = await this.organizationsService.findAllForUser(userId);
        const orgNames = new Map(organizations.map((o) => [o.id, o.name]));
        return departments.map((d) => ({
          id: d.id,
          name: d.name,
          organizationId: d.organizationId,
          organization: orgNames.get(d.organizationId),
          memberCount: d.memberCount,
        }));
      }

      case "list_department_members": {
        // Kadroyu görme yetkisi DepartmentMembersService içinde uygulanıyor:
        // yetkisi olmayan yalnızca kendini görür (bkz. canViewRoster).
        const members = await this.departmentMembersService.findByDepartment(input.departmentId, userId);
        return members
          .filter((m) => m.userId && m.status === "approved")
          .map((m) => ({
            userId: m.userId,
            name: m.fullName ?? m.username ?? m.email,
            role: m.role,
            title: m.title,
          }));
      }

      case "list_department_tasks": {
        await this.departmentsService.assertCanView(input.departmentId, userId);
        const tasks = await this.tasksService.findByDepartment(input.departmentId, userId);
        return tasks.map(compactTask);
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
          this.budgetService.findByProject(input.projectId, userId),
          this.projectsService.findOne(input.projectId, userId),
        ]);
        const [remainingMargin, expectedPayment] = await Promise.all([
          this.budgetService.calculateRemainingMargin(input.projectId, userId),
          this.budgetService.calculateExpectedPayment(input.projectId, userId),
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

      // --- Yapılacaklar sayfası (kişisel pano) ---------------------------
      // Yetki bu servisin İÇİNDE ve tek kural: kayıt istekte bulunanın olmalı.
      // Her çağrıda userId geçiliyor, hiçbir yerde gövdeden kimlik alınmıyor.
      case "get_todo_board": {
        const board = await this.personalTodosService.getBoard(userId, {
          source: input.source ?? "all",
          includeHidden: input.includeHidden === true,
          completedWithinDays: input.completedWithinDays,
        });
        // Modele kartın YALNIZCA karar için gereken alanları verilir; pano
        // kaydı kapak görseli, sıra numarası gibi arayüze ait alanlar da
        // taşıyor ve bunlar her turda token olarak ödenirdi.
        return board.map((item) => ({
          itemId: item.itemId,
          source: item.source,
          title: item.title,
          status: item.status,
          priority: item.priority,
          dueDate: shortDate(item.effectiveDueDate),
          dueTime: item.deadlineTime,
          isPinned: item.isPinned || undefined,
          isHidden: item.isHidden || undefined,
          personalNote: item.personalNote,
          project: item.projectTitle,
          // Atanan kartlarda kullanıcının kendine koyduğu tarih ile projedeki
          // gerçek teslim tarihi farklı olabilir; ikisini karıştırmasın.
          projectDeadline: shortDate(item.projectDeadline),
        }));
      }

      case "create_todo":
        return this.personalTodosService.create(userId, {
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          color: input.color,
          dueDate: input.dueDate,
          dueTime: input.dueTime,
          reminderLeadMinutes: input.reminderLeadMinutes,
        });

      case "create_todos": {
        const items: any[] = Array.isArray(input.todos) ? input.todos : [];
        if (!items.length) throw new BadRequestException("En az bir yapılacak gerekli.");
        // Sırayla ekleniyor: her kart kolonun sonuna gireceği için sıra
        // numarası bir öncekine bakıyor (bkz. PersonalTodosService.create).
        const created: any[] = [];
        for (const item of items) {
          created.push(await this.personalTodosService.create(userId, item));
        }
        return { created: created.length, todos: created.map((t) => ({ id: t.id, title: t.title })) };
      }

      case "update_todo":
        return this.personalTodosService.update(userId, input.todoId, {
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          color: input.color,
          dueDate: input.dueDate,
          dueTime: input.dueTime,
          reminderLeadMinutes: input.reminderLeadMinutes,
        });

      case "set_todo_status":
        return this.personalTodosService.setStatus(userId, {
          source: input.source,
          itemId: input.itemId,
          status: input.status,
        });

      case "update_assigned_todo_prefs":
        return this.personalTodosService.updateAssignedPrefs(userId, input.taskId, {
          personalNote: input.personalNote,
          personalDueDate: input.personalDueDate,
          isPinned: input.isPinned,
          isHidden: input.isHidden,
        });

      case "reorder_todos":
        return this.personalTodosService.reorder(userId, input.items ?? []);

      case "archive_todo":
        return this.personalTodosService.archive(userId, input.todoId);

      case "restore_todo":
        return this.personalTodosService.restore(userId, input.todoId);

      case "search_files": {
        // Aramanın kapsamı Lio'nun list_jobs'ta gördüğü işlerle AYNI olsun diye
        // iş listesi oradan alınıyor. Erişim ayrıca FilesService'te tekrar
        // denetlenir — bu liste bir kolaylık, yetki kaynağı değil.
        const jobs = await this.jobsService.findAllForUser(userId);
        return this.filesService.searchInJobs(
          jobs.map((j) => j.id),
          userId,
          { query: input.query, uploader: input.uploader, projectId: input.projectId, limit: input.limit }
        );
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
        const target = taskTarget(input);
        const data = {
          title: input.title,
          description: input.description,
          deadline: input.deadline,
          startDate: input.startDate,
          assignedTo: input.assignedTo,
          budget: input.budget,
          parentTaskId: input.parentTaskId,
          outputId: input.outputId,
        };
        if (target.departmentId) {
          // Yetki DEPARTMAN kadrosuna göre; TasksService.createForDepartment
          // kendi içinde denetliyor (org sahibi ya da onaylı kadro üyesi).
          return this.tasksService.createForDepartment(target.departmentId, data, userId);
        }
        await this.requireProjectRole(target.projectId!, userId, userRole, ["owner", "member", "subcontractor"]);
        return this.tasksService.create(target.projectId!, data, userId);
      }

      case "update_task": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireTaskAccess(task, userId, userRole);
        return this.tasksService.update(
          input.taskId,
          {
            // Boş dize "çıktıdan çıkar" demek; undefined ise alan hiç yazılmaz.
            ...(input.outputId !== undefined ? { outputId: input.outputId || null } : {}),
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
        await this.requireTaskAccess(task, userId, userRole);
        return this.tasksService.updateStatus(input.taskId, input.status, userId);
      }

      case "archive_task": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireTaskAccess(task, userId, userRole, true);
        return this.tasksService.archive(input.taskId);
      }

      case "delete_task": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireTaskAccess(task, userId, userRole, true);
        await this.tasksService.remove(input.taskId);
        return { success: true };
      }

      case "create_tasks": {
        const target = taskTarget(input);
        if (!target.departmentId) {
          await this.requireProjectRole(target.projectId!, userId, userRole, ["owner", "member", "subcontractor"]);
        }
        const items: any[] = Array.isArray(input.tasks) ? input.tasks : [];
        const created: unknown[] = [];
        const failed: unknown[] = [];
        for (const item of items) {
          try {
            const data = {
              title: item.title,
              description: item.description,
              deadline: item.deadline,
              startDate: item.startDate,
              assignedTo: item.assignedTo,
              budget: item.budget,
              parentTaskId: item.parentTaskId,
              outputId: item.outputId,
            };
            const task = target.departmentId
              ? await this.tasksService.createForDepartment(target.departmentId, data, userId)
              : await this.tasksService.create(target.projectId!, data, userId);
            created.push(compactTask(task));
          } catch (err: any) {
            failed.push({ title: item?.title, error: err?.message ?? "bilinmeyen hata" });
          }
        }
        return { createdCount: created.length, created, failed: failed.length ? failed : undefined };
      }

      // --- Çıktılar ---------------------------------------------------
      // Görünürlük projeden devralınıyor; okuma için üyelik yeterli, yazma
      // işlemleri OutputsService içinde ayrıca yetki denetiminden geçiyor.
      case "list_outputs": {
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        const outputs = await this.outputsService.findByProject(input.projectId);
        return outputs.map((output) =>
          pruneEmpty({ id: output.id, title: output.title, description: output.description })
        );
      }

      case "create_output":
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member"]);
        return this.outputsService.create(
          input.projectId,
          { title: input.title, description: input.description },
          userId
        );

      case "update_output":
        return this.outputsService.update(
          input.outputId,
          { title: input.title, description: input.description },
          userId
        );

      case "archive_output":
        return this.outputsService.archive(input.outputId, userId);

      case "delete_output":
        await this.outputsService.remove(input.outputId, userId);
        return { deleted: true };

      case "list_task_comments": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireProjectRole(task.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        const comments = await this.taskCommentsService.findByTask(input.taskId);
        return comments.map((c) => pruneEmpty({ author: c.authorName, body: c.body, createdAt: shortDate(c.createdAt) }));
      }

      case "add_task_comment": {
        const task = await this.getTaskOrThrow(input.taskId);
        await this.requireProjectRole(task.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
        const comment = await this.taskCommentsService.create(input.taskId, userId, input.body);
        return { success: true, author: comment.authorName };
      }

      case "get_notifications_summary": {
        const { notifications, unreadCount } = await this.notificationsService.findForUser(userId, 5);
        return {
          unreadCount,
          latest: notifications.map((n) => pruneEmpty({ title: n.title, read: n.read, createdAt: shortDate(n.createdAt) })),
        };
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

      // --- Takvim / kişisel planlama -------------------------------------
      //
      // Bu araçların hepsi PlanningService'e geçer; oradaki güvenlik notu
      // burada da geçerlidir: userId daima oturumdan gelir, hiçbir plan
      // kaydına başka bir kullanıcının id'siyle ulaşılamaz.

      case "get_plan_overview": {
        const progress = await this.planningService.getProgress(
          userId,
          input.kind ?? "week",
          input.date ?? new Date().toISOString().slice(0, 10)
        );
        // Modele yalnızca konuşurken işine yarayacak alanlar veriliyor:
        // ham satırların tamamı (blok sayıları, id'ler) token yakıyor,
        // cümle kurmaya katkısı olmuyor.
        return pruneEmpty({
          donem: `${progress.period.periodStart} → ${progress.period.periodEnd}`,
          tema: progress.period.theme,
          kapasiteSaat: round1(progress.capacityMinutes / 60),
          takvimeDusenSaat: round1(progress.plannedMinutes / 60),
          tamamlananSaat: round1(progress.doneMinutes / 60),
          doluluk: `%${progress.fillPct}`,
          planaSadakat: `%${progress.adherencePct}`,
          hedefYuzdeToplami: progress.sharePctTotal,
          alanlar: progress.rows.map((r) =>
            pruneEmpty({
              alan: r.focusAreaName ?? r.targetTitle ?? "(kategorisiz)",
              hedefYuzde: r.sharePct,
              gerceklesenYuzde: r.doneSharePct,
              takvimdeSaat: round1(r.plannedMinutes / 60),
              yapilanSaat: round1(r.doneMinutes / 60),
              adetHedefi: r.targetCount != null ? `${r.doneCount}/${r.targetCount} ${r.unit ?? ""}`.trim() : undefined,
            })
          ),
        });
      }

      case "list_focus_areas": {
        const areas = await this.planningService.listFocusAreas(userId);
        return areas.map((a) => ({ id: a.id, ad: a.name }));
      }

      case "set_period_plan": {
        const kind = input.kind ?? "week";
        const date = input.date ?? new Date().toISOString().slice(0, 10);
        const period = await this.planningService.ensurePeriod(userId, kind, date);

        if (input.theme !== undefined || input.capacityMinutes !== undefined) {
          await this.planningService.updatePeriod(userId, period.id, {
            theme: input.theme,
            capacityMinutes: input.capacityMinutes,
            // Plan yazıldığı anda dönem taslak olmaktan çıkar.
            status: "active",
          });
        }

        const incoming: any[] = Array.isArray(input.targets) ? input.targets : [];
        const targets = [];
        for (const t of incoming) {
          // Modelin önce alanı yaratıp sonra id'sini taşıması iki ek araç turu
          // demek; adı verip geçmesine izin veriyoruz (tur = kredi).
          const focusAreaId = t.focusAreaName
            ? await this.resolveFocusArea(userId, t.focusAreaName)
            : t.focusAreaId;
          targets.push({
            focusAreaId,
            title: focusAreaId ? undefined : t.title,
            sharePct: t.sharePct,
            targetMinutes: t.targetMinutes,
            targetCount: t.targetCount,
            unit: t.unit,
          });
        }

        const saved = incoming.length ? await this.planningService.setTargets(userId, period.id, targets) : [];
        return {
          donem: `${period.periodStart} → ${period.periodEnd}`,
          tema: input.theme ?? period.theme ?? null,
          hedefler: saved.map((t) =>
            pruneEmpty({
              alan: t.focusAreaName ?? t.title,
              yuzde: t.sharePct,
              adet: t.targetCount,
              birim: t.unit,
            })
          ),
        };
      }

      case "suggest_schedule": {
        const result = await this.planningService.suggestSchedule(
          userId,
          input.kind ?? "week",
          input.date ?? new Date().toISOString().slice(0, 10),
          { apply: input.apply === true, replaceExisting: input.replaceExisting === true }
        );
        return pruneEmpty({
          aralik: `${result.from} → ${result.to}`,
          uygulandi: result.applied,
          onerilenBlokSayisi: result.proposedCount,
          onerilenSaat: round1(result.proposedMinutes / 60),
          // Takvimde yer kalmadığı için karşılanamayan süre. Modelin bunu
          // kullanıcıya SÖYLEMESİ gerekiyor; sessizce yutulursa kullanıcı
          // hedefini kurduğunu sanır.
          yerlesemeyen: result.shortfall.length
            ? result.shortfall.map((s) => `${s.focusAreaName}: ${round1(s.minutes / 60)} saat`)
            : undefined,
        });
      }

      case "list_time_blocks": {
        const blocks = await this.planningService.listBlocks(userId, input.from, input.to);
        return blocks.map((b) =>
          pruneEmpty({
            id: b.id,
            tarih: b.blockDate,
            saat: `${b.startsAt}-${b.endsAt}`,
            baslik: b.title ?? b.linkedTitle,
            alan: b.focusAreaName,
            durum: b.status,
          })
        );
      }

      case "create_time_blocks": {
        const incoming: any[] = Array.isArray(input.blocks) ? input.blocks : [];
        const blocks = [];
        for (const b of incoming) {
          blocks.push({
            blockDate: b.blockDate,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            title: b.title,
            note: b.note,
            taskId: b.taskId,
            focusAreaId: b.focusAreaName ? await this.resolveFocusArea(userId, b.focusAreaName) : undefined,
            // Lio'nun koyduğu bloklar işaretlenir; kullanıcı "önerileri temizle"
            // dediğinde kendi elle koyduklarıyla karışmasınlar.
            source: "lio" as const,
          });
        }
        const created = await this.planningService.createBlocks(userId, blocks);
        return { eklenen: created.length };
      }

      case "update_time_block_status": {
        const block = await this.planningService.setBlockStatus(
          userId,
          input.blockId,
          input.status,
          input.actualMinutes
        );
        return { id: block.id, durum: block.status };
      }

      case "get_due_ritual": {
        const ritual = await this.planningService.getDueRitual(userId);
        if (!ritual) return { bekleyenRitual: null };
        return pruneEmpty({
          tur: ritual.kind,
          donem: ritual.periodStart,
          sorular: ritual.questions.map((q) => q.question),
          oncekiOzet: ritual.previousSummary,
        });
      }

      case "complete_ritual": {
        const ritual = await this.planningService.completeRitual(userId, {
          kind: input.kind,
          answers: input.answers,
          summary: input.summary,
          status: input.status,
        });
        return { tur: ritual.kind, tarih: ritual.occurredOn, durum: ritual.status };
      }

      // --- Modüller ---------------------------------------------------------
      //
      // Modül = departmanın (serbest çalışanda işin) defteri. Yetki kontrolleri
      // ilgili servislerin İÇİNDE duruyor ve her çağrıda userId geçiliyor:
      // Lio ayrı bir yol açmıyor, kullanıcının arayüzde geçtiği kapıdan geçiyor.

      case "list_modules":
        return this.listModulesForUser(userId, input);

      case "describe_module": {
        const moduleName = await this.moduleDisplayName(input.moduleKey);
        const described = describeModuleFields(input.moduleKey, moduleName);
        if (hasRecordConfig(input.moduleKey)) return described;
        // Kayıt defteri OLMAYAN modüller: türev panel (kendi verisi yok, başka
        // modülleri okur), ortak varlık (müşteri -> party), ürünler ve sosyal
        // medya kendi tablolarına yazar. Bunlara module_record yazmak, hiçbir
        // ekranda görünmeyen kayıt üretir — o yüzden alan listesi verilmiyor.
        return {
          moduleKey: input.moduleKey,
          kayitDefteriMi: false,
          not:
            "Bu modül bir kayıt defteri değil: kendi ekranı var ya da verisini başka modüllerden üretiyor. " +
            "Buraya kayıt EKLEYEMEZSİN. Kullanıcıyı modülün kendi sayfasına yönlendir.",
        };
      }

      case "list_module_records": {
        const limit = Math.min(Number(input.limit) || 25, 100);
        const records = input.jobId
          ? await this.moduleRecordsService.findByJob(
              await this.requireOwnJob(userId, input.jobId),
              input.moduleKey
            )
          : await this.moduleRecordsService.findByOrganization(
              await this.requireOwnOrganization(userId, input.organizationId),
              input.moduleKey,
              userId
            );
        return records.slice(0, limit).map((r) =>
          pruneEmpty({ id: r.id, olusturuldu: shortDate(r.createdAt), veri: r.data })
        );
      }

      case "create_module_record": {
        const moduleName = await this.moduleDisplayName(input.moduleKey);
        if (!hasRecordConfig(input.moduleKey)) {
          // Bkz. describe_module: bu modüller module_records kullanmıyor.
          throw new BadRequestException(
            `"${moduleName}" bir kayıt defteri değil; buraya kayıt eklenemez. ` +
              "Modülün kendi sayfasından girilmesi gerekiyor."
          );
        }
        const { data, warnings } = normalizeModuleData(input.moduleKey, moduleName, input.data, {
          requireMandatory: true,
        });
        const record = input.jobId
          ? await this.moduleRecordsService.createForJob(
              await this.requireOwnJob(userId, input.jobId),
              { moduleKey: input.moduleKey, data },
              userId
            )
          : await this.moduleRecordsService.create(
              await this.requireOwnOrganization(userId, input.organizationId),
              { moduleKey: input.moduleKey, departmentId: input.departmentId, data },
              userId
            );
        return pruneEmpty({
          id: record.id,
          moduleKey: record.moduleKey,
          veri: record.data,
          uyarilar: warnings.length ? warnings : undefined,
        });
      }

      case "update_module_record": {
        const existing = await this.moduleRecordsService.findOne(input.recordId);
        const moduleName = await this.moduleDisplayName(existing.moduleKey);
        if (!hasRecordConfig(existing.moduleKey)) {
          // Alan tanımı olmadan her anahtar "tanımsız" sayılır ve düşerdi:
          // güncelleme sessizce hiçbir şey yapmaz, model ise yaptı sanır.
          throw new BadRequestException(
            `"${moduleName}" bir kayıt defteri değil; kayıtları buradan düzenlenemez.`
          );
        }
        const { data: patch, warnings } = normalizeModuleData(existing.moduleKey, moduleName, input.data);
        // Kısmi güncelleme burada birleştiriliyor: servis `data`yı bütün olarak
        // değiştiriyor, ham gönderilse verilmeyen alanlar sessizce silinirdi.
        const record = await this.moduleRecordsService.update(
          input.recordId,
          { ...existing.data, ...patch },
          userId
        );
        return pruneEmpty({
          id: record.id,
          moduleKey: record.moduleKey,
          veri: record.data,
          uyarilar: warnings.length ? warnings : undefined,
        });
      }

      case "archive_module_record":
        await this.moduleRecordsService.remove(input.recordId, userId);
        return { success: true };

      case "enable_module": {
        // Katalogda olmayan bir anahtar organizasyon tarafında sessizce
        // eklenebiliyordu (job_modules doğruluyor, organization_modules değil).
        await this.moduleDisplayName(input.moduleKey);
        if (input.jobId) {
          const assigned = await this.jobModulesService.assign(
            await this.requireOwnJob(userId, input.jobId),
            input.moduleKey,
            userId
          );
          return { moduleKey: assigned.moduleKey, isKimligi: assigned.jobId };
        }
        const enabled = await this.organizationModulesService.enable(
          await this.requireOwnOrganization(userId, input.organizationId),
          input.moduleKey,
          userId
        );
        return { moduleKey: enabled.moduleKey, organizationId: enabled.organizationId };
      }

      case "disable_module": {
        if (input.jobId) {
          await this.jobModulesService.unassign(
            await this.requireOwnJob(userId, input.jobId),
            input.moduleKey,
            userId
          );
          return { success: true };
        }
        await this.organizationModulesService.disable(
          await this.requireOwnOrganization(userId, input.organizationId),
          input.moduleKey,
          userId
        );
        return { success: true };
      }

      // --- Tablodan toplu içe aktarma ---------------------------------------
      //
      // Satırlar sunucuda (bkz. AiAttachmentsService.sheets); model yalnızca
      // eşlemeyi yazar. 100 satırlık bir dosya 15 tur yerine 3 tur eder.

      case "read_sheet": {
        const sheet = this.requireSheet(userId, input);
        const ilk = Math.max(1, Number(input.ilkSatir) || 1);
        const son = Math.min(sheet.rows.length, Number(input.sonSatir) || ilk + 39, ilk + 39);
        return pruneEmpty({
          sayfa: sheet.name,
          toplamSatir: sheet.rows.length,
          satirlar: sheet.rows.slice(ilk - 1, son).map((row, i) => `${ilk + i}: ${row.join(" | ")}`),
          not:
            son < sheet.rows.length
              ? `${son + 1}. satırdan itibaren okunmadı. Kayıt açacaksan satırları okumana gerek yok.`
              : undefined,
        });
      }

      case "list_sheet_values": {
        const sheet = this.requireSheet(userId, input);
        const values = distinctValues(sheet, input.kolon, { basliksatiri: input.basliksatiri });
        return {
          sayfa: sheet.name,
          kolon: input.kolon,
          degerler: values.slice(0, 40),
          farkliDegerSayisi: values.length,
        };
      }

      case "import_tasks_from_sheet":
        return this.importTasksFromSheet(userId, userRole, input);

      case "import_module_records_from_sheet":
        return this.importModuleRecordsFromSheet(userId, input);

      // --- Gruplar / organizasyonlar / departmanlar -------------------------
      //
      // Kapsayıcı sırası: grup > organizasyon > departman. Yetki her serviste
      // SAHİPLİK üzerinden denetleniyor (assertOwner / assertOrgOwner) ve
      // userId her çağrıda geçiliyor — Lio kullanıcının kendi kapısından geçer.

      case "list_groups": {
        const groups = await this.groupsService.findAllForUser(userId);
        return groups.map((g) =>
          pruneEmpty({
            groupId: g.id,
            ad: g.name,
            aciklama: g.description,
            organizasyonSayisi: g.organizationCount,
            isSayisi: g.jobCount,
          })
        );
      }

      case "create_group": {
        const group = await this.groupsService.create(userId, {
          name: input.name,
          description: input.description,
        });
        return { groupId: group.id, ad: group.name };
      }

      case "update_group": {
        const group = await this.groupsService.update(
          input.groupId,
          { name: input.name, description: input.description },
          userId
        );
        return { groupId: group.id, ad: group.name };
      }

      case "archive_group":
        await this.groupsService.archive(input.groupId, userId);
        return { success: true };

      case "delete_group":
        await this.groupsService.remove(input.groupId, userId);
        return { success: true };

      case "list_organizations": {
        const orgs = await this.organizationsService.findAllForUser(userId);
        const filtered = input.groupId ? orgs.filter((o) => o.groupId === input.groupId) : orgs;
        return filtered.map((o) =>
          pruneEmpty({
            organizationId: o.id,
            ad: o.name,
            tur: o.orgType,
            grup: o.groupName,
            aciklama: o.description,
            isSayisi: o.jobCount,
          })
        );
      }

      case "create_organization": {
        const org = await this.organizationsService.create(userId, {
          name: input.name,
          description: input.description,
          orgType: input.orgType === "isletme" ? "isletme" : "sirket",
          groupId: input.groupId || undefined,
        });
        return { organizationId: org.id, ad: org.name, tur: org.orgType };
      }

      case "update_organization": {
        // Boş dize "gruptan çıkar" demek, undefined "dokunma". Şemada null
        // gönderilemediği için ayrım burada yapılıyor; servis null'ı
        // group_id = null'a çeviriyor (bkz. OrganizationsService.update).
        const patch: Record<string, unknown> = {
          name: input.name,
          description: input.description,
          orgType: input.orgType,
        };
        if (input.groupId !== undefined) patch.groupId = input.groupId || null;
        const org = await this.organizationsService.update(input.organizationId, patch as any, userId);
        return { organizationId: org.id, ad: org.name, tur: org.orgType, grup: org.groupName };
      }

      case "archive_organization":
        await this.organizationsService.archive(input.organizationId, userId);
        return { success: true };

      case "delete_organization":
        await this.organizationsService.remove(input.organizationId, userId);
        return { success: true };

      case "create_department": {
        const department = await this.departmentsService.create(
          input.organizationId,
          { name: input.name, description: input.description },
          userId
        );
        return { departmentId: department.id, ad: department.name };
      }

      case "update_department": {
        const department = await this.departmentsService.update(
          input.departmentId,
          { name: input.name, description: input.description },
          userId
        );
        return { departmentId: department.id, ad: department.name };
      }

      case "archive_department":
        await this.departmentsService.archive(input.departmentId, userId);
        return { success: true };

      case "delete_department":
        await this.departmentsService.remove(input.departmentId, userId);
        return { success: true };

      // --- Rutinler (operasyonlar) -----------------------------------------

      case "list_operations": {
        const operations = await this.operationsService.findAllForUser(userId);
        const filtered = input.jobId ? operations.filter((o) => o.jobId === input.jobId) : operations;
        return filtered.map((o) =>
          pruneEmpty({
            operationId: o.id,
            ad: o.title,
            isKimligi: o.jobId,
            durum: o.status,
            donemButcesi: o.budgetPerPeriod,
            donem: o.budgetPeriod,
            siradakiTarih: shortDate(o.nextDueOn),
            acikRutinSayisi: o.activeRoutineCount,
          })
        );
      }

      case "create_operation": {
        // Rutin bir işe bağlı doğuyor ve servis yalnızca ownerId'yi yazıyor;
        // işin kullanıcıya ait olduğunu burada doğruluyoruz.
        await this.requireOwnJob(userId, input.jobId);
        const operation = await this.operationsService.create(userId, {
          jobId: input.jobId,
          title: input.title,
          description: input.description,
          budgetPerPeriod: input.budgetPerPeriod,
          budgetPeriod: input.budgetPeriod,
          startedOn: input.startedOn,
        });
        return { operationId: operation.id, ad: operation.title, durum: operation.status };
      }

      case "update_operation": {
        const operation = await this.operationsService.update(
          input.operationId,
          {
            title: input.title,
            description: input.description,
            budgetPerPeriod: input.budgetPerPeriod,
            budgetPeriod: input.budgetPeriod,
            status: input.status,
            endedOn: input.endedOn,
          },
          userId
        );
        return { operationId: operation.id, ad: operation.title, durum: operation.status };
      }

      case "archive_operation":
        await this.operationsService.archive(input.operationId, userId);
        return { success: true };

      case "delete_operation":
        await this.operationsService.remove(input.operationId, userId);
        return { success: true };

      // --- Ürünler ----------------------------------------------------------
      //
      // ProductsService.findByOrganization yetki kontrolü YAPMIYOR (denetim
      // controller'da duruyor); kapı burada kuruluyor — bkz. requireOwnOrganization.

      case "list_products": {
        const organizationId = await this.requireOwnOrganization(userId, input.organizationId);
        const products = await this.productsService.findByOrganization(organizationId);
        const query = String(input.query ?? "").trim().toLocaleLowerCase("tr");
        const limit = Math.min(Number(input.limit) || 30, 100);
        return products
          .filter((p) =>
            query
              ? [p.name, p.sku, p.category, p.brand].some((field) =>
                  (field ?? "").toLocaleLowerCase("tr").includes(query)
                )
              : true
          )
          .slice(0, limit)
          .map((p) =>
            pruneEmpty({
              productId: p.id,
              ad: p.name,
              sku: p.sku,
              kategori: p.category,
              marka: p.brand,
              stok: p.stockQuantity,
              birim: p.unit,
              fiyat: p.price,
              paraBirimi: p.currency,
              durum: p.status,
            })
          );
      }

      case "create_product": {
        const organizationId = await this.requireOwnOrganization(userId, input.organizationId);
        const product = await this.productsService.create(organizationId, this.productPatch(input), userId);
        return { productId: product.id, ad: product.name };
      }

      case "update_product": {
        const product = await this.productsService.update(input.productId, this.productPatch(input), userId);
        return { productId: product.id, ad: product.name };
      }

      case "archive_product":
        await this.productsService.archive(input.productId, userId);
        return { success: true };

      case "delete_product":
        await this.productsService.remove(input.productId, userId);
        return { success: true };

      // --- Destek talepleri -------------------------------------------------

      case "list_support_requests": {
        const requests = await this.supportService.findMine(userId);
        return requests.map((r) =>
          pruneEmpty({
            konu: r.subject,
            durum: r.status === "answered" ? "yanıtlandı" : "açık",
            mesaj: r.message,
            yanit: r.reply,
            tarih: shortDate(r.createdAt),
          })
        );
      }

      case "create_support_request": {
        // Ad verilmediyse hesaptaki ad kullanılır: kullanıcıya kendi adını
        // sormak gereksiz, oturumda zaten duruyor.
        const created = await this.supportService.create(userId, {
          name: input.name?.trim() || (await this.userDisplayName(userId)),
          subject: input.subject,
          message: input.message,
        });
        return { konu: created.subject, durum: created.status };
      }

      // --- Dışa aktarma -----------------------------------------------------

      case "export_report":
        return this.exportReport(userId, userRole, input);

      // ============================================================ WhatsApp
      case "whatsapp_search_customers":
        return this.whatsappLio.searchCustomers(userId, String(input.query ?? ""));

      case "whatsapp_send_message":
        return this.whatsappLio.sendToCustomer(userId, {
          partyId: input.partyId,
          phone: input.phone,
          displayName: input.displayName,
          text: String(input.text ?? ""),
        });

      case "whatsapp_list_conversations":
        return this.whatsappLio.listConversations(userId);

      case "whatsapp_read_conversation":
        return this.whatsappLio.readConversation(userId, {
          threadId: input.threadId,
          partyId: input.partyId,
          phone: input.phone,
          limit: input.limit,
        });

      case "whatsapp_set_auto_reply":
        return this.whatsappLio.setAutoReply(userId, {
          threadId: input.threadId,
          partyId: input.partyId,
          phone: input.phone,
          enabled: Boolean(input.enabled),
        });

      default:
        throw new BadRequestException(`Bilinmeyen araç: ${name}`);
    }
  }

  // --- Tablodan toplu içe aktarmanın yardımcıları ---------------------------

  /**
   * Açık bir tablonun istenen sayfası.
   *
   * Sahiplik AiAttachmentsService'te doğrulanır. Dosya süresi dolmuşsa (sunucu
   * yeniden başlamış ya da iki saat geçmiş olabilir) modele ne yapacağı
   * söylenir: içeriği uydurmasın, kullanıcıdan dosyayı tekrar istesin.
   */
  private requireSheet(userId: string, input: Record<string, any>): SheetData {
    const sheets = this.attachmentsService.getSheets(userId, String(input.dosyaKimligi ?? ""));
    if (!sheets?.length) {
      throw new BadRequestException(
        "Bu kimlikte açık bir tablo yok. \"Şu an açık dosyalar\" listesindeki dosyaKimligi değerini kullan; " +
          "dosya listede yoksa kullanıcıdan tekrar göndermesini iste."
      );
    }
    if (!input.sayfa) return sheets[0];
    const wanted = normalizeKey(input.sayfa);
    const found = sheets.find((sheet) => normalizeKey(sheet.name) === wanted);
    if (!found) {
      throw new BadRequestException(
        `"${input.sayfa}" adlı sayfa yok. Sayfalar: ${sheets.map((s) => s.name).join(", ")}`
      );
    }
    return found;
  }

  /**
   * Tablodan toplu görev açar.
   *
   * İki modda çalışır: onizleme (hiçbir şey yazmaz, ne olacağını söyler) ve
   * uygulama. Önizleme kasıtlı olarak varsayılan: yüz satırlık bir dosyada
   * yanlış sütun eşlemesi, ancak kayıtlar açıldıktan sonra fark edilir.
   */
  private async importTasksFromSheet(
    userId: string,
    userRole: string,
    input: Record<string, any>
  ): Promise<unknown> {
    const sheet = this.requireSheet(userId, input);
    const plan = planTaskImport(sheet, {
      esleme: input.esleme ?? {},
      hedef: input.hedef ?? {},
      atananKurallari: input.atananKurallari,
      basliksatiri: input.basliksatiri,
      ilkSatir: input.ilkSatir,
      sonSatir: input.sonSatir,
    });

    // Tek çağrıda işlenecek satır tavanı; kalanı bir sonraki çağrıya devredilir.
    const islenecek = plan.planlanan.slice(0, MAX_IMPORT_ROWS);
    const kalanIlkSatir = plan.planlanan[MAX_IMPORT_ROWS]?.satir;

    const gruplar = new Map<
      string,
      { projectId?: string; departmentId?: string; hedefAdi: string; items: typeof islenecek }
    >();
    for (const task of islenecek) {
      const key = task.projectId ? `p:${task.projectId}` : `d:${task.departmentId}`;
      const mevcut = gruplar.get(key);
      if (mevcut) mevcut.items.push(task);
      else {
        gruplar.set(key, {
          projectId: task.projectId,
          departmentId: task.departmentId,
          hedefAdi: task.hedefAdi,
          items: [task],
        });
      }
    }

    // Yetki her hedef için BİR kez ve ÖNİZLEMEDE DE denetlenir: kullanıcıya
    // "99 görev açılacak" deyip sonra yetkiden dönmek en kötü sonuç olurdu.
    for (const grup of gruplar.values()) {
      if (grup.projectId) {
        await this.requireProjectRole(grup.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
      } else if (grup.departmentId) {
        await this.departmentsService.assertCanView(grup.departmentId, userId);
      }
    }

    const hedefler = [...gruplar.values()].map((g) => ({ hedef: g.hedefAdi, adet: g.items.length }));

    if (input.onizleme !== false) {
      return pruneEmpty({
        onizleme: true,
        okunanSatir: plan.toplamSatir,
        olusturulacak: islenecek.length,
        hedefler,
        atlanan: plan.atlanan.slice(0, 8),
        atlananToplam: plan.atlanan.length || undefined,
        uyarilar: plan.uyarilar.slice(0, 5),
        ornek: islenecek.slice(0, 3).map((t) => ({
          satir: t.satir,
          baslik: t.title,
          teslim: t.deadline,
          hedef: t.hedefAdi,
        })),
        kalanIlkSatir,
        not:
          "Hiçbir şey YAZILMADI. Özeti kullanıcıya göster, onay alınca aynı çağrıyı onizleme:false ile tekrarla. " +
          "Tarihi çözülemeyen görevler bugünün tarihiyle açılır; sorumlusu belirtilmeyenler kullanıcıya atanır.",
      });
    }

    let olusturulan = 0;
    const yazilanHedefler: { hedef: string; adet: number }[] = [];
    for (const grup of gruplar.values()) {
      const created = await this.tasksService.createMany(
        { projectId: grup.projectId, departmentId: grup.departmentId },
        grup.items.map((t) => ({
          title: t.title,
          description: t.description,
          deadline: t.deadline,
          startDate: t.startDate,
          budget: t.budget,
          assignedTo: t.assignedTo,
        })),
        userId
      );
      olusturulan += created.length;
      yazilanHedefler.push({ hedef: grup.hedefAdi, adet: created.length });
    }

    return pruneEmpty({
      olusturulan,
      hedefler: yazilanHedefler,
      atlanan: plan.atlanan.slice(0, 8),
      atlananToplam: plan.atlanan.length || undefined,
      uyarilar: plan.uyarilar.slice(0, 5),
      kalanIlkSatir,
      not: kalanIlkSatir
        ? `Satır tavanına gelindi. Kalanlar için aynı çağrıyı ilkSatir:${kalanIlkSatir} ile tekrarla.`
        : "Bitti. Kaç görev açıldığını ve atlanan satırları kullanıcıya SÖYLE.",
    });
  }

  /** Tablodan toplu modül kaydı açar; akış görev içe aktarmasıyla aynı. */
  private async importModuleRecordsFromSheet(userId: string, input: Record<string, any>): Promise<unknown> {
    const sheet = this.requireSheet(userId, input);
    const moduleName = await this.moduleDisplayName(input.moduleKey);
    if (!hasRecordConfig(input.moduleKey)) {
      throw new BadRequestException(
        `"${moduleName}" bir kayıt defteri değil; buraya toplu kayıt yazılamaz (bkz. describe_module).`
      );
    }

    const target = input.jobId
      ? { jobId: await this.requireOwnJob(userId, input.jobId), moduleKey: input.moduleKey }
      : {
          organizationId: await this.requireOwnOrganization(userId, input.organizationId),
          departmentId: input.departmentId,
          moduleKey: input.moduleKey,
        };

    const plan = planRecordImport(sheet, {
      esleme: input.esleme ?? {},
      basliksatiri: input.basliksatiri,
      ilkSatir: input.ilkSatir,
      sonSatir: input.sonSatir,
    });

    const islenecek = plan.planlanan.slice(0, MAX_IMPORT_ROWS);
    const kalanIlkSatir = plan.planlanan[MAX_IMPORT_ROWS]?.satir;

    // Her satır alan tanımından geçer: tanımda olmayan anahtar hiçbir ekranda
    // görünmez, zorunlu alanı eksik satır da kaydedilmemeli.
    const hazir: Record<string, unknown>[] = [];
    const atlanan = [...plan.atlanan];
    const uyarilar: { satir: number; sebep: string }[] = [];
    for (const row of islenecek) {
      try {
        const { data, warnings } = normalizeModuleData(input.moduleKey, moduleName, row.data, {
          requireMandatory: true,
        });
        if (Object.keys(data).length === 0) {
          atlanan.push({ satir: row.satir, sebep: "eşlenen alanların hiçbiri tanımda yok" });
          continue;
        }
        if (warnings.length) uyarilar.push({ satir: row.satir, sebep: warnings[0] });
        hazir.push(data);
      } catch (err: any) {
        atlanan.push({ satir: row.satir, sebep: err?.message ?? "kayıt doğrulanamadı" });
      }
    }

    if (input.onizleme !== false) {
      return pruneEmpty({
        onizleme: true,
        modul: moduleName,
        okunanSatir: plan.toplamSatir,
        olusturulacak: hazir.length,
        atlanan: atlanan.slice(0, 8),
        atlananToplam: atlanan.length || undefined,
        uyarilar: uyarilar.slice(0, 5),
        ornek: hazir.slice(0, 2),
        kalanIlkSatir,
        not: "Hiçbir şey YAZILMADI. Onay alınca aynı çağrıyı onizleme:false ile tekrarla.",
      });
    }

    const created = await this.moduleRecordsService.createMany(target, hazir, userId);
    return pruneEmpty({
      olusturulan: created.length,
      modul: moduleName,
      atlanan: atlanan.slice(0, 8),
      atlananToplam: atlanan.length || undefined,
      uyarilar: uyarilar.slice(0, 5),
      kalanIlkSatir,
      not: kalanIlkSatir
        ? `Satır tavanına gelindi. Kalanlar için ilkSatir:${kalanIlkSatir} ile tekrarla.`
        : "Bitti. Kaç kayıt yazıldığını ve atlananları kullanıcıya SÖYLE.",
    });
  }

  // --- Yeni alanların yardımcıları -----------------------------------------

  /** Ürün araçlarının ortak alan eşlemesi; verilmeyen alan dokunulmadan kalır. */
  private productPatch(input: Record<string, any>): ProductWriteInput {
    const patch: Record<string, unknown> = {};
    const fields = [
      "name",
      "description",
      "sku",
      "brand",
      "category",
      "unit",
      "stockQuantity",
      "price",
      "costPrice",
      "currency",
      "taxRate",
      "status",
      "notes",
    ];
    for (const field of fields) {
      if (input[field] !== undefined) patch[field] = input[field];
    }
    return patch as ProductWriteInput;
  }

  /** Ürünün organizasyonu — canlı bildirimin hedef sayfası için (bkz. describeActivity). */
  private async organizationIdOfProduct(productId?: string): Promise<string | undefined> {
    if (!productId) return undefined;
    try {
      const product = await this.productsService.findOne(productId);
      return product.organizationId;
    } catch {
      return undefined;
    }
  }

  /** Destek talebinde görünecek ad; kullanıcıya sormaya gerek yok. */
  private async userDisplayName(userId: string): Promise<string> {
    const { data } = await this.supabase.client
      .from("users")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    return (data?.full_name as string) || (data?.email as string) || "Projelio kullanıcısı";
  }

  // --- Dışa aktarma ---------------------------------------------------------

  /**
   * Rapor üretir: veriyi toplar, dosyaya çevirir, indirme bağlantısı ya da
   * dosya kitaplığındaki kayıt olarak döndürür.
   *
   * VERİYİ TOPLAMAK BURADA, dosyaya çevirmek AiExportsService'te. Böylece
   * raporun gördüğü şey Lio'nun list_* araçlarının gördüğüyle AYNI kapıdan
   * geçiyor: yetkisi olmayan bir projeyi listeleyemeyen kullanıcı onu dışa da
   * aktaramaz.
   */
  private async exportReport(
    userId: string,
    userRole: string,
    input: Record<string, any>
  ): Promise<unknown> {
    const format: ExportFormat = input.bicim === "csv" ? "csv" : "xlsx";
    const { table, defaultName, target } = await this.collectExportTable(userId, userRole, input);

    if (table.rows.length === 0) {
      throw new BadRequestException(
        "Dışa aktarılacak kayıt bulunamadı. Filtreleri gözden geçir ya da kullanıcıya söyle."
      );
    }

    const totalRows = table.rows.length;
    const built = await this.exportsService.build(userId, {
      fileName: input.dosyaAdi || defaultName,
      format,
      table,
    });
    // Kesilen satırı SÖYLEMEK zorunlu: eksik bir raporu kullanıcı ancak elle
    // sayarak fark eder (bkz. MAX_EXPORT_ROWS).
    const kesilen = totalRows > built.rowCount ? totalRows - built.rowCount : 0;

    if (input.hedef === "dosya_kitapligi") {
      const fileId = await this.uploadExportToLibrary(userId, built.id, target);
      return pruneEmpty({
        fileId,
        dosyaAdi: built.fileName,
        satirSayisi: built.rowCount,
        atlananSatir: kesilen || undefined,
        not: "Dosya kitaplığa yüklendi. Kullanıcıya `[dosya adı](projelio:file/<fileId>)` biçiminde ver.",
      });
    }

    return pruneEmpty({
      indirmeBaglantisi: `projelio:export/${built.id}`,
      dosyaAdi: built.fileName,
      satirSayisi: built.rowCount,
      atlananSatir: kesilen || undefined,
      gecerlilik: "30 dakika",
      not: "Bağlantıyı yanıtında `[dosya adı](projelio:export/<id>)` biçiminde yaz; kullanıcı tıklayınca dosya iner.",
    });
  }

  /** Üretilen raporu işin/projenin/departmanın dosyalarına yükler. */
  private async uploadExportToLibrary(
    userId: string,
    exportId: string,
    target: { projectId?: string; departmentId?: string; jobId?: string }
  ): Promise<string> {
    if (!target.projectId && !target.departmentId && !target.jobId) {
      throw new BadRequestException(
        "Bu veri kümesinin bağlı olduğu bir iş/proje/departman yok, dosya kitaplığına yüklenemez. " +
          "İndirme bağlantısı olarak ver."
      );
    }

    const stored = this.exportsService.take(exportId, userId);
    // FilesService multer dosyası bekliyor; ürettiğimiz tampon aynı biçime
    // sarılıyor (istek gövdesinden gelmediği için boyut/ad elimizde).
    const file = {
      originalname: stored.fileName,
      mimetype: stored.mimeType,
      buffer: stored.buffer,
      size: stored.buffer.length,
    } as Express.Multer.File;

    if (target.projectId) {
      const uploaded = await this.filesService.uploadInlineForProject(target.projectId, userId, file, {});
      return uploaded.id;
    }
    if (target.departmentId) {
      const uploaded = await this.filesService.uploadInlineForDepartment(target.departmentId, userId, file);
      return uploaded.id;
    }
    const uploaded = await this.filesService.uploadInline(target.jobId!, userId, file, {});
    return uploaded.id;
  }

  /**
   * Rapora girecek tabloyu hazırlar.
   *
   * Her veri kümesi kendi yetki kapısından geçer — list_* araçlarında ne
   * kullanılıyorsa aynısı.
   */
  private async collectExportTable(
    userId: string,
    userRole: string,
    input: Record<string, any>
  ): Promise<{
    table: ExportTable;
    defaultName: string;
    target: { projectId?: string; departmentId?: string; jobId?: string };
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const cell = (value: unknown): string | number | undefined => {
      if (value === undefined || value === null || value === "") return undefined;
      if (typeof value === "number") return value;
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    };

    switch (input.veri) {
      case "gorevler": {
        const durum: Record<string, string> = {
          todo: "Yapılacak",
          in_progress: "Yapılıyor",
          completed: "Tamamlandı",
        };
        let tasks;
        let baslik: string;
        if (input.projectId) {
          await this.requireProjectRole(input.projectId, userId, userRole, ["owner", "member", "subcontractor"]);
          const project = await this.projectsService.findOne(input.projectId);
          tasks = await this.tasksService.findByProject(input.projectId, userId);
          baslik = project.title;
        } else if (input.departmentId) {
          await this.departmentsService.assertCanView(input.departmentId, userId);
          const department = await this.departmentsService.findOne(input.departmentId);
          tasks = await this.tasksService.findByDepartment(input.departmentId, userId);
          baslik = department.name;
        } else {
          throw new BadRequestException("Görev raporu için projectId ya da departmentId vermelisin.");
        }

        return {
          defaultName: `gorevler-${baslik}-${today}`,
          target: { projectId: input.projectId, departmentId: input.departmentId },
          table: {
            title: "Görevler",
            headers: ["Başlık", "Durum", "Öncelik", "Başlangıç", "Teslim", "Atanan", "Bütçe", "Açıklama"],
            rows: tasks.map((t: any) => [
              cell(t.title),
              durum[t.status] ?? t.status,
              cell(t.priority),
              shortDate(t.startDate),
              shortDate(t.deadline),
              cell(t.assignedToName),
              cell(t.budget),
              cell(t.description),
            ]),
          },
        };
      }

      case "butce": {
        if (!input.projectId) throw new BadRequestException("Bütçe raporu için projectId gerekli.");
        // Bütçeyi yalnızca proje sahibi görebiliyor (bkz. list_budget_transactions).
        await this.requireProjectRole(input.projectId, userId, userRole, ["owner"]);
        const [project, transactions] = await Promise.all([
          this.projectsService.findOne(input.projectId),
          this.budgetService.findByProject(input.projectId, userId),
        ]);
        const tur: Record<string, string> = { income: "Gelir", expense: "Gider", payout: "Ödeme" };
        return {
          defaultName: `butce-${project.title}-${today}`,
          target: { projectId: input.projectId },
          table: {
            title: "Bütçe hareketleri",
            headers: ["Tarih", "Tür", "Tutar", "Açıklama"],
            rows: transactions.map((t: any) => [
              shortDate(t.occurredAt),
              tur[t.type] ?? t.type,
              cell(t.amount),
              cell(t.description),
            ]),
          },
        };
      }

      case "modul_kayitlari": {
        const moduleName = await this.moduleDisplayName(input.moduleKey);
        if (!hasRecordConfig(input.moduleKey)) {
          throw new BadRequestException(
            `"${moduleName}" bir kayıt defteri değil; dışa aktarılacak kaydı yok (bkz. describe_module).`
          );
        }
        const config = getModuleRecordConfig(input.moduleKey, moduleName);
        const records = input.jobId
          ? await this.moduleRecordsService.findByJob(await this.requireOwnJob(userId, input.jobId), input.moduleKey)
          : await this.moduleRecordsService.findByOrganization(
              await this.requireOwnOrganization(userId, input.organizationId),
              input.moduleKey,
              userId
            );

        return {
          defaultName: `${moduleName}-${today}`,
          target: { jobId: input.jobId },
          table: {
            title: moduleName,
            headers: ["Oluşturuldu", ...config.fields.map((f) => f.label)],
            rows: records.map((r: any) => [
              shortDate(r.createdAt),
              ...config.fields.map((f) => cell(r.data?.[f.key])),
            ]),
          },
        };
      }

      case "urunler": {
        const organizationId = await this.requireOwnOrganization(userId, input.organizationId);
        const products = await this.productsService.findByOrganization(organizationId);
        return {
          defaultName: `urunler-${today}`,
          target: {},
          table: {
            title: "Ürünler",
            headers: [
              "Ad",
              "Stok kodu",
              "Kategori",
              "Marka",
              "Birim",
              "Stok",
              "Fiyat",
              "Para birimi",
              "Maliyet",
              "KDV %",
              "Durum",
              "Notlar",
            ],
            rows: products.map((p: any) => [
              cell(p.name),
              cell(p.sku),
              cell(p.category),
              cell(p.brand),
              cell(p.unit),
              cell(p.stockQuantity),
              cell(p.price),
              cell(p.currency),
              cell(p.costPrice),
              cell(p.taxRate),
              p.status === "inactive" ? "Pasif" : "Aktif",
              cell(p.notes),
            ]),
          },
        };
      }

      case "yapilacaklar": {
        const board = await this.personalTodosService.getBoard(userId, { source: "all", includeHidden: false });
        const durum: Record<string, string> = {
          todo: "Yapılacak",
          in_progress: "Yapılıyor",
          completed: "Tamamlandı",
        };
        return {
          defaultName: `yapilacaklar-${today}`,
          target: {},
          table: {
            title: "Yapılacaklar",
            headers: ["Başlık", "Kaynak", "Durum", "Teslim", "Saat", "Proje", "Kişisel not"],
            rows: board.map((item: any) => [
              cell(item.title),
              item.source === "assigned" ? "Atanmış görev" : "Kişisel",
              durum[item.status] ?? item.status,
              shortDate(item.effectiveDueDate),
              cell(item.deadlineTime),
              cell(item.projectTitle),
              cell(item.personalNote),
            ]),
          },
        };
      }

      case "projeler": {
        if (!input.jobId) throw new BadRequestException("Proje raporu için jobId gerekli.");
        const jobId = await this.requireOwnJob(userId, input.jobId);
        const job = await this.jobsService.findOne(jobId);
        const projects = (await this.projectsService.findAllForUser(userId)).filter((p) => p.jobId === jobId);
        return {
          defaultName: `projeler-${job.title}-${today}`,
          target: { jobId },
          table: {
            title: "Projeler",
            headers: ["Proje", "Durum", "Bütçe", "Başlangıç", "Teslim", "Açıklama"],
            rows: projects.map((p: any) => [
              cell(p.title),
              cell(p.status),
              cell(p.totalBudget),
              shortDate(p.startDate),
              shortDate(p.deadline),
              cell(p.description),
            ]),
          },
        };
      }

      default:
        throw new BadRequestException(`Bilinmeyen veri kümesi: ${input.veri}`);
    }
  }

  // --- Modül araçlarının yardımcıları --------------------------------------

  /**
   * Modülün katalogdaki adı. Aynı zamanda anahtarın GERÇEK olduğunu doğrular:
   * model anahtar uydurursa kayıt açılmadan burada durur.
   */
  private async moduleDisplayName(moduleKey: string): Promise<string> {
    if (!moduleKey) throw new BadRequestException("moduleKey gerekli");
    const modules = await this.catalogService.findModules();
    const found = modules.find((m) => m.key === moduleKey);
    if (!found) throw new BadRequestException(`Bilinmeyen modül: ${moduleKey}`);
    return found.name;
  }

  /**
   * Organizasyon erişimi. Modül servislerinin bir kısmı (findByJob,
   * organizationModuleStats) yetkiyi kendisi kontrol etmiyor — denetim
   * controller'da duruyordu. Lio controller'dan geçmediği için kapıyı burada
   * kuruyoruz: kullanıcının erişebildiği organizasyonlar dışına çıkılamaz.
   */
  private async requireOwnOrganization(userId: string, organizationId?: string): Promise<string> {
    if (!organizationId) {
      throw new BadRequestException("organizationId ya da jobId vermelisin (list_modules ile bulabilirsin).");
    }
    const orgs = await this.organizationsService.findAllForUser(userId);
    if (!orgs.some((o) => o.id === organizationId)) {
      throw new ForbiddenException("Bu organizasyona erişimin yok.");
    }
    return organizationId;
  }

  /** İş erişimi — bkz. requireOwnOrganization. */
  private async requireOwnJob(userId: string, jobId: string): Promise<string> {
    const jobs = await this.jobsService.findAllForUser(userId);
    if (!jobs.some((j) => j.id === jobId)) throw new ForbiddenException("Bu işe erişimin yok.");
    return jobId;
  }

  /**
   * "Nerede hangi modül var" tablosu. Modelin modül işlerine buradan başlaması
   * bekleniyor: organizationId/jobId ve moduleKey değerlerinin tek kaynağı bu.
   */
  private async listModulesForUser(userId: string, input: Record<string, any>): Promise<unknown> {
    const wantAvailable = input.includeAvailable === true;
    const catalog = await this.catalogService.findModules();
    const nameOf = (key: string) => catalog.find((m) => m.key === key)?.name ?? key;

    if (input.jobId) {
      const jobId = await this.requireOwnJob(userId, input.jobId);
      const assigned = await this.jobModulesService.findByJob(jobId);
      return pruneEmpty({
        isKimligi: jobId,
        acikModuller: assigned.map((m) => ({ moduleKey: m.moduleKey, ad: nameOf(m.moduleKey) })),
        acilabilirModuller: wantAvailable
          ? catalog
              .filter((m) => m.appliesToFreelancer && !assigned.some((a) => a.moduleKey === m.key))
              .map((m) => ({ moduleKey: m.key, ad: m.name }))
          : undefined,
      });
    }

    const orgs = await this.organizationsService.findAllForUser(userId);
    const targets = input.organizationId ? orgs.filter((o) => o.id === input.organizationId) : orgs;
    if (input.organizationId && targets.length === 0) {
      throw new ForbiddenException("Bu organizasyona erişimin yok.");
    }

    const organizasyonlar = [];
    for (const org of targets) {
      const stats = await this.moduleRecordsService.organizationModuleStats(org.id, userId);
      organizasyonlar.push(
        pruneEmpty({
          organizationId: org.id,
          ad: org.name,
          acikModuller: stats.modules.map((m) =>
            pruneEmpty({
              moduleKey: m.moduleKey,
              ad: m.moduleName,
              kayitSayisi: m.recordCount,
              sonHareket: shortDate(m.lastActivityAt),
              banaAtanmis: m.assignedToMe || undefined,
            })
          ),
          acilabilirModuller: wantAvailable
            ? catalog
                .filter((m) => !stats.modules.some((s) => s.moduleKey === m.key))
                .map((m) => ({ moduleKey: m.key, ad: m.name }))
            : undefined,
        })
      );
    }

    // Organizasyon süzgeci varsa serbest çalışan tarafı istenmiyordur.
    const jobStats = input.organizationId
      ? { modules: [] }
      : await this.moduleRecordsService.myJobModuleStats(userId);

    return pruneEmpty({
      organizasyonlar: organizasyonlar.length ? organizasyonlar : undefined,
      isModulleri: jobStats.modules.length
        ? jobStats.modules.map((m) =>
            pruneEmpty({
              moduleKey: m.moduleKey,
              ad: m.moduleName,
              isKimligi: m.jobId,
              kayitSayisi: m.recordCount,
            })
          )
        : undefined,
    });
  }

  /**
   * Odak alanını adından bulur, yoksa oluşturur.
   *
   * Modelin "önce alanı yarat, id'sini al, sonra hedefi yaz" diye üç tura
   * yayılması hem yavaş hem pahalı. Ad eşleşmesi büyük/küçük harf ve baştaki
   * sondaki boşluklara duyarsız — kullanıcı bir hafta "Yazılım", ertesi hafta
   * "yazılım" derse aynı alan kullanılır, veri ikiye bölünmez.
   */
  private async resolveFocusArea(userId: string, name: string): Promise<string | undefined> {
    const wanted = name?.trim();
    if (!wanted) return undefined;

    const areas = await this.planningService.listFocusAreas(userId);
    const match = areas.find((a) => a.name.trim().toLocaleLowerCase("tr") === wanted.toLocaleLowerCase("tr"));
    if (match) return match.id;

    const created = await this.planningService.createFocusArea(userId, { name: wanted });
    return created.id;
  }
}
