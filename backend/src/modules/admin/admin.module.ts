import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { UsersModule } from "../users/users.module";
import { ProjectsModule } from "../projects/projects.module";
import { DemoModule } from "../demo/demo.module";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";
import { AdminKullanicilarService } from "./admin-kullanicilar.service";
import { AdminMesajService } from "./admin-mesaj.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { EmailModule } from "../auth/email.module";

@Module({
  imports: [UsersModule, ProjectsModule, DemoModule, AiAssistantModule, NotificationsModule, EmailModule],
  controllers: [AdminController],
  providers: [AdminService, AdminKullanicilarService, AdminMesajService],
})
export class AdminModule {}
