import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { MicrosoftCoreModule } from "../microsoft/microsoft-core.module";
import { GoogleAuthService } from "./google-auth.service";
import { GoogleController } from "./google.controller";
import { GoogleCoreModule } from "./google-core.module";
import { DemoMeetModule } from "../demo-randevu/demo-meet.module";
import { GoogleTakvimModule } from "../google-takvim/google-takvim.module";

/**
 * "Google ile giriş" akışı ve Ayarlar'daki Drive bağlantı ekranı.
 *
 * Kullanıcı kaydı/eşleştirmesi yaptığı için UsersModule'e bağımlı. Drive'ın
 * kendisiyle çalışan modüller (FilesModule) bunun yerine GoogleCoreModule'ü
 * kullanır — bkz. google-core.module.ts'teki döngü açıklaması.
 *
 * MicrosoftCoreModule'ü de içeri alır: depolama sağlayıcısı yalnızca biri
 * olabilir (Google Drive YA DA OneDrive), bu yüzden GoogleController'ın
 * OneDrive'ın bağlı olup olmadığını görebilmesi gerekiyor. Bilerek
 * MicrosoftModule değil: o UsersModule'ü çeker ve döngü doğar.
 */
@Module({
  imports: [GoogleCoreModule, MicrosoftCoreModule, UsersModule, PassportModule, DemoMeetModule, GoogleTakvimModule],
  controllers: [GoogleController],
  providers: [GoogleAuthService],
  exports: [GoogleCoreModule],
})
export class GoogleModule {}
