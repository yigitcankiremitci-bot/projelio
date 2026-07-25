import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { MembersModule } from "./modules/members/members.module";
import { BudgetModule } from "./modules/budget/budget.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { AdminModule } from "./modules/admin/admin.module";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    MembersModule,
    BudgetModule,
    NotificationsModule,
    CalendarModule,
    AdminModule,
  ],
})
export class AppModule {}
