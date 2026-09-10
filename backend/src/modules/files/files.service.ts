import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { DriveNotConnectedError } from "../google/google-accounts.service";
import { DriveFileMissingError } from "../google/drive.service";
import { FOLDER_MIME, OneDriveFileMissingError } from "../microsoft/onedrive.service";
import {
  CloudStorageService,
  GOOGLE_DOC_EXPORT_MIME,
  isGoogleDocMime,
  type NativeFileKind,
} from "../cloud-storage/cloud-storage.service";
import type { CloudAccount, CloudFile, StorageProvider } from "../cloud-storage/cloud-storage.types";
import { OrganizationStorageService } from "../cloud-storage/organization-storage.service";
import { NotificationsService } from "../notifications/notifications.service";
import { decodeUploadFileName } from "../../common/upload-filename.util";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { previewableMime } from "./onizleme-turleri";

export type { NativeFileKind };

/** "Drive'dan seç" gezinme sonucundaki tek bir öğe (dosya ya da klasör). */
export interface DriveBrowseEntry {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string;
  size?: number;
  iconLink?: string;
}

function toBrowseEntry(f: CloudFile): DriveBrowseEntry {
  return {
    id: f.id,
    name: f.name,
    isFolder: f.mimeType === FOLDER_MIME,
    mimeType: f.mimeType,
    size: f.size,
    iconLink: f.iconLink,
  };
}

/**
 * Yükleyene göre süzerken taranacak azami satır.
 *
 * Ad eşlemesi veritabanında değil bellekte yapılıyor (bkz. searchInJobs); bu
 * yüzden pencere geniş tutulur, ama sınırsız değil — tek bir arama isteğinin
 * bütün dosya tablosunu çekmesi gerekmiyor.
 */
const UPLOADER_SCAN_LIMIT = 300;

/** Backend belleğinden geçirmeye razı olduğumuz üst sınır. Üstü resumable akışa gider. */
export const INLINE_UPLOAD_LIMIT = 8 * 1024 * 1024;

/** Tek istekte çoğaltılabilecek en çok dosya (bkz. duplicateFolder). */
const KLASOR_COGALTMA_TAVANI = 50;

/**
 * "rapor.pdf" -> "rapor kopya.pdf".
 *
 * Ek uzantıdan ÖNCE giriyor: "rapor.pdf kopya" işletim sistemlerinde ve
 * bulutta artık PDF sayılmaz, çift tıklayınca açılmazdı.
 */
function kopyaAdi(name: string): string {
  const nokta = name.lastIndexOf(".");
  if (nokta <= 0) return `${name} kopya`;
  return `${name.slice(0, nokta)} kopya${name.slice(nokta)}`;
}

export interface ProjectFile {
  id: string;
  /** Dosya bir İŞE, bir DEPARTMANA ya da bir ŞİRKETE aittir (üçünden tam biri dolu). */
  jobId?: string;
  /** Organizasyon/grup listelerinde dosyanın hangi işten geldiğini göstermek için. */
  jobTitle?: string;
  departmentId?: string;
  /** Şirketin kendi dosya alanı (bkz. migration 089). */
  organizationId?: string;
  projectId?: string;
  taskId?: string;
  outputId?: string;
  /** İçinde bulunduğu kullanıcı klasörü; boşsa kapsamın kökünde (bkz. file_folders). */
  folderId?: string;
  uploadedBy: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  driveFileId: string;
  webViewLink?: string;
  iconLink?: string;
  /**
   * Önizleme var mı. Adresin KENDİSİ gönderilmez: kısa ömürlü ve kimlik
   * istiyor — istemciye vermek hem işe yaramaz hem sızıntı olurdu. İstemci
   * önizlemeyi imzalı proxy'den ister (bkz. GET /files/:id/content?thumb=1).
   */
  hasThumbnail?: boolean;
  isGoogleDoc: boolean;
  /** Dosyanın gerçek içeriği hangi bulut sağlayıcısında: Google Drive ya da OneDrive. */
  storageProvider: StorageProvider;
  status: "pending" | "ready" | "missing";
  createdAt: string;
  canEditInDrive: boolean;
}

export interface FileContext {
  projectId?: string;
  taskId?: string;
  outputId?: string;
}

/**
 * Lio'nun dosya aramasında dönen tek satır.
 *
 * Ekranlara giden `ProjectFile` yerine daha dar bir şekil dönülüyor: modele
 * gönderilen her alan tur başına token demek, ve `canEditInDrive` satır başına
 * ayrı bir sorgu istiyor — Lio dosyayı Drive'da düzenlemediği için o bilgiyi
 * hesaplamak boşuna maliyet olurdu.
 */
export interface FileSearchHit {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  /**
   * Dosyayı yükleyen kişinin adı.
   *
   * Model için ADIN kendisi gerekli, kimliği değil: kullanıcı dosyayı "Arda'nın
   * gönderdiği dosya" diye tarif ediyor, adıyla arıyor. Ad olmadan Lio elindeki
   * listeden doğru dosyayı seçemiyordu.
   */
  uploadedByName?: string;
  jobId?: string;
  jobTitle?: string;
  projectId?: string;
  projectTitle?: string;
  status: "pending" | "ready" | "missing";
  createdAt: string;
}

/**
 * Arama terimini PostgREST filtresine konulabilir hâle getirir.
 *
 * `ilike` değerinde virgül ve parantez AYRAÇ sayılıyor, `%` ve `_` ise joker:
 * kullanıcının yazdığı metin olduğu gibi konursa sorgu ya bozulur ya da hiç
 * beklenmedik dosyalar eşleşir.
 */
function likeTerm(raw: string): string {
  return raw.replace(/[%_,()"\\]/g, " ").trim();
}

/**
 * Kullanıcının bir işteki erişim düzeyi.
 *
 *  job     -> iş sahibi ya da işe alınmış üye: işin BÜTÜN dosyalarını görür
 *  project -> yalnızca bir/birkaç projeye eklenmiş kişi: sadece o projelerin
 *             dosyalarını görür. İşin geneline ait dosyalar (project_id boş)
 *             ona kapalıdır.
 *  none    -> erişim yok
 */
interface JobAccess {
  level: "job" | "project" | "none";
  isJobOwner: boolean;
  /** level='project' ise erişebildiği proje kimlikleri. */
  projectIds: string[];
}

function mapFile(row: any, canEditInDrive: boolean): ProjectFile {
  return {
    id: row.id,
    jobId: row.job_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    projectId: row.project_id ?? undefined,
    taskId: row.task_id ?? undefined,
    outputId: row.output_id ?? undefined,
    folderId: row.folder_id ?? undefined,
    uploadedBy: row.uploaded_by,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : undefined,
    driveFileId: row.drive_file_id,
    webViewLink: row.web_view_link ?? undefined,
    iconLink: row.icon_link ?? undefined,
    hasThumbnail: Boolean(row.thumbnail_link) || previewableMime(row.mime_type),
    isGoogleDoc: row.is_google_doc ?? false,
    storageProvider: (row.storage_provider as StorageProvider) ?? "google",
    status: row.status,
    createdAt: row.created_at,
    canEditInDrive,
  };
}

/**
 * `job_storage`/`department_storage`/`files` satırlarından sağlayıcıyı ve
 * ilgili hesap kimliğini okur.
 *
 * Bu tablolarda "hangi sağlayıcı" `storage_provider` kolonunda, hesap kimliği
 * ise sağlayıcıya göre `google_account_id` YA DA `microsoft_account_id`
 * kolonunda durur (bkz. migration 034) — ikisi asla birlikte dolu olmaz.
 */
function storageOwner(row: {
  storage_provider?: string | null;
  google_account_id?: string | null;
  microsoft_account_id?: string | null;
}): { provider: StorageProvider; accountId: string } {
  const provider: StorageProvider = row.storage_provider === "microsoft" ? "microsoft" : "google";
  const accountId = provider === "microsoft" ? row.microsoft_account_id : row.google_account_id;
  if (!accountId) throw new BadRequestException("Depolama hesabı bulunamadı.");
  return { provider, accountId };
}

/**
 * "Düz kapsam": departman ya da şirket.
 *
 * İkisinin de dosyaları TEK, alt klasörsüz bir bulut klasöründe durur ve
 * yükleme/izin eşitleme/listeleme akışları birebir aynıdır — tek farkları hangi
 * tabloya baktıkları ve kimin erişebildiği. Bu yüzden iki ayrı kopya yerine
 * ortak gövdeler + kapsam tanımı var; ikisi ayrı yazılsaydı bir düzeltme
 * yalnızca birine uygulanır ve aradaki fark sessizce büyürdü.
 *
 * İŞLER (job) bu kapsamın DIŞINDA: onların altında proje/görev/çıktı hiyerarşisi
 * ve ona karşılık gelen bir klasör ağacı var (bkz. file_folders).
 */
export interface FlatScope {
  kind: "department" | "organization";
  id: string;
}

/**
 * Dosyanın/klasörün sahibi: iş, departman ya da şirket.
 *
 * FlatScope'un iş kapsamını da içeren hâli. Klasör ağacı üç kapsamda da aynı
 * çalıştığı için (bkz. migration 090) klasör uçları bunu kullanıyor.
 */
export interface FileOwner {
  kind: "job" | "department" | "organization";
  id: string;
}

export interface FileFolderEntry {
  id: string;
  name: string;
  kind: "general" | "user" | "project" | "task" | "output";
  parentFolderId?: string;
  driveFolderId: string;
  /**
   * Projelio üretimi mi. true ise ad projeden/görevden geliyor: yeniden
   * adlandırılamaz ve silinemez, arayüz de bu yüzden seçenekleri kapatıyor.
   */
  managed: boolean;
}

function mapFolder(row: any): FileFolderEntry {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentFolderId: row.parent_folder_id ?? undefined,
    driveFolderId: row.drive_folder_id,
    managed: row.kind !== "user",
  };
}

/** `files` satırının kapsam sahibi — klasör satırlarındaki eşinin aynısı. */
function ownerOfFileRow(row: {
  job_id?: string | null;
  department_id?: string | null;
  organization_id?: string | null;
}): FileOwner {
  if (row.job_id) return { kind: "job", id: row.job_id };
  if (row.department_id) return { kind: "department", id: row.department_id };
  if (row.organization_id) return { kind: "organization", id: row.organization_id };
  throw new BadRequestException("Dosyanın kapsamı çözülemedi.");
}

function ownerOfFolderRow(row: {
  job_id?: string | null;
  department_id?: string | null;
  organization_id?: string | null;
}): FileOwner {
  if (row.job_id) return { kind: "job", id: row.job_id };
  if (row.department_id) return { kind: "department", id: row.department_id };
  if (row.organization_id) return { kind: "organization", id: row.organization_id };
  throw new BadRequestException("Klasörün kapsamı çözülemedi.");
}

/**
 * `files`/`file_upload_sessions` satırının düz kapsamı — yoksa (iş kapsamı) undefined.
 *
 * Satırda job_id, department_id ve organization_id'den tam olarak biri dolu
 * (bkz. migration 089 files_scope kısıtı).
 */
function flatScopeOfRow(row: { department_id?: string | null; organization_id?: string | null }): FlatScope | undefined {
  if (row.department_id) return { kind: "department", id: row.department_id };
  if (row.organization_id) return { kind: "organization", id: row.organization_id };
  return undefined;
}

/** provider'a göre insert/update payload'ına doğru hesap kolonunu yazar. */
function storageAccountColumns(provider: StorageProvider, accountId: string) {
  return {
    storage_provider: provider,
    google_account_id: provider === "google" ? accountId : null,
    microsoft_account_id: provider === "microsoft" ? accountId : null,
  };
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private supabase: SupabaseService,
    private cloudStorage: CloudStorageService,
    private orgStorage: OrganizationStorageService,
    private notifications: NotificationsService
  ) {}

  // ============================================================ yetkilendirme
  // Veritabanında RLS politikası yok (her şey service_role ile geçiyor), bu yüzden
  // erişim kontrolü burada AÇIKÇA yapılmak zorunda. Bir dosya endpoint'inde bunu
  // atlamak, başka bir işin belgelerini herkese açmak demektir.

  /**
   * İşin BÜTÜN dosyalarına erişmesi gereken kullanıcılar.
   *
   * Projelio'nun sahiplik zinciri: Grup > Organizasyon > İş > Proje.
   * Üst kademe, altındaki her şeyi görebilmeli — bir holding sahibi, holdingine
   * bağlı şirketlerin işlerindeki dosyaları görmek ister.
   *
   *   İşin sahibi ve iş ekibi
   *   + İş bir organizasyona bağlıysa: o organizasyonun sahibi ve onaylı üyeleri
   *   + İş (ya da bağlı olduğu organizasyon) bir gruba bağlıysa: grubun sahibi ve üyeleri
   *
   * Bağ kurulmamışsa (organization_id ve group_id boşsa) zincir işin kendisinde
   * biter — serbest çalışanın işleri kimsenin holdingine görünmez.
   *
   * Hem yetki kontrolü hem Drive izin eşitlemesi bu tek listeden beslenir;
   * ikisinin ayrışması "Projelio'da göremiyor ama Drive'da görüyor" gibi
   * sessiz tutarsızlıklar üretirdi.
   */
  private async jobLevelUserIds(jobId: string): Promise<Set<string>> {
    const { data: job, error } = await this.supabase.client
      .from("jobs")
      .select("owner_id, organization_id, group_id")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!job) throw new NotFoundException("İş bulunamadı");

    const ids = new Set<string>();
    if (job.owner_id) ids.add(job.owner_id);

    const { data: jobMembers } = await this.supabase.client
      .from("job_members")
      .select("user_id")
      .eq("job_id", jobId)
      // Drive klasörü yalnızca daveti kabul etmiş ekiple paylaşılır; bekleyen
      // davet sahibi henüz ekipten sayılmaz.
      .eq("status", "approved");
    for (const m of jobMembers ?? []) ids.add(m.user_id);

    // İş doğrudan gruba bağlı olabilir; organizasyon üzerinden de gruba bağlanabilir.
    let groupId: string | null = job.group_id ?? null;

    if (job.organization_id) {
      const [{ data: org }, { data: orgMembers }] = await Promise.all([
        this.supabase.client
          .from("organizations")
          .select("owner_id, group_id")
          .eq("id", job.organization_id)
          .maybeSingle(),
        this.supabase.client
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", job.organization_id)
          .eq("status", "approved"),
      ]);
      if (org?.owner_id) ids.add(org.owner_id);
      for (const m of orgMembers ?? []) ids.add(m.user_id);
      groupId = groupId ?? org?.group_id ?? null;
    }

    if (groupId) {
      const [{ data: group }, { data: groupMembers }] = await Promise.all([
        this.supabase.client.from("groups").select("owner_id").eq("id", groupId).maybeSingle(),
        // group_members'ta onay durumu yok: eklenen kişi doğrudan üyedir.
        this.supabase.client.from("group_members").select("user_id").eq("group_id", groupId),
      ]);
      if (group?.owner_id) ids.add(group.owner_id);
      for (const m of groupMembers ?? []) ids.add(m.user_id);
    }

    return ids;
  }

  /**
   * Kullanıcının bu işteki erişim düzeyini hesaplar.
   *
   * Yalnızca bir projeye çağrılmış kişi (tipik olarak taşeron) sadece o projeyi
   * görür; hiyerarşideki üst kademeler ise işin tamamını görür.
   */
  private async resolveAccess(jobId: string, userId: string): Promise<JobAccess> {
    const { data: job, error: jobError } = await this.supabase.client
      .from("jobs")
      .select("owner_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) throw new NotFoundException("İş bulunamadı");

    const jobLevel = await this.jobLevelUserIds(jobId);
    if (jobLevel.has(userId)) {
      return { level: "job", isJobOwner: job.owner_id === userId, projectIds: [] };
    }

    // Bu işin altındaki projelerden hangilerine üye ya da sahip?
    const { data: projectMemberships, error } = await this.supabase.client
      .from("projects")
      .select("id, owner_id, project_members(user_id, status)")
      .eq("job_id", jobId);
    if (error) throw error;

    const projectIds = (projectMemberships ?? [])
      .filter(
        (p: any) =>
          p.owner_id === userId ||
          (p.project_members ?? []).some((m: any) => m.user_id === userId && m.status === "approved")
      )
      .map((p: any) => p.id);

    if (projectIds.length) return { level: "project", isJobOwner: false, projectIds };
    return { level: "none", isJobOwner: false, projectIds: [] };
  }

  /** İşe herhangi bir düzeyde erişimi olduğunu doğrular. */
  async assertJobAccess(jobId: string, userId: string): Promise<JobAccess> {
    const access = await this.resolveAccess(jobId, userId);
    if (access.level === "none") {
      throw new ForbiddenException("Bu işin dosyalarına erişim yetkiniz yok");
    }
    return access;
  }

  /** Belirli bir bağlama (proje/iş geneli) yazma ya da okuma hakkı var mı? */
  private assertContextAllowed(access: JobAccess, projectId?: string): void {
    if (access.level === "job") return;
    if (!projectId) {
      throw new ForbiddenException(
        "İşin geneline dosya eklemek için iş ekibinde olmanız gerekir"
      );
    }
    if (!access.projectIds.includes(projectId)) {
      throw new ForbiddenException("Bu projenin dosyalarına erişim yetkiniz yok");
    }
  }

  /** Görev/çıktı hangi projeye ait? Dosya iliştirilirken proje bağlamını türetmek için. */
  private async resolveProjectFromContext(context: FileContext): Promise<string | undefined> {
    if (context.projectId) return context.projectId;

    if (context.taskId) {
      const { data } = await this.supabase.client
        .from("tasks")
        .select("project_id")
        .eq("id", context.taskId)
        .maybeSingle();
      return data?.project_id ?? undefined;
    }
    if (context.outputId) {
      const { data } = await this.supabase.client
        .from("outputs")
        .select("project_id")
        .eq("id", context.outputId)
        .maybeSingle();
      return data?.project_id ?? undefined;
    }
    return undefined;
  }

  private async jobIdOfProject(projectId: string): Promise<string> {
    const { data, error } = await this.supabase.client
      .from("projects")
      .select("job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Proje bulunamadı");
    return data.job_id;
  }

  private async isJobOwner(jobId: string, userId: string): Promise<boolean> {
    const { data } = await this.supabase.client
      .from("jobs")
      .select("owner_id")
      .eq("id", jobId)
      .maybeSingle();
    return data?.owner_id === userId;
  }

  // ============================================================ düz kapsam erişimi
  // Departman kaynaklarını yalnızca organizasyon sahibi ya da o departmanın
  // onaylı bir kadro üyesi görebilir/yönetebilir (bkz. TasksService/OutputsService
  // ile aynı desen — Dosyalar sekmesi de aynı yetki modelini paylaşır).
  //
  // Şirket kapsamı aynı deseni bir üst kademede tekrarlar: sahibi, onaylı
  // üyeleri ve — şirket bir gruba bağlıysa — grubun sahibi/üyeleri.

  /** Kapsamın hangi tablolarda yaşadığı (bkz. FlatScope). */
  private flatTables(scope: FlatScope) {
    return scope.kind === "department"
      ? { storage: "department_storage", grants: "department_folder_grants", idColumn: "department_id" }
      : { storage: "organization_storage", grants: "organization_folder_grants", idColumn: "organization_id" };
  }

  /** Kapsamın klasörüne erişebilmesi gereken kullanıcılar (izin eşitlemesi ve bildirim aynı listeden beslenir). */
  private async flatEligibleUserIds(scope: FlatScope): Promise<Set<string>> {
    const ids = new Set<string>();

    if (scope.kind === "organization") {
      const [{ data: org }, { data: members }] = await Promise.all([
        this.supabase.client.from("organizations").select("owner_id").eq("id", scope.id).maybeSingle(),
        this.supabase.client
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", scope.id)
          .eq("status", "approved"),
      ]);
      if (org?.owner_id) ids.add(org.owner_id);
      for (const m of members ?? []) if (m.user_id) ids.add(m.user_id);
      return ids;
    }

    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", scope.id)
      .maybeSingle();

    const [{ data: org }, { data: members }] = await Promise.all([
      dept
        ? this.supabase.client.from("organizations").select("owner_id").eq("id", dept.organization_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      this.supabase.client
        .from("department_members")
        .select("user_id")
        .eq("department_id", scope.id)
        .eq("status", "approved"),
    ]);
    if (org?.owner_id) ids.add(org.owner_id);
    for (const m of members ?? []) if (m.user_id) ids.add(m.user_id);
    return ids;
  }

  async assertFlatAccess(scope: FlatScope, userId: string): Promise<void> {
    if (scope.kind === "organization") {
      // listByOrganization ile AYNI liste olmak zorunda: "Projelio'da görüyorum
      // ama açamıyorum" (ya da tersi) tutarsızlığı buradan doğuyordu.
      const { data: org } = await this.supabase.client
        .from("organizations")
        .select("owner_id, group_id")
        .eq("id", scope.id)
        .maybeSingle();
      if (!org) throw new NotFoundException("Organizasyon bulunamadı");
      if (org.owner_id === userId) return;
      if (await this.isApprovedOrgMember(scope.id, userId)) return;
      if (org.group_id && (await this.hasGroupAccess(org.group_id, userId))) return;
      throw new ForbiddenException("Bu şirketin dosyalarını yalnızca ekibi görebilir");
    }

    const departmentId = scope.id;
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
    const { data: memberRow } = await this.supabase.client
      .from("department_members")
      .select("id")
      .eq("department_id", departmentId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (memberRow) return;
    throw new ForbiddenException("Bu departmanın dosyalarını yalnızca kadrosundaki kişiler görebilir");
  }

  /** Eski ad; denetleyici ve findById bunu çağırıyor. */
  async assertDepartmentAccess(departmentId: string, userId: string): Promise<void> {
    return this.assertFlatAccess({ kind: "department", id: departmentId }, userId);
  }

  /** Silme yetkisi: yükleyen kişi, organizasyon sahibi ya da departman yöneticisi. */
  private async isFlatManagerOrOwner(scope: FlatScope, userId: string): Promise<boolean> {
    if (scope.kind === "organization") {
      // Şirket kapsamında "yönetici" ayrı bir rol değil: sahibi tek yetkilidir.
      const { data: org } = await this.supabase.client
        .from("organizations")
        .select("owner_id")
        .eq("id", scope.id)
        .maybeSingle();
      return org?.owner_id === userId;
    }

    const departmentId = scope.id;
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (!dept) return false;
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    if (org?.owner_id === userId) return true;
    const { data: managerRow } = await this.supabase.client
      .from("department_members")
      .select("id")
      .eq("department_id", departmentId)
      .eq("user_id", userId)
      .eq("role", "manager")
      .eq("status", "approved")
      .maybeSingle();
    return Boolean(managerRow);
  }

  /**
   * Hedefin (iş/departman) deposu için kısa ömürlü erişim jetonu.
   *
   * Google Picker tarayıcıda çalışıyor ve seçilen dosya hedef klasöre KOPYALANIRKEN
   * hedefin jetonu kullanılıyor (bkz. importForDepartment). İki jeton farklı
   * hesaplara aitse kopyalama kaynağı göremez — bu yüzden Picker da hedefin
   * hesabıyla açılmak zorunda.
   */
  async pickerTokenForTarget(
    userId: string,
    target: { jobId?: string; departmentId?: string; organizationId?: string }
  ): Promise<{ accessToken: string; expiresInSeconds: number; provider: StorageProvider }> {
    let provider: StorageProvider;
    let accountId: string;

    if (target.departmentId || target.organizationId) {
      const scope: FlatScope = target.departmentId
        ? { kind: "department", id: target.departmentId }
        : { kind: "organization", id: target.organizationId! };
      await this.assertFlatAccess(scope, userId);
      ({ provider, accountId } = await this.ensureFlatStorage(scope, userId));
    } else if (target.jobId) {
      await this.assertJobAccess(target.jobId, userId);
      ({ provider, accountId } = await this.ensureJobStorage(target.jobId, userId));
    } else {
      throw new BadRequestException("jobId, departmentId ya da organizationId gerekli");
    }

    if (provider !== "google") {
      throw new BadRequestException("Bu hedef OneDrive kullanıyor; dosya seçimi OneDrive penceresiyle yapılır.");
    }

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    // 3000 sn: jetonun ömrü 1 saat, Picker açıkken sona ermesin diye pay bırakılıyor.
    return { accessToken, expiresInSeconds: 3000, provider };
  }

  // ============================================================ depolama sahibi

  /**
   * İşin dosyalarının tutulacağı bulut hesabını döndürür; yoksa kurar.
   *
   * İş başına TEK hesap: her üye kendi Drive'ına/OneDrive'ına yükleseydi, o üye
   * ekipten ayrıldığında işin dosyalarının bir kısmı erişilemez hâle gelirdi.
   *
   * Sağlayıcı ve hesap seçimi iş kurulurken bir kez belirlenir, sırayla:
   *   1. İş bir şirkete bağlıysa ŞİRKETİN seçtiği depo hesabı (organization_storage)
   *   2. Yoksa iş sahibinin varsayılan hesabı
   *   3. O da yoksa işlemi yapan kullanıcınınki
   * (2 ve 3'te sağlayıcı CloudStorageService.findAccountForUser ile, Google öncelikli.)
   */
  /**
   * Şirketin seçtiği depo hesabı (varsa) — bkz. OrganizationStorageService.
   *
   * Seçim var ama hesap kullanılamaz durumdaysa (kullanıcı Drive iznini
   * geri çekmiş) `undefined` döner ve çağıran eski akışa düşer. Alternatif,
   * şirketin bütün dosya işlemlerinin durması olurdu.
   */
  private async resolveOrganizationAccount(
    organizationId?: string
  ): Promise<{ provider: StorageProvider; account: CloudAccount } | undefined> {
    if (!organizationId) return undefined;

    const binding = await this.orgStorage.find(organizationId);
    if (!binding) return undefined;

    const account = await this.cloudStorage.findById(binding.provider, binding.accountId);
    if (!this.cloudStorage.isDriveReady(binding.provider, account)) {
      this.logger.warn(
        `Şirketin depo hesabı kullanılamıyor (organization=${organizationId}); varsayılan hesaba düşülüyor.`
      );
      return undefined;
    }
    return { provider: binding.provider, account: account! };
  }

  /**
   * İş/departman klasörünün açılacağı kök klasör.
   *
   * Şirketin AÇIK bir depo seçimi varsa kök, o hesabın "Projelio" klasörünün
   * altındaki ŞİRKET klasörüdür: kullanıcı zaten dosyalarını ayırmak istediği
   * için bu seçimi yapmıştır, hepsini tek düzlemde toplamak amacı boşa
   * çıkarırdı. Seçim yoksa eski davranış — doğrudan "Projelio" kökü.
   */
  private async ensureScopeRoot(params: {
    provider: StorageProvider;
    account: CloudAccount;
    accessToken: string;
    organizationId?: string;
  }): Promise<string> {
    const { provider, account, accessToken, organizationId } = params;

    const root =
      account.rootFolderId ?? (await this.cloudStorage.ensureRootFolder(provider, accessToken)).id;
    if (!account.rootFolderId) await this.cloudStorage.setRootFolderId(provider, account.id, root);

    if (!organizationId) return root;
    const binding = await this.orgStorage.find(organizationId);
    // Seçim yoksa ya da bu hesap şirketin seçtiği hesap değilse şirket klasörü
    // açılmaz: başka bir hesaba şirket adında klasör açmak kafa karıştırırdı.
    if (!binding || binding.accountId !== account.id) return root;
    if (binding.folderId) return binding.folderId;

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();

    const folder = await this.cloudStorage.findOrCreateFolder(
      provider,
      accessToken,
      org?.name || "Şirket",
      root
    );
    await this.orgStorage.setFolder(organizationId, folder.id, folder.webViewLink);
    return folder.id;
  }

  private async ensureJobStorage(
    jobId: string,
    actingUserId: string
  ): Promise<{ provider: StorageProvider; accountId: string; rootFolderId: string }> {
    const { data: existing, error } = await this.supabase.client
      .from("job_storage")
      .select()
      .eq("job_id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (existing) {
      const owner = storageOwner(existing);
      return { ...owner, rootFolderId: existing.drive_folder_id };
    }

    const { data: job, error: jobError } = await this.supabase.client
      .from("jobs")
      .select("owner_id, title, organization_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) throw new NotFoundException("İş bulunamadı");

    // Şirketin açık depo seçimi her şeyin önünde: "şirketimin dosyaları benim
    // kişisel Drive'ıma düşmesin" talebinin karşılığı burası.
    let resolved = await this.resolveOrganizationAccount(job.organization_id ?? undefined);

    // Seçim yoksa eski davranış: önce iş sahibinin hesabı, sonra işlemi yapanınki.
    const candidates = [job.owner_id, actingUserId].filter(Boolean) as string[];
    for (const candidateId of resolved ? [] : candidates) {
      const found = await this.cloudStorage.findAccountForUser(candidateId);
      if (found) {
        resolved = found;
        break;
      }
    }
    if (!resolved) {
      throw new DriveNotConnectedError(
        "Bu işte dosya saklamak için önce bir Google Drive ya da OneDrive hesabı bağlanmalı. Ayarlar > Bağlı hesaplar."
      );
    }
    const { provider, account } = resolved;

    const accessToken = await this.cloudStorage.getAccessToken(provider, account.id);

    const root = await this.ensureScopeRoot({
      provider,
      account,
      accessToken,
      organizationId: job.organization_id ?? undefined,
    });

    const jobFolder = await this.cloudStorage.findOrCreateFolder(provider, accessToken, job.title || "İş", root);

    const { error: insertError } = await this.supabase.client.from("job_storage").insert({
      job_id: jobId,
      ...storageAccountColumns(provider, account.id),
      drive_folder_id: jobFolder.id,
      folder_web_view_link: jobFolder.webViewLink ?? null,
    });
    // Eşzamanlı iki yükleme aynı anda kurulum yapmış olabilir; ilk kazananın
    // kaydıyla devam ederiz.
    if (insertError && (insertError as any).code !== "23505") throw insertError;

    void this.syncJobShares(jobId).catch((err) =>
      this.logger.warn(`Bulut paylaşımları eşitlenemedi (job=${jobId}): ${String(err)}`)
    );

    return { provider, accountId: account.id, rootFolderId: jobFolder.id };
  }

  /**
   * Düz kapsamın (departman ya da şirket) dosyalarının tutulacağı bulut hesabını
   * ve DÜZ (alt klasörsüz) klasörünü döndürür; yoksa kurar.
   *
   * İş modelinden farkı: bu kapsamların altında proje/görev/çıktı hiyerarşisi
   * yok, bu yüzden Projelio kendiliğinden alt klasör AÇMAZ — burada dönen tek
   * klasör kapsamın köküdür. Kullanıcı kendi klasörlerini bunun altında açar
   * (kind='user', bkz. createFolder).
   *
   * Hesap seçimi sırası: şirketin AÇIK seçimi (organization_storage) > şirket
   * sahibinin varsayılan hesabı > işlemi yapan kullanıcınınki.
   */
  private async ensureFlatStorage(
    scope: FlatScope,
    actingUserId: string
  ): Promise<{ provider: StorageProvider; accountId: string; folderId: string }> {
    const tables = this.flatTables(scope);

    const { data: existing, error } = await this.supabase.client
      .from(tables.storage)
      .select()
      .eq(tables.idColumn, scope.id)
      .maybeSingle();
    if (error) throw error;

    // Şirkette satırın VARLIĞI yetmez: kullanıcı hesabı seçmiş ama henüz dosya
    // eklememiş olabilir, o durumda klasör hâlâ açılmamıştır (bkz. migration 088).
    if (existing && (scope.kind === "department" || existing.drive_folder_id)) {
      const owner = storageOwner(existing);
      return { ...owner, folderId: existing.drive_folder_id };
    }

    // Kapsamın bağlı olduğu şirket ve o şirketin "sahibi" — hesap adaylarının sırası buradan çıkıyor.
    let organizationId: string | undefined;
    let folderName = "Departman";
    if (scope.kind === "organization") {
      organizationId = scope.id;
    } else {
      const { data: dept, error: deptError } = await this.supabase.client
        .from("departments")
        .select("name, organization_id")
        .eq("id", scope.id)
        .maybeSingle();
      if (deptError) throw deptError;
      if (!dept) throw new NotFoundException("Departman bulunamadı");
      organizationId = dept.organization_id ?? undefined;
      folderName = dept.name || "Departman";
    }

    const { data: org } = organizationId
      ? await this.supabase.client.from("organizations").select("owner_id").eq("id", organizationId).maybeSingle()
      : { data: null as any };

    // Şirketin açık depo seçimi önce gelir; yoksa eski davranış (sahibin hesabı).
    let resolved = await this.resolveOrganizationAccount(organizationId);

    const candidates = [org?.owner_id, actingUserId].filter(Boolean) as string[];
    for (const candidateId of resolved ? [] : candidates) {
      const found = await this.cloudStorage.findAccountForUser(candidateId);
      if (found) {
        resolved = found;
        break;
      }
    }
    if (!resolved) {
      throw new DriveNotConnectedError(
        scope.kind === "organization"
          ? "Bu şirkette dosya saklamak için önce bir Google Drive ya da OneDrive hesabı bağlanmalı. Ayarlar > Bağlı hesaplar."
          : "Bu departmanda dosya saklamak için önce bir Google Drive ya da OneDrive hesabı bağlanmalı. Ayarlar > Bağlı hesaplar."
      );
    }
    const { provider, account } = resolved;

    const accessToken = await this.cloudStorage.getAccessToken(provider, account.id);

    if (scope.kind === "organization") {
      // Seçim yapılmamışsa burada ÖRTÜK olarak yapılır: ilk dosyanın düştüğü
      // hesap şirketin hesabı sayılır. Eskiden bu karar da örtüktü ama hiçbir
      // yerde görünmüyordu; artık şirket ayarlarında görünüp değiştirilebiliyor.
      if (!existing) {
        const { error: bindError } = await this.supabase.client.from("organization_storage").insert({
          organization_id: scope.id,
          ...storageAccountColumns(provider, account.id),
        });
        if (bindError && (bindError as any).code !== "23505") throw bindError;
      }

      // ensureScopeRoot, şirketin adını taşıyan klasörü açar ve kimliğini
      // organization_storage'a yazar — şirket kapsamında HEDEF klasör budur.
      const folderId = await this.ensureScopeRoot({
        provider,
        account,
        accessToken,
        organizationId: scope.id,
      });

      void this.syncFlatShares(scope).catch((err) =>
        this.logger.warn(`Bulut paylaşımları eşitlenemedi (organization=${scope.id}): ${String(err)}`)
      );

      return { provider, accountId: account.id, folderId };
    }

    const root = await this.ensureScopeRoot({ provider, account, accessToken, organizationId });
    const folder = await this.cloudStorage.findOrCreateFolder(provider, accessToken, folderName, root);

    const { error: insertError } = await this.supabase.client.from("department_storage").insert({
      department_id: scope.id,
      ...storageAccountColumns(provider, account.id),
      drive_folder_id: folder.id,
      folder_web_view_link: folder.webViewLink ?? null,
    });
    // Eşzamanlı iki yükleme aynı anda kurulum yapmış olabilir; ilk kazananın kaydıyla devam ederiz.
    if (insertError && (insertError as any).code !== "23505") throw insertError;

    void this.syncFlatShares(scope).catch((err) =>
      this.logger.warn(`Bulut paylaşımları eşitlenemedi (department=${scope.id}): ${String(err)}`)
    );

    return { provider, accountId: account.id, folderId: folder.id };
  }

  /**
   * Bağlama uygun klasörü bulur/oluşturur.
   *
   * Ağaç:  Projelio / {İş} / Genel
   *        Projelio / {İş} / {Proje} / Görevler / {Görev}
   *        Projelio / {İş} / {Proje} / Çıktılar / {Çıktı}
   */
  /**
   * İş kapsamında yüklemenin ineceği klasör.
   *
   * İki kaynak var ve sıra önemli: kullanıcı bir klasörün İÇİNDEYKEN yüklüyorsa
   * (ya da klasör yüklüyorsa) dosya oraya iner. Aksi halde eski davranış sürer:
   * Projelio dosyanın bağlamına göre kendi klasörünü seçer (Genel / Proje /
   * Görev / Çıktı).
   */
  private async jobUploadTarget(
    jobId: string,
    userId: string,
    provider: StorageProvider,
    accountId: string,
    rootFolderId: string,
    context: FileContext,
    resolvedProjectId: string | undefined,
    placement?: { folderId?: string; relativePath?: string }
  ): Promise<{ folderRowId?: string; driveFolderId: string }> {
    if (placement?.folderId || placement?.relativePath) {
      return this.resolvePlacement({ kind: "job", id: jobId }, userId, rootFolderId, placement);
    }
    return this.ensureContextFolder(jobId, provider, accountId, rootFolderId, {
      ...context,
      resolvedProjectId,
    });
  }

  private async ensureContextFolder(
    jobId: string,
    provider: StorageProvider,
    accountId: string,
    jobRootFolderId: string,
    context: FileContext & { resolvedProjectId?: string }
  ): Promise<{ folderRowId: string; driveFolderId: string }> {
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const projectId = context.resolvedProjectId;

    // --- İşin geneli
    if (!projectId) {
      return this.findOrCreateFolderRow(jobId, provider, accessToken, {
        kind: "general",
        name: "Genel",
        parentDriveId: jobRootFolderId,
        match: (q) => q.eq("kind", "general"),
      });
    }

    // --- Proje klasörü (görev/çıktı klasörlerinin de üstü)
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .maybeSingle();

    const projectFolder = await this.findOrCreateFolderRow(jobId, provider, accessToken, {
      kind: "project",
      name: project?.title || "Proje",
      parentDriveId: jobRootFolderId,
      projectId,
      match: (q) => q.eq("kind", "project").eq("project_id", projectId),
    });

    if (!context.taskId && !context.outputId) return projectFolder;

    // --- Görev/çıktı klasörü
    const isTask = Boolean(context.taskId);
    const entityId = (context.taskId ?? context.outputId)!;
    const { data: entity } = await this.supabase.client
      .from(isTask ? "tasks" : "outputs")
      .select("title")
      .eq("id", entityId)
      .maybeSingle();

    // Ara klasör ("Görevler"/"Çıktılar") bulutta tutulur ama ayrı satır olarak
    // kaydedilmez: hiçbir dosya doğrudan ona iliştirilmiyor.
    const groupFolder = await this.cloudStorage.findOrCreateFolder(
      provider,
      accessToken,
      isTask ? "Görevler" : "Çıktılar",
      projectFolder.driveFolderId
    );

    return this.findOrCreateFolderRow(jobId, provider, accessToken, {
      kind: isTask ? "task" : "output",
      name: entity?.title || (isTask ? "Görev" : "Çıktı"),
      parentDriveId: groupFolder.id,
      parentRowId: projectFolder.folderRowId,
      projectId,
      taskId: context.taskId,
      outputId: context.outputId,
      match: (q) =>
        isTask ? q.eq("kind", "task").eq("task_id", entityId) : q.eq("kind", "output").eq("output_id", entityId),
    });
  }

  private async findOrCreateFolderRow(
    jobId: string,
    provider: StorageProvider,
    accessToken: string,
    spec: {
      kind: "general" | "project" | "task" | "output";
      name: string;
      parentDriveId: string;
      parentRowId?: string;
      projectId?: string;
      taskId?: string;
      outputId?: string;
      match: (q: any) => any;
    }
  ): Promise<{ folderRowId: string; driveFolderId: string }> {
    const { data: existing, error } = await spec
      .match(this.supabase.client.from("file_folders").select().eq("job_id", jobId))
      .maybeSingle();
    if (error) throw error;
    if (existing) return { folderRowId: existing.id, driveFolderId: existing.drive_folder_id };

    const folder = await this.cloudStorage.findOrCreateFolder(provider, accessToken, spec.name, spec.parentDriveId);

    const { data: row, error: insertError } = await this.supabase.client
      .from("file_folders")
      .insert({
        job_id: jobId,
        parent_folder_id: spec.parentRowId ?? null,
        kind: spec.kind,
        project_id: spec.projectId ?? null,
        task_id: spec.taskId ?? null,
        output_id: spec.outputId ?? null,
        name: spec.name,
        drive_folder_id: folder.id,
      })
      .select()
      .single();

    if (insertError) {
      // Yarış durumu: aynı anda başka bir istek klasörü oluşturmuş olabilir.
      if ((insertError as any).code === "23505") {
        const { data: raced } = await spec
          .match(this.supabase.client.from("file_folders").select().eq("job_id", jobId))
          .maybeSingle();
        if (raced) return { folderRowId: raced.id, driveFolderId: raced.drive_folder_id };
      }
      throw insertError;
    }

    return { folderRowId: row.id, driveFolderId: folder.id };
  }

  // ============================================================ klasörler
  // Klasör ağacı `file_folders` tablosunda (bkz. migration 090). İki tür var ve
  // fark KULLANICIYA GÖRÜNÜR:
  //
  //   * Projelio üretimi (general/project/task/output) — adı projeden/görevden
  //     geliyor, elle silinemez ve yeniden adlandırılamaz. Adı değiştirmenin
  //     yolu projenin adını değiştirmek.
  //   * Kullanıcı klasörü (kind='user') — elle açılan ya da klasör yükleyerek
  //     oluşan; her şeyi yapılabilir.
  //
  // Ağaç bulutta ZATEN vardı; arayüz göstermiyordu. Burası onu görünür kılıyor.

  /**
   * Klasör tablosu kullanılabilir mi (migration 090 uygulandı mı).
   *
   * NEDEN VAR: migration'lar elle uygulanıyor ve koddan geride kalabiliyor.
   * Bir kez geride kaldığında iş ekranında dosyalar KAYBOLDU: klasör listesi
   * boş dönüyor, dosya listesi de "yalnızca kökteki dosyalar" diye süzülüyordu
   * — iş kapsamında her dosyanın klasörü olduğu için sonuç bomboş bir ekrandı,
   * üstelik dosyalar Drive'da duruyordu. Tablo yoksa klasör süzgeçleri hiç
   * uygulanmıyor ve eski düz liste davranışı geri geliyor.
   *
   * Yalnızca OLUMLU sonuç önbelleğe alınır: tablo sonradan gelirse (migration
   * uygulanınca) süreç yeniden başlatılmadan kendiliğinden düzelsin.
   */
  private foldersReady = false;

  private async foldersAvailable(): Promise<boolean> {
    if (this.foldersReady) return true;
    const { error } = await this.supabase.client.from("file_folders").select("id").limit(1);
    if (error) {
      this.logger.warn(`Klasör tablosu kullanılamıyor (migration 090 uygulandı mı?): ${error.message}`);
      return false;
    }
    this.foldersReady = true;
    return true;
  }

  private ownerColumn(owner: FileOwner): "job_id" | "department_id" | "organization_id" {
    return owner.kind === "job" ? "job_id" : owner.kind === "department" ? "department_id" : "organization_id";
  }

  /** Kapsamın erişim kontrolü; klasör uçları da dosya uçlarıyla aynı kapıdan geçer. */
  private async assertOwnerAccess(owner: FileOwner, userId: string): Promise<void> {
    if (owner.kind === "job") {
      await this.assertJobAccess(owner.id, userId);
      return;
    }
    await this.assertFlatAccess({ kind: owner.kind, id: owner.id }, userId);
  }

  /** Kapsamın kök klasörü (bulut tarafındaki kimlik) ve depo hesabı. */
  private async ownerRoot(
    owner: FileOwner,
    userId: string
  ): Promise<{ provider: StorageProvider; accountId: string; rootFolderId: string }> {
    if (owner.kind === "job") return this.ensureJobStorage(owner.id, userId);
    const flat = await this.ensureFlatStorage({ kind: owner.kind, id: owner.id }, userId);
    return { provider: flat.provider, accountId: flat.accountId, rootFolderId: flat.folderId };
  }

  async listFolders(owner: FileOwner, userId: string, parentFolderId?: string): Promise<FileFolderEntry[]> {
    await this.assertOwnerAccess(owner, userId);
    if (!(await this.foldersAvailable())) return [];

    let query = this.supabase.client
      .from("file_folders")
      .select()
      .eq(this.ownerColumn(owner), owner.id)
      .order("name", { ascending: true })
      .limit(LISTE_TAVANI);

    query = parentFolderId ? query.eq("parent_folder_id", parentFolderId) : query.is("parent_folder_id", null);

    const { data, error } = await query;
    // Migration 090 uygulanmadan dağıtım olursa tablo eski adında kalır; dosya
    // listesi klasörsüz çalışmaya devam etsin.
    if (error) {
      this.logger.warn(`Klasörler okunamadı (migration 090 uygulandı mı?): ${error.message}`);
      return [];
    }

    return (data ?? []).map(mapFolder);
  }

  /** Klasörün kök'e kadar olan yolu — ekmek kırıntısı için (en üstteki başta). */
  async folderPath(folderId: string, userId: string): Promise<FileFolderEntry[]> {
    const chain: FileFolderEntry[] = [];
    let current: string | undefined = folderId;

    // Döngü koruması: parent zinciri bozuksa (elle düzenlenmiş veri) sonsuza
    // kadar dönmesin.
    for (let i = 0; current && i < 32; i += 1) {
      const { data, error } = await this.supabase.client
        .from("file_folders")
        .select()
        .eq("id", current)
        .maybeSingle();
      if (error || !data) break;

      if (i === 0) {
        await this.assertOwnerAccess(ownerOfFolderRow(data), userId);
      }
      chain.unshift(mapFolder(data));
      current = data.parent_folder_id ?? undefined;
    }

    return chain;
  }

  async createFolder(
    owner: FileOwner,
    userId: string,
    name: string,
    parentFolderId?: string
  ): Promise<FileFolderEntry> {
    const temiz = this.safeFileName(name ?? "");
    if (!temiz.trim()) throw new BadRequestException("Klasör adı gerekli");
    await this.assertOwnerAccess(owner, userId);

    const { provider, accountId, rootFolderId } = await this.ownerRoot(owner, userId);
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);

    let parentDriveId = rootFolderId;
    if (parentFolderId) {
      const { data: parent } = await this.supabase.client
        .from("file_folders")
        .select()
        .eq("id", parentFolderId)
        .maybeSingle();
      if (!parent) throw new NotFoundException("Üst klasör bulunamadı");
      // Başka bir kapsamın klasörünün altına yazmak: kimlik istemciden geliyor.
      if (parent[this.ownerColumn(owner)] !== owner.id) {
        throw new ForbiddenException("Bu klasör bu alana ait değil");
      }
      parentDriveId = parent.drive_folder_id;
    }

    const folder = await this.cloudStorage.findOrCreateFolder(provider, accessToken, temiz, parentDriveId);

    const { data: row, error } = await this.supabase.client
      .from("file_folders")
      .insert({
        [this.ownerColumn(owner)]: owner.id,
        parent_folder_id: parentFolderId ?? null,
        kind: "user",
        name: temiz,
        drive_folder_id: folder.id,
      })
      .select()
      .single();

    if (error) {
      // Aynı adla ikinci klasör (migration 090'daki kısmi unique index): zaten
      // varsa onu döndürmek, klasör yüklemesini idempotent kılıyor.
      //
      // ÜST KLASÖRE GÖRE ARANIR. Tekillik (kapsam, üst klasör, ad) üçlüsünde;
      // yalnızca ada bakmak "Fotoğraflar/2026" ile "Belgeler/2026" gibi iki
      // ayrı dala aynı adı koyan bir klasör yüklemesinde ya yanlış klasörü ya
      // da birden fazla satır döndürüp yüklemeyi düşürüyordu.
      if ((error as any).code === "23505") {
        let arama = this.supabase.client
          .from("file_folders")
          .select()
          .eq(this.ownerColumn(owner), owner.id)
          .eq("kind", "user")
          .ilike("name", temiz);
        arama = parentFolderId ? arama.eq("parent_folder_id", parentFolderId) : arama.is("parent_folder_id", null);
        const { data: raced } = await arama.maybeSingle();
        if (raced) return mapFolder(raced);
      }
      throw error;
    }

    return mapFolder(row);
  }

  /**
   * "Fotoğraflar/2026/Ocak" gibi bir yolu klasör klasör kurar ve en alttakini döndürür.
   *
   * Klasör yüklemesi bunu kullanıyor: tarayıcı her dosya için yalnızca göreli
   * yolu veriyor (webkitRelativePath), ağacı biz kurmak zorundayız. Aynı yol
   * ikinci kez gelirse yeni klasör açılmaz (bkz. createFolder'daki 23505 dalı).
   */
  async ensureUserFolderPath(
    owner: FileOwner,
    userId: string,
    segments: string[],
    startFolderId?: string
  ): Promise<string | undefined> {
    let parentId = startFolderId;
    // 12 kademe: gerçek bir klasör ağacı için fazlasıyla yeterli, bozuk/kötü
    // niyetli bir yolun binlerce klasör açmasını da engelliyor.
    for (const segment of segments.slice(0, 12)) {
      const temiz = this.safeFileName(segment).trim();
      if (!temiz || temiz === "." || temiz === "..") continue;
      const folder = await this.createFolder(owner, userId, temiz, parentId);
      parentId = folder.id;
    }
    return parentId;
  }

  /**
   * Yüklemenin ineceği klasör.
   *
   * İki girdi var ve ikisi de isteğe bağlı:
   *   * `folderId` — kullanıcının o an içinde bulunduğu klasör.
   *   * `relativePath` — KLASÖR yüklemesinde tarayıcının verdiği göreli yol
   *     ("Fotoğraflar/2026/kapak.jpg"). Dosya adı atılır, kalan kademeler
   *     `folderId`'nin altına kurulur.
   *
   * İkisi de yoksa dosya kapsamın köküne iner (bugünkü davranış).
   */
  private async resolvePlacement(
    owner: FileOwner,
    userId: string,
    rootDriveId: string,
    placement?: { folderId?: string; relativePath?: string }
  ): Promise<{ folderRowId?: string; driveFolderId: string }> {
    let folderId = placement?.folderId;

    if (placement?.relativePath) {
      const segments = placement.relativePath.split("/").filter(Boolean).slice(0, -1);
      if (segments.length) folderId = await this.ensureUserFolderPath(owner, userId, segments, folderId);
    }

    if (!folderId) return { driveFolderId: rootDriveId };

    const { data: row } = await this.supabase.client
      .from("file_folders")
      .select()
      .eq("id", folderId)
      .maybeSingle();
    if (!row) throw new NotFoundException("Klasör bulunamadı");
    // Kimlik istemciden geliyor: başka bir kapsamın klasörüne yazılamamalı.
    if (row[this.ownerColumn(owner)] !== owner.id) {
      throw new ForbiddenException("Bu klasör bu alana ait değil");
    }

    return { folderRowId: row.id, driveFolderId: row.drive_folder_id };
  }

  async renameFolder(folderId: string, userId: string, name: string): Promise<FileFolderEntry> {
    const { row, owner } = await this.folderForWrite(folderId, userId);

    const temiz = this.safeFileName(name ?? "").trim();
    if (!temiz) throw new BadRequestException("Klasör adı gerekli");

    const { provider, accountId } = await this.ownerRoot(owner, userId);
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    await this.cloudStorage.renameFile(provider, accessToken, row.drive_folder_id, temiz);

    const { data: updated, error } = await this.supabase.client
      .from("file_folders")
      .update({ name: temiz })
      .eq("id", folderId)
      .select()
      .single();
    if (error) throw error;
    return mapFolder(updated);
  }

  /**
   * Klasörü kaldırır.
   *
   * Bulut tarafında ÇÖP KUTUSUNA taşınır (silinmez): geri alınabilir olması,
   * yanlışlıkla bir ağacı yok etmenin bedelini düşürüyor. Projelio tarafında
   * içindeki dosyalar arşivlenir — satırları silmek, "dosya kayboldu" diye
   * geri dönülemez bir durum yaratırdı.
   */
  async removeFolder(folderId: string, userId: string): Promise<void> {
    const { row, owner } = await this.folderForWrite(folderId, userId);

    const { provider, accountId } = await this.ownerRoot(owner, userId);
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    try {
      await this.cloudStorage.trashFile(provider, accessToken, row.drive_folder_id);
    } catch (err) {
      this.logger.warn(`Klasör buluta taşınamadı (folder=${folderId}): ${String(err)}`);
    }

    const ids = await this.folderSubtreeIds(folderId);
    await this.supabase.client
      .from("files")
      .update({ archived_at: new Date().toISOString() })
      .in("folder_id", ids);
    // Alt klasör satırları parent_folder_id cascade ile gidiyor (migration 023).
    const { error } = await this.supabase.client.from("file_folders").delete().eq("id", folderId);
    if (error) throw error;
  }

  /**
   * Dosyayı başka bir klasöre (ya da köke) taşır.
   *
   * Klasör sistemi bunsuz yarım kalıyordu: yüklendikten sonra bir dosyayı
   * düzenlemenin tek yolu silip yeniden yüklemekti. Taşıma HEM Projelio'da hem
   * bulutta yapılır — ikisi ayrışırsa kullanıcı Drive'da dosyayı bambaşka bir
   * yerde bulur.
   *
   * `folderId` verilmezse dosya kapsamın köküne çıkar.
   */
  async moveFile(fileId: string, userId: string, folderId?: string): Promise<ProjectFile> {
    const { row } = await this.findById(fileId, userId);

    const owner = ownerOfFileRow(row);
    // Erişim findById'de doğrulandı; burada asıl mesele hedefin AYNI kapsamda
    // olması — klasör kimliği istemciden geliyor.
    const { provider, accountId, rootFolderId } = await this.ownerRoot(owner, userId);
    const hedef = await this.resolvePlacement(owner, userId, rootFolderId, { folderId });

    // Bulunulan yer: Google'da eski ebeveyni çıkarmak için gerekiyor.
    let mevcutDriveKlasoru = rootFolderId;
    if (row.folder_id) {
      const { data: mevcut } = await this.supabase.client
        .from("file_folders")
        .select("drive_folder_id")
        .eq("id", row.folder_id)
        .maybeSingle();
      if (mevcut?.drive_folder_id) mevcutDriveKlasoru = mevcut.drive_folder_id;
    }

    if (hedef.driveFolderId !== mevcutDriveKlasoru) {
      const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
      await this.cloudStorage.moveFile(
        provider,
        accessToken,
        row.drive_file_id,
        hedef.driveFolderId,
        mevcutDriveKlasoru
      );
    }

    const { data: updated, error } = await this.supabase.client
      .from("files")
      .update({ folder_id: hedef.folderRowId ?? null })
      .eq("id", fileId)
      .select()
      .single();
    if (error) throw error;

    return mapFile(updated, await this.canEditInDrive(row.job_id, userId, row.project_id ?? undefined));
  }

  /**
   * Klasörü başka bir klasörün altına (ya da köke) taşır.
   *
   * Kendi altına taşımak ağacı koparıp erişilemez bir döngü bırakırdı; bu
   * yüzden hedefin, taşınan klasörün alt ağacında olmadığı kontrol ediliyor.
   */
  async moveFolder(folderId: string, userId: string, parentFolderId?: string): Promise<FileFolderEntry> {
    const { row, owner } = await this.folderForWrite(folderId, userId);
    if (parentFolderId === folderId) throw new BadRequestException("Bir klasör kendi içine taşınamaz");

    const { provider, accountId, rootFolderId } = await this.ownerRoot(owner, userId);

    let hedefDriveKlasoru = rootFolderId;
    if (parentFolderId) {
      if ((await this.folderSubtreeIds(folderId)).includes(parentFolderId)) {
        throw new BadRequestException("Bir klasör kendi alt klasörüne taşınamaz");
      }
      const { data: parent } = await this.supabase.client
        .from("file_folders")
        .select()
        .eq("id", parentFolderId)
        .maybeSingle();
      if (!parent) throw new NotFoundException("Üst klasör bulunamadı");
      if (parent[this.ownerColumn(owner)] !== owner.id) {
        throw new ForbiddenException("Bu klasör bu alana ait değil");
      }
      hedefDriveKlasoru = parent.drive_folder_id;
    }

    let mevcutDriveKlasoru = rootFolderId;
    if (row.parent_folder_id) {
      const { data: mevcut } = await this.supabase.client
        .from("file_folders")
        .select("drive_folder_id")
        .eq("id", row.parent_folder_id)
        .maybeSingle();
      if (mevcut?.drive_folder_id) mevcutDriveKlasoru = mevcut.drive_folder_id;
    }

    if (hedefDriveKlasoru !== mevcutDriveKlasoru) {
      const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
      await this.cloudStorage.moveFile(
        provider,
        accessToken,
        row.drive_folder_id,
        hedefDriveKlasoru,
        mevcutDriveKlasoru
      );
    }

    const { data: updated, error } = await this.supabase.client
      .from("file_folders")
      .update({ parent_folder_id: parentFolderId ?? null })
      .eq("id", folderId)
      .select()
      .single();
    if (error) {
      // Hedefte aynı adda bir klasör zaten var (migration 090 tekillik indeksi).
      if ((error as any).code === "23505") {
        throw new BadRequestException("Hedefte aynı adda bir klasör zaten var.");
      }
      throw error;
    }
    return mapFolder(updated);
  }

  /**
   * Dosyayı aynı klasöre kopyalar ("Çoğalt").
   *
   * Bulutta gerçek bir kopya açılıyor: aynı Drive dosyasına ikinci bir Projelio
   * satırı yazmak, birini silince diğerinin de içeriğini götürürdü.
   */
  async duplicateFile(fileId: string, userId: string): Promise<ProjectFile> {
    const { row } = await this.findById(fileId, userId);
    const owner = ownerOfFileRow(row);
    const { provider, accountId, rootFolderId } = await this.ownerRoot(owner, userId);

    // Kopya kaynağın YANINA düşer; kullanıcı çoğalttığı şeyi bulunduğu yerde arar.
    const target = await this.resolvePlacement(owner, userId, rootFolderId, {
      folderId: row.folder_id ?? undefined,
    });

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const kopya = await this.cloudStorage.copyFile(
      provider,
      accessToken,
      row.drive_file_id,
      target.driveFolderId,
      kopyaAdi(row.name)
    );

    const flat = flatScopeOfRow(row);
    if (flat) return this.persistFlatFile(flat, userId, provider, accountId, kopya, target.folderRowId);
    return this.persist(
      row.job_id,
      userId,
      provider,
      accountId,
      kopya,
      { taskId: row.task_id ?? undefined, outputId: row.output_id ?? undefined },
      row.project_id ?? undefined,
      target.folderRowId
    );
  }

  /**
   * Klasörü içeriğiyle birlikte çoğaltır.
   *
   * TAVAN VAR ve bilerek düşük: her dosya için ayrı bir bulut kopyalama isteği
   * gidiyor, yani 200 dosyalık bir ağaç tek HTTP isteğini dakikalarca açık
   * tutardı ve yarıda kopan bir istek yarım bir kopya bırakırdı. Sınırın
   * üstünde işe hiç başlamıyoruz — yarım kopyalamaktansa açıkça reddetmek.
   */
  async duplicateFolder(folderId: string, userId: string): Promise<FileFolderEntry> {
    const { row, owner } = await this.folderForWrite(folderId, userId);

    const ids = await this.folderSubtreeIds(folderId);
    const { count } = await this.supabase.client
      .from("files")
      .select("id", { count: "exact", head: true })
      .in("folder_id", ids)
      .is("archived_at", null);
    if ((count ?? 0) > KLASOR_COGALTMA_TAVANI) {
      // Şablon dizesi DEĞİL: mesaj sözlük anahtarı olarak aranıyor, değişken
      // gömülürse İngilizce arayüzde sessizce Türkçe kalırdı (bkz. dil-denetimi).
      throw new BadRequestException("Bu klasör çoğaltmak için çok büyük (en fazla 50 dosya).");
    }

    const hedef = await this.createFolder(owner, userId, kopyaAdi(row.name), row.parent_folder_id ?? undefined);
    await this.copyFolderContents(owner, userId, folderId, hedef.id, 0);
    return hedef;
  }

  /** duplicateFolder'ın özyinelemeli gövdesi: bir klasörün içindekileri hedefe kopyalar. */
  private async copyFolderContents(
    owner: FileOwner,
    userId: string,
    kaynakId: string,
    hedefId: string,
    derinlik: number
  ): Promise<void> {
    if (derinlik >= 12) return;

    const { data: dosyalar } = await this.supabase.client
      .from("files")
      .select()
      .eq("folder_id", kaynakId)
      .is("archived_at", null)
      .limit(KLASOR_COGALTMA_TAVANI);

    for (const dosya of dosyalar ?? []) {
      const { provider, accountId } = storageOwner(dosya);
      const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
      const { data: hedefKlasor } = await this.supabase.client
        .from("file_folders")
        .select("drive_folder_id")
        .eq("id", hedefId)
        .maybeSingle();
      if (!hedefKlasor) return;

      // Ad KORUNUR: kopya klasörün içinde "… kopya" eki anlamsız, klasörün
      // kendisi zaten kopya.
      const kopya = await this.cloudStorage.copyFile(
        provider,
        accessToken,
        dosya.drive_file_id,
        hedefKlasor.drive_folder_id,
        dosya.name
      );
      const flat = flatScopeOfRow(dosya);
      if (flat) await this.persistFlatFile(flat, userId, provider, accountId, kopya, hedefId);
      else
        await this.persist(
          dosya.job_id,
          userId,
          provider,
          accountId,
          kopya,
          { taskId: dosya.task_id ?? undefined, outputId: dosya.output_id ?? undefined },
          dosya.project_id ?? undefined,
          hedefId
        );
    }

    const { data: altlar } = await this.supabase.client
      .from("file_folders")
      .select()
      .eq("parent_folder_id", kaynakId)
      .eq("kind", "user");

    for (const alt of altlar ?? []) {
      const yeni = await this.createFolder(owner, userId, alt.name, hedefId);
      await this.copyFolderContents(owner, userId, alt.id, yeni.id, derinlik + 1);
    }
  }

  /** Klasör ve altındaki tüm klasörlerin kimlikleri. */
  private async folderSubtreeIds(folderId: string): Promise<string[]> {
    const ids = [folderId];
    let frontier = [folderId];

    // Genişlik öncelikli, 12 kademeyle sınırlı (bkz. ensureUserFolderPath).
    for (let depth = 0; depth < 12 && frontier.length; depth += 1) {
      const { data } = await this.supabase.client
        .from("file_folders")
        .select("id")
        .in("parent_folder_id", frontier);
      frontier = (data ?? []).map((r: any) => r.id);
      ids.push(...frontier);
    }
    return ids;
  }

  /** Yazma işlemleri için klasörü çözer: yalnızca kullanıcı klasörleri değiştirilebilir. */
  private async folderForWrite(folderId: string, userId: string): Promise<{ row: any; owner: FileOwner }> {
    const { data: row, error } = await this.supabase.client
      .from("file_folders")
      .select()
      .eq("id", folderId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Klasör bulunamadı");

    const owner = ownerOfFolderRow(row);
    await this.assertOwnerAccess(owner, userId);

    if (row.kind !== "user") {
      throw new BadRequestException(
        "Bu klasörü Projelio yönetiyor; adı bağlı olduğu proje/görev değiştiğinde değişir."
      );
    }
    return { row, owner };
  }

  // ============================================================ paylaşım

  /**
   * İş ekibiyle bulut klasör izinlerini eşitler.
   *
   * İki seviye:
   *   * İş sahibi + iş üyeleri -> işin KÖK klasörüne izin (her şeyi görürler)
   *   * Yalnızca projeye eklenmiş kişiler -> sadece o projenin klasörüne izin
   *
   * Böylece bir projeye çağrılan taşeron, Drive'da da işin diğer projelerini
   * göremez. Projelio'daki yetkiyle bulut deposundaki yetki aynı hikâyeyi anlatır.
   *
   * Bu işin sağlayıcısında (Google/Microsoft) hesabı bağlı olmayan üyeler
   * atlanır — dosyaları yine görür ve indirirler (backend proxy'si üzerinden),
   * sadece bulut editörünü açamazlar.
   */
  async syncJobShares(jobId: string): Promise<{ granted: number; revoked: number }> {
    const { data: storage } = await this.supabase.client
      .from("job_storage")
      .select()
      .eq("job_id", jobId)
      .maybeSingle();
    if (!storage) return { granted: 0, revoked: 0 };

    const { provider, accountId } = storageOwner(storage);
    const ownerAccount = await this.cloudStorage.findById(provider, accountId);
    if (!this.cloudStorage.isDriveReady(provider, ownerAccount)) return { granted: 0, revoked: 0 };
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);

    const [jobLevel, { data: projects }, { data: grants }] = await Promise.all([
      // İş ekibi + hiyerarşideki üst kademeler (organizasyon, grup) tek listeden gelir;
      // bulut izinleri Projelio'daki yetkiyle birebir aynı hikâyeyi anlatsın.
      this.jobLevelUserIds(jobId),
      this.supabase.client
        .from("projects")
        .select("id, owner_id, project_members(user_id, status)")
        .eq("job_id", jobId),
      this.supabase.client.from("job_folder_grants").select().eq("job_id", jobId),
    ]);

    /** projectId -> erişmesi gereken kullanıcılar (iş düzeyindekiler hariç) */
    const projectLevel = new Map<string, Set<string>>();
    for (const project of projects ?? []) {
      const users = new Set<string>();
      if (project.owner_id) users.add(project.owner_id);
      for (const m of project.project_members ?? []) {
        if (m.status === "approved") users.add(m.user_id);
      }
      for (const u of jobLevel) users.delete(u);
      if (users.size) projectLevel.set(project.id, users);
    }

    // Depolama sahibi dosyaların gerçek sahibi; kendine izin vermeye gerek yok.
    jobLevel.delete(ownerAccount!.userId);

    let granted = 0;
    let revoked = 0;

    // --- artık hak etmeyenlerin izinlerini geri al
    for (const grant of grants ?? []) {
      const stillValid = grant.project_id
        ? projectLevel.get(grant.project_id)?.has(grant.user_id)
        : jobLevel.has(grant.user_id);
      if (stillValid) continue;

      try {
        await this.cloudStorage.revokePermission(provider, accessToken, grant.drive_file_id, grant.drive_permission_id);
      } catch (err) {
        this.logger.warn(`İzin geri alınamadı (grant=${grant.id}): ${String(err)}`);
      }
      await this.supabase.client.from("job_folder_grants").delete().eq("id", grant.id);
      revoked += 1;
    }

    const existingJobGrants = new Set(
      (grants ?? []).filter((g: any) => !g.project_id).map((g: any) => g.user_id)
    );
    const existingProjectGrants = new Set(
      (grants ?? []).filter((g: any) => g.project_id).map((g: any) => `${g.project_id}:${g.user_id}`)
    );

    // --- iş düzeyi izinler (kök klasör)
    for (const userId of jobLevel) {
      if (existingJobGrants.has(userId)) continue;
      granted += await this.grantOne(provider, accessToken, {
        jobId,
        userId,
        driveFileId: storage.drive_folder_id,
      });
    }

    // --- proje düzeyi izinler (yalnızca o projenin klasörü)
    for (const [projectId, users] of projectLevel) {
      for (const userId of users) {
        if (existingProjectGrants.has(`${projectId}:${userId}`)) continue;

        // Proje klasörü henüz yoksa (o projeye hiç dosya yüklenmemişse) izin
        // verecek bir hedef de yok. İlk yüklemede tekrar eşitlenecek.
        const { data: folder } = await this.supabase.client
          .from("file_folders")
          .select("drive_folder_id")
          .eq("job_id", jobId)
          .eq("kind", "project")
          .eq("project_id", projectId)
          .maybeSingle();
        if (!folder) continue;

        granted += await this.grantOne(provider, accessToken, {
          jobId,
          projectId,
          userId,
          driveFileId: folder.drive_folder_id,
        });
      }
    }

    return { granted, revoked };
  }

  private async grantOne(
    provider: StorageProvider,
    accessToken: string,
    params: { jobId: string; projectId?: string; userId: string; driveFileId: string }
  ): Promise<number> {
    // Grantee'nin AYNI sağlayıcıda bağlı bir hesabı olmalı — Drive izni bir
    // Google e-postası, OneDrive izni bir Microsoft e-postası ister.
    const account = await this.cloudStorage.findByUserId(provider, params.userId);
    if (!account) return 0; // Bu sağlayıcıda hesabı yok: proxy ile erişmeye devam eder

    try {
      const { permissionId } = await this.cloudStorage.grantPermission(
        provider,
        accessToken,
        params.driveFileId,
        account.email,
        "writer"
      );
      await this.supabase.client.from("job_folder_grants").insert({
        job_id: params.jobId,
        project_id: params.projectId ?? null,
        user_id: params.userId,
        granted_email: account.email,
        drive_file_id: params.driveFileId,
        drive_permission_id: permissionId,
        role: "writer",
      });
      return 1;
    } catch (err) {
      this.logger.warn(`Bulut izni verilemedi (user=${params.userId}): ${String(err)}`);
      return 0;
    }
  }

  /** Proje ekibi değiştiğinde çağrılır; işi bulup tam eşitleme yapar. */
  async syncSharesForProject(projectId: string): Promise<void> {
    const jobId = await this.jobIdOfProject(projectId);
    await this.syncJobShares(jobId);
  }

  /**
   * Kullanıcının bulut hesabı bu dosyanın klasörüne erişebiliyor mu?
   * Arayüzdeki "Drive'da düzenle" düğmesi buna bakar.
   */
  private async canEditInDrive(jobId: string, userId: string, projectId?: string): Promise<boolean> {
    const { data: storage } = await this.supabase.client
      .from("job_storage")
      .select("storage_provider, google_account_id, microsoft_account_id")
      .eq("job_id", jobId)
      .maybeSingle();
    if (!storage) return false;

    const { provider, accountId } = storageOwner(storage);
    const ownerAccount = await this.cloudStorage.findById(provider, accountId);
    if (ownerAccount?.userId === userId) return true;

    const { data: grants } = await this.supabase.client
      .from("job_folder_grants")
      .select("project_id")
      .eq("job_id", jobId)
      .eq("user_id", userId);

    return (grants ?? []).some(
      (g: any) => g.project_id === null || (projectId && g.project_id === projectId)
    );
  }

  /**
   * Departman kadrosuyla bulut klasör izinlerini eşitler.
   *
   * İş modelinden farkı: tek seviye — departmanın onaylı her kadro üyesi (+
   * organizasyon sahibi) klasörün TAMAMINA izinlidir, proje bazlı alt izin yok.
   */
  async syncFlatShares(scope: FlatScope): Promise<{ granted: number; revoked: number }> {
    const tables = this.flatTables(scope);

    const { data: storage } = await this.supabase.client
      .from(tables.storage)
      .select()
      .eq(tables.idColumn, scope.id)
      .maybeSingle();
    // Şirkette satır klasörsüz olabilir (hesap seçilmiş, henüz dosya eklenmemiş):
    // paylaşılacak bir klasör yoksa yapacak bir şey de yok.
    if (!storage?.drive_folder_id) return { granted: 0, revoked: 0 };

    const { provider, accountId } = storageOwner(storage);
    const ownerAccount = await this.cloudStorage.findById(provider, accountId);
    if (!this.cloudStorage.isDriveReady(provider, ownerAccount)) return { granted: 0, revoked: 0 };
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);

    const [eligible, { data: grants }] = await Promise.all([
      this.flatEligibleUserIds(scope),
      this.supabase.client.from(tables.grants).select().eq(tables.idColumn, scope.id),
    ]);

    // Depolama sahibi dosyaların gerçek sahibi; kendine izin vermeye gerek yok.
    eligible.delete(ownerAccount!.userId);

    let granted = 0;
    let revoked = 0;

    for (const grant of grants ?? []) {
      if (eligible.has(grant.user_id)) continue;
      try {
        await this.cloudStorage.revokePermission(provider, accessToken, grant.drive_file_id, grant.drive_permission_id);
      } catch (err) {
        this.logger.warn(`İzin geri alınamadı (grant=${grant.id}): ${String(err)}`);
      }
      await this.supabase.client.from(tables.grants).delete().eq("id", grant.id);
      revoked += 1;
    }

    const existingGrants = new Set((grants ?? []).map((g: any) => g.user_id));
    for (const userId of eligible) {
      if (existingGrants.has(userId)) continue;
      granted += await this.grantOneFlat(provider, accessToken, {
        scope,
        userId,
        driveFileId: storage.drive_folder_id,
      });
    }

    return { granted, revoked };
  }

  /** Eski ad; denetleyici bunu çağırıyor. */
  async syncDepartmentShares(departmentId: string): Promise<{ granted: number; revoked: number }> {
    return this.syncFlatShares({ kind: "department", id: departmentId });
  }

  private async grantOneFlat(
    provider: StorageProvider,
    accessToken: string,
    params: { scope: FlatScope; userId: string; driveFileId: string }
  ): Promise<number> {
    const account = await this.cloudStorage.findByUserId(provider, params.userId);
    if (!account) return 0; // Bu sağlayıcıda hesabı yok: proxy ile erişmeye devam eder

    const tables = this.flatTables(params.scope);
    try {
      const { permissionId } = await this.cloudStorage.grantPermission(
        provider,
        accessToken,
        params.driveFileId,
        account.email,
        "writer"
      );
      await this.supabase.client.from(tables.grants).insert({
        [tables.idColumn]: params.scope.id,
        user_id: params.userId,
        granted_email: account.email,
        drive_file_id: params.driveFileId,
        drive_permission_id: permissionId,
        role: "writer",
      });
      return 1;
    } catch (err) {
      this.logger.warn(`Bulut izni verilemedi (user=${params.userId}): ${String(err)}`);
      return 0;
    }
  }

  private async canEditInDriveForFlat(scope: FlatScope, userId: string): Promise<boolean> {
    const tables = this.flatTables(scope);

    const { data: storage } = await this.supabase.client
      .from(tables.storage)
      .select("storage_provider, google_account_id, microsoft_account_id")
      .eq(tables.idColumn, scope.id)
      .maybeSingle();
    if (!storage) return false;

    const { provider, accountId } = storageOwner(storage);
    const ownerAccount = await this.cloudStorage.findById(provider, accountId);
    if (ownerAccount?.userId === userId) return true;

    const { data: grant } = await this.supabase.client
      .from(tables.grants)
      .select("id")
      .eq(tables.idColumn, scope.id)
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(grant);
  }

  // ============================================================ listeleme

  /**
   * İşin dosyaları.
   *
   * scope:
   *   all      -> erişilebilen her şey (iş geneli + projeler)
   *   general  -> yalnızca işin geneline ait, projeye bağlı olmayanlar
   *   project  -> belirli bir projenin dosyaları
   */
  async listByJob(
    jobId: string,
    userId: string,
    filter: {
      scope?: "all" | "general" | "project";
      projectId?: string;
      taskId?: string;
      outputId?: string;
      /** Klasör gezinme: verilirse yalnızca o klasörün dosyaları. */
      folderId?: string;
      /** true ise klasörsüz (kök) dosyalar — iş kapsamında pratikte boş çıkar. */
      atRoot?: boolean;
    } = {}
  ): Promise<ProjectFile[]> {
    const access = await this.assertJobAccess(jobId, userId);

    let query = this.supabase.client
      .from("files")
      .select()
      .eq("job_id", jobId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);

    // Klasör gezinmesi diğer süzgeçlerin ÖNÜNDE: kullanıcı bir klasörün içine
    // girdiyse gördüğü şey o klasörün içeriğidir, proje/görev süzgeci değil.
    //
    // Klasör tablosu yoksa hiçbir klasör süzgeci uygulanmaz (bkz. foldersAvailable):
    // aksi halde ekran boş görünüyordu.
    const klasorlerHazir = filter.folderId || filter.atRoot ? await this.foldersAvailable() : false;
    if (klasorlerHazir && filter.folderId) query = query.eq("folder_id", filter.folderId);
    else if (klasorlerHazir && filter.atRoot) query = query.is("folder_id", null);
    else if (filter.taskId) query = query.eq("task_id", filter.taskId);
    else if (filter.outputId) query = query.eq("output_id", filter.outputId);
    else if (filter.projectId) {
      this.assertContextAllowed(access, filter.projectId);
      query = query.eq("project_id", filter.projectId);
    } else if (filter.scope === "general") {
      this.assertContextAllowed(access, undefined);
      query = query.is("project_id", null);
    } else if (access.level === "project") {
      // Proje düzeyindeki kullanıcı "hepsi" istese bile yalnızca kendi
      // projelerini görür; işin geneli ona kapalı.
      query = query.in("project_id", access.projectIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    let rows = data ?? [];
    // Görev/çıktı filtresiyle gelindiğinde de proje sınırını uygula.
    if (access.level === "project") {
      rows = rows.filter((r: any) => r.project_id && access.projectIds.includes(r.project_id));
    }

    return Promise.all(
      rows.map(async (row: any) =>
        mapFile(row, await this.canEditInDrive(jobId, userId, row.project_id ?? undefined))
      )
    );
  }

  /** Departman ekranı: dosyalar düz bir listedir, iş hiyerarşisindeki alt bağlam yok. */
  /**
   * `folderId` verilmezse KÖK listelenir (klasörü olmayan dosyalar), verilirse o
   * klasörün içi. Klasörlerin kendisi ayrı uçtan geliyor (bkz. listFolders):
   * yanıt tipini bozmamak için ikisi ayrı istek — arayüz ikisini paralel çekiyor.
   */
  async listByFlat(scope: FlatScope, userId: string, folderId?: string): Promise<ProjectFile[]> {
    await this.assertFlatAccess(scope, userId);
    const tables = this.flatTables(scope);

    let query = this.supabase.client
      .from("files")
      .select()
      .eq(tables.idColumn, scope.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);

    const { data, error } = await query;
    if (error) throw error;

    const canEdit = await this.canEditInDriveForFlat(scope, userId);
    return (data ?? []).map((row: any) => mapFile(row, canEdit));
  }

  async listByDepartment(departmentId: string, userId: string, folderId?: string): Promise<ProjectFile[]> {
    return this.listByFlat({ kind: "department", id: departmentId }, userId, folderId);
  }

  // ------------------------------------------------- hiyerarşi: org / grup

  /**
   * Bir organizasyonun altındaki bütün işlerin dosyaları.
   *
   * Erişim: organizasyon sahibi, onaylı üyeleri ve — organizasyon bir gruba
   * bağlıysa — o grubun sahibi/üyeleri.
   */
  async listByOrganization(
    organizationId: string,
    userId: string,
    folderId?: string
  ): Promise<ProjectFile[]> {
    // Bir klasörün içindeyken toplama liste anlamsız: kullanıcı o klasörün
    // içeriğini görmek istiyor, şirketin altındaki işlerin dosyalarını değil.
    if (folderId) return this.listByFlat({ kind: "organization", id: organizationId }, userId, folderId);

    const { data: org, error } = await this.supabase.client
      .from("organizations")
      .select("owner_id, group_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");

    const allowed =
      org.owner_id === userId ||
      (await this.isApprovedOrgMember(organizationId, userId)) ||
      (org.group_id ? await this.hasGroupAccess(org.group_id, userId) : false);
    if (!allowed) throw new ForbiddenException("Bu organizasyonun dosyalarına erişim yetkiniz yok");

    const scope: FlatScope = { kind: "organization", id: organizationId };

    const [{ data: jobs }, own, canEdit] = await Promise.all([
      this.supabase.client.from("jobs").select("id").eq("organization_id", organizationId),
      // Şirketin KENDİ dosyaları (migration 089). Erişim yukarıda doğrulandı;
      // listByFlat'ı çağırmak aynı kontrolü ikinci kez yapardı.
      //
      // Migration uygulanmadan dağıtım yapılırsa `files.organization_id` kolonu
      // yoktur. Bu sekme eskiden de çalışıyordu (işlerin dosyalarını topluyordu);
      // kolon yok diye tamamen patlaması, çalışan bir ekranı bozmak olurdu.
      this.supabase.client
        .from("files")
        .select()
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        // Kökteki dosyalar; klasörlerin içi ancak o klasöre girilince listelenir.
        .is("folder_id", null)
        .order("created_at", { ascending: false })
        .limit(LISTE_TAVANI)
        .then(({ data, error }) => {
          if (error) {
            this.logger.warn(`Şirket dosyaları okunamadı (migration 089 uygulandı mı?): ${error.message}`);
            return [] as any[];
          }
          return data ?? [];
        }),
      this.canEditInDriveForFlat(scope, userId).catch(() => false),
    ]);

    const jobFiles = await this.listForJobIds((jobs ?? []).map((j: any) => j.id), userId);

    // Şirketin kendi dosyaları önce: sekmeyi açan kişi çoğu zaman oraya koyduğu
    // dosyayı arıyor, işlerin dosyaları arasında kaybolmasın.
    return [...own.map((row: any) => mapFile(row, canEdit)), ...jobFiles];
  }

  /**
   * Bir grubun altındaki bütün işlerin dosyaları.
   *
   * İki yoldan gelir: gruba doğrudan bağlı işler ve gruba bağlı
   * organizasyonların işleri.
   */
  async listByGroup(groupId: string, userId: string): Promise<ProjectFile[]> {
    if (!(await this.hasGroupAccess(groupId, userId))) {
      throw new ForbiddenException("Bu grubun dosyalarına erişim yetkiniz yok");
    }

    const { data: orgs } = await this.supabase.client
      .from("organizations")
      .select("id")
      .eq("group_id", groupId);
    const orgIds = (orgs ?? []).map((o: any) => o.id);

    const [{ data: directJobs }, { data: orgJobs }] = await Promise.all([
      this.supabase.client.from("jobs").select("id").eq("group_id", groupId),
      orgIds.length
        ? this.supabase.client.from("jobs").select("id").in("organization_id", orgIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const jobIds = new Set<string>([
      ...(directJobs ?? []).map((j: any) => j.id),
      ...(orgJobs ?? []).map((j: any) => j.id),
    ]);

    return this.listForJobIds([...jobIds], userId);
  }

  private async isApprovedOrgMember(organizationId: string, userId: string): Promise<boolean> {
    const { data } = await this.supabase.client
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    return Boolean(data);
  }

  private async hasGroupAccess(groupId: string, userId: string): Promise<boolean> {
    const [{ data: group }, { data: member }] = await Promise.all([
      this.supabase.client.from("groups").select("owner_id").eq("id", groupId).maybeSingle(),
      // group_members'ta onay durumu yok: eklenen kişi doğrudan üyedir.
      this.supabase.client
        .from("group_members")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    return group?.owner_id === userId || Boolean(member);
  }

  /**
   * Birden çok işin dosyalarını tek listede toplar.
   *
   * Buraya gelen kullanıcı hiyerarşi üzerinden yetkilendirilmiş olsa da her iş
   * için erişim TEKRAR kontrol edilir: araya sonradan başka bir sahiplik kuralı
   * girerse liste sessizce sızdırmasın.
   */
  private async listForJobIds(jobIds: string[], userId: string): Promise<ProjectFile[]> {
    if (!jobIds.length) return [];

    const [lists, { data: jobRows }] = await Promise.all([
      Promise.all(
        jobIds.map((jobId) =>
          this.listByJob(jobId, userId, { scope: "all" }).catch(() => [] as ProjectFile[])
        )
      ),
      this.supabase.client.from("jobs").select("id, title").in("id", jobIds),
    ]);

    const titles = new Map((jobRows ?? []).map((j: any) => [j.id, j.title as string]));

    return lists
      .flat()
      .map((f) => ({ ...f, jobTitle: titles.get(f.jobId) }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  /** Proje ekranından çağrılır: işi kendisi bulur. */
  async listByProject(projectId: string, userId: string, filter: FileContext = {}): Promise<ProjectFile[]> {
    const jobId = await this.jobIdOfProject(projectId);
    return this.listByJob(jobId, userId, { ...filter, projectId: filter.taskId || filter.outputId ? undefined : projectId });
  }

  /**
   * Verilen işlerin dosyalarında ada göre arar (Lio'nun `search_files` aracı).
   *
   * İş listesi DIŞARIDAN veriliyor: çağıran taraf kullanıcının hangi işleri
   * gördüğünü zaten biliyor ve aynı listeyi burada ikinci kez kurmak, iki yerde
   * ayrışabilecek iki erişim tanımı demek olurdu. Yine de gelen listeye
   * GÜVENİLMEZ — her iş için erişim burada tekrar çözülür ve proje düzeyindeki
   * kullanıcıya işin geneline ait dosyalar gösterilmez (bkz. listByJob).
   */
  async searchInJobs(
    jobIds: string[],
    userId: string,
    filter: { query?: string; projectId?: string; uploader?: string; limit?: number } = {}
  ): Promise<FileSearchHit[]> {
    let scope = jobIds.filter(Boolean);

    if (filter.projectId) {
      const jobId = await this.jobIdOfProject(filter.projectId);
      if (!scope.includes(jobId)) throw new ForbiddenException("Bu projenin dosyalarına erişim yetkiniz yok");
      scope = [jobId];
    }
    if (!scope.length) return [];

    const limit = Math.min(Math.max(Number(filter.limit) || 20, 1), 50);
    const uploaderTerm = filter.uploader?.trim().toLocaleLowerCase("tr") ?? "";

    let query = this.supabase.client
      .from("files")
      .select()
      .in("job_id", scope)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      // Yetki elemesi sorgudan SONRA yapıldığı için ham liste daha geniş çekilir;
      // doğrudan `limit` ile çekilseydi elenen satırlar yüzünden sonuç sayısı
      // sebepsiz yere azalırdı. Yükleyene göre süzülüyorsa pencere iyice
      // genişler: aranan kişinin dosyaları eski olabilir ve dar bir pencerede
      // "bulunamadı" demek, olmayan bir şeyi yok saymak olurdu.
      .limit(uploaderTerm ? UPLOADER_SCAN_LIMIT : limit * 4);

    if (filter.projectId) query = query.eq("project_id", filter.projectId);

    const term = filter.query ? likeTerm(filter.query) : "";
    if (term) query = query.ilike("name", `%${term}%`);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return [];

    // Erişim İŞ BAŞINA bir kez çözülür: satır başına çözmek aynı sorguyu
    // onlarca kez çalıştırmak olurdu.
    const accessByJob = new Map<string, JobAccess>();
    for (const jobId of new Set<string>(rows.map((r: any) => r.job_id).filter(Boolean))) {
      accessByJob.set(jobId, await this.resolveAccess(jobId, userId));
    }

    const visible = rows.filter((row: any) => {
      const access = accessByJob.get(row.job_id);
      if (!access || access.level === "none") return false;
      if (access.level === "job") return true;
      return Boolean(row.project_id) && access.projectIds.includes(row.project_id);
    });
    if (!visible.length) return [];

    // Yükleyen adları YALNIZCA kullanıcının zaten görebildiği dosyalardan
    // toplanır. Adı doğrudan `users` tablosunda aramak daha kolay olurdu ama o,
    // dosyayla hiç ilgisi olmayan kişilerin varlığını sızdıran bir arama ucu
    // açardı.
    const uploaderIds = [...new Set<string>(visible.map((r: any) => r.uploaded_by).filter(Boolean))];
    const { data: uploaderRows } = uploaderIds.length
      ? await this.supabase.client.from("users").select("id, full_name").in("id", uploaderIds)
      : { data: [] as any[] };
    const uploaderNames = new Map<string, string>(
      (uploaderRows ?? []).map((u: any) => [u.id, u.full_name as string])
    );

    const allowed = (
      uploaderTerm
        ? visible.filter((row: any) =>
            (uploaderNames.get(row.uploaded_by) ?? "").toLocaleLowerCase("tr").includes(uploaderTerm)
          )
        : visible
    ).slice(0, limit);
    if (!allowed.length) return [];

    // Başlıklar tek sorguda toplanır; model "hangi işin/projenin dosyası"
    // bilgisini görmeden doğru dosyayı seçemiyor.
    const foundJobIds = [...new Set<string>(allowed.map((r: any) => r.job_id).filter(Boolean))];
    const foundProjectIds = [...new Set<string>(allowed.map((r: any) => r.project_id).filter(Boolean))];
    const [{ data: jobRows }, { data: projectRows }] = await Promise.all([
      foundJobIds.length
        ? this.supabase.client.from("jobs").select("id, title").in("id", foundJobIds)
        : Promise.resolve({ data: [] as any[] }),
      foundProjectIds.length
        ? this.supabase.client.from("projects").select("id, title").in("id", foundProjectIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const jobTitles = new Map((jobRows ?? []).map((j: any) => [j.id, j.title as string]));
    const projectTitles = new Map((projectRows ?? []).map((p: any) => [p.id, p.title as string]));

    return allowed.map((row: any) => ({
      id: row.id,
      name: row.name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : undefined,
      uploadedByName: uploaderNames.get(row.uploaded_by),
      jobId: row.job_id ?? undefined,
      jobTitle: row.job_id ? jobTitles.get(row.job_id) : undefined,
      projectId: row.project_id ?? undefined,
      projectTitle: row.project_id ? projectTitles.get(row.project_id) : undefined,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async findById(fileId: string, userId: string): Promise<{ row: any; file: ProjectFile }> {
    const { data: row, error } = await this.supabase.client
      .from("files")
      .select()
      .eq("id", fileId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Dosya bulunamadı");

    // Düz kapsam (departman ya da şirket): erişim ve düzenleme hakkı aynı yoldan.
    const flat = flatScopeOfRow(row);
    if (flat) {
      await this.assertFlatAccess(flat, userId);
      return { row, file: mapFile(row, await this.canEditInDriveForFlat(flat, userId)) };
    }

    const access = await this.assertJobAccess(row.job_id, userId);
    this.assertContextAllowed(access, row.project_id ?? undefined);

    return {
      row,
      file: mapFile(row, await this.canEditInDrive(row.job_id, userId, row.project_id ?? undefined)),
    };
  }

  // ============================================================ yükleme

  async uploadInline(
    jobId: string,
    userId: string,
    file: Express.Multer.File,
    context: FileContext,
    placement?: { folderId?: string; relativePath?: string }
  ): Promise<ProjectFile> {
    if (!file) throw new BadRequestException("Dosya gönderilmedi");
    if (file.size > INLINE_UPLOAD_LIMIT) {
      throw new BadRequestException(
        "Bu dosya doğrudan yükleme için çok büyük; parçalı yükleme akışını kullanın."
      );
    }

    const access = await this.assertJobAccess(jobId, userId);
    const resolvedProjectId = await this.resolveProjectFromContext(context);
    this.assertContextAllowed(access, resolvedProjectId);

    const { provider, accountId, rootFolderId } = await this.ensureJobStorage(jobId, userId);
    // Kullanıcı bir klasörün içindeyken yüklüyorsa oraya iner; yoksa dosya
    // bağlamına göre Projelio'nun kendi klasörüne (Genel / Proje / Görev).
    const target = await this.jobUploadTarget(jobId, userId, provider, accountId, rootFolderId, context, resolvedProjectId, placement);

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const uploaded = await this.cloudStorage.uploadMultipart(
      provider,
      accessToken,
      {
        name: this.safeFileName(decodeUploadFileName(file.originalname)),
        mimeType: file.mimetype || "application/octet-stream",
        parentId: target.driveFolderId,
      },
      file.buffer
    );

    return this.persist(jobId, userId, provider, accountId, uploaded, context, resolvedProjectId, target.folderRowId);
  }

  /**
   * Proje/görev ekranından yükleme.
   *
   * Ön yüzün işi ayrıca bilmesine gerek kalmasın diye iş buradan türetilir;
   * dosya yine işin deposuna, projenin klasörüne yazılır.
   */
  async uploadInlineForProject(
    projectId: string,
    userId: string,
    file: Express.Multer.File,
    context: Omit<FileContext, "projectId">
  ): Promise<ProjectFile> {
    const jobId = await this.jobIdOfProject(projectId);
    return this.uploadInline(jobId, userId, file, { ...context, projectId });
  }

  async createUploadSessionForProject(
    projectId: string,
    userId: string,
    payload: { name: string; mimeType: string; sizeBytes?: number } & Omit<FileContext, "projectId">
  ): Promise<{ sessionId: string; uploadUrl: string }> {
    const jobId = await this.jobIdOfProject(projectId);
    return this.createUploadSession(jobId, userId, { ...payload, projectId });
  }

  /**
   * Departman ekranından yükleme. İş modelinden farkı: bağlam yok (proje/görev/
   * çıktı), dosya doğrudan departmanın düz klasörüne gider.
   */
  async uploadInlineForFlat(
    scope: FlatScope,
    userId: string,
    file: Express.Multer.File,
    placement?: { folderId?: string; relativePath?: string }
  ): Promise<ProjectFile> {
    if (!file) throw new BadRequestException("Dosya gönderilmedi");
    if (file.size > INLINE_UPLOAD_LIMIT) {
      throw new BadRequestException(
        "Bu dosya doğrudan yükleme için çok büyük; parçalı yükleme akışını kullanın."
      );
    }
    await this.assertFlatAccess(scope, userId);

    const { provider, accountId, folderId } = await this.ensureFlatStorage(scope, userId);
    const target = await this.resolvePlacement({ kind: scope.kind, id: scope.id }, userId, folderId, placement);

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const uploaded = await this.cloudStorage.uploadMultipart(
      provider,
      accessToken,
      {
        name: this.safeFileName(decodeUploadFileName(file.originalname)),
        mimeType: file.mimetype || "application/octet-stream",
        parentId: target.driveFolderId,
      },
      file.buffer
    );

    return this.persistFlatFile(scope, userId, provider, accountId, uploaded, target.folderRowId);
  }

  async uploadInlineForDepartment(
    departmentId: string,
    userId: string,
    file: Express.Multer.File
  ): Promise<ProjectFile> {
    return this.uploadInlineForFlat({ kind: "department", id: departmentId }, userId, file);
  }

  async createUploadSessionForFlat(
    scope: FlatScope,
    userId: string,
    payload: { name: string; mimeType: string; sizeBytes?: number; folderId?: string; relativePath?: string }
  ): Promise<{ sessionId: string; uploadUrl: string }> {
    if (!payload?.name) throw new BadRequestException("Dosya adı gerekli");
    await this.assertFlatAccess(scope, userId);

    const { provider, accountId, folderId } = await this.ensureFlatStorage(scope, userId);
    const target = await this.resolvePlacement({ kind: scope.kind, id: scope.id }, userId, folderId, payload);

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const uploadUrl = await this.cloudStorage.createResumableSession(provider, accessToken, {
      name: this.safeFileName(payload.name),
      mimeType: payload.mimeType || "application/octet-stream",
      parentId: target.driveFolderId,
      sizeBytes: payload.sizeBytes,
    });

    const tables = this.flatTables(scope);
    const { data: row, error } = await this.supabase.client
      .from("file_upload_sessions")
      .insert({
        [tables.idColumn]: scope.id,
        folder_id: target.folderRowId ?? null,
        user_id: userId,
        resumable_uri: uploadUrl,
        name: payload.name,
        mime_type: payload.mimeType || "application/octet-stream",
        size_bytes: payload.sizeBytes ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    return { sessionId: row.id, uploadUrl };
  }

  async createUploadSessionForDepartment(
    departmentId: string,
    userId: string,
    payload: { name: string; mimeType: string; sizeBytes?: number }
  ): Promise<{ sessionId: string; uploadUrl: string }> {
    return this.createUploadSessionForFlat({ kind: "department", id: departmentId }, userId, payload);
  }

  async createUploadSession(
    jobId: string,
    userId: string,
    payload: { name: string; mimeType: string; sizeBytes?: number; folderId?: string; relativePath?: string } &
      FileContext
  ): Promise<{ sessionId: string; uploadUrl: string }> {
    if (!payload?.name) throw new BadRequestException("Dosya adı gerekli");

    const access = await this.assertJobAccess(jobId, userId);
    const resolvedProjectId = await this.resolveProjectFromContext(payload);
    this.assertContextAllowed(access, resolvedProjectId);

    const { provider, accountId, rootFolderId } = await this.ensureJobStorage(jobId, userId);
    const target = await this.jobUploadTarget(
      jobId,
      userId,
      provider,
      accountId,
      rootFolderId,
      payload,
      resolvedProjectId,
      payload
    );

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const uploadUrl = await this.cloudStorage.createResumableSession(provider, accessToken, {
      name: this.safeFileName(payload.name),
      mimeType: payload.mimeType || "application/octet-stream",
      parentId: target.driveFolderId,
      sizeBytes: payload.sizeBytes,
    });

    const { data: row, error } = await this.supabase.client
      .from("file_upload_sessions")
      .insert({
        job_id: jobId,
        project_id: resolvedProjectId ?? null,
        task_id: payload.taskId ?? null,
        output_id: payload.outputId ?? null,
        user_id: userId,
        folder_id: target.folderRowId ?? null,
        resumable_uri: uploadUrl,
        name: payload.name,
        mime_type: payload.mimeType || "application/octet-stream",
        size_bytes: payload.sizeBytes ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    return { sessionId: row.id, uploadUrl };
  }

  /**
   * Tarayıcı yüklemeyi bitirdikten sonra çağrılır.
   *
   * driveFileId istemciden geliyor, bu yüzden ona güvenilmez: dosya bulut
   * deposundan gerçekten okunur ve bizim depolama hesabımızda olduğu doğrulanır.
   */
  /**
   * Yarım kalmış bir yükleme oturumunu KAPATIR: ya dosyayı Projelio'ya kazandırır
   * ya da sağlayıcıdan temizler.
   *
   * SORUN. Büyük dosya tarayıcıdan doğrudan Drive/OneDrive'a gidiyor ve son parça
   * ulaştığı anda dosya ORADA OLUŞUYOR. Projelio ise ancak tarayıcı
   * `/complete` çağrısını yapabilirse haberdar oluyor. Aradaki pencerede
   * bağlantı koparsa (ya da sekme arka planda uyutulup istek düşerse) sonuç
   * şu oluyordu: Drive'da dosya var, Projelio'da yok, kullanıcının elinde
   * düzeltecek hiçbir şey yok. "Vazgeç" de aynı pencereye denk gelirse dosya
   * iptal edilmiş görünüp yine Drive'da beliriyordu — oturum iptal edilmediği
   * için Drive onu bir hafta boyunca tamamlanabilir tutuyor.
   *
   * ÇÖZÜM. Yükleme nasıl biterse bitsin oturum burada kapatılıyor:
   *  - Sağlayıcı "dosya oluştu" diyorsa ve kullanıcı vazgeçmediyse kayıt
   *    yaratılır — koptuğu sanılan yükleme aslında başarılıdır.
   *  - Kullanıcı vazgeçtiyse ve dosya oluşmuşsa dosya ÇÖPE atılır; "vazgeçtim"
   *    demek Drive'da bir kopya bırakmamalı.
   *  - Dosya oluşmamışsa oturum sağlayıcı tarafında iptal edilir.
   *
   * Oturum satırı her hâlükârda silinir: iş bitti, açık kalması yalnızca gece
   * temizliğine iş çıkarır.
   */
  async reconcileUploadSession(
    sessionId: string,
    userId: string,
    opts: { cancel?: boolean } = {}
  ): Promise<{ status: "completed"; file: ProjectFile } | { status: "discarded" }> {
    const { data: session, error } = await this.supabase.client
      .from("file_upload_sessions")
      .select()
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new NotFoundException("Yükleme oturumu bulunamadı");
    if (session.user_id !== userId) throw new ForbiddenException("Bu yükleme oturumu size ait değil");
    // Zaten tamamlanmışsa yapacak bir şey yok; bunu hata saymak, tarayıcının
    // hem complete hem reconcile çağırdığı yarış durumunda kullanıcıya sebepsiz
    // bir hata göstermek olurdu.
    if (session.completed_at) return { status: "discarded" };

    const flat = flatScopeOfRow(session);
    const storage = flat
      ? (
          await this.supabase.client
            .from(this.flatTables(flat).storage)
            .select()
            .eq(this.flatTables(flat).idColumn, flat.id)
            .maybeSingle()
        ).data
      : (
          await this.supabase.client.from("job_storage").select().eq("job_id", session.job_id).maybeSingle()
        ).data;
    if (!storage) throw new BadRequestException("Depolama bulunamadı");

    const { provider, accountId } = storageOwner(storage);
    const status = await this.cloudStorage.resumableStatus(
      provider,
      session.resumable_uri,
      session.size_bytes ?? undefined
    );

    const dropSession = async () => {
      await this.supabase.client.from("file_upload_sessions").delete().eq("id", sessionId);
    };

    if (status.state === "complete") {
      if (opts.cancel) {
        // Kullanıcı vazgeçti ama dosya yine de oluşmuş: Drive'da bırakmak,
        // kullanıcının "iptal ettim" bilgisiyle çelişen bir kopya demek.
        const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
        await this.cloudStorage.trashFile(provider, accessToken, status.fileId).catch((err) => {
          this.logger.warn(`İptal edilen yüklemenin dosyası çöpe atılamadı: ${err?.message}`);
        });
        await dropSession();
        return { status: "discarded" };
      }

      // Kopmuş sanılan yükleme aslında başarılı: kaydı yarat, dosya Projelio'da
      // görünsün. completeUploadSession aynı işi yapıyor, tekrar yazmıyoruz.
      const file = await this.completeUploadSession(sessionId, userId, status.fileId);
      return { status: "completed", file };
    }

    // Yarım ya da kayıp: sağlayıcı tarafındaki oturumu kapat. İptal edilmezse
    // oturum bir süre daha tamamlanabilir durumda kalıyor.
    await this.cloudStorage.cancelResumable(provider, session.resumable_uri).catch(() => undefined);
    await dropSession();
    return { status: "discarded" };
  }

  async completeUploadSession(
    sessionId: string,
    userId: string,
    driveFileId: string
  ): Promise<ProjectFile> {
    const { data: session, error } = await this.supabase.client
      .from("file_upload_sessions")
      .select()
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new NotFoundException("Yükleme oturumu bulunamadı");
    if (session.user_id !== userId) throw new ForbiddenException("Bu yükleme oturumu size ait değil");
    if (session.completed_at) throw new BadRequestException("Bu yükleme zaten tamamlanmış");

    const flat = flatScopeOfRow(session);
    if (flat) {
      await this.assertFlatAccess(flat, userId);

      const tables = this.flatTables(flat);
      const { data: storage } = await this.supabase.client
        .from(tables.storage)
        .select()
        .eq(tables.idColumn, flat.id)
        .maybeSingle();
      if (!storage?.drive_folder_id) throw new BadRequestException("Bu alanın dosya deposu bulunamadı");

      const { provider, accountId } = storageOwner(storage);
      const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
      const driveFile = await this.cloudStorage.getFile(provider, accessToken, driveFileId);

      await this.supabase.client
        .from("file_upload_sessions")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", sessionId);

      return this.persistFlatFile(flat, userId, provider, accountId, driveFile);
    }

    const access = await this.assertJobAccess(session.job_id, userId);
    this.assertContextAllowed(access, session.project_id ?? undefined);

    const { data: storage } = await this.supabase.client
      .from("job_storage")
      .select()
      .eq("job_id", session.job_id)
      .maybeSingle();
    if (!storage) throw new BadRequestException("İş depolaması bulunamadı");

    const { provider, accountId } = storageOwner(storage);
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const driveFile = await this.cloudStorage.getFile(provider, accessToken, driveFileId);

    await this.supabase.client
      .from("file_upload_sessions")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", sessionId);

    return this.persist(
      session.job_id,
      userId,
      provider,
      accountId,
      driveFile,
      { taskId: session.task_id ?? undefined, outputId: session.output_id ?? undefined },
      session.project_id ?? undefined,
      session.folder_id ?? undefined
    );
  }

  private async persistFlatFile(
    scope: FlatScope,
    userId: string,
    provider: StorageProvider,
    accountId: string,
    driveFile: {
      id: string;
      name: string;
      mimeType: string;
      size?: number;
      webViewLink?: string;
      iconLink?: string;
      thumbnailLink?: string;
      md5Checksum?: string;
    },
    folderRowId?: string
  ): Promise<ProjectFile> {
    const tables = this.flatTables(scope);
    const { data: row, error } = await this.supabase.client
      .from("files")
      .insert({
        [tables.idColumn]: scope.id,
        folder_id: folderRowId ?? null,
        uploaded_by: userId,
        ...storageAccountColumns(provider, accountId),
        name: driveFile.name,
        mime_type: driveFile.mimeType,
        size_bytes: driveFile.size ?? null,
        drive_file_id: driveFile.id,
        web_view_link: driveFile.webViewLink ?? null,
        icon_link: driveFile.iconLink ?? null,
        thumbnail_link: driveFile.thumbnailLink ?? null,
        md5_checksum: driveFile.md5Checksum ?? null,
        is_google_doc: isGoogleDocMime(driveFile.mimeType),
        status: "ready",
        last_verified_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    void this.notifyFlatNewFile(scope, driveFile.name, userId);
    void this.syncFlatShares(scope).catch(() => undefined);

    return mapFile(row, await this.canEditInDriveForFlat(scope, userId));
  }

  private async persist(
    jobId: string,
    userId: string,
    provider: StorageProvider,
    accountId: string,
    driveFile: {
      id: string;
      name: string;
      mimeType: string;
      size?: number;
      webViewLink?: string;
      iconLink?: string;
      thumbnailLink?: string;
      md5Checksum?: string;
    },
    context: FileContext,
    projectId?: string,
    folderRowId?: string
  ): Promise<ProjectFile> {
    const { data: row, error } = await this.supabase.client
      .from("files")
      .insert({
        job_id: jobId,
        project_id: projectId ?? null,
        folder_id: folderRowId ?? null,
        task_id: context.taskId ?? null,
        output_id: context.outputId ?? null,
        uploaded_by: userId,
        ...storageAccountColumns(provider, accountId),
        name: driveFile.name,
        mime_type: driveFile.mimeType,
        size_bytes: driveFile.size ?? null,
        drive_file_id: driveFile.id,
        web_view_link: driveFile.webViewLink ?? null,
        icon_link: driveFile.iconLink ?? null,
        thumbnail_link: driveFile.thumbnailLink ?? null,
        md5_checksum: driveFile.md5Checksum ?? null,
        is_google_doc: isGoogleDocMime(driveFile.mimeType),
        status: "ready",
        last_verified_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    void this.notifyTeamNewFile(jobId, projectId, driveFile.name, userId);

    // Yeni proje klasörü açılmış olabilir; o projenin üyelerine izin ver.
    void this.syncJobShares(jobId).catch(() => undefined);

    return mapFile(row, await this.canEditInDrive(jobId, userId, projectId));
  }

  /** Drive/OneDrive ve işletim sistemlerinde sorun çıkaran karakterleri temizler. */
  private safeFileName(name: string): string {
    return (name || "dosya").replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
  }

  // ================================================== göz atma / içe aktarma / yeni dosya
  //
  // "Drive'dan seç" iki farklı yoldan çözülür:
  //   * OneDrive: browseForJob/browseForDepartment ile klasör klasör gezinilir
  //     (bkz. onedrive.service.ts listFiles — Files.Read.All scope'u sayesinde).
  //   * Google Drive: gezinme backend'e hiç uğramaz, tarayıcıda resmi Picker
  //     widget'ı açılır (bkz. google.controller.ts pickerToken). Picker'dan
  //     seçilen dosya, aşağıdaki importFor* metotlarıyla (sourceFileId zaten
  //     elde) içe aktarılır — bu kısım her iki sağlayıcı için ortaktır.
  //
  // "Yeni dosya oluştur" da ortak: createNativeFor* sağlayıcıya göre doğru
  // şablonu (Google Dokümanlar/E-Tablolar/Sunular ya da boş Word/Excel/
  // PowerPoint) CloudStorageService üzerinden oluşturup aynı persist akışına sokar.

  async browseForJob(jobId: string, userId: string, folderId?: string): Promise<{ provider: StorageProvider; entries: DriveBrowseEntry[] }> {
    await this.assertJobAccess(jobId, userId);
    const { provider, accountId } = await this.ensureJobStorage(jobId, userId);
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const files = await this.cloudStorage.listFiles(provider, accessToken, folderId);
    return { provider, entries: files.map(toBrowseEntry) };
  }

  async browseForProject(projectId: string, userId: string, folderId?: string) {
    const jobId = await this.jobIdOfProject(projectId);
    return this.browseForJob(jobId, userId, folderId);
  }

  async browseForFlat(
    scope: FlatScope,
    userId: string,
    folderId?: string
  ): Promise<{ provider: StorageProvider; entries: DriveBrowseEntry[] }> {
    await this.assertFlatAccess(scope, userId);
    const { provider, accountId } = await this.ensureFlatStorage(scope, userId);
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const files = await this.cloudStorage.listFiles(provider, accessToken, folderId);
    return { provider, entries: files.map(toBrowseEntry) };
  }

  async browseForDepartment(
    departmentId: string,
    userId: string,
    folderId?: string
  ): Promise<{ provider: StorageProvider; entries: DriveBrowseEntry[] }> {
    return this.browseForFlat({ kind: "department", id: departmentId }, userId, folderId);
  }

  /**
   * "Drive'dan ekle" akışında dosya ZATEN Projelio'da kayıtlı mı?
   *
   * Kayıtlıysa ikinci bir satır yaratmak da dosyayı yeniden kopyalamak da
   * yanlış: kullanıcı aynı dosyayı listede iki kez görür ve Drive'da ikinci bir
   * kopya belirir. Arşivlenmiş bir kayıt bulunursa geri getiriliyor — kullanıcı
   * kaldırdığı dosyayı yeniden eklemek istemiştir.
   */
  private async existingImport(
    scope: { jobId?: string; flat?: FlatScope },
    driveFileId: string
  ): Promise<any | null> {
    let query = this.supabase.client.from("files").select().eq("drive_file_id", driveFileId);
    query = scope.flat
      ? query.eq(this.flatTables(scope.flat).idColumn, scope.flat.id)
      : query.eq("job_id", scope.jobId!);

    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) return null;

    if (data.archived_at) {
      const { data: restored } = await this.supabase.client
        .from("files")
        .update({ archived_at: null })
        .eq("id", data.id)
        .select()
        .maybeSingle();
      return restored ?? data;
    }
    return data;
  }

  async importForJob(
    jobId: string,
    userId: string,
    sourceFileId: string,
    opts: FileContext & { name?: string } = {}
  ): Promise<ProjectFile> {
    if (!sourceFileId) throw new BadRequestException("sourceFileId gerekli");
    const access = await this.assertJobAccess(jobId, userId);
    const resolvedProjectId = await this.resolveProjectFromContext(opts);
    this.assertContextAllowed(access, resolvedProjectId);

    const { provider, accountId, rootFolderId } = await this.ensureJobStorage(jobId, userId);
    const target = await this.ensureContextFolder(jobId, provider, accountId, rootFolderId, {
      ...opts,
      resolvedProjectId,
    });

    // Aynı dosya bu işe daha önce eklendiyse ikinci bir kayıt (ve ikinci bir
    // Drive kopyası) yaratma; var olanı döndür.
    const existing = await this.existingImport({ jobId }, sourceFileId);
    if (existing) {
      return mapFile(existing, await this.canEditInDrive(jobId, userId, existing.project_id ?? undefined));
    }

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const source = await this.cloudStorage.getFile(provider, accessToken, sourceFileId);

    // Dosya ZATEN hedef klasörün içindeyse kopyalamak, kullanıcının Drive
    // kotasında aynı dosyadan ikinci bir kopya demek — kullanıcı bunu "korkunç"
    // diye bildirdi ve haklı. Bu durumda yalnızca kaydını oluşturuyoruz.
    const alreadyInFolder = source.parentIds?.includes(target.driveFolderId) ?? false;
    const stored = alreadyInFolder
      ? source
      : await this.cloudStorage.copyFile(
          provider,
          accessToken,
          sourceFileId,
          target.driveFolderId,
          opts.name ? this.safeFileName(opts.name) : undefined
        );

    return this.persist(jobId, userId, provider, accountId, stored, opts, resolvedProjectId, target.folderRowId);
  }

  async importForProject(
    projectId: string,
    userId: string,
    sourceFileId: string,
    opts: Omit<FileContext, "projectId"> & { name?: string } = {}
  ): Promise<ProjectFile> {
    const jobId = await this.jobIdOfProject(projectId);
    return this.importForJob(jobId, userId, sourceFileId, { ...opts, projectId });
  }

  async importForFlat(
    scope: FlatScope,
    userId: string,
    sourceFileId: string,
    name?: string,
    folderId?: string
  ): Promise<ProjectFile> {
    if (!sourceFileId) throw new BadRequestException("sourceFileId gerekli");
    await this.assertFlatAccess(scope, userId);

    const existing = await this.existingImport({ flat: scope }, sourceFileId);
    if (existing) {
      return mapFile(existing, await this.canEditInDriveForFlat(scope, userId));
    }

    const storage = await this.ensureFlatStorage(scope, userId);
    const { provider, accountId } = storage;
    const target = await this.resolvePlacement({ kind: scope.kind, id: scope.id }, userId, storage.folderId, {
      folderId,
    });

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const source = await this.cloudStorage.getFile(provider, accessToken, sourceFileId);

    // Dosya zaten hedef klasördeyse kopyalanmıyor (bkz. importForJob).
    const stored = source.parentIds?.includes(target.driveFolderId)
      ? source
      : await this.cloudStorage.copyFile(
          provider,
          accessToken,
          sourceFileId,
          target.driveFolderId,
          name ? this.safeFileName(name) : undefined
        );

    return this.persistFlatFile(scope, userId, provider, accountId, stored, target.folderRowId);
  }

  async importForDepartment(
    departmentId: string,
    userId: string,
    sourceFileId: string,
    name?: string
  ): Promise<ProjectFile> {
    return this.importForFlat({ kind: "department", id: departmentId }, userId, sourceFileId, name);
  }

  async createNativeForJob(
    jobId: string,
    userId: string,
    kind: NativeFileKind,
    name: string,
    opts: FileContext = {}
  ): Promise<ProjectFile> {
    if (!name?.trim()) throw new BadRequestException("Dosya adı gerekli");
    const access = await this.assertJobAccess(jobId, userId);
    const resolvedProjectId = await this.resolveProjectFromContext(opts);
    this.assertContextAllowed(access, resolvedProjectId);

    const { provider, accountId, rootFolderId } = await this.ensureJobStorage(jobId, userId);
    const target = await this.ensureContextFolder(jobId, provider, accountId, rootFolderId, {
      ...opts,
      resolvedProjectId,
    });

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const created = await this.cloudStorage.createNativeFile(
      provider,
      accessToken,
      kind,
      this.safeFileName(name),
      target.driveFolderId
    );

    return this.persist(jobId, userId, provider, accountId, created, opts, resolvedProjectId, target.folderRowId);
  }

  async createNativeForProject(
    projectId: string,
    userId: string,
    kind: NativeFileKind,
    name: string,
    opts: Omit<FileContext, "projectId"> = {}
  ): Promise<ProjectFile> {
    const jobId = await this.jobIdOfProject(projectId);
    return this.createNativeForJob(jobId, userId, kind, name, { ...opts, projectId });
  }

  async createNativeForFlat(
    scope: FlatScope,
    userId: string,
    kind: NativeFileKind,
    name: string,
    folderId?: string
  ): Promise<ProjectFile> {
    if (!name?.trim()) throw new BadRequestException("Dosya adı gerekli");
    await this.assertFlatAccess(scope, userId);

    const storage = await this.ensureFlatStorage(scope, userId);
    const { provider, accountId } = storage;
    const target = await this.resolvePlacement({ kind: scope.kind, id: scope.id }, userId, storage.folderId, {
      folderId,
    });

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const created = await this.cloudStorage.createNativeFile(
      provider,
      accessToken,
      kind,
      this.safeFileName(name),
      target.driveFolderId
    );

    return this.persistFlatFile(scope, userId, provider, accountId, created, target.folderRowId);
  }

  async createNativeForDepartment(
    departmentId: string,
    userId: string,
    kind: NativeFileKind,
    name: string
  ): Promise<ProjectFile> {
    return this.createNativeForFlat({ kind: "department", id: departmentId }, userId, kind, name);
  }

  // ============================================================ indirme

  /**
   * Dosya içeriğini bulut deposundan çekip istemciye aktarmak için hazırlar.
   *
   * Bu sağlayıcıda hesabı olmayan (veya klasöre izni bulunmayan) üyeler
   * dosyaya ancak buradan ulaşır: yetki Projelio'nun kendi üyelik kontrolüyle
   * verilir, bulut isteği depolama sahibinin token'ıyla yapılır.
   */
  /**
   * Dosyanın önizlemesini sağlayıcıdan çeker.
   *
   * Neden proxy: Drive'ın thumbnailLink'i KISA ÖMÜRLÜ ve kimlik ister — adresi
   * tarayıcıya vermek hem çalışmaz hem de erişim jetonunu sızdırırdı. OneDrive
   * adresi kendi içinde imzalıdır, orada başlık gönderilmez (gönderilirse Graph
   * isteği reddediyor).
   *
   * Adres bayatlamışsa künye bir kez tazelenip yeniden denenir; yine olmazsa
   * `null` döner ve arayüz tür ikonuna düşer — önizleme kritik değil.
   *
   * KOLON BOŞKEN DE ÇALIŞIR. Eskiden `thumbnail_link` yoksa hemen `null`
   * dönüyordu ve bu, önizlemenin HİÇ görünmemesi demekti: kolon yalnızca
   * yükleme yanıtından dolduruluyor, iki sağlayıcı da orada önizleme adresi
   * vermiyor (bkz. previewableMime). Artık kolon boşsa künye sağlayıcıdan
   * çekilip yazılıyor — ilk istek biraz yavaş, sonrakiler önbellekten.
   */
  async openThumbnail(fileId: string, userId: string): Promise<Response | null> {
    const { row } = await this.findById(fileId, userId);

    const { provider, accountId } = storageOwner(row);
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);

    const iste = (url: string) =>
      fetchWithTimeout(url, provider === "google" ? { headers: { Authorization: `Bearer ${accessToken}` } } : {});

    if (row.thumbnail_link) {
      const response = await iste(row.thumbnail_link).catch(() => null);
      if (response?.ok) return response;
    }

    // Kolon boş ya da adres bayatlamış: künyeyi tazele.
    try {
      const fresh = await this.cloudStorage.getFile(provider, accessToken, row.drive_file_id);
      if (!fresh.thumbnailLink) return null;
      await this.supabase.client
        .from("files")
        .update({ thumbnail_link: fresh.thumbnailLink })
        .eq("id", fileId);
      const response = await iste(fresh.thumbnailLink).catch(() => null);
      return response?.ok ? response : null;
    } catch {
      return null;
    }
  }

  async openDownload(
    fileId: string,
    userId: string
  ): Promise<{ response: Response; fileName: string; mimeType: string }> {
    const { row } = await this.findById(fileId, userId);
    const { provider, accountId } = storageOwner(row);

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    try {
      const response = await this.cloudStorage.downloadResponse(provider, accessToken, row.drive_file_id, row.mime_type);
      const exportAs = GOOGLE_DOC_EXPORT_MIME[row.mime_type];
      return {
        response,
        // Google Dokümanı dışa aktarılırken uzantı kazanır: "Rapor" -> "Rapor.docx"
        fileName: exportAs ? `${row.name}.${exportAs.ext}` : row.name,
        mimeType: exportAs ? exportAs.mime : row.mime_type,
      };
    } catch (error) {
      if (error instanceof DriveFileMissingError || error instanceof OneDriveFileMissingError) {
        await this.markMissing(row.id);
      }
      throw error;
    }
  }

  private async markMissing(fileId: string): Promise<void> {
    await this.supabase.client
      .from("files")
      .update({ status: "missing", last_verified_at: new Date().toISOString() })
      .eq("id", fileId);
  }

  // ============================================================ düzenleme/silme

  async rename(fileId: string, userId: string, name: string): Promise<ProjectFile> {
    const { row } = await this.findById(fileId, userId);
    const { provider, accountId } = storageOwner(row);
    const clean = this.safeFileName(name);
    if (!clean.trim()) throw new BadRequestException("Dosya adı boş olamaz");

    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    await this.cloudStorage.renameFile(provider, accessToken, row.drive_file_id, clean);

    const { data: updated, error } = await this.supabase.client
      .from("files")
      .update({ name: clean })
      .eq("id", fileId)
      .select()
      .single();
    if (error) throw error;

    return mapFile(updated, await this.canEditInDrive(row.job_id, userId, row.project_id ?? undefined));
  }

  /**
   * Dosyayı Projelio'dan kaldırır.
   *
   * Varsayılan olarak bulut deposundaki dosyaya dokunulmaz — kullanıcının kendi
   * depolamasındaki veriyi Projelio'daki bir tıklamayla yok etmek doğru olmaz.
   * `alsoTrash` yalnızca açıkça istenirse çöp kutusuna taşır (kalıcı silmez).
   */
  async remove(fileId: string, userId: string, alsoTrash = false): Promise<void> {
    const { row } = await this.findById(fileId, userId);

    const isUploader = row.uploaded_by === userId;
    const flat = flatScopeOfRow(row);
    const isOwner = flat
      ? await this.isFlatManagerOrOwner(flat, userId)
      : await this.isJobOwner(row.job_id, userId);
    if (!isUploader && !isOwner) {
      throw new ForbiddenException("Bu dosyayı yalnızca yükleyen kişi veya sahibi/yöneticisi kaldırabilir");
    }

    if (alsoTrash) {
      try {
        const { provider, accountId } = storageOwner(row);
        const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
        await this.cloudStorage.trashFile(provider, accessToken, row.drive_file_id);
      } catch (err) {
        this.logger.warn(`Bulut çöp kutusuna taşınamadı (file=${fileId}): ${String(err)}`);
      }
    }

    const { error } = await this.supabase.client
      .from("files")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", fileId);
    if (error) throw error;
  }

  // ============================================================ bildirim

  private async notifyTeamNewFile(
    jobId: string,
    projectId: string | undefined,
    fileName: string,
    uploaderId: string
  ): Promise<void> {
    try {
      const [{ data: job }, { data: jobMembers }] = await Promise.all([
        this.supabase.client.from("jobs").select("owner_id").eq("id", jobId).maybeSingle(),
        this.supabase.client.from("job_members").select("user_id").eq("job_id", jobId).eq("status", "approved"),
      ]);

      const recipients = new Set<string>();
      if (job?.owner_id) recipients.add(job.owner_id);
      for (const m of jobMembers ?? []) recipients.add(m.user_id);

      // Dosya bir projeye iliştirilmişse o projenin ekibi de haberdar olsun.
      if (projectId) {
        const { data: members } = await this.supabase.client
          .from("project_members")
          .select("user_id")
          .eq("project_id", projectId)
          .eq("status", "approved");
        for (const m of members ?? []) recipients.add(m.user_id);
      }

      recipients.delete(uploaderId);
      const link = projectId ? `/projects/${projectId}` : `/jobs/${jobId}`;

      await Promise.all(
        [...recipients].map((userId) =>
          this.notifications.notifyUser(
            userId,
            "task_updated",
            "Yeni Dosya",
            { metin: '"{dosya}" eklendi.', params: { dosya: fileName } },
            link
          )
        )
      );
    } catch {
      // Bildirim gönderilemese de yükleme başarılı sayılır.
    }
  }

  private async notifyFlatNewFile(scope: FlatScope, fileName: string, uploaderId: string): Promise<void> {
    try {
      const recipients = await this.flatEligibleUserIds(scope);
      recipients.delete(uploaderId);

      const path =
        scope.kind === "organization"
          ? `/organizations/${scope.id}?tab=files`
          : `/departments/${scope.id}?tab=files`;

      await Promise.all(
        [...recipients].map((userId) =>
          this.notifications.notifyUserSafe(userId, "task_updated", "Yeni Dosya", `"${fileName}" eklendi.`, path)
        )
      );
    } catch {
      // Bildirim gönderilemese de yükleme başarılı sayılır.
    }
  }
}
