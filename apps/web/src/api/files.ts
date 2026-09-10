import type { GoogleDriveStatus, ProjectFile } from "@projelio/shared";
import { API_URL, api } from "./client";

/** Bu boyutun altındaki dosyalar tek istekte backend üzerinden gider. */
const INLINE_LIMIT = 8 * 1024 * 1024;
/** Resumable yüklemede parça boyutu. Drive 256 KB'ın katı olmasını şart koşar. */
const CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Dosyalar İŞE aittir; aşağıdakiler yalnızca "nereye iliştirildiği" bilgisidir.
 * Hepsi boşsa dosya işin geneline yüklenir (yalnızca iş ekibi görür).
 */
export interface FileContext {
  projectId?: string;
  taskId?: string;
  outputId?: string;
}

/** Dosya listeleme kapsamı. */
export type FileScope = "all" | "general" | "project";

/** Klasörün sahibi; üç kapsam da aynı ağacı kullanıyor. */
export interface FileFolderOwner {
  kind: "job" | "department" | "organization";
  id: string;
}

export interface FileFolder {
  id: string;
  name: string;
  kind: "general" | "user" | "project" | "task" | "output";
  parentFolderId?: string;
  driveFolderId: string;
  /** Projelio üretimi: adı projeden/görevden gelir, silinemez ve yeniden adlandırılamaz. */
  managed: boolean;
}

/**
 * Dosyanın ekleneceği yer.
 *
 * Şirket (organizationId) de bir hedef: departmanla birebir aynı uçları
 * kullanır, çünkü sunucuda gövdeler de ortak (bkz. FilesService, FlatScope).
 */
export type FileTarget =
  | { jobId: string }
  | { projectId: string }
  | { departmentId: string }
  | { organizationId: string };

function targetBase(target: FileTarget): string {
  return "jobId" in target
    ? `/jobs/${target.jobId}`
    : "projectId" in target
    ? `/projects/${target.projectId}`
    : "departmentId" in target
    ? `/departments/${target.departmentId}`
    : `/organizations/${target.organizationId}`;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

/** Google için gdoc/gsheet/gslide; Microsoft için docx/xlsx/pptx — bkz. backend NativeFileKind. */
export type NativeFileKind = "gdoc" | "gsheet" | "gslide" | "docx" | "xlsx" | "pptx";

/** "Drive'dan seç" gezinme sonucundaki tek bir öğe (dosya ya da klasör). */
export interface DriveBrowseEntry {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string;
  size?: number;
  iconLink?: string;
}

export const filesApi = {
  /** İş ekranı: kapsamı seçerek listeler. */
  listByJob: (
    jobId: string,
    filter: FileContext & { scope?: FileScope; folderId?: string; atRoot?: string } = {}
  ) =>
    api.get<ProjectFile[]>(`/jobs/${jobId}/files${query(filter as Record<string, string | undefined>)}`),

  /** Proje/görev/çıktı ekranı: işi backend projeden türetir. */
  listByProject: (projectId: string, filter: Omit<FileContext, "projectId"> = {}) =>
    api.get<ProjectFile[]>(
      `/projects/${projectId}/files${query(filter as Record<string, string | undefined>)}`
    ),

  /** Hiyerarşi: organizasyona bağlı bütün işlerin dosyaları. */
  listByOrganization: (organizationId: string, folderId?: string) =>
    api.get<ProjectFile[]>(`/organizations/${organizationId}/files${query({ folderId })}`),

  /** Hiyerarşi: gruba bağlı işler + gruba bağlı organizasyonların işleri. */
  listByGroup: (groupId: string) => api.get<ProjectFile[]>(`/groups/${groupId}/files`),

  /** Departman ekranı: dosyalar düz bir listedir, iş hiyerarşisi yok. */
  listByDepartment: (departmentId: string, folderId?: string) =>
    api.get<ProjectFile[]>(`/departments/${departmentId}/files${query({ folderId })}`),

  rename: (fileId: string, name: string) => api.patch<ProjectFile>(`/files/${fileId}`, { name }),

  /** Dosyayı bulunduğu klasöre kopyalar. */
  duplicate: (fileId: string) => api.post<ProjectFile>(`/files/${fileId}/duplicate`, {}),

  /** Dosyayı başka bir klasöre taşır; `folderId` verilmezse kapsamın köküne. */
  move: (fileId: string, folderId?: string) =>
    api.patch<ProjectFile>(`/files/${fileId}/folder`, { folderId: folderId ?? null }),

  remove: (fileId: string, alsoTrash = false) =>
    api.delete<{ ok: boolean }>(`/files/${fileId}${alsoTrash ? "?trash=1" : ""}`),

  syncShares: (jobId: string) =>
    api.post<{ granted: number; revoked: number }>(`/jobs/${jobId}/files/sync-shares`, {}),

  /** OneDrive'da bir klasörün alt öğelerini listeler ("Drive'dan seç" akışı). Google Picker kullandığı için buraya düşmez. */
  browse: (target: FileTarget, folderId?: string) =>
    api.get<{ provider: "google" | "microsoft"; entries: DriveBrowseEntry[] }>(
      `${targetBase(target)}/files/browse${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`
    ),

  /** Sağlayıcının kendi Drive'ında var olan bir dosyayı Projelio'nun klasörüne kopyalar ve kaydeder. */
  importFromDrive: (
    target: FileTarget,
    body: { sourceFileId: string; name?: string; taskId?: string; outputId?: string; folderId?: string }
  ) => api.post<ProjectFile>(`${targetBase(target)}/files/import`, body),

  /** Boş bir Doküman/Tablo/Sunum ya da Word/Excel/PowerPoint oluşturur. */
  createNativeFile: (
    target: FileTarget,
    body: { kind: NativeFileKind; name: string; taskId?: string; outputId?: string; folderId?: string }
  ) => api.post<ProjectFile>(`${targetBase(target)}/files/create-native`, body),

  /**
   * Yarım kalan bir yüklemeyi kapatır.
   *
   * Dosya sağlayıcıda oluşmuşsa Projelio kaydı yaratılır — "bağlantı koptu"
   * diye biten bir yükleme aslında başarılı olmuş olabilir. `cancel` verilirse
   * oluşmuş dosya da çöpe atılır.
   */
  reconcileSession: (sessionId: string, cancel: boolean) =>
    api.post<{ status: "completed"; file: ProjectFile } | { status: "discarded" }>(
      `/files/sessions/${sessionId}/reconcile`,
      { cancel }
    ),

  /**
   * Klasörler. Kapsam (iş/departman/şirket) sorgu parametresi: üçü de aynı
   * ağacı kullanıyor (bkz. migration 090).
   */
  folders: (owner: FileFolderOwner, parentId?: string) =>
    api.get<FileFolder[]>(
      `/file-folders${query({ ownerKind: owner.kind, ownerId: owner.id, parentId })}`
    ),
  folderPath: (folderId: string) => api.get<FileFolder[]>(`/file-folders/${folderId}/path`),
  createFolder: (owner: FileFolderOwner, name: string, parentFolderId?: string) =>
    api.post<FileFolder>("/file-folders", {
      ownerKind: owner.kind,
      ownerId: owner.id,
      name,
      parentFolderId,
    }),
  renameFolder: (folderId: string, name: string) =>
    api.patch<FileFolder>(`/file-folders/${folderId}`, { name }),
  /** Klasörü içeriğiyle birlikte çoğaltır. */
  duplicateFolder: (folderId: string) => api.post<FileFolder>(`/file-folders/${folderId}/duplicate`, {}),
  /** Klasörü başka bir klasörün altına taşır; `parentFolderId` yoksa köke. */
  moveFolder: (folderId: string, parentFolderId?: string) =>
    api.patch<FileFolder>(`/file-folders/${folderId}/parent`, { parentFolderId: parentFolderId ?? null }),
  removeFolder: (folderId: string) => api.delete<{ ok: boolean }>(`/file-folders/${folderId}`),

  /**
   * Önizlemeler için toplu imzalı jeton.
   *
   * Simge görünümünde onlarca önizleme var; her biri için ayrı jeton isteği
   * atmak gereksiz gecikme demekti. Erişilemeyen dosya yanıtta hiç dönmez.
   */
  accessTokens: (ids: string[]) =>
    api.post<{ tokens: Record<string, string>; expiresInSeconds: number }>("/files/access-tokens", { ids }),

  /** Jetonu elde olan bir dosyanın önizleme adresi (bkz. accessTokens). */
  thumbnailUrlWithToken: (fileId: string, token: string) =>
    `${API_URL}/files/${fileId}/thumbnail?t=${encodeURIComponent(token)}`,

  /**
   * Önizleme adresi.
   *
   * Sağlayıcının kendi adresi KULLANILAMAZ: kısa ömürlü ve kimlik istiyor.
   * İçerik adresiyle aynı imzalı jeton düzeni (bkz. contentUrl).
   */
  thumbnailUrl: async (fileId: string) => {
    const { token } = await api.post<{ token: string }>(`/files/${fileId}/access-token`, {});
    return `${API_URL}/files/${fileId}/thumbnail?t=${encodeURIComponent(token)}`;
  },

  /** Tek dosyanın künyesi — önizleme penceresini elde yalnızca kimlik varken açmak için. */
  getById: (fileId: string) => api.get<ProjectFile>(`/files/${fileId}`),

  /**
   * İçerik adresi üretir.
   *
   * <img src> {t("ve")} <iframe src> Authorization başlığı gönderemez; bu yüzden önce
   * 5 dakikalık, tek dosyaya bağlı imzalı bir jeton alıp adrese ekliyoruz.
   */
  contentUrl: async (fileId: string, options: { download?: boolean } = {}) => {
    const { token } = await api.post<{ token: string }>(`/files/${fileId}/access-token`, {});
    const params = new URLSearchParams({ t: token });
    if (options.download) params.set("download", "1");
    return `${API_URL}/files/${fileId}/content?${params.toString()}`;
  },
};

export const driveApi = {
  status: () => api.get<GoogleDriveStatus>("/google/status"),
  disconnect: () => api.post<{ ok: boolean }>("/google/disconnect", {}),
  disconnectAccount: (accountId: string) => api.post<{ ok: boolean }>("/google/disconnect", { accountId }),
  /**
   * `label`: ikinci bir hesap bağlanırken verilen ad ("Şirket Drive'ı").
   * Kullanıcı birden fazla Drive hesabı bağlayabiliyor; ad olmadan Ayarlar
   * ekranında iki satır birbirinden ayırt edilemiyor.
   */
  connectUrl: (next?: string, label?: string) =>
    api.get<{ configured: boolean; url: string | null; blockedBy?: "google" | "microsoft" }>(
      `/google/connect-url?${new URLSearchParams({
        ...(next ? { next } : {}),
        ...(label ? { label } : {}),
      }).toString()}`
    ),
  loginUrl: (next?: string) =>
    api.get<{ configured: boolean; url: string | null }>(
      `/auth/google/url${next ? `?next=${encodeURIComponent(next)}` : ""}`
    ),
  exchange: (code: string) => api.post<{ token: string }>("/auth/google/exchange", { code }),
  /**
   * Frontend'de açılan resmi Google Picker widget'ı için kısa ömürlü Drive erişim jetonu.
   *
   * Hedef (iş/departman) verilirse jeton O HEDEFİN depo hesabından alınır.
   * Verilmezse kullanıcının varsayılan hesabı kullanılır — hedefi başka bir
   * Drive hesabında olan bir departmanda bu, seçilen dosyanın kopyalanamamasına
   * yol açar (bkz. FilesService.pickerTokenForTarget).
   */
  pickerToken: (target?: { jobId?: string; departmentId?: string; organizationId?: string }) => {
    if (!target?.jobId && !target?.departmentId && !target?.organizationId) {
      return api.get<{ accessToken: string; expiresInSeconds: number }>("/google/picker-token");
    }
    const params = new URLSearchParams(
      target.departmentId
        ? { departmentId: target.departmentId }
        : target.organizationId
        ? { organizationId: target.organizationId }
        : { jobId: target.jobId! }
    );
    return api.get<{ accessToken: string; expiresInSeconds: number }>(`/files/picker-token?${params.toString()}`);
  },
};

/** Bulut hesabı — Ayarlar > Bağlı hesaplar listesinin satırı. */
export interface CloudAccountRow {
  provider: "google" | "microsoft";
  id: string;
  email: string;
  label?: string;
  pictureUrl?: string;
  driveReady: boolean;
  /** Bu hesapla Projelio'ya giriş yapılabiliyor mu; kesilirse giriş yolu da gider. */
  isLoginIdentity: boolean;
  needsReconnect: boolean;
  connectedAt: string;
}

export type OrganizationStorageInfo =
  | { selected: false }
  | {
      selected: true;
      provider: "google" | "microsoft";
      accountId: string;
      email?: string;
      label?: string;
      driveReady: boolean;
      folderWebViewLink?: string;
    };

/**
 * Bulut hesaplarının tamamı ve şirketlerin depo seçimi.
 *
 * driveApi/oneDriveApi sağlayıcıya özgü işleri (bağla, kes, kota) yapmaya
 * devam ediyor; buradakiler iki sağlayıcıyı da kapsayan SEÇİM işleri.
 */
export const cloudStorageApi = {
  accounts: () => api.get<CloudAccountRow[]>("/cloud-storage/accounts"),
  rename: (provider: "google" | "microsoft", accountId: string, label: string) =>
    api.patch<{ ok: boolean }>(`/cloud-storage/accounts/${provider}/${accountId}`, { label }),
  organizationStorage: (organizationId: string) =>
    api.get<OrganizationStorageInfo>(`/organizations/${organizationId}/storage`),
  setOrganizationStorage: (organizationId: string, provider: "google" | "microsoft", accountId: string) =>
    api.post<{ ok: boolean }>(`/organizations/${organizationId}/storage`, { provider, accountId }),
  clearOrganizationStorage: (organizationId: string) =>
    api.delete<{ ok: boolean }>(`/organizations/${organizationId}/storage`),
};

/**
 * driveApi'nin Microsoft karşılığı: hem "Microsoft ile giriş" hem OneDrive
 * bağlama uçları.
 *
 * `connectUrl` giriş yapmış kullanıcıya OneDrive izni ister; `loginUrl` ise
 * hiç girişi olmayan ziyaretçiyi Microsoft'a yollar ve dönüşte `exchange` ile
 * oturum jetonu alınır (Google akışının aynısı).
 */
export const oneDriveApi = {
  status: () => api.get<GoogleDriveStatus>("/microsoft/status"),
  disconnect: () => api.post<{ ok: boolean }>("/microsoft/disconnect", {}),
  disconnectAccount: (accountId: string) => api.post<{ ok: boolean }>("/microsoft/disconnect", { accountId }),
  connectUrl: (next?: string, label?: string) =>
    api.get<{ configured: boolean; url: string | null; blockedBy?: "google" | "microsoft" }>(
      `/microsoft/connect-url?${new URLSearchParams({
        ...(next ? { next } : {}),
        ...(label ? { label } : {}),
      }).toString()}`
    ),
  loginUrl: (next?: string) =>
    api.get<{ configured: boolean; url: string | null }>(
      `/auth/microsoft/url${next ? `?next=${encodeURIComponent(next)}` : ""}`
    ),
  exchange: (code: string) => api.post<{ token: string }>("/auth/microsoft/exchange", { code }),
};

/**
 * Dosya yükler.
 *
 * Küçük dosyalar backend üzerinden gider (tek istek, basit). Büyük dosyalar için
 * backend'den bir Drive/OneDrive yükleme adresi alınır ve tarayıcı parçaları
 * DOĞRUDAN bulut sağlayıcısına gönderir — içerik backend'in belleğinden ve bant
 * genişliğinden geçmez, bağlantı koparsa kaldığı yerden devam edebilir.
 */
/** Dosyanın yükleneceği yer. Kuyruk da aynı tipi taşıyor (bkz. lib/uploadQueue). */
export type UploadTarget = FileTarget;

export async function uploadFile(
  target: UploadTarget,
  file: File,
  /**
   * `folderId`: kullanıcının içinde bulunduğu klasör.
   * `relativePath`: KLASÖR yüklemesinde tarayıcının verdiği göreli yol
   * ("Fotoğraflar/2026/kapak.jpg"); sunucu eksik klasörleri kurar.
   */
  context: Omit<FileContext, "projectId"> & { folderId?: string; relativePath?: string } = {},
  onProgress?: (ratio: number) => void,
  /** Verilirse yükleme iptal edilebilir; iptalde AbortError fırlar. */
  signal?: AbortSignal,
  /**
   * Parçalı yüklemede oturum açılır açılmaz çağrılır.
   *
   * Çağıranın bunu bilmesi ŞART: yükleme yarıda kalırsa (iptal, kopan bağlantı)
   * oturumun kapatılması gerekiyor, yoksa dosya sağlayıcıda oluşup Projelio'da
   * hiç görünmeyebiliyor (bkz. filesApi.reconcileSession).
   */
  onSession?: (sessionId: string) => void
): Promise<ProjectFile> {
  // Proje ekranından yüklerken işi backend türetir; ön yüzün bilmesine gerek yok.
  const base = targetBase(target);
  // Departmanın ve şirketin altında proje/görev/çıktı hiyerarşisi yok; taskId/outputId
  // yalnızca iş/proje hedeflerinde anlamlı.
  const isDepartment = "departmentId" in target || "organizationId" in target;

  if (file.size <= INLINE_LIMIT) {
    const form = new FormData();
    form.append("file", file);
    if (!isDepartment && context.taskId) form.append("taskId", context.taskId);
    if (!isDepartment && context.outputId) form.append("outputId", context.outputId);
    if (context.folderId) form.append("folderId", context.folderId);
    if (context.relativePath) form.append("relativePath", context.relativePath);
    onProgress?.(0.1);
    const result = await api.uploadFile<ProjectFile>(`${base}/files`, form, signal);
    onProgress?.(1);
    return result;
  }

  const session = await api.post<{ sessionId: string; uploadUrl: string }>(
    `${base}/files/upload-session`,
    {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      taskId: isDepartment ? undefined : context.taskId,
      outputId: isDepartment ? undefined : context.outputId,
      folderId: context.folderId,
      relativePath: context.relativePath,
    }
  );

  onSession?.(session.sessionId);

  const driveFileId = await uploadInChunks(session.uploadUrl, file, onProgress, signal);
  return api.post<ProjectFile>(`/files/sessions/${session.sessionId}/complete`, { driveFileId });
}

/**
 * İki sağlayıcının parçalı yükleme protokolü ara adımda farklı yanıt verir:
 *
 *  - Google Drive: 308 "Resume Incomplete" + `Range` başlığı (alınan son bayt).
 *  - OneDrive (Microsoft Graph): 202 "Accepted" + gövdede `nextExpectedRanges`
 *    dizisi (bir sonraki beklenen aralığın başlangıcı).
 *
 * Hangi sağlayıcı olduğunu burada bilmemize gerek yok: adrese PUT ediyoruz,
 * yanıtın şekline göre devam ediyoruz. Son parçada ikisi de dosyanın id'sini
 * içeren bir JSON gövdesiyle 200/201 döner.
 */
async function uploadInChunks(
  uploadUrl: string,
  file: File,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal
): Promise<string> {
  let offset = 0;

  while (offset < file.size) {
    // Parçalar arasında da bakılıyor: fetch'e verilen signal yalnızca UÇUŞTAKİ
    // isteği kesiyor, döngünün kendisini durdurmuyor. İkisi olmadan iptal,
    // sıradaki parçayla sessizce devam ederdi.
    if (signal?.aborted) throw new DOMException("Yükleme iptal edildi", "AbortError");

    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
      body: chunk,
      signal,
    });

    // Google: parça alındı, sonraki parça bekleniyor.
    if (res.status === 308) {
      const range = res.headers.get("range");
      // Drive kaç bayt aldığını söyler; ondan devam ederiz. Söylemezse kendi
      // hesabımızla ilerleriz.
      offset = range ? Number(range.split("-")[1]) + 1 : end;
      onProgress?.(offset / file.size);
      continue;
    }

    // OneDrive: parça alındı, sonraki beklenen aralık gövdede gelir.
    if (res.status === 202) {
      const json = await res.json().catch(() => null);
      const nextRange: string | undefined = json?.nextExpectedRanges?.[0];
      offset = nextRange ? Number(nextRange.split("-")[0]) : end;
      onProgress?.(offset / file.size);
      continue;
    }

    if (res.ok) {
      onProgress?.(1);
      const json = await res.json();
      if (!json?.id) throw new Error("Bulut deposu dosya kimliği döndürmedi.");
      return json.id as string;
    }

    throw new Error(`Yükleme başarısız (${res.status}). Lütfen tekrar deneyin.`);
  }

  throw new Error("Yükleme tamamlanamadı.");
}

/** Bir dosyanın iliştirilebileceği yerler (bkz. migration 095). */
export type LinkTargetKind = "task" | "user" | "module_record";

export interface FileLink {
  id: string;
  fileId: string;
  targetKind: LinkTargetKind;
  targetId: string;
  createdBy: string;
  createdAt: string;
}

/** Seçicideki aday listeleri; hepsi dosyanın kapsamından geliyor. */
export interface LinkTargets {
  tasks: { id: string; title: string; context?: string; isSubtask: boolean }[];
  users: { id: string; fullName: string }[];
  records: { id: string; name: string; moduleKey?: string }[];
}

/**
 * Dosya bağlantıları.
 *
 * Bağlamak TAŞIMAK DEĞİL: dosya klasöründe kalır, yalnızca hedefin ekranında
 * da görünür (bkz. migration 095).
 */
export const fileLinksApi = {
  /** Bir hedefe (görev/kişi/modül kaydı) bağlı dosyalar. */
  forTarget: (targetKind: LinkTargetKind, targetId: string) =>
    api.get<ProjectFile[]>(`/file-links${query({ targetKind, targetId })}`),
  /** Bir dosyanın bağlı olduğu yerler. */
  forFile: (fileId: string) => api.get<FileLink[]>(`/files/${fileId}/links`),
  targets: (fileId: string, q?: string) =>
    api.get<LinkTargets>(`/files/${fileId}/link-targets${query({ q })}`),
  link: (fileId: string, targetKind: LinkTargetKind, targetId: string) =>
    api.post<FileLink>(`/files/${fileId}/links`, { targetKind, targetId }),
  unlink: (fileId: string, targetKind: LinkTargetKind, targetId: string) =>
    api.delete<{ ok: boolean }>(`/files/${fileId}/links${query({ targetKind, targetId })}`),
};
