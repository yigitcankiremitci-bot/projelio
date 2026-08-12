import { Module } from "@nestjs/common";
import { PlanningController } from "./planning.controller";
import { PlanningService } from "./planning.service";
import { PersonalTodosModule } from "../personal-todos/personal-todos.module";

/**
 * Takvim / kişisel planlama.
 *
 * PersonalTodosModule'e bağımlı: takvimin yan sütunundaki "henüz planlanmamış
 * işler" listesi kişisel panonun (v_personal_board) tam olarak aynı kaynağıdır.
 * Aynı sorguyu burada tekrar yazmak, iki listenin zamanla ayrışması demekti.
 */
@Module({
  imports: [PersonalTodosModule],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
