import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "./database/database.module";
import { KullaniciDiliModule } from "./common/i18n/kullanici-dili.service";
import { AccessModule } from "./common/access/access.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { ProjectSharesModule } from "./modules/project-shares/project-shares.module";
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
import { SupportModule } from "./modules/support/support.module";
import { ArchiveModule } from "./modules/archive/archive.module";
import { AiAssistantModule } from "./modules/ai-assistant/ai-assistant.module";
import { HabieModule } from "./modules/habie/habie.module";
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
import { ModuleMembersModule } from "./modules/module-members/module-members.module";
import { PartyModule } from "./modules/party/party.module";
import { ModuleRecordsModule } from "./modules/module-records/module-records.module";
import { PersonalTodosModule } from "./modules/personal-todos/personal-todos.module";
import { PlanningModule } from "./modules/planning/planning.module";
import { CreationRequestsModule } from "./modules/creation-requests/creation-requests.module";
import { SocialMediaModule } from "./modules/social-media/social-media.module";
import { MailboxModule } from "./modules/mailbox/mailbox.module";
import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";
import { DataRetentionModule } from "./modules/data-retention/data-retention.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { RealtimeChangeInterceptor } from "./modules/realtime/realtime.interceptor";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    // Arayüz dili her modülden soruluyor; DatabaseModule gibi global.
    KullaniciDiliModule,
    // Görünürlüğün tek kapısı (bkz. common/access/access.service.ts).
    AccessModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    ProjectSharesModule,
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
    SupportModule,
    ArchiveModule,
    AiAssistantModule,
    HabieModule,
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
    ModuleMembersModule,
    ModuleRecordsModule,
    PartyModule,
    PersonalTodosModule,
    PlanningModule,
    // Sosyal medya: kendi tablolarını kullanan ilk modül (bkz. 054_social_media.sql).
    SocialMediaModule,
    // E-posta modülünün gelen kutusu (Outlook/Graph, bkz. 064_mail_accounts.sql).
    MailboxModule,
    // WhatsApp köprüsü: QR ile bağlanan numara üzerinden bildirim (bkz. 080_whatsapp.sql).
    WhatsappModule,
    // Taşeronun iş/proje açma talepleri (onay akışı).
    CreationRequestsModule,
    // Aynı sayfadaki kullanıcıların birbirini görmesi ve değişikliklerin anında
    // yansıması (bkz. realtime.gateway.ts).
    RealtimeModule,
    // Saklama süresi dolmuş kayıtların gece temizliği (gizlilik politikası §12).
    DataRetentionModule,
  ],
  providers: [
    // Her başarılı değiştirme isteğinden sonra, isteği yapanın bulunduğu sayfaya
    // "değişti" sinyali gönderir. Servislere tek tek yayın çağrısı eklemek
    // yerine tek kapı (bkz. realtime.interceptor.ts).
    { provide: APP_INTERCEPTOR, useClass: RealtimeChangeInterceptor },
  ],
})
export class AppModule {}
