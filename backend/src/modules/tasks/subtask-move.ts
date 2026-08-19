import { BadRequestException } from "@nestjs/common";

/**
 * Alt görevin başka bir üst görevin altına taşınmasının (bkz.
 * TasksService.updateParent) veritabanına dokunmayan kuralları.
 *
 * Ayrı dosyada olmalarının nedeni test edilebilirlik: taşımanın kendisi
 * Supabase'e bağlı, ama "hangi taşıma geçerli" sorusunun cevabı saf bir kural
 * kümesi ve asıl kırılgan olan yer orası.
 */

export interface TaskLike {
  id: string;
  parentTaskId?: string;
}

export interface TaskScopeRow {
  project_id?: string | null;
  department_id?: string | null;
}

/** İstek daha veritabanına gitmeden bakılabilen kurallar. */
export function assertSubtaskMoveRequest(taskId: string, parentTaskId: string): void {
  if (!parentTaskId) throw new BadRequestException("Hedef üst görev belirtilmeli");
  if (parentTaskId === taskId) throw new BadRequestException("Bir görev kendi alt görevi olamaz");
}

/**
 * Kayıtlar okunduktan sonraki kurallar. Uygulamanın her yerinde varsayılan yapı
 * iki seviye (görev → alt görev); taşıma bunu bozamaz.
 */
export function assertSubtaskMoveAllowed(task: TaskLike, parent: TaskLike): void {
  if (!task.parentTaskId) {
    throw new BadRequestException("Yalnızca alt görevler başka bir görevin altına taşınabilir");
  }
  if (parent.parentTaskId) {
    throw new BadRequestException("Bir alt görev başka bir alt görevin altına taşınamaz");
  }
}

/**
 * Alt görev üst göreviyle aynı yerde yaşamalı: hedef başka bir projede ya da
 * departmandaysa kapsamı devralır. Çıktı (output) eski projeye özgüdür, proje
 * değiştiyse düşer.
 *
 * Aynı kapsamdaysa boş nesne döner — gereksiz alan yazmak, ilgisiz bir sütunu
 * yanlışlıkla null'a çekme riskini doğuruyordu.
 */
export function subtaskScopePatch(task: TaskScopeRow, parent: TaskScopeRow): Record<string, unknown> {
  const sameProject = (parent.project_id ?? null) === (task.project_id ?? null);
  const sameDepartment = (parent.department_id ?? null) === (task.department_id ?? null);
  if (sameProject && sameDepartment) return {};

  const patch: Record<string, unknown> = {
    project_id: parent.project_id ?? null,
    department_id: parent.department_id ?? null,
  };
  if (!sameProject) patch.output_id = null;
  return patch;
}
