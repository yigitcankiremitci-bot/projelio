import { Module, forwardRef } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { TasksModule } from "../tasks/tasks.module";
import { OutputsModule } from "../outputs/outputs.module";
import { CreationRequestsModule } from "../creation-requests/creation-requests.module";

@Module({
  // forwardRef: bkz. JobsModule'deki aynı gerekçe.
  imports: [TasksModule, OutputsModule, forwardRef(() => CreationRequestsModule)],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
