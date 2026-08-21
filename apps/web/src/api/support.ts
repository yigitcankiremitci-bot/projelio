import type { SupportRequest } from "@projelio/shared";
import { api } from "./client";

/** Destek talepleri (bkz. backend modules/support). */
export const support = {
  /** Kullanıcı yeni talep bırakır. */
  create: (data: { name: string; subject: string; message: string }) =>
    api.post<SupportRequest>("/support", data),

  /** Kullanıcının kendi talepleri — yanıtlar da burada. */
  mine: () => api.get<SupportRequest[]>("/support/mine"),

  /** Admin panosu: tüm talepler, bekleyenler önce. */
  all: () => api.get<SupportRequest[]>("/admin/support"),

  /** Admin yanıtlar; kullanıcıya bildirim sunucu tarafında gider. */
  reply: (id: string, reply: string) =>
    api.patch<SupportRequest>(`/admin/support/${id}/reply`, { reply }),
};
