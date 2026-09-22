import { API_URL } from "./client";
import { TOKEN_KEY } from "../lib/session";

export const partyApi = {
  /**
   * Boş müşteri Excel şablonu (bkz. backend party/musteri-sablonu.ts).
   *
   * `window.location` ile açılamıyor: uç oturum başlığı istiyor ve tarayıcı
   * adres çubuğundan açılan isteğe o başlığı koymaz — faturalar.ts'teki arşiv
   * indirmesiyle aynı yol.
   */
  sablonuIndir: async (dosyaAdi: string): Promise<void> => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_URL}/party-template`, {
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
};
