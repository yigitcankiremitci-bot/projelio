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
import { TaskCommentsModule } from "../task-comments/task-comments.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PlanningModule } from "../planning/planning.module";

@Module({
  imports: [
    TasksModule,
    ProjectsModule,
    JobsModule,
    BudgetModule,
    MembersModule,
    TaskCommentsModule,
    NotificationsModule,
    // Takvim araçları: Lio'nun haftalık/günlük planlama sihirbazı bu servisi kullanır.
    PlanningModule,
  ],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, AiCreditsService, AiConversationsService],
  exports: [AiCreditsService],
})
export class AiAssistantModule {}
