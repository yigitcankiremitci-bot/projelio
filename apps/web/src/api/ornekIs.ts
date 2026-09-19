import { api } from "./client";

/**
 * Eğitici örnek iş (bkz. backend/src/modules/ornek-is/). Uçlar yalnızca oturum
 * sahibinin kendi örnek işine bakıyor; kimlik parametresi yok.
 */
export const ornekIsApi = {
  durum: () => api.get<{ jobId: string | null }>("/ornek-is"),
  olustur: () => api.post<{ jobId: string; created: boolean }>("/ornek-is", {}),
  sil: () => api.delete<{ deleted: number }>("/ornek-is"),
};
