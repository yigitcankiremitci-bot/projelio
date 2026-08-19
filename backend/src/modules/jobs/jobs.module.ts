import { Module, forwardRef } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { ProjectsModule } from "../projects/projects.module";
import { OperationsModule } from "../operations/operations.module";
import { FilesModule } from "../files/files.module";
import { CreationRequestsModule } from "../creation-requests/creation-requests.module";

@Module({
  // forwardRef: CreationRequestsModule da JobsModule'e ihtiyaç duyuyor
  // (onaylanan talebi gerçek işe dönüştürmek için) — bağımlılık çift yönlü.
  imports: [ProjectsModule, OperationsModule, FilesModule, forwardRef(() => CreationRequestsModule)],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
