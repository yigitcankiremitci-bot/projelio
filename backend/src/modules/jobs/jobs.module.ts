import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { ProjectsModule } from "../projects/projects.module";
import { OperationsModule } from "../operations/operations.module";

@Module({
  imports: [ProjectsModule, OperationsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
