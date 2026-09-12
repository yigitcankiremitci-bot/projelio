import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { UsersModule } from "../users/users.module";
import { ProjectsModule } from "../projects/projects.module";
import { DemoModule } from "../demo/demo.module";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";
import { AdminKullanicilarService } from "./admin-kullanicilar.service";

@Module({
  imports: [UsersModule, ProjectsModule, DemoModule, AiAssistantModule],
  controllers: [AdminController],
  providers: [AdminService, AdminKullanicilarService],
})
export class AdminModule {}
