import type {
  CreateFileDownloadLinkInput,
  FileDownloadLink,
  FileDownloadLinkSendResult,
  Locale,
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

  /** Birden fazla dosya için TEK bağlantı (bkz. migration 121). */
  createMany: (fileIds: string[], input: CreateFileDownloadLinkInput = {}) =>
    api.post<FileDownloadLink>(`/file-download-links`, { ...input, fileIds }),

  update: (id: string, input: UpdateFileDownloadLinkInput) =>
    api.patch<FileDownloadLink>(`/file-download-links/${id}`, input),

  /** Bağlantıyı kapatır. Kayıt silinmez; "kime vermiştim, kaç kez indirildi" sorusu cevaplanabilsin. */
  revoke: (id: string) => api.delete<FileDownloadLink>(`/file-download-links/${id}`),

  /**
   * Bağlantıyı bir ya da birden çok alıcıya e-postayla gönderir (link@ adresinden).
   *
   * Sonuç ADRES BAŞINA geliyor ve çağıran hepsine bakmak zorunda: e-posta
   * sağlayıcısı yapılandırılmamışsa ya da tek bir adres reddedilirse istek yine
   * başarılı olur, mesaj gitmez.
   *
   * Adresler SERBEST YAZILIR (virgül, noktalı virgül, boşluk ya da alt alta);
   * ayrıştırma sunucuda — ikinci bir kopya iki yerde ayrışırdı.
   *
   * `locale` e-postanın dili: alıcının hesabı olmadığı için gönderen seçiyor.
   */
  send: (id: string, emails: string, note?: string, locale?: Locale) =>
    api.post<FileDownloadLinkSendResult>(`/file-download-links/${id}/send`, { email: emails, note, locale }),

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
