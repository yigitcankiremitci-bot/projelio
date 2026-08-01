import { Module } from "@nestjs/common";
import { AiAssistantController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { TasksModule } from "../tasks/tasks.module";
import { ProjectsModule } from "../projects/projects.module";
import { JobsModule } from "../jobs/jobs.module";
import { BudgetModule } from "../budget/budget.module";

@Module({
  imports: [TasksModule, ProjectsModule, JobsModule, BudgetModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
})
export class AiAssistantModule {}
