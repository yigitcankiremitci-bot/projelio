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
    api.get<{ configured: boolean; url: string | null }>(
      `/google/connect-url${next ? `?next=${encodeURIComponent(next)}` : ""}`
    ),
  loginUrl: (next?: string) =>
    api.get<{ configured: boolean; url: string | null }>(
      `/auth/google/url${next ? `?next=${encodeURIComponent(next)}` : ""}`
    ),
  exchange: (code: string) => api.post<{ token: string }>("/auth/google/exchange", { code }),
};

/**
 * Dosya yükler.
 *
 * Küçük dosyalar backend üzerinden gider (tek istek, basit). Büyük dosyalar için
 * backend'den bir Drive yükleme adresi alınır ve tarayıcı parçaları DOĞRUDAN
 * Google'a gönderir — içerik backend'in belleğinden ve bant genişliğinden geçmez,
 * bağlantı koparsa kaldığı yerden devam edebilir.
 */
export async function uploadFile(
  target: { jobId: string } | { projectId: string },
  file: File,
  context: Omit<FileContext, "projectId"> = {},
  onProgress?: (ratio: number) => void
): Promise<ProjectFile> {
  // Proje ekranından yüklerken işi backend türetir; ön yüzün bilmesine gerek yok.
  const base = "jobId" in target ? `/jobs/${target.jobId}` : `/projects/${target.projectId}`;

  if (file.size <= INLINE_LIMIT) {
    const form = new FormData();
    form.append("file", file);
    if (context.taskId) form.append("taskId", context.taskId);
    if (context.outputId) form.append("outputId", context.outputId);
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
      taskId: context.taskId,
      outputId: context.outputId,
    }
  );

  const driveFileId = await uploadInChunks(session.uploadUrl, file, onProgress);
  return api.post<ProjectFile>(`/files/sessions/${session.sessionId}/complete`, { driveFileId });
}

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

    // 308 = "devam et": Drive parçayı aldı, sonraki parçayı bekliyor.
    if (res.status === 308) {
      const range = res.headers.get("range");
      // Drive kaç bayt aldığını söyler; ondan devam ederiz. Söylemezse kendi
      // hesabımızla ilerleriz.
      offset = range ? Number(range.split("-")[1]) + 1 : end;
      onProgress?.(offset / file.size);
      continue;
    }

    if (res.ok) {
      onProgress?.(1);
      const json = await res.json();
      if (!json?.id) throw new Error("Google Drive dosya kimliği döndürmedi.");
      return json.id as string;
    }

    throw new Error(`Yükleme başarısız (${res.status}). Lütfen tekrar deneyin.`);
  }

  throw new Error("Yükleme tamamlanamadı.");
}
