import type { UrunIceAktarmaSonucu } from "@projelio/shared";
import { api, API_URL } from "./client";
import { TOKEN_KEY } from "../lib/session";
import { etkinDil } from "../lib/i18n/depo";

/** Ürün/hizmet kataloğunun Excel ile toplu eklenmesi (bkz. backend products/urun-sablonu.ts). */
export const urunlerApi = {
  /**
   * Boş şablonu indirir. `fetch` + blob: `<a href>` oturum başlığını
   * taşıyamıyor (bkz. partyApi.sablonuIndir, aynı yol).
   */
  sablonuIndir: async (dosyaAdi: string): Promise<void> => {
    const token = localStorage.getItem(TOKEN_KEY);
    const q = new URLSearchParams({ dil: etkinDil() });
    const res = await fetch(`${API_URL}/product-template?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Şablon indirilemedi.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = dosyaAdi;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Hemen değil: Safari bağlantıya tıklandıktan sonra adresi bir an daha okuyor.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /** onizleme=true iken sunucu hiçbir şey yazmaz. */
  iceAktar: (organizationId: string, dosya: File, onizleme: boolean, departmentId?: string) => {
    const fd = new FormData();
    fd.append("file", dosya);
    const q = new URLSearchParams({ onizleme: onizleme ? "1" : "0" });
    if (departmentId) q.set("departmentId", departmentId);
    return api.uploadFile<UrunIceAktarmaSonucu>(`/organizations/${organizationId}/products/import?${q}`, fd);
  },
};
