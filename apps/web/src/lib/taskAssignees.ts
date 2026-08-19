import type { Task } from "@projelio/shared";

/**
 * Görev atamalarını okumanın tek yeri.
 *
 * Bir görev birden fazla kişiye atanabilir (bkz. migration 053, task_assignees).
 * `tasks.assigned_to` yalnızca BİRİNCİL atanandır ve listelerde tek yüz göstermek
 * için duruyor; "bu görev bana ait mi" sorusunun cevabı ondan okunamaz — ikinci
 * kişi olarak eklenen biri kendi listelerinde görevi hiç görmezdi.
 *
 * `assignees` gelmediği durumlar (atamaları çekmeyen dar sorgular, eski sunucu
 * yanıtı) için her iki yardımcı da birincil atanana düşer; böylece kısmi veriyle
 * de makul davranırlar.
 */

type TaskLike = Pick<Task, "assignedTo" | "assignedToName"> & Partial<Pick<Task, "assignees">>;

/** Kullanıcı bu göreve atanmış mı (birincil ya da değil)? */
export function isAssignedTo(task: TaskLike, userId?: string): boolean {
  if (!userId) return false;
  if (task.assignees?.length) return task.assignees.some((a) => a.userId === userId);
  return task.assignedTo === userId;
}

/** Kartta/listede gösterilecek atanan isimleri. Boş dizi = atanmamış. */
export function assigneeLabels(task: TaskLike): string[] {
  const named = (task.assignees ?? []).map((a) => a.fullName).filter((n): n is string => Boolean(n));
  if (named.length) return named;
  return task.assignedToName ? [task.assignedToName] : [];
}
