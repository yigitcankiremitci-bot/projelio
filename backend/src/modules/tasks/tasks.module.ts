import { Module } from "@nestjs/common";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { NotificationsModule } from "../notifications/notifications.module";
// Görev bütçesi onayı BudgetModule'de: eski budget-status ucu artık oradaki
// akışa delege ediyor (bkz. TasksService.updateBudgetStatus).
import { BudgetModule } from "../budget/budget.module";

@Module({
  imports: [NotificationsModule, BudgetModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
