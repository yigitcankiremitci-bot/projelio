import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TasksModule } from "../tasks/tasks.module";
import { FileLinksController } from "./file-links.controller";
import { FileLinksService } from "./file-links.service";

/**
 * Dosya bağlantıları (bkz. migration 095).
 *
 * Bağımlılık yönü TEK YÖNLÜ: bu modül FilesModule ve TasksModule'ü içeri alır,
 * onlar bunu almaz. Ters yönde bir bağımlılık Jobs > Files > Tasks > … grafında
 * yeni bir döngü riski demekti; o graf bir kez döngüye girmişti
 * (bkz. files.module.ts'teki GoogleCoreModule notu).
 *
 * Modül kayıtları için ModuleRecordsModule'e ihtiyaç YOK: kaydın kapsamı tek bir
 * satır okumasıyla çözülüyor, yetkiyi zaten kapsam karşılaştırması veriyor.
 */
@Module({
  imports: [FilesModule, TasksModule, NotificationsModule],
  controllers: [FileLinksController],
  providers: [FileLinksService],
  exports: [FileLinksService],
})
export class FileLinksModule {}
