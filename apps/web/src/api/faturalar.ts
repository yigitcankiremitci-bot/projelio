import type { ProjectFile } from "@projelio/shared";
import { API_URL, api } from "./client";

/**
 * Faturaların BELGE tarafı: kayda ek, kasa bağı, ay sonu arşivi.
 *
 * Fatura kaydının kendisi sıradan bir modül kaydı ve kendi uçlarından
 * yönetiliyor (bkz. ModuleRecordsPanel) — burada yalnızca belgeler var.
 */

/** Belge biriktiren bir kaydın kapsamı: şirket ya da (serbest çalışanda) iş. */
export interface FaturaKapsami {
  scope: "organization" | "job";
  scopeId: string;
}

export interface AyOzeti {
  kayitSayisi: number;
  muhasebeciEposta?: string;
}

export interface GonderimSonucu {
  gonderildi: true;
  /** Arşiv ek olarak mı gitti, yoksa indirme bağlantısıyla mı (bkz. EPOSTA_EKI_TAVANI). */
  ekOlarak: boolean;
  belgeSayisi: number;
  /** Belgesi yüklenmemiş faturaların etiketleri; kullanıcıya eksik uyarısı için. */
  eksikKayitlar: string[];
}

function ayQuery(kapsam: FaturaKapsami, ay: string): string {
  return `?scope=${kapsam.scope}&scopeId=${encodeURIComponent(kapsam.scopeId)}&month=${encodeURIComponent(ay)}`;
}

/** Modülün "Lio yardımı" anahtarının durumu + kullanıcının kredi durumu. */
export interface LioYardimiDurumu {
  enabled: boolean;
  /** Anahtarı açmaya yetecek kredi var mı. */
  krediVar: boolean;
  bakiye: number;
  minBakiye: number;
  /** Sunucuda belge okuyabilen (görsel kabul eden) bir model tanımlı mı. */
  okuyabilir: boolean;
}

/** Lio'nun belgeden okuduğu fatura. */
export interface OkunanFatura {
  direction: "issued" | "received";
  amount: number;
  currency: string;
  issueDate: string;
  invoiceNo?: string;
  counterpartyName?: string;
  category?: string;
  description?: string;
  confidence: number;
}

export interface LioGirisSonucu {
  recordId: string;
  fatura: OkunanFatura;
  /** Bu okumanın harcadığı kredi. */
  kredi: number;
  /** Kasa satırı açıldı mı — modül yetkisi defter yetkisinden geniş olabiliyor. */
  kasa: { yazildi: boolean; hata?: string };
}

export const faturalarApi = {
  lioDurumu: (moduleKey: string, kapsam: FaturaKapsami) =>
    api.get<LioYardimiDurumu>(
      `/modules/${moduleKey}/ai-assist?scope=${kapsam.scope}&scopeId=${encodeURIComponent(kapsam.scopeId)}`
    ),

  lioAyarla: (moduleKey: string, kapsam: FaturaKapsami, enabled: boolean) =>
    api.patch<{ enabled: boolean }>(`/modules/${moduleKey}/ai-assist`, { ...kapsam, enabled }),

  /** Lio yardımı açıkken bırakılan belge: okunur, kaydı ve kasa satırı açılır. */
  lioIleGir: (kapsam: FaturaKapsami, file: File, departmentId?: string, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("file", file);
    form.append("scope", kapsam.scope);
    form.append("scopeId", kapsam.scopeId);
    if (departmentId) form.append("departmentId", departmentId);
    return api.uploadFile<LioGirisSonucu>("/invoices/ai-intake", form, signal);
  },

  /** Kayda belge ekler; sunucu dosyayı fatura tarihinin ay klasörüne indirir. */
  ekYukle: (recordId: string, file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("file", file);
    return api.uploadFile<ProjectFile>(`/module-records/${recordId}/attachments`, form, signal);
  },

  /** Kasa satırının faturası: `recordId` verilirse eşleştirir, verilmezse yeni kayıt açar. */
  kasaFaturasi: (transactionId: string, body: { recordId?: string; departmentId?: string } = {}) =>
    api.post<{ recordId: string }>(`/budget/transactions/${transactionId}/invoice`, body),

  kasaFaturasiniKaldir: (transactionId: string) =>
    api.delete<{ success: true }>(`/budget/transactions/${transactionId}/invoice`),

  ayOzeti: (kapsam: FaturaKapsami, ay: string) => api.get<AyOzeti>(`/invoices/month-summary${ayQuery(kapsam, ay)}`),

  gonder: (kapsam: FaturaKapsami, ay: string, to?: string) =>
    api.post<GonderimSonucu>("/invoices/send", { ...kapsam, month: ay, to }),

  /**
   * Ayın arşivini indirir.
   *
   * `window.location` ile açılamıyor: uç oturum başlığı istiyor ve tarayıcı
   * adres çubuğundan açılan isteğe o başlığı koymaz. Bu yüzden içerik blob
   * olarak alınıp gizli bir bağlantıyla kaydettiriliyor.
   */
  arsiviIndir: async (kapsam: FaturaKapsami, ay: string): Promise<void> => {
    const token = localStorage.getItem("projelio_token");
    const res = await fetch(`${API_URL}/invoices/archive${ayQuery(kapsam, ay)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      // Sunucunun açıklaması korunuyor: "belgesi olan fatura yok" ile
      // "arşiv çok büyük" farklı şeyler ve ikisi de kullanıcıya bir şey söyler.
      const govde = await res.json().catch(() => null);
      throw new Error(govde?.message || "Arşiv indirilemedi.");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = dosyaAdiCoz(res.headers.get("content-disposition")) ?? `Faturalar ${ay}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Hemen değil: Safari bağlantıya tıklandıktan sonra adresi bir an daha
    // okuyor ve erken serbest bırakılan blob'da indirme boş dosya oluyordu.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

/** Content-Disposition'daki RFC 5987 adı ("filename*=UTF-8''Faturalar%20…"). */
function dosyaAdiCoz(header: string | null): string | undefined {
  const m = header && /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
}
