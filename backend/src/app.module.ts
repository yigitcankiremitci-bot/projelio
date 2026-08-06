import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { OperationsModule } from "./modules/operations/operations.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { GroupsModule } from "./modules/groups/groups.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { OutputsModule } from "./modules/outputs/outputs.module";
import { TaskCommentsModule } from "./modules/task-comments/task-comments.module";
import { ProjectPostsModule } from "./modules/project-posts/project-posts.module";
import { PostCommentsModule } from "./modules/post-comments/post-comments.module";
import { MembersModule } from "./modules/members/members.module";
import { JobMembersModule } from "./modules/job-members/job-members.module";
import { BudgetModule } from "./modules/budget/budget.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { AdminModule } from "./modules/admin/admin.module";
import { ArchiveModule } from "./modules/archive/archive.module";
import { AiAssistantModule } from "./modules/ai-assistant/ai-assistant.module";
import { GoogleModule } from "./modules/google/google.module";
import { MicrosoftModule } from "./modules/microsoft/microsoft.module";
import { FilesModule } from "./modules/files/files.module";
import { HealthModule } from "./modules/health/health.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { DepartmentsModule } from "./modules/departments/departments.module";
import { DepartmentMembersModule } from "./modules/department-members/department-members.module";
import { OrganizationModulesModule } from "./modules/organization-modules/organization-modules.module";
import { JobModulesModule } from "./modules/job-modules/job-modules.module";
import { PartnersModule } from "./modules/partners/partners.module";
import { ProductsModule } from "./modules/products/products.module";
import { ModuleRecordsModule } from "./modules/module-records/module-records.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    OperationsModule,
    JobsModule,
    OrganizationsModule,
    GroupsModule,
    TasksModule,
    OutputsModule,
    TaskCommentsModule,
    ProjectPostsModule,
    PostCommentsModule,
    MembersModule,
    JobMembersModule,
    BudgetModule,
    NotificationsModule,
    CalendarModule,
    AdminModule,
    ArchiveModule,
    AiAssistantModule,
    GoogleModule,
    MicrosoftModule,
    FilesModule,
    HealthModule,
    CatalogModule,
    DepartmentsModule,
    DepartmentMembersModule,
    OrganizationModulesModule,
    JobModulesModule,
    PartnersModule,
    ProductsModule,
    ModuleRecordsModule,
  ],
})
export class AppModule {}
