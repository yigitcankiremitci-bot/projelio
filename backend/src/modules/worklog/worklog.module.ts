import { Module } from "@nestjs/common";
import { WorklogController } from "./worklog.controller";
import { WorklogService } from "./worklog.service";
import { TasksModule } from "../tasks/tasks.module";
import { BudgetModule } from "../budget/budget.module";
import { ModuleRecordsModule } from "../module-records/module-records.module";
import { PersonalTodosModule } from "../personal-todos/personal-todos.module";

/**
 * Yaptım. Aktarma (push) hedeflerinin servislerini içeri alır: yetki kuralları
 * o servislerin kendisinde ve burada KOPYALANMAZ — kopya kural er ya da geç
 * asıl kuralla ayrışır.
 */
@Module({
  imports: [TasksModule, BudgetModule, ModuleRecordsModule, PersonalTodosModule],
  controllers: [WorklogController],
  providers: [WorklogService],
  exports: [WorklogService],
})
export class WorklogModule {}
