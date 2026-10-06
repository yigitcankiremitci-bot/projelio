import type { BultenAbonesi } from "@projelio/shared";
import { api } from "./client";

/** Admin > Bülten. Uçlar yalnızca role === "admin" ile açılır. */
export const bultenApi = {
  listele: () => api.get<BultenAbonesi[]>("/admin/bulten"),
  iptal: (id: string) => api.post<BultenAbonesi>(`/admin/bulten/${id}/iptal`, {}),
  sil: (id: string) => api.delete<{ ok: true }>(`/admin/bulten/${id}`),
};
