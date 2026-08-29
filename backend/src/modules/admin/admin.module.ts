import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { UsersModule } from "../users/users.module";
import { ProjectsModule } from "../projects/projects.module";
import { DemoModule } from "../demo/demo.module";

@Module({
  imports: [UsersModule, ProjectsModule, DemoModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
