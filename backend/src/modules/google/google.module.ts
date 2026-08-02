import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { GoogleAuthService } from "./google-auth.service";
import { GoogleController } from "./google.controller";
import { GoogleCoreModule } from "./google-core.module";

/**
 * "Google ile giriş" akışı ve Ayarlar'daki Drive bağlantı ekranı.
 *
 * Kullanıcı kaydı/eşleştirmesi yaptığı için UsersModule'e bağımlı. Drive'ın
 * kendisiyle çalışan modüller (FilesModule) bunun yerine GoogleCoreModule'ü
 * kullanır — bkz. google-core.module.ts'teki döngü açıklaması.
 */
@Module({
  imports: [GoogleCoreModule, UsersModule, PassportModule],
  controllers: [GoogleController],
  providers: [GoogleAuthService],
  exports: [GoogleCoreModule],
})
export class GoogleModule {}
