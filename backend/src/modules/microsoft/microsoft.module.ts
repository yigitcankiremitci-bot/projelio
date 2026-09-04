import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { GoogleCoreModule } from "../google/google-core.module";
import { UsersModule } from "../users/users.module";
import { MicrosoftAuthService } from "./microsoft-auth.service";
import { MicrosoftController } from "./microsoft.controller";
import { MicrosoftCoreModule } from "./microsoft-core.module";

/**
 * "Microsoft ile giriş" akışı ve Ayarlar'daki OneDrive bağlantı ekranı.
 *
 * google.module.ts'in karşılığı; aynı sebeple ikiye bölünmüş durumda:
 * kullanıcı kaydı/eşleştirmesi yaptığı için UsersModule'e bağımlı, OneDrive'ın
 * kendisiyle çalışan modüller (FilesModule, CloudStorageModule, MailboxModule)
 * bunun yerine MicrosoftCoreModule'ü kullanır — bkz. microsoft-core.module.ts.
 */
@Module({
  imports: [
    MicrosoftCoreModule,
    // Depolama sağlayıcısı yalnızca biri olabilir: MicrosoftController'ın
    // Google Drive'ın bağlı olup olmadığını görebilmesi gerekiyor.
    GoogleCoreModule,
    UsersModule,
    PassportModule,
  ],
  controllers: [MicrosoftController],
  providers: [MicrosoftAuthService],
  exports: [MicrosoftCoreModule],
})
export class MicrosoftModule {}
