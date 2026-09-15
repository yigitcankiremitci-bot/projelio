import type {
  CreateFileDownloadLinkInput,
  FileDownloadLink,
  PublicFileAccess,
  UpdateFileDownloadLinkInput,
} from "@projelio/shared";
import { API_URL, api } from "./client";

/**
 * Üyelik gerektirmeyen dosya indirme bağlantıları (bkz. migration 114).
 *
 * `open` ve `unlock` KİMLİK DOĞRULAMASIZ çalışır: bağlantıyı açan kişinin
 * hesabı yok. api istemcisi token varsa gönderir, yoksa göndermez — sunucu
 * ikisini de aynı şekilde karşılıyor.
 */
export const fileDownloadLinksApi = {
  list: (fileId: string) => api.get<FileDownloadLink[]>(`/files/${fileId}/download-links`),

  create: (fileId: string, input: CreateFileDownloadLinkInput = {}) =>
    api.post<FileDownloadLink>(`/files/${fileId}/download-links`, input),

  update: (id: string, input: UpdateFileDownloadLinkInput) =>
    api.patch<FileDownloadLink>(`/file-download-links/${id}`, input),

  /** Bağlantıyı kapatır. Kayıt silinmez; "kime vermiştim, kaç kez indirildi" sorusu cevaplanabilsin. */
  revoke: (id: string) => api.delete<FileDownloadLink>(`/file-download-links/${id}`),

  /**
   * Bağlantıyı e-postayla gönderir (link@ adresinden).
   *
   * `sent: false` DÖNEBİLİR ve çağıran buna bakmak zorunda: e-posta sağlayıcısı
   * yapılandırılmamışsa istek başarılı olur ama mesaj gitmez.
   */
  send: (id: string, email: string, note?: string) =>
    api.post<{ sent: boolean; link: FileDownloadLink }>(`/file-download-links/${id}/send`, { email, note }),

  /** Bağlantıyı açan sayfanın ilk çağrısı. */
  open: (token: string) => api.get<PublicFileAccess>(`/public/file-links/${encodeURIComponent(token)}`),

  /** Kapıyı açma denemesi. Adres gövdede gider — sorgu dizesine konsaydı loglara düşerdi. */
  unlock: (token: string, email: string) =>
    api.post<PublicFileAccess>(`/public/file-links/${encodeURIComponent(token)}/unlock`, { email }),

  /**
   * İçerik adresi. Paylaşım token'ı DEĞİL, kısa ömürlü içerik jetonu taşır:
   * bu adres <img>/<iframe>'e giriyor ve sayfadan kopyalanabiliyor.
   */
  contentUrl: (contentToken: string, options: { download?: boolean } = {}) => {
    const params = new URLSearchParams({ t: contentToken });
    if (options.download) params.set("download", "1");
    return `${API_URL}/public/file-links/content?${params.toString()}`;
  },

  thumbnailUrl: (contentToken: string) =>
    `${API_URL}/public/file-links/thumbnail?t=${encodeURIComponent(contentToken)}`,
};
