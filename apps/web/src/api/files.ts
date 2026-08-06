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

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const filesApi = {
  /** İş ekranı: kapsamı seçerek listeler. */
  listByJob: (jobId: string, filter: FileContext & { scope?: FileScope } = {}) =>
    api.get<ProjectFile[]>(`/jobs/${jobId}/files${query(filter as Record<string, string | undefined>)}`),

  /** Proje/görev/çıktı ekranı: işi backend projeden türetir. */
  listByProject: (projectId: string, filter: Omit<FileContext, "projectId"> = {}) =>
    api.get<ProjectFile[]>(
      `/projects/${projectId}/files${query(filter as Record<string, string | undefined>)}`
    ),

  /** Hiyerarşi: organizasyona bağlı bütün işlerin dosyaları. */
  listByOrganization: (organizationId: string) =>
    api.get<ProjectFile[]>(`/organizations/${organizationId}/files`),

  /** Hiyerarşi: gruba bağlı işler + gruba bağlı organizasyonların işleri. */
  listByGroup: (groupId: string) => api.get<ProjectFile[]>(`/groups/${groupId}/files`),

  /** Departman ekranı: dosyalar düz bir listedir, iş hiyerarşisi yok. */
  listByDepartment: (departmentId: string) => api.get<ProjectFile[]>(`/departments/${departmentId}/files`),

  rename: (fileId: string, name: string) => api.patch<ProjectFile>(`/files/${fileId}`, { name }),

  remove: (fileId: string, alsoTrash = false) =>
    api.delete<{ ok: boolean }>(`/files/${fileId}${alsoTrash ? "?trash=1" : ""}`),

  syncShares: (jobId: string) =>
    api.post<{ granted: number; revoked: number }>(`/jobs/${jobId}/files/sync-shares`, {}),

  /**
   * İçerik adresi üretir.
   *
   * <img src> ve <iframe src> Authorization başlığı gönderemez; bu yüzden önce
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
  connectUrl: (next?: string) =>
    api.get<{ configured: boolean; url: string | null; blockedBy?: "google" | "microsoft" }>(
      `/google/connect-url${next ? `?next=${encodeURIComponent(next)}` : ""}`
    ),
  loginUrl: (next?: string) =>
    api.get<{ configured: boolean; url: string | null }>(
      `/auth/google/url${next ? `?next=${encodeURIComponent(next)}` : ""}`
    ),
  exchange: (code: string) => api.post<{ token: string }>("/auth/google/exchange", { code }),
};

/**
 * driveApi'nin OneDrive karşılığı.
 *
 * Google'dan fark: "OneDrive ile giriş" diye bir akış yok (loginUrl/exchange
 * yok) — kullanıcı zaten Projelio'ya girişini yapmış olmalı, buradaki
 * uç noktalar yalnızca mevcut hesaba bir OneDrive bağlantısı ekler/kaldırır.
 */
export const oneDriveApi = {
  status: () => api.get<GoogleDriveStatus>("/microsoft/status"),
  disconnect: () => api.post<{ ok: boolean }>("/microsoft/disconnect", {}),
  connectUrl: (next?: string) =>
    api.get<{ configured: boolean; url: string | null; blockedBy?: "google" | "microsoft" }>(
      `/microsoft/connect-url${next ? `?next=${encodeURIComponent(next)}` : ""}`
    ),
};

/**
 * Dosya yükler.
 *
 * Küçük dosyalar backend üzerinden gider (tek istek, basit). Büyük dosyalar için
 * backend'den bir Drive/OneDrive yükleme adresi alınır ve tarayıcı parçaları
 * DOĞRUDAN bulut sağlayıcısına gönderir — içerik backend'in belleğinden ve bant
 * genişliğinden geçmez, bağlantı koparsa kaldığı yerden devam edebilir.
 */
export async function uploadFile(
  target: { jobId: string } | { projectId: string } | { departmentId: string },
  file: File,
  context: Omit<FileContext, "projectId"> = {},
  onProgress?: (ratio: number) => void
): Promise<ProjectFile> {
  // Proje ekranından yüklerken işi backend türetir; ön yüzün bilmesine gerek yok.
  const base =
    "jobId" in target
      ? `/jobs/${target.jobId}`
      : "projectId" in target
      ? `/projects/${target.projectId}`
      : `/departments/${target.departmentId}`;
  // Departmanın bağlamı (proje/görev/çıktı) olmadığı için taskId/outputId yalnızca
  // iş/proje hedeflerinde anlamlı.
  const isDepartment = "departmentId" in target;

  if (file.size <= INLINE_LIMIT) {
    const form = new FormData();
    form.append("file", file);
    if (!isDepartment && context.taskId) form.append("taskId", context.taskId);
    if (!isDepartment && context.outputId) form.append("outputId", context.outputId);
    onProgress?.(0.1);
    const result = await api.uploadFile<ProjectFile>(`${base}/files`, form);
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
    }
  );

  const driveFileId = await uploadInChunks(session.uploadUrl, file, onProgress);
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
  onProgress?: (ratio: number) => void
): Promise<string> {
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
      body: chunk,
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
