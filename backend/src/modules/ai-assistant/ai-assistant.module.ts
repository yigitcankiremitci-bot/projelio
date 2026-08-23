import { Module } from "@nestjs/common";
import { AiAssistantController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { AiCreditsService } from "./ai-credits.service";
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
import { CloudStorageModule } from "../cloud-storage/cloud-storage.module";
import { RealtimeModule } from "../realtime/realtime.module";

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
    // Sohbete iliştirilen dosyalar için: FilesModule mevcut bir Projelio dosyasını
    // indirmeye, CloudStorageModule ise kullanıcının Drive/OneDrive'ındaki dosyaya
    // erişmeye yarıyor. İkisi de yalnızca OKUMA için kullanılıyor.
    FilesModule,
    CloudStorageModule,
    // Lio'nun yaptığı değişikliği kullanıcının ekranına anında taşımak için
    // (bkz. AiAssistantService.emitActivity). Yalnızca yayın yapılıyor.
    RealtimeModule,
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
  ],
  // AiAssistantService dışarı açık: e-posta modülü yanıt taslağı üretmek için
  // draftText() çağırıyor (bkz. MailboxService.draftReply). Kredi muhasebesi ve
  // Anthropic istemcisi tek yerde kalsın diye ikinci bir istemci kurulmuyor.
  exports: [AiCreditsService, AiAssistantService],
})
export class AiAssistantModule {}
