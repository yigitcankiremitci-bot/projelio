import { Module } from "@nestjs/common";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { TasksModule } from "../tasks/tasks.module";
import { PlanningModule } from "../planning/planning.module";
import { NotificationsModule } from "../notifications/notifications.module";

/**
 * Proje takvimi (migration 152). PlanningModule'e bağımlı: proje takviminde
 * bakan kişinin o projeye ayırdığı kendi plan blokları da gösteriliyor ve
 * blok okumasının tek doğru yolu PlanningService (etiketler, bağlı görev).
 */
@Module({
  imports: [TasksModule, PlanningModule, NotificationsModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
