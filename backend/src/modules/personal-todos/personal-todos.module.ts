import { Module } from "@nestjs/common";
import { PersonalTodosController } from "./personal-todos.controller";
import { PersonalTodosService } from "./personal-todos.service";
import { YapilacakListeleriService } from "./yapilacak-listeleri.service";
// Kişisel görevi bir projeye/departmana bağlamak onu GERÇEK göreve çevirir;
// yetki kontrolü ve atama kuralı TasksService.create'ten geçsin diye (bkz. promote).
import { TasksModule } from "../tasks/tasks.module";

@Module({
  imports: [TasksModule],
  controllers: [PersonalTodosController],
  providers: [PersonalTodosService, YapilacakListeleriService],
  exports: [PersonalTodosService],
})
export class PersonalTodosModule {}
