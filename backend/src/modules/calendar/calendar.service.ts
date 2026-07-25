import { Injectable } from "@nestjs/common";
import type { Task } from "@projelio/shared";

@Injectable()
export class CalendarService {
  // "Sadece Benim Görevlerim" / "Tüm Ekip Takvimi" filtreleme
  filterTasks(tasks: Task[], userId: string, scope: "mine" | "team"): Task[] {
    return scope === "mine" ? tasks.filter((t) => t.assignedTo === userId) : tasks;
  }

  // Sürükle-bırak ile tarih güncelleme sonrası çağrılır
  reschedule(task: Task, newStart: string, newDeadline: string): Task {
    return { ...task, startDate: newStart, deadline: newDeadline };
  }
}
