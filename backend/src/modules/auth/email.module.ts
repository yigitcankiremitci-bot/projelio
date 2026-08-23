import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";

/**
 * EmailService kendi modülünde.
 *
 * NEDEN AYRILDI: servis AuthModule içinde tanımlıydı ve dışarı açılmıyordu.
 * UsersModule'ün de ona ihtiyacı oldu (hesap silme bildirimi), ama AuthModule
 * zaten UsersModule'ü import ettiği için doğrudan import etmek döngü yaratırdı.
 * Bağımsız bir modül ikisinin de sorunsuz import edebileceği tek çözüm.
 *
 * Servisin kendi bağımlılığı yok (yalnızca ortam değişkeni ve logger), bu yüzden
 * modül boş kalabiliyor.
 */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
