import { Module } from "@nestjs/common";
import { AiAssistantController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { AiCreditsService } from "./ai-credits.service";
import { AiConversationsService } from "./ai-conversations.service";
import { TasksModule } from "../tasks/tasks.module";
import { ProjectsModule } from "../projects/projects.module";
import { JobsModule } from "../jobs/jobs.module";
import { BudgetModule } from "../budget/budget.module";
import { MembersModule } from "../members/members.module";

@Module({
  imports: [TasksModule, ProjectsModule, JobsModule, BudgetModule, MembersModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, AiCreditsService, AiConversationsService],
  exports: [AiCreditsService],
})
export class AiAssistantModule {}
