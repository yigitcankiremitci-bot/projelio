import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { OutputsModule } from "./modules/outputs/outputs.module";
import { TaskCommentsModule } from "./modules/task-comments/task-comments.module";
import { ProjectPostsModule } from "./modules/project-posts/project-posts.module";
import { MembersModule } from "./modules/members/members.module";
import { BudgetModule } from "./modules/budget/budget.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { AdminModule } from "./modules/admin/admin.module";
import { ArchiveModule } from "./modules/archive/archive.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    JobsModule,
    TasksModule,
    OutputsModule,
    TaskCommentsModule,
    ProjectPostsModule,
    MembersModule,
    BudgetModule,
    NotificationsModule,
    CalendarModule,
    AdminModule,
    ArchiveModule,
  ],
})
export class AppModule {}
