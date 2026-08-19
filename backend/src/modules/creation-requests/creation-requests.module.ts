import { Module, forwardRef } from "@nestjs/common";
import { CreationRequestsController } from "./creation-requests.controller";
import { CreationRequestsService } from "./creation-requests.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";

// forwardRef: JobsController/ProjectsController da bu servisi kullanıyor
// (taşeronun "aç" isteğini talebe çevirmek için), yani bağımlılık çift yönlü.
@Module({
  imports: [NotificationsModule, forwardRef(() => JobsModule), forwardRef(() => ProjectsModule)],
  controllers: [CreationRequestsController],
  providers: [CreationRequestsService],
  exports: [CreationRequestsService],
})
export class CreationRequestsModule {}
