import type { TaskStatus } from "@projelio/shared";

/**
 * Görevin süresi geçti mi? Kanban kartlarındaki kırmızı "gecikmiş" kuralıyla
 * AYNI (bkz. TaskColumn isOverdue): gün bazlı — son günü bugün olan görev gün
 * bitmeden gecikmiş sayılmaz; tamamlanan görev hiç sayılmaz; tarihi olmayan
 * da. İki yerde ayrı kural olursa "Süresi geçen" filtresi kırmızı kartlardan
 * farklı bir küme gösterirdi.
 */
export function suresiGectiMi(
  gorev: { status: TaskStatus; deadline?: string | null },
  simdi: Date = new Date()
): boolean {
  if (gorev.status === "completed" || !gorev.deadline) return false;
  const tarih = new Date(gorev.deadline);
  if (Number.isNaN(tarih.getTime())) return false;
  const gun = new Date(tarih.getFullYear(), tarih.getMonth(), tarih.getDate());
  const bugun = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  return gun < bugun;
}
