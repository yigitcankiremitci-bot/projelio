import { Injectable } from "@nestjs/common";
import type { Task } from "@projelio/shared";

@Injectable()
export class CalendarService {
  // "Sadece Benim Görevlerim" / "Tüm Ekip Takvimi" filtreleme
  filterTasks(tasks: Task[], userId: string, scope: "mine" | "team"): Task[] {
    // Bir görevin birden fazla atananı olabilir (bkz. migration 053); assignedTo
    // yalnızca birincil atanandır, ikinci kişi kendi takviminde görevi göremezdi.
    const mine = (t: Task) =>
      t.assignees?.length ? t.assignees.some((a) => a.userId === userId) : t.assignedTo === userId;
    return scope === "mine" ? tasks.filter(mine) : tasks;
  }

  // Sürükle-bırak ile tarih güncelleme sonrası çağrılır
  reschedule(task: Task, newStart: string, newDeadline: string): Task {
    return { ...task, startDate: newStart, deadline: newDeadline };
  }
}
