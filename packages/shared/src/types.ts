// Veritabanı şemasıyla birebir eşleşen paylaşılan tipler

export type UserRole = "admin" | "freelancer";

// Kullanıcının hiyerarşideki hangi seviyeyi yönettiğini belirler; navigasyonda hangi
// panellerin/isimlendirmenin gösterileceğine bu karar verir. Sonradan yükseltilebilir
// (freelancer -> organization_owner -> group_owner), signup'ta sabitlenmez.
// employee/subcontractor: bir organizasyona bağlı olarak çalışacağını baştan bilen
// kullanıcılar için (davet bekleyen "kadro" pozisyonuyla sonradan eşleşirler,
// bkz. DepartmentMember). Bu ikisi kendi organizasyonunu kurmaz.
export type AccountType = "freelancer" | "organization_owner" | "group_owner" | "employee" | "subcontractor";

// Kullanıcı kendi unvanını yazmadıysa (User.title boşsa) profilinde hesap tipine göre
// bu varsayılan unvan gösterilir. Kullanıcı ayarlardan kendi metnini girerse o öncelikli
// olur; alanı tekrar boşaltırsa otomatik unvana geri dönülür.
export const DEFAULT_TITLE_BY_ACCOUNT_TYPE: Record<AccountType, string> = {
  freelancer: "Serbest Çalışan",
  organization_owner: "Organizasyon Sahibi",
  group_owner: "Grup Sahibi",
  employee: "Çalışan",
  subcontractor: "Taşeron",
};

// Organizasyonun ölçeği. Aynı şema, ölçek farkı — sihirbazda kullanıcı seçer.
export type OrgType = "sirket" | "isletme";
export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  sirket: "Şirket",
  isletme: "İşletme",
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
  // Null ise kullanıcı e-posta adresini henüz doğrulamamıştır ve giriş yapamaz
  // (bkz. 044_email_verification.sql). Google ile açılan hesaplarda kayıt anında dolar.
  emailVerifiedAt?: string;
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
  // sirket = büyük ölçekli, isletme = küçük ölçekli. Aynı şema, ölçek farkı.
  orgType: OrgType;
  createdAt: string;
  archivedAt?: string;
  sortOrder?: number;
  // Bu organizasyona bağlı İş sayısı.
  jobCount?: number;
}

// ============================================================ Departmanlar / Kadro

// ISO 9001 uyumlu standart departman tanımı (referans/sabit veri).
export interface DepartmentCatalogEntry {
  key: string;
  name: string;
  description?: string;
  mainTaskAreas?: string;
  sortOrder: number;
}

export type ModuleScope = "organization" | "holding";

// Departman/holding bazlı modül-araç kataloğu (referans/sabit veri).
export interface ModuleCatalogEntry {
  key: string;
  departmentKey?: string;
  name: string;
  description?: string;
  scope: ModuleScope;
  // true ise serbest çalışan panelindeki "Modüller" sekmesinde de listelenir.
  appliesToFreelancer: boolean;
  sortOrder: number;
}

// Bir organizasyonun kurulum sihirbazında seçtiği/oluşturduğu departman.
export interface Department {
  id: string;
  organizationId: string;
  catalogKey?: string;
  name: string;
  description?: string;
  // Kullanıcının özel olarak yüklediği kapak fotoğrafı. Boşsa (kaldırıldıysa
  // veya hiç yüklenmediyse), istemci catalogKey'e göre 10 standart departmanın
  // varsayılan kapak fotoğrafına döner (bkz. apps/web DEFAULT_DEPARTMENT_COVERS).
  coverImageUrl?: string;
  sortOrder: number;
  // Departman sayfası açıldığında öntanımlı gelecek sekme. Organizasyon sahibi
  // departman ayarlarından değiştirebilir; boşsa "tasks" (Görevler) varsayılır.
  defaultTab?: string;
  createdAt: string;
  archivedAt?: string;
  // Sunucu tarafında eklenir: bu departmandaki (removed hariç) kadro sayısı.
  memberCount?: number;
}

// Ürün Yönetimi departmanından eklenen ürün/hizmet. Şirket anasayfasında
// (OrganizationDetail "Ürünler" sekmesi) iş kartlarıyla aynı görünümde listelenir.
export interface Product {
  id: string;
  organizationId: string;
  departmentId?: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  price?: number;
  currency?: string;
  sortOrder: number;
  createdAt: string;
  archivedAt?: string;
}

export type DepartmentMemberRole = "manager" | "employee" | "subcontractor";
export type DepartmentMemberStatus = "invited" | "pending" | "approved" | "rejected" | "removed";

// "Kadro": bir departmana bağlı kişi + rolü + pozisyon adı. userId boşsa henüz hesap
// açmamış, davet bekleyen bir pozisyondur (inviteEmail ile tanımlanır).
export interface DepartmentMember {
  id: string;
  departmentId: string;
  userId?: string;
  inviteEmail?: string;
  role: DepartmentMemberRole;
  title?: string;
  reportsTo?: string;
  status: DepartmentMemberStatus;
  // İşten çıkarılan/departmandan ayrılan kişinin, yöneticinin izin verdiği belgeleri
  // görebileceği son tarih. Boşsa sınırsız/geçerli erişim.
  accessUntil?: string;
  invitedBy?: string;
  joinedAt: string;
  fullName?: string;
  email?: string;
  username?: string;
}

// Kurulum sihirbazında organizasyonun etkinleştirdiği modül.
export interface OrganizationModule {
  id: string;
  organizationId: string;
  moduleKey: string;
  createdAt: string;
}

// Serbest çalışanın "Modüller" sekmesinden bir işe atadığı modül.
export interface JobModule {
  id: string;
  jobId: string;
  moduleKey: string;
  createdAt: string;
}

// ============================================================ Modül ekibi

// Roller department_members ile bilinçli olarak aynı: kullanıcı iki farklı yerde
// iki farklı rol sözlüğü öğrenmek zorunda kalmasın.
//   manager        — modül ayarlarını ve ekibini yönetir
//   employee       — kayıt ekler/düzenler
//   subcontractor  — dış kaynak; kayıt ekler/düzenler ancak ekibi göremez
export type ModuleMemberRole = DepartmentMemberRole;
export type ModuleMemberStatus = "invited" | "pending" | "approved" | "removed";

// Bir modüle atanan kişi. Atananlar o modülde kayıt oluşturup düzenleyebilir —
// bu tablo olmadan yalnızca organizasyon sahibi ve departman yöneticisi
// yazabiliyordu (bkz. database/migrations/042_module_members.sql).
export interface ModuleMember {
  id: string;
  // module_records ile aynı desen: kayıt ya organizasyona ya İŞ'e aittir.
  organizationId?: string;
  jobId?: string;
  // Aynı modül birden fazla departmanda etkin olabilir; atamanın hangi
  // departman bağlamında yapıldığını belirtir. Serbest çalışanda boş.
  departmentId?: string;
  moduleKey: string;
  userId?: string;
  inviteEmail?: string;
  role: ModuleMemberRole;
  status: ModuleMemberStatus;
  assignedBy?: string;
  createdAt: string;
  removedAt?: string;
  fullName?: string;
  email?: string;
  username?: string;
  avatarUrl?: string;
}

// Kullanıcının bir modüldeki etkin yetkisi. Modül panelini render ederken
// hangi eylemlerin gösterileceğini belirler.
export interface ModuleAccess {
  moduleKey: string;
  canRead: boolean;
  canWrite: boolean;
  canManageTeam: boolean;
  // Yetkinin nereden geldiği — arayüzde "organizasyon sahibi olduğunuz için
  // görüyorsunuz" gibi açıklamalar için.
  reason: "owner" | "department_manager" | "module_member" | "department_member" | "none";
  role?: ModuleMemberRole;
}

// ============================================================ Ortak varlık: party
//
// Dış dünyadaki kişi ve kurumların TEK kaydı. Modül veriyi sahiplenmez; ortak
// bir varlığa açılan penceredir. Bu yüzden Satış ve Müşteri İlişkileri aynı
// müşteriye bakar, ayrı kayıt tutmaz.
// Bkz. database/migrations/046_party_and_customer_merge.sql ve
//      docs/moduller/03-ortak-varlik-party.md
//
// DİKKAT: Partner (yukarıdaki, hisse ortağı) ve Party farklı şeylerdir.
//   users   → Projelio hesabı olan ekip üyesi
//   Partner → şirkete HİSSE ile ortak olan kişi (iç kavram)
//   Party   → şirketin DIŞINDAKİ kişi/kurum

// Rol bir alandır, tablo değil: aynı firma hem müşteri hem tedarikçi olabilir.
// Rol EKLENİR, silinmez — ilk fatura kesilince lead üzerine customer eklenir.
export type PartyRole = "lead" | "customer" | "supplier" | "candidate" | "distributor" | "other";
export type PartyType = "person" | "company";
export type PartyStatus = "active" | "passive" | "blocked";

export interface PartyAddress {
  country?: string;
  city?: string;
  district?: string;
  line?: string;
  postalCode?: string;
}

export interface Party {
  id: string;
  // module_records ile aynı desen: ya organizasyona ya İŞ'e ait.
  organizationId?: string;
  jobId?: string;

  partyType: PartyType;
  displayName: string;
  legalName?: string;

  taxNumber?: string;
  taxOffice?: string;

  email?: string;
  phone?: string;
  website?: string;
  address?: PartyAddress;

  roles: PartyRole[];
  status: PartyStatus;
  source?: string;

  ownerUserId?: string;
  parentPartyId?: string;
  linkedUserId?: string;
  /** Yinelenen kayıt birleştirildiyse hedef kaydın id'si. */
  mergedIntoId?: string;

  /** Organizasyona özel ek alanlar. */
  data: Record<string, unknown>;
  notes?: string;

  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;

  // Sunucuda hesaplanan, yazılamayan alanlar.
  ownerName?: string;
  contactCount?: number;
  lastActivityAt?: string;
}

/** Kurumdaki kişi. B2B'de firma bir, muhatap birden fazladır. */
export interface PartyContact {
  id: string;
  partyId: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
  notes?: string;
  createdAt: string;
  archivedAt?: string;
}

export type PartyActivityType = "not" | "arama" | "toplanti" | "eposta" | "teklif" | "ziyaret" | "sistem";

/**
 * Temas geçmişi. Manuel notların yanı sıra diğer modüller de yazar
 * (related_type/related_id) — müşteri kartı tek akışta fatura, talep ve
 * fırsatı birlikte gösterir.
 */
export interface PartyActivity {
  id: string;
  partyId: string;
  type: PartyActivityType;
  occurredAt: string;
  summary: string;
  userId?: string;
  relatedType?: string;
  relatedId?: string;
  createdAt: string;
  userName?: string;
}

/** Kayıt eklenirken/güncellenirken tespit edilen olası yinelenen kayıt. */
export interface PartyDuplicate {
  party: Party;
  /** block: kayıt açılmaz (vergi no). warn: kullanıcıya sorulur. */
  severity: "block" | "warn";
  reason: "tax_number" | "email" | "name";
}

// ============================================================ Ortaklar (hisse)

export type PartnerStatus = "invited" | "pending" | "approved" | "rejected" | "removed";

// Holding/şirket/işletmeye hisse yüzdesiyle ortak olan kişi.
export interface Partner {
  id: string;
  groupId?: string;
  organizationId?: string;
  userId?: string;
  inviteEmail?: string;
  equityPercent: number;
  grantedBy?: string;
  status: PartnerStatus;
  createdAt: string;
  fullName?: string;
  email?: string;
  username?: string;
}

// Ortağı ekleyen kişinin, ortağa görünür kıldığı modül/bölüm.
export interface PartnerModuleGrant {
  id: string;
  partnerId: string;
  moduleKey: string;
  createdAt: string;
}

// Tam özellikli hale getirilen bir modülün (Gelir-Gider, Fatura, Müşteri, İşe
// Alım vb.) tek bir kaydı. Alanlar modüle göre değiştiği için serbest biçimli
// (data) tutulur — frontend'deki moduleRecordConfigs.ts bu alanları tanımlar.
export interface ModuleRecord {
  id: string;
  // Bir kayıt ya bir organizasyona (şirket/işletme modülleri) ya da bir İŞ'e
  // (serbest çalışanın anasayfadan attığı modüller) aittir — ikisi birden değil.
  // Bkz. database/migrations/037_freelancer_modules.sql module_records_owner_chk.
  organizationId?: string;
  jobId?: string;
  departmentId?: string;
  moduleKey: string;
  data: Record<string, unknown>;
  createdAt: string;
  archivedAt?: string;

  // ---- A1 (Form / Doküman) arketipi ----
  // Yürürlükteki metin daima `data`'dadır. `draftData` onaylanmamış
  // değişikliklerdir: kaydedilir ama okuma görünümünde gösterilmez; boş ise
  // bekleyen değişiklik yoktur. Bkz. docs/moduller/20-motor-a1-form.md
  draftData?: Record<string, unknown>;
  // "Kapsam başına tek kayıt" kuralında kapsamı adresler (ör. products.id).
  // Boş = organizasyon/iş kapsamı.
  scopeRef?: string;
  updatedAt?: string;
}

/**
 * A1 modüllerinde yürürlükten DÜŞEN metin.
 *
 * Yürürlükteki metin her zaman ModuleRecord.data'dadır; burada yalnızca geçmiş
 * durur. Böylece okuma yolu tek sorgu kalır, sürüm geçmişi istendiğinde açılır.
 */
export interface ModuleRecordVersion {
  id: string;
  recordId: string;
  data: Record<string, unknown>;
  approvedBy?: string;
  approvedAt: string;
  note?: string;
}

/**
 * Bir modülün kullanım göstergeleri — sekme yerleşiminin girdisi.
 *
 * Tıklama günlüğü tutulmuyor: kayıt hareketi kullanımın daha dürüst
 * göstergesi, çünkü insan baktığı yeri değil çalıştığı yeri doldurur.
 * Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §4
 */
export interface ModuleUsageStat {
  moduleKey: string;
  moduleName: string;
  recordCount: number;
  lastActivityAt?: string;
  enabledAt?: string;
  assignedToMe: boolean;
  /** Serbest çalışan tarafında modülün açılacağı iş. */
  jobId?: string;
}

export interface ModuleStatsResponse {
  /** Şirket büyüklüğü — kaç modül sekmesi gösterileceğini belirler. */
  size: { userCount: number; departmentCount: number };
  modules: ModuleUsageStat[];
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
  // Bir çıktı ya bir projeye ya bir departmana aittir (ikisi birden değil).
  projectId?: string;
  departmentId?: string;
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
  // Bir görev projeye, programa (operation) ya da departmana ait olabilir.
  projectId?: string;
  departmentId?: string;
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
  /** Öncelik yıldızı 0-5. Görevin özelliğidir, ekibin tamamına görünür. */
  priority: TaskPriority;
  parentTaskId?: string;
  budget?: number;
  budgetStatus: TaskBudgetStatus;
  weekNumber?: number;
  // Görevi yapacak kişinin bildirdiği tahmini iş süresi (opsiyonel). Deadline "ne
  // zamana kadar bitmeli"yi, bu "ne kadar sürer"i tutar — ikisi bağımsızdır.
  estimatedDurationValue?: number;
  estimatedDurationUnit?: "hours" | "days";
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
  // Bir paylaşım proje/departman/organizasyondan tam olarak birine aittir (aynı anda birden fazlasına değil).
  projectId?: string;
  departmentId?: string;
  organizationId?: string;
  // Yalnızca organizasyon akışında (bkz. şirket anasayfası "Sosyal" sekmesi) anlamlıdır: paylaşım
  // organizasyona bağlı bir departmandan (findByOrganization ile toplanan) geliyorsa o
  // departmanın adı burada döner; organizasyona doğrudan yapılmış bir paylaşımsa boştur.
  sourceDepartmentName?: string;
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
  // Departman bütçesine ait kayıtlarda dolu, diğerlerinde boştur.
  departmentId?: string;
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
  /** Dosya ya bir İŞE ya bir DEPARTMANA aittir (ikisinden tam biri dolu). */
  jobId?: string;
  /** Organizasyon/grup listelerinde dosyanın hangi işten geldiğini göstermek için. */
  jobTitle?: string;
  departmentId?: string;
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
  /** Dosyanın gerçek içeriği hangi bulut sağlayıcısında: Google Drive ya da OneDrive. */
  storageProvider: "google" | "microsoft";
  /** missing: dosya Drive'da/OneDrive'da bulunamadı (kullanıcı silmiş/taşımış olabilir). */
  status: "pending" | "ready" | "missing";
  createdAt: string;
  /** Bu kullanıcının Drive/OneDrive klasörüne izni var mı — düzenle düğmesi buna bakar. */
  canEditInDrive: boolean;
}

/** Google Drive VE OneDrive bağlantı kartlarının paylaştığı durum şekli. */
export interface GoogleDriveStatus {
  /** Sunucuda Google istemci kimlikleri tanımlı mı? */
  configured: boolean;
  connected: boolean;
  email?: string;
  pictureUrl?: string;
  driveReady: boolean;
  /** Bağlıydı ama erişim koptu: kullanıcı yeniden bağlanmalı. */
  needsReconnect: boolean;
  /**
   * Depolama sağlayıcısı yalnızca biri olabilir: kullanıcı diğer sağlayıcıyı
   * (Google Drive ya da OneDrive) zaten bağlamışsa bu true döner ve bu
   * sağlayıcı, önce diğeri kaldırılmadan bağlanamaz.
   */
  lockedByOtherProvider?: boolean;
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

// ---------------------------------------------------------------- Yapılacaklar
// Kişisel kanban panosu. İki tür kart barındırır:
//  - "personal": kullanıcının kendi eklediği, hiçbir işe/projeye bağlı olmayan
//    görevler. Bunları kullanıcıdan başkası GÖREMEZ.
//  - "assigned": kullanıcıya atanmış gerçek proje/program/departman görevleri.
//    Görevin kendisi projede herkese açıktır; buradaki kişisel not, kişisel
//    tarih, sıralama ve gizleme yalnızca kullanıcıya aittir.

/**
 * Öncelik yıldızı: 0 = belirtilmemiş, 1 en düşük … 5 en yüksek.
 * Hem gerçek görevler (Task) hem kişisel yapılacaklar aynı ölçeği kullanır.
 */
export type TaskPriority = 0 | 1 | 2 | 3 | 4 | 5;

export const MAX_TASK_PRIORITY = 5;
export type PersonalBoardSource = "personal" | "assigned";

export interface PersonalTodo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Kullanıcının karta verdiği opsiyonel etiket rengi (#RRGGBB). */
  color?: string;
  dueDate?: string;
  sortOrder: number;
  completedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Atanan bir görevin, kullanıcının kişisel panosundaki katmanı. Buradaki hiçbir
 * alan proje tarafına yansımaz — görevin kendisi (tasks tablosu) değişmez.
 */
export interface PersonalTaskPrefs {
  taskId: string;
  sortOrder: number;
  /** Yalnızca kullanıcıya görünür not. Görev yorumlarından tamamen ayrıdır. */
  personalNote?: string;
  /** Kullanıcının kendine koyduğu iç hedef; görevin gerçek deadline'ı değişmez. */
  personalDueDate?: string;
  isPinned: boolean;
  /** Kart kullanıcının panosundan gizlendi; görev projede aynen duruyor. */
  isHidden: boolean;
}

/** Panodaki tek bir kart — kaynağı ne olursa olsun aynı şekli taşır. */
export interface PersonalBoardItem {
  itemId: string;
  source: PersonalBoardSource;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  color?: string;
  /** Gösterilecek tarih: kişisel tarih varsa o, yoksa görevin deadline'ı. */
  effectiveDueDate?: string;
  /** Yalnızca "assigned" kartlarda dolu: görevin projedeki gerçek deadline'ı. */
  projectDeadline?: string;
  sortOrder: number;
  isPinned: boolean;
  isHidden: boolean;
  personalNote?: string;
  projectId?: string;
  projectTitle?: string;
  operationId?: string;
  operationTitle?: string;
  departmentId?: string;
  departmentName?: string;
  /**
   * Kartın nereye ait olduğunu gösteren yuvarlak görsel. "assigned" kartlarda
   * görevin en yakın kapsayıcısının (proje/program/departman, proje kendi
   * kapağını koymamışsa bağlı olduğu işin) kapak fotoğrafı. "personal"
   * kartlarda boştur — arayüz orada kullanıcının profil fotoğrafını gösterir.
   */
  coverImageUrl?: string;
  completedAt?: string;
  createdAt: string;
}

// --- Takvim: kişisel planlama katmanı ----------------------------------------
// Görevin deadline'ı bir SON tarihtir; kişinin haftasını nasıl geçireceğini
// anlatmaz. Planlama katmanı bu boşluğu dolduran ayrı bir eksendir:
//
//   PlanFocusArea  "neye vakit ayırıyorum"   (Yazılım, Müzik, İçerik)
//        ↓
//   PlanPeriod     "bu dönemin niyeti ne"     (gün / hafta / ay)
//        ↓
//   PlanTarget     "dönemi nasıl bölüyorum"   (%60 yazılım, 10 içerik)
//        ↓
//   PlanTimeBlock  "takvimde nereye düşüyor"  (Salı 09:00-11:30)
//
// Halkaların hepsi opsiyoneldir: kullanıcı hiç hedef koymadan da takvime blok
// atabilir, hiç blok atmadan da hedef koyabilir.
// (bkz. database/migrations/045_planning_calendar.sql)

/**
 * Kullanıcının vaktini bölüştürdüğü alan. Serbest çalışanın işleri proje
 * sınırlarıyla birebir örtüşmediği için (üç ayrı müşteri projesi aynı "yazılım"
 * kovasına düşer) jobs/projects'ten ayrı bir kavramdır.
 */
export interface PlanFocusArea {
  id: string;
  name: string;
  color?: string;
  /** Opsiyonel: alan bir işe karşılık geliyorsa raporlamada eşleştirilir. */
  jobId?: string;
  jobTitle?: string;
  sortOrder: number;
  archivedAt?: string;
  createdAt: string;
}

export type PlanPeriodKind = "day" | "week" | "month";
export type PlanPeriodStatus = "draft" | "active" | "closed";

/**
 * Bir gün, hafta veya ay. Üç kademe de aynı şekli taşır: bir başlangıç, bir
 * niyet cümlesi, bir kapasite ve dönem sonunda bir değerlendirme.
 */
export interface PlanPeriod {
  id: string;
  kind: PlanPeriodKind;
  /** Kademeye göre normalize edilmiş başlangıç: gün / pazartesi / ayın 1'i. */
  periodStart: string;
  /** Dönemin son günü (sunucuda periodStart + kademeden hesaplanır). */
  periodEnd: string;
  /** "Bu hafta ağırlığı neye vereceğim" — dönemin tek cümlelik niyeti. */
  theme?: string;
  note?: string;
  reviewNote?: string;
  /** Dönem için ayrılan toplam çalışma dakikası. Boşsa tercihlerden hesaplanır. */
  capacityMinutes?: number;
  status: PlanPeriodStatus;
  createdAt: string;
  closedAt?: string;
  /** Dönemin hedefleri (getPeriod ile birlikte döner). */
  targets?: PlanTarget[];
}

/**
 * Dönemin bir odak alanına ayrılan payı. İki hedef dili aynı satırda yaşar,
 * çünkü kullanıcı ikisini bir arada kurar: "%60 yazılım, ayrıca 10 içerik".
 *
 * Yüzdelerin toplamı 100 olmak zorunda DEĞİLDİR; kalan pay esneklik payıdır.
 */
export interface PlanTarget {
  id: string;
  periodId: string;
  focusAreaId?: string;
  focusAreaName?: string;
  focusAreaColor?: string;
  /** Odak alanına bağlı olmayan serbest hedefler için başlık. */
  title?: string;
  /** Dönemin yüzde kaçı (0-100). */
  sharePct?: number;
  targetMinutes?: number;
  targetCount?: number;
  /** Adet hedefinin birimi: "içerik", "video". */
  unit?: string;
  /** Elle ilerletilen sayaç; zaman hedefleri bloklardan hesaplanır. */
  doneCount: number;
  sortOrder: number;
}

/** Bloğu kim koydu: kullanıcı, Lio, yoksa bir programın rutini mi. */
export type PlanBlockSource = "manual" | "lio" | "routine";
export type PlanBlockStatus = "planned" | "done" | "skipped";

/**
 * Takvimdeki somut zaman kutusu.
 *
 * Blok görevin KENDİSİ DEĞİL, ona ayrılan zamandır: bir görev birden çok bloğa
 * bölünebilir, blok silinince görev yerinde durur. Bu ayrım bilinçli — aksi
 * halde takvimden bir kutu silmek projedeki işi silerdi.
 */
export interface PlanTimeBlock {
  id: string;
  /** YYYY-MM-DD */
  blockDate: string;
  /** HH:MM */
  startsAt: string;
  /** HH:MM */
  endsAt: string;
  /** startsAt/endsAt farkı; sunucuda hesaplanır. */
  plannedMinutes: number;
  title?: string;
  note?: string;
  color?: string;
  focusAreaId?: string;
  focusAreaName?: string;
  focusAreaColor?: string;
  /** Gerçek bir göreve bağlıysa dolu. taskId ve personalTodoId birlikte olmaz. */
  taskId?: string;
  personalTodoId?: string;
  /** Bağlı kartın başlığı; blok kendi başlığını taşımıyorsa arayüz bunu gösterir. */
  linkedTitle?: string;
  linkedStatus?: TaskStatus;
  source: PlanBlockSource;
  status: PlanBlockStatus;
  /** Gerçekleşen süre. Boşsa planlanan süre gerçekleşmiş kabul edilir. */
  actualMinutes?: number;
  completedAt?: string;
  sortOrder: number;
}

/**
 * Kullanıcının çalışma ritmi. Lio bir haftayı dağıtırken "kaç saatlik bir
 * haftadan bahsediyoruz" sorusunun cevabını buradan alır.
 */
export interface PlanPreferences {
  timezone: string;
  /** 0 = Pazar … 6 = Cumartesi (JS getDay() ile aynı ölçek). */
  workdays: number[];
  /** HH:MM */
  dayStart: string;
  /** HH:MM */
  dayEnd: string;
  dailyTargetMinutes: number;
  focusBlockMinutes: number;
  breakMinutes: number;
  ritualsEnabled: boolean;
  weeklyRitualWeekday: number;
  weeklyRitualTime: string;
  dailyRitualTime: string;
  /** 1-28 arası: her ayda karşılığı olsun diye 28 ile sınırlı. */
  monthlyRitualDay: number;
}

export type PlanRitualKind = "daily" | "weekly" | "monthly";
export type PlanRitualStatus = "pending" | "done" | "skipped";

/**
 * Lio'nun hafta başı / gün başı / ay başı sihirbaz oturumu.
 *
 * Kayıt iki işe yarar: aynı ritüel aynı gün iki kez sorulmaz, ve Lio bir
 * sonraki oturumda "geçen hafta şuna ağırlık vereceğini söylemiştin, ne oldu?"
 * diye sorabilir.
 */
export interface PlanRitual {
  id: string;
  kind: PlanRitualKind;
  /** YYYY-MM-DD */
  occurredOn: string;
  periodId?: string;
  status: PlanRitualStatus;
  answers: Record<string, unknown>;
  summary?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * "Bugün hangi ritüelin zamanı geldi" cevabı. Zamanlanmış bir görev (cron)
 * yok; sunucu bunu bugünün tarihi + tercihlerden hesaplar.
 */
export interface PlanRitualPrompt {
  kind: PlanRitualKind;
  /** Ritüelin ait olduğu dönemin başlangıcı. */
  periodStart: string;
  periodKind: PlanPeriodKind;
  /** Dönem kaydı zaten varsa id'si; yoksa sihirbaz açılışında oluşturulur. */
  periodId?: string;
  /** Sihirbazın açılış başlığı ve soruları. */
  title: string;
  questions: PlanRitualQuestion[];
  /** Bir önceki aynı türden oturumun özeti; Lio bunun üzerine konuşur. */
  previousSummary?: string;
}

export interface PlanRitualQuestion {
  key: string;
  question: string;
  hint?: string;
}

/**
 * Bir dönemin hedef/gerçek karşılaştırması — takvimin "verimlilik yüzdeleri"
 * ekranının tek kaynağı (v_plan_period_progress).
 *
 * Hedefi olup hiç bloğu olmayan alanlar da (henüz takvime düşmemiş hedef),
 * bloğu olup hedefi olmayan alanlar da (plan dışı çalışma) listede görünür;
 * ikisi de kullanıcının görmesi gereken sapmalardır.
 */
export interface PlanProgressRow {
  targetId?: string;
  focusAreaId?: string;
  focusAreaName?: string;
  focusAreaColor?: string;
  targetTitle?: string;
  /** Hedeflenen pay. */
  sharePct?: number;
  targetMinutes?: number;
  targetCount?: number;
  unit?: string;
  doneCount: number;
  /** Takvime düşen (atlanmamış) toplam süre. */
  plannedMinutes: number;
  /** Tamamlanmış blokların süresi. */
  doneMinutes: number;
  blockCount: number;
  doneBlockCount: number;
  /** Bu alanın, dönemde planlanan zamandan aldığı pay. */
  plannedSharePct?: number;
  /** Bu alanın, dönemde yapılan zamandan aldığı pay. */
  doneSharePct?: number;
}

export interface PlanPeriodProgress {
  period: PlanPeriod;
  rows: PlanProgressRow[];
  /** Dönemde takvime düşen toplam süre. */
  plannedMinutes: number;
  /** Dönemde tamamlanan toplam süre. */
  doneMinutes: number;
  /** Dönemin toplam kapasitesi (kayıtta yoksa tercihlerden hesaplanır). */
  capacityMinutes: number;
  /** Hedef yüzdelerinin toplamı; 100'ü aşarsa arayüz uyarır. */
  sharePctTotal: number;
  /** Kapasitenin yüzde kaçı takvime dolduruldu. */
  fillPct: number;
  /** Takvime düşen sürenin yüzde kaçı gerçekten yapıldı. */
  adherencePct: number;
}

/**
 * Takvime bağlanabilecek bir görev.
 *
 * Kişisel panodaki (PersonalBoardItem) kartlardan farkı kapsamı: pano
 * kullanıcının "kendi tabağını" gösterir (kişisel görevler + kendisine
 * atananlar), bu liste ise erişebildiği TÜM proje ve program görevlerini
 * kapsar. Serbest çalışan çoğu zaman kendi projesindeki bir işe kimseye
 * atamadan zaman ayırmak ister; o iş panoda görünmez ama burada görünür.
 */
export interface SchedulableTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline?: string;
  assignedTo?: string;
  assignedToName?: string;
  projectId?: string;
  projectTitle?: string;
  operationId?: string;
  operationTitle?: string;
  jobId?: string;
  jobTitle?: string;
  /** Görevin tahmini süresi dakikaya çevrilmiş hâli; blok bu uzunlukta açılır. */
  estimatedMinutes?: number;
}

/** Takvimin gün/hafta/ay görünümlerini tek istekte besleyen paket. */
export interface PlanCalendarView {
  kind: PlanPeriodKind;
  from: string;
  to: string;
  /**
   * Çalışma ritmi. Takvim gridinin hangi saatler arasında çizileceği, hangi
   * günlerin soluk gösterileceği ve yeni blokların varsayılan uzunluğu buradan
   * geliyor; ayrı bir istekle çekilseydi grid ilk render'da yanlış saatlerle
   * çizilip sonra yerinden oynardı.
   */
  preferences: PlanPreferences;
  blocks: PlanTimeBlock[];
  /** Görünüm aralığına düşen, henüz bloğa bağlanmamış görevler. */
  unscheduled: PersonalBoardItem[];
  focusAreas: PlanFocusArea[];
  progress: PlanPeriodProgress;
  /** Bugün bekleyen ritüel varsa dolu. */
  ritual?: PlanRitualPrompt;
}
