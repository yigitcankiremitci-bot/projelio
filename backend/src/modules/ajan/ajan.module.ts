import { Module } from "@nestjs/common";
import { AjanController, AjanIsciController } from "./ajan.controller";
import { AjanService } from "./ajan.service";
import { PersonalTodosModule } from "../personal-todos/personal-todos.module";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";

/**
 * Ajan MVP (migration 177). PersonalTodosModule: onaylanan "yapılacak"
 * önerisi kişinin listesine oradaki kurallarla girer, kural kopyalanmaz.
 * AiAssistantModule: ajan şirketi Lio'nun salt okunur araçlarıyla tanır
 * (AiAssistantService.ajanIcinOku) — yetki kuralları ikinci kez yazılmaz.
 */
@Module({
  imports: [PersonalTodosModule, AiAssistantModule],
  controllers: [AjanController, AjanIsciController],
  providers: [AjanService],
})
export class AjanModule {}
