import { Module } from "@nestjs/common";
import { AjanController, AjanIsciController } from "./ajan.controller";
import { AjanService } from "./ajan.service";
import { PersonalTodosModule } from "../personal-todos/personal-todos.module";

/**
 * Ajan MVP (migration 177). PersonalTodosModule: onaylanan "yapılacak"
 * önerisi kişinin listesine oradaki kurallarla girer, kural kopyalanmaz.
 */
@Module({
  imports: [PersonalTodosModule],
  controllers: [AjanController, AjanIsciController],
  providers: [AjanService],
})
export class AjanModule {}
