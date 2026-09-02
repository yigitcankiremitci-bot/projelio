import { forwardRef, Module } from "@nestjs/common";
import { AiAssistantController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { AiCreditsService } from "./ai-credits.service";
import { AiCreditOrdersService } from "./ai-credit-orders.service";
import { AiPaymentProvider } from "./ai-payment.provider";
import { AiConversationsService } from "./ai-conversations.service";
import { AiAttachmentsService } from "./ai-attachments.service";
import { AiTranscriptionService } from "./ai-transcription.service";
import { AiSpeechService } from "./ai-speech.service";
import { AiSpendAlertProcessor } from "./ai-spend-alert.processor";
import { TasksModule } from "../tasks/tasks.module";
import { ProjectsModule } from "../projects/projects.module";
import { JobsModule } from "../jobs/jobs.module";
import { BudgetModule } from "../budget/budget.module";
import { MembersModule } from "../members/members.module";
import { TaskCommentsModule } from "../task-comments/task-comments.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PlanningModule } from "../planning/planning.module";
import { OutputsModule } from "../outputs/outputs.module";
import { FilesModule } from "../files/files.module";
import { PersonalTodosModule } from "../personal-todos/personal-todos.module";
import { CloudStorageModule } from "../cloud-storage/cloud-storage.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CatalogModule } from "../catalog/catalog.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { DepartmentsModule } from "../departments/departments.module";
import { DepartmentMembersModule } from "../department-members/department-members.module";
import { OrganizationModulesModule } from "../organization-modules/organization-modules.module";
import { JobModulesModule } from "../job-modules/job-modules.module";
import { ModuleRecordsModule } from "../module-records/module-records.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";

@Module({
  imports: [
    TasksModule,
    ProjectsModule,
    JobsModule,
    BudgetModule,
    MembersModule,
    TaskCommentsModule,
    NotificationsModule,
    // Takvim araçları: Lio'nun haftalık/günlük planlama sihirbazı bu servisi kullanır.
    PlanningModule,
    // Çıktılar: proje/departmanın teslim edilecek parçaları. Lio görevleri
    // çıktılara bağlayabilsin ve çıktı oluşturabilsin diye.
    OutputsModule,
    // Yapılacaklar sayfası: kullanıcının kişisel panosu. Proje görevlerinden
    // (TasksModule) ayrı bir modül çünkü kayıtlar ayrı tabloda ve kimseyle
    // paylaşılmıyor; yetki kuralı da tek: kayıt istekte bulunanın olmalı.
    PersonalTodosModule,
    // Sohbete iliştirilen dosyalar için: FilesModule mevcut bir Projelio dosyasını
    // indirmeye, CloudStorageModule ise kullanıcının Drive/OneDrive'ındaki dosyaya
    // erişmeye yarıyor. İkisi de yalnızca OKUMA için kullanılıyor.
    FilesModule,
    CloudStorageModule,
    // Lio'nun yaptığı değişikliği kullanıcının ekranına anında taşımak için
    // (bkz. AiAssistantService.emitActivity). Yalnızca yayın yapılıyor.
    RealtimeModule,
    // Modül araçları. Modül = departmanın (serbest çalışanda işin) defteri:
    // Gelir-Gider, Fatura, Sözleşme… Lio hem defterin içeriğini (ModuleRecords)
    // hem de hangi modüllerin açık olduğunu (OrganizationModules/JobModules)
    // yönetebilsin diye. Katalog hangi modüllerin var olduğunu, Organizations
    // ise kullanıcının hangi organizasyonlarda olduğunu söylüyor.
    CatalogModule,
    OrganizationsModule,
    // Departman araçları: görev bir projeye ya da bir departmana açılabiliyor.
    // Departmanı listelemek, kadrosunu görmek ve görevlerini yönetmek için.
    DepartmentsModule,
    DepartmentMembersModule,
    OrganizationModulesModule,
    JobModulesModule,
    ModuleRecordsModule,
    // WhatsApp araçları (müşteriye yaz, konuşmayı oku). İki yönlü bağımlılık:
    // WhatsApp modülü otomatik yanıt için draftText()'i çağırıyor.
    forwardRef(() => WhatsappModule),
  ],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    AiCreditsService,
    AiConversationsService,
    AiAttachmentsService,
    AiTranscriptionService,
    AiSpeechService,
    AiSpendAlertProcessor,
    AiCreditOrdersService,
    AiPaymentProvider,
  ],
  // AiAssistantService dışarı açık: e-posta modülü yanıt taslağı üretmek için
  // draftText() çağırıyor (bkz. MailboxService.draftReply). Kredi muhasebesi ve
  // Anthropic istemcisi tek yerde kalsın diye ikinci bir istemci kurulmuyor.
  exports: [AiCreditsService, AiAssistantService],
})
export class AiAssistantModule {}
