import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { TasksModule } from "../tasks/tasks.module";
import { OutputsModule } from "../outputs/outputs.module";

@Module({
  imports: [TasksModule, OutputsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
