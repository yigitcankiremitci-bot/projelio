// Veritabanı şemasıyla birebir eşleşen paylaşılan tipler

export type UserRole = "admin" | "freelancer";

// Kullanıcının hiyerarşideki hangi seviyeyi yönettiğini belirler; navigasyonda hangi
// panellerin/isimlendirmenin gösterileceğine bu karar verir. Sonradan yükseltilebilir
// (freelancer -> organization_owner -> group_owner), signup'ta sabitlenmez.
export type AccountType = "freelancer" | "organization_owner" | "group_owner";

// Kullanıcı kendi unvanını yazmadıysa (User.title boşsa) profilinde hesap tipine göre
// bu varsayılan unvan gösterilir. Kullanıcı ayarlardan kendi metnini girerse o öncelikli
// olur; alanı tekrar boşaltırsa otomatik unvana geri dönülür.
export const DEFAULT_TITLE_BY_ACCOUNT_TYPE: Record<AccountType, string> = {
  freelancer: "Serbest Çalışan",
  organization_owner: "Organizasyon Sahibi",
  group_owner: "Grup Sahibi",
};

export function resolveUserTitle(user: { title?: string; accountType?: AccountType }): string {
  const custom = user.title?.trim();
  if (custom) return custom;
  return DEFAULT_TITLE_BY_ACCOUNT_TYPE[user.accountType ?? "freelancer"];
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  username: string;
  role: UserRole;
  accountType: AccountType;
  createdAt: string;
  // Kullanıcının o an "üzerinde çalışıyorum" diyerek işaretlediği görev (varsa).
  activeTaskId?: string;
  // Null ise kullanıcı henüz ilk giriş onboarding sihirbazını tamamlamadı demektir.
  onboardingCompletedAt?: string;
  // Anasayfadaki kişi kartında gösterilen profil alanları — hepsi opsiyonel.
  avatarUrl?: string;
  // Kullanıcının kendi profilinde gösterdiği görev/unvan (örn. "Serbest Grafik Tasarımcı").
  title?: string;
  bio?: string;
}

export interface Job {
  id: string;
  ownerId: string;
  ownerName?: string;
  // İş isteğe bağlı olarak bir Organization YA DA bir Group'a bağlanabilir (ikisi
  // birden değil). Hiçbiri set edilmemişse iş freelancer modunda kalır — bugünkü
  // varsayılan davranış. Bu bağlantı altındaki tüm projelere otomatik yansır.
  organizationId?: string;
  organizationName?: string;
  groupId?: string;
  groupName?: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
  // İşteki gerçek (arşivlenmemiş) proje sayısı — anasayfadaki gösterge için
  // sunucu tarafında hesaplanır (kullanıcının görebildiği projelerle sınırlı değildir).
  projectCount?: number;
}

// Holding katmanı. Tamamen opsiyonel — bir Grup birden çok Organization'a ve/veya
// doğrudan İş'e sahip olabilir. Hiyerarşi: Grup -> Organizasyon -> İş -> Proje -> Görev.
export interface Group {
  id: string;
  ownerId?: string;
  ownerName?: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
  organizationCount?: number;
  // Gruba bir Organizasyon üzerinden değil, doğrudan bağlı İş sayısı.
  jobCount?: number;
}

// Şirket/Marka katmanı. Bir Group'a bağlı olabilir ya da tek başına durabilir.
export interface Organization {
  id: string;
  groupId?: string;
  groupName?: string;
  ownerId?: string;
  ownerName?: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
  // Bu organizasyona bağlı İş sayısı.
  jobCount?: number;
}

export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  jobId: string;
  ownerId: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  totalBudget: number;
  startDate: string;
  deadline: string;
  status: ProjectStatus;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
}

// --- Program (kodda "operation") ---------------------------------------------
// Proje geçicidir ve biter; program süreklidir ve tekrarlayan işlerden oluşur.
// (PMBOK ayrımıyla: project vs. operations.) İkisi de bir "iş" (job) altında yaşar.
// Bu yüzden programda deadline, toplam bütçe ve "tamamlandı" durumu yoktur;
// yerine dönemsel bütçe, duraklatma ve uyum oranı vardır.

export type OperationStatus = "active" | "paused" | "ended";
export type OperationBudgetPeriod = "weekly" | "monthly" | "yearly";
export type OperationHealth = "healthy" | "at_risk" | "failing" | "idle";

export interface Operation {
  id: string;
  jobId: string;
  ownerId: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  status: OperationStatus;
  startedOn: string;
  endedOn?: string;
  // Programın dönemsel çalışma maliyeti. Sonu olmayan bir işte "toplam bütçe"
  // tanımsız olduğu için projedeki totalBudget'ın karşılığı değildir.
  budgetPerPeriod: number;
  budgetPeriod: OperationBudgetPeriod;
  timezone: string;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
  // Sunucu tarafında operation_health view'ından eklenir (liste ekranları için).
  activeRoutineCount?: number;
  dueCount?: number;
  doneCount?: number;
  missedCount?: number;
  upcomingCount?: number;
  adherencePct?: number;
  nextDueOn?: string;
  health?: OperationHealth;
}

export type RoutineFreq = "daily" | "weekly" | "monthly" | "yearly";

// Rutin, programın tekrar kuralıdır — görevin kendisi değil, görev şablonu.
// Alanlar RFC 5545 (iCalendar RRULE) semantiğine göre adlandırılmıştır.
export interface OperationRoutine {
  id: string;
  operationId: string;
  title: string;
  description?: string;
  defaultAssignee?: string;
  defaultAssigneeName?: string;

  freq: RoutineFreq;
  intervalN: number;
  // 0 = Pazar … 6 = Cumartesi
  byWeekday?: number[];
  // 1..31; -1 = ayın son günü
  byMonthDay?: number[];
  // byWeekday ile birlikte: "ayın 2. Salısı" (yalnız aylık tekrarlarda)
  bySetPos?: number;
  // 1..12 (yıllık tekrarlarda)
  byMonth?: number[];

  startsOn: string;
  endsOn?: string;
  maxOccurrences?: number;

  dueTime: string;
  // Görev, vade tarihinden kaç gün önce açılsın
  leadDays: number;
  // Vadeden kaç gün sonra "kaçırıldı" sayılsın
  graceDays: number;
  generateAheadDays: number;
  budget: number;

  active: boolean;
  sortOrder?: number;
  archivedAt?: string;
  lastMaterializedOn?: string;
  createdAt: string;

  // operation_routine_stats view'ından
  dueCount?: number;
  doneCount?: number;
  skippedCount?: number;
  missedCount?: number;
  upcomingCount?: number;
  adherencePct?: number;
  adherence90dPct?: number;
  currentStreak?: number;
  nextDueOn?: string;
  lastDoneOn?: string;
}

// Rutinden üretilmiş somut tekrar. Veritabanında tasks satırıdır, ancak
// projeye ait görevlerle karışmaması için ayrı bir tip olarak taşınır.
export interface OperationOccurrence {
  id: string;
  operationId: string;
  routineId: string;
  routineTitle?: string;
  occurrenceOn: string;
  title: string;
  description?: string;
  assignedTo?: string;
  assignedToName?: string;
  deadline: string;
  status: TaskStatus;
  budget?: number;
  budgetStatus: TaskBudgetStatus;
  completedAt?: string;
  completedBy?: string;
  skippedAt?: string;
  createdAt: string;
}

export type MemberRole = "owner" | "member" | "subcontractor";
export type MemberStatus = "pending" | "approved" | "rejected";

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: MemberRole;
  // Proje yöneticisinin serbest metinle belirlediği görev/unvan (örn. "Elektrik taşeronu").
  // Yetkilendirme "role" alanına göre çalışır; "title" sadece görüntüleme amaçlıdır.
  title?: string;
  status: MemberStatus;
  customAgreedRate?: number;
  canViewBudget: boolean;
  joinedAt: string;
  fullName?: string;
  email?: string;
  username?: string;
}

export interface JobMember {
  id: string;
  jobId: string;
  userId: string;
  // İşe alan kişinin serbest metinle belirlediği görev/unvan (örn. "Grafik tasarımcı").
  title?: string;
  joinedAt: string;
  fullName?: string;
  email?: string;
  username?: string;
  // Bu kişinin o an "üzerinde çalışıyorum" diyerek işaretlediği görev (varsa).
  activeTaskId?: string;
}

export interface Output {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
}

export type TaskStatus = "todo" | "in_progress" | "completed";
export type TaskBudgetStatus = "pending" | "planned" | "paid";

export interface Task {
  id: string;
  projectId: string;
  outputId?: string;
  assignedTo?: string;
  // Atanan kişinin görünen adı (sunucu tarafında users tablosundan eklenir);
  // görev kartlarında kimin ilgilendiği herkes tarafından görülebilsin diye.
  assignedToName?: string;
  title: string;
  // Görev kartlarına eklenebilen serbest açıklama metni.
  description?: string;
  startDate?: string;
  deadline: string;
  status: TaskStatus;
  parentTaskId?: string;
  budget?: number;
  budgetStatus: TaskBudgetStatus;
  weekNumber?: number;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
  // Görev "tamamlandı" durumuna geçtiğinde doldurulur; tekrar geri alınırsa temizlenir.
  completedAt?: string;
  completedBy?: string;
  completedByName?: string;
  // Görevin bağlı olduğu projenin başlığı (arşivlenmiş projeler dahil, sunucu tarafında eklenir).
  projectTitle?: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ProjectPost {
  id: string;
  projectId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
}

export type BudgetTransactionType = "income" | "expense" | "payout";

export interface BudgetTransaction {
  id: string;
  // Projeye bağlı olmayan (genel işletme gideri gibi) kayıtlarda boştur.
  projectId?: string;
  projectTitle?: string;
  // Kaydın ait olduğu defterin sahibi.
  ownerId?: string;
  userId?: string;
  type: BudgetTransactionType;
  amount: number;
  description?: string;
  // İşlemin gerçekleştiği tarih (createdAt kayıt anıdır).
  occurredAt: string;
  // Otomatik olarak bir düzenli ödemeden üretildiyse onun kimliği.
  recurringPaymentId?: string;
  createdAt: string;
}

export type RecurrenceInterval = "weekly" | "monthly" | "yearly";

// Kira, abonelik, düzenli hakediş gibi tekrar eden ödemeler. Vadesi geldiğinde
// sunucudaki günlük görev otomatik olarak bir BudgetTransaction üretir, sonraki
// vadeyi ilerletir ve kullanıcıya bildirim gönderir.
export interface RecurringPayment {
  id: string;
  ownerId: string;
  projectId?: string;
  projectTitle?: string;
  type: "income" | "expense";
  amount: number;
  description?: string;
  interval: RecurrenceInterval;
  nextDueDate: string;
  // Ayın kaçında tekrarlandığı. Şubat gibi kısa aylarda vade öne çekilse de sonraki
  // ayda asıl güne dönülebilmesi için saklanır.
  anchorDay?: number;
  // Vadeden kaç gün önce ön-uyarı bildirimi gönderilecek.
  reminderDaysBefore: number;
  active: boolean;
  lastRunAt?: string;
  createdAt: string;
}

// Anasayfa bütçe sekmesindeki proje kırılımı.
//
// Kavram haritası (serbest çalışan bakış açısı):
//   agreedFee  — projenin anlaşılan toplam ücreti; müşteriden tahsil edilecek para.
//   received   — bugüne kadar fiilen tahsil edilen tutar (gelir hareketlerinin toplamı).
//   expected   — henüz tahsil edilmemiş kalan alacak = max(0, agreedFee - received).
//   overpaid   — anlaşılan ücretten fazla tahsilat yapıldıysa aşan kısım.
//   expense    — bu proje için yapılan harcamalar (taşeron ödemesi, malzeme…).
//   netEarned  — eldeki net = received - expense.
//
// ÖNEMLİ: received, agreedFee'nin ÜZERİNE EKLENMEZ. Tahsil edilen para zaten
// anlaşılan ücretin bir parçasıdır; eklemek aynı parayı iki kez saymak olur.
export interface ProjectBudgetSummary {
  projectId: string;
  projectTitle: string;
  agreedFee: number;
  received: number;
  expected: number;
  overpaid: number;
  expense: number;
  netEarned: number;
  // Tahsilatın tamamlanıp tamamlanmadığı (received >= agreedFee).
  fullyCollected: boolean;
}

export interface BudgetOverview {
  // Tüm projelerin anlaşılan ücret toplamı.
  totalAgreedFee: number;
  // Tahsil edilen toplam (projeye bağlı olmayan genel gelirler dahil).
  totalReceived: number;
  // Kalan alacak toplamı.
  totalExpected: number;
  totalExpense: number;
  // Eldeki net = totalReceived - totalExpense.
  netEarned: number;
  // Projeye bağlı olmayan genel kayıtların toplamları.
  generalIncome: number;
  generalExpense: number;
  projects: ProjectBudgetSummary[];
}

export interface NotificationPayload {
  id: string;
  userId: string;
  type:
    | "task_due_24h"
    | "task_due_1h"
    | "project_deadline_24h"
    | "team_invite"
    | "role_updated"
    | "budget_changed"
    | "recurring_payment_due"
    | "recurring_payment_reminder"
    | "join_request"
    | "task_assigned"
    | "task_updated"
    | "member_joined"
    | "daily_digest"
    | "weekly_digest"
    | "post_mention"
    | "post_comment"
    | "post_like"
    | "comment_like";
  title: string;
  body: string;
  link?: string;
  createdAt: string;
  read: boolean;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface ArchivedJobEntry {
  id: string;
  title: string;
  archivedAt: string;
}

export interface ArchivedProjectEntry {
  id: string;
  title: string;
  archivedAt: string;
  jobId: string;
  jobTitle: string;
}

export interface ArchivedTaskEntry {
  id: string;
  title: string;
  archivedAt: string;
  isSubtask: boolean;
  projectId: string;
  projectTitle: string;
  jobId: string;
  jobTitle: string;
  parentTaskId?: string;
  parentTaskTitle?: string;
}

export interface ArchivedOutputEntry {
  id: string;
  title: string;
  archivedAt: string;
  projectId: string;
  projectTitle: string;
  jobId: string;
  jobTitle: string;
}

export interface ArchiveSummary {
  jobs: ArchivedJobEntry[];
  projects: ArchivedProjectEntry[];
  tasks: ArchivedTaskEntry[];
  outputs: ArchivedOutputEntry[];
}

// ============================================================ Dosyalar (Drive)

export interface ProjectFile {
  id: string;
  /** Dosya her zaman bir İŞE aittir. */
  jobId: string;
  /** Organizasyon/grup listelerinde dosyanın hangi işten geldiğini göstermek için. */
  jobTitle?: string;
  /** Boşsa dosya işin geneline aittir; doluysa o projeye iliştirilmiştir. */
  projectId?: string;
  taskId?: string;
  outputId?: string;
  uploadedBy: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  driveFileId: string;
  webViewLink?: string;
  iconLink?: string;
  /** Google Dokümanlar/E-Tablolar/Sunular: ikili içeriği yoktur, dışa aktarılır. */
  isGoogleDoc: boolean;
  /** missing: dosya Drive'da bulunamadı (kullanıcı silmiş/taşımış olabilir). */
  status: "pending" | "ready" | "missing";
  createdAt: string;
  /** Bu kullanıcının Drive klasörüne izni var mı — düzenle düğmesi buna bakar. */
  canEditInDrive: boolean;
}

export interface GoogleDriveStatus {
  /** Sunucuda Google istemci kimlikleri tanımlı mı? */
  configured: boolean;
  connected: boolean;
  email?: string;
  pictureUrl?: string;
  driveReady: boolean;
  /** Bağlıydı ama erişim koptu: kullanıcı yeniden bağlanmalı. */
  needsReconnect: boolean;
  quota?: {
    limitBytes?: number;
    usageBytes?: number;
    usageInDriveBytes?: number;
  };
}

export interface FileUploadSession {
  sessionId: string;
  uploadUrl: string;
}
