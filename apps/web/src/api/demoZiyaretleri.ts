import type { DemoAnalitik } from "@projelio/shared";
import { api } from "./client";

export type DemoZiyaretAnalitigi = DemoAnalitik & {
  /** Okunan olay tavana dayandı: en eski günler eksik olabilir. */
  kesildi: boolean;
};

/** Admin > Demo ziyaretleri. Uç yalnızca role === "admin" ile açılır. */
export const demoZiyaretleri = {
  ozet: (gun: number) => api.get<DemoZiyaretAnalitigi>(`/admin/demo/ziyaretler?gun=${gun}`),
};
