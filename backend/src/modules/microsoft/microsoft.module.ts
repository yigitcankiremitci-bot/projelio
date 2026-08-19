import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { GoogleCoreModule } from "../google/google-core.module";
import { MicrosoftAccountsService } from "./microsoft-accounts.service";
import { MicrosoftController } from "./microsoft.controller";
import { MicrosoftOAuthService } from "./microsoft-oauth.service";
import { OneDriveService } from "./onedrive.service";
import { getJwtSecret, getJwtExpiresIn } from "../../common/config/env";

/**
 * "OneDrive'ı bağla" akışı (Ayarlar ekranı) + FilesModule'ün kullandığı
 * OneDrive "boru tesisatı" (token yönetimi + Graph API çağrıları).
 *
 * Google'daki google.module.ts / google-core.module.ts ikilisinden farklı
 * olarak burada bölünmeye gerek yok: "Microsoft ile giriş" diye bir akış
 * olmadığı için UsersModule'e bağımlılık yok, dolayısıyla Google tarafındaki
 * döngü riski (bkz. google-core.module.ts) burada oluşmuyor.
 *
 * GoogleCoreModule'ü içeri alır: depolama sağlayıcısı yalnızca biri olabilir
 * (Google Drive YA DA OneDrive), bu yüzden MicrosoftController'ın Drive'ın
 * bağlı olup olmadığını görebilmesi gerekiyor. GoogleCoreModule'ün
 * UsersModule'e bağımlılığı olmadığı için döngü doğmaz.
 */
@Module({
  imports: [
    GoogleCoreModule,
    PassportModule,
    // `state` parametresini imzalamak için; oturum token'ıyla aynı anahtar.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [MicrosoftController],
  providers: [MicrosoftOAuthService, MicrosoftAccountsService, OneDriveService],
  exports: [MicrosoftOAuthService, MicrosoftAccountsService, OneDriveService],
})
export class MicrosoftModule {}
