import { Module } from "@nestjs/common";
import { ProjectSharesController } from "./project-shares.controller";
import { PublicProjectController } from "./public-project.controller";
import { ProjectSharesService } from "./project-shares.service";
import { ProjectsModule } from "../projects/projects.module";

@Module({
  // ProjectsModule: "bu projeyi kim yönetebilir" kuralı orada
  // (ProjectsService.assertCanManageProject), kopyalanmıyor.
  imports: [ProjectsModule],
  controllers: [ProjectSharesController, PublicProjectController],
  providers: [ProjectSharesService],
})
export class ProjectSharesModule {}
