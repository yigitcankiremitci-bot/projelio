import type { Task } from "@projelio/shared";

/**
 * Görev, beklediği bir görev yüzünden başlatılamıyor mu? (bkz. migration 094)
 *
 * Kararı SUNUCU veriyor; buradaki hesap yalnızca kartta rozet göstermek için.
 * Bu yüzden "bilmiyorsam engel yok" tarafına yanılıyor:
 *
 *  - Beklenen görev elimizdeki listede olmayabilir (başka bir proje, başka bir
 *    çıktı ya da liste tavanının dışında kalmış bir kayıt). O görevin durumunu
 *    bilmediğimiz için engel saymıyoruz — bilmediğimiz bir sebeple kartı
 *    "bekliyor" diye işaretlemek, kullanıcıya yanlış bir engel uydurmak olurdu.
 *  - Tamamlanmış görev hiç engelli değildir: iş çoktan bitmiş, geriye dönük bir
 *    uyarı göstermenin karşılığı yok.
 */
export function isTaskBlocked(task: Task, byId: Map<string, Task>): boolean {
  if (!task.dependsOn?.length || task.status === "completed") return false;
  return task.dependsOn.some((id) => {
    const beklenen = byId.get(id);
    return beklenen ? beklenen.status !== "completed" : false;
  });
}
