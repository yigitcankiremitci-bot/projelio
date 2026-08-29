import { api } from "./client";

export interface DemoAnlikGoruntuOzeti {
  tabloSayisi: number;
  satirSayisi: number;
  alindi: string | null;
  /** "veritabani" = panelden kaydedilmiş hâl, "dosya" = depodaki fabrika ayarı. */
  kaynak: "veritabani" | "dosya" | "yok";
}

export interface DemoDurumu {
  duzenlemeKipi: { aktif: boolean; acan?: string; acildi?: string };
  anlikGoruntu: DemoAnlikGoruntuOzeti;
}

/** Admin > demo hesabı yönetimi. Uçlar yalnızca role === "admin" ile açılır. */
export const demoAdmin = {
  durum: () => api.get<DemoDurumu>("/admin/demo"),

  /** kaydet=false yalnızca kip KAPATILIRKEN anlamlı: yapılanları çöpe atar. */
  duzenlemeKipi: (aktif: boolean, kaydet = true) =>
    api.post<{ duzenlemeKipi: DemoDurumu["duzenlemeKipi"]; kaydedilen: DemoAnlikGoruntuOzeti | null }>(
      "/admin/demo/duzenleme-kipi",
      { aktif, kaydet }
    ),

  kaydet: () => api.post<{ kaydedilen: DemoAnlikGoruntuOzeti }>("/admin/demo/anlik-goruntu", {}),

  sifirla: () => api.post<{ ok: true }>("/admin/demo/sifirla", {}),
};
