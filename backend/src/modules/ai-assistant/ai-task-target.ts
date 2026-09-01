import { BadRequestException } from "@nestjs/common";

/**
 * Görev hangi kaba açılacak: bir projeye mi, bir departmana mı?
 *
 * Projelio'da görevin İKİ kabı var (bkz. Task.departmentId): proje ve departman.
 * create_task/create_tasks şemasında ikisi de opsiyonel — departman görevinde
 * projectId hiç gelmiyor — ama "ikisinden TAM OLARAK biri" kuralı zorunlu:
 *
 *   - ikisi birden verilirse görevin nereye gittiği belirsiz kalır,
 *   - hiçbiri verilmezse model görevi koyacak bir yer uydurma eğilimine girer
 *     (departman araçları yokken yaşanan hata tam olarak buydu: kullanıcı
 *     "departmanlara dağıt" dedi, model işlerin altına yeni bir proje açıp
 *     bütün görevleri oraya yığdı).
 *
 * Hata mesajları modele ne yapacağını söylüyor: aracı doğru parametreyle
 * yeniden çağırabilsin, kullanıcıya "olmadı" demesin.
 */
export function taskTarget(input: Record<string, any>): { projectId?: string; departmentId?: string } {
  const projectId = typeof input.projectId === "string" && input.projectId ? input.projectId : undefined;
  const departmentId = typeof input.departmentId === "string" && input.departmentId ? input.departmentId : undefined;

  if (projectId && departmentId) {
    throw new BadRequestException(
      "projectId ve departmentId birlikte verilemez. Görev ya bir projeye ya da bir departmana açılır; birini seç."
    );
  }
  if (!projectId && !departmentId) {
    throw new BadRequestException(
      "Görevin nereye açılacağı belirtilmedi: projectId ya da departmentId ver. " +
        "Departman id'sini list_departments, proje id'sini list_projects verir."
    );
  }
  return { projectId, departmentId };
}
