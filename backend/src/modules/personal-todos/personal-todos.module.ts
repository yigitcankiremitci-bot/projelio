import { Module } from "@nestjs/common";
import { PersonalTodosController } from "./personal-todos.controller";
import { PersonalTodosService } from "./personal-todos.service";

@Module({
  controllers: [PersonalTodosController],
  providers: [PersonalTodosService],
  exports: [PersonalTodosService],
})
export class PersonalTodosModule {}
