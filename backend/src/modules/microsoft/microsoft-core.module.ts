import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MicrosoftAccountsService } from "./microsoft-accounts.service";
import { MicrosoftOAuthService } from "./microsoft-oauth.service";
import { OneDriveService } from "./onedrive.service";
import { getJwtSecret, getJwtExpiresIn } from "../../common/config/env";

/**
 * Microsoft'un "boru tesisatı": OAuth token yönetimi ve Graph/OneDrive çağrıları.
 *
 * google-core.module.ts'in birebir karşılığı ve aynı gerekçeyle var:
 * MicrosoftModule artık "Microsoft ile giriş" akışını da barındırdığı için
 * UsersModule'e bağımlı, UsersModule ise OrganizationsModule > JobsModule
 * zincirini çekiyor. Dosya/posta tarafı MicrosoftModule'ü içeri alsaydı şu
 * döngü doğardı:
 *
 *   JobsModule > FilesModule > CloudStorageModule > MicrosoftModule
 *              > UsersModule > OrganizationsModule > JobsModule
 *
 * Oysa OneDrive'a dosya yazmak için kullanıcı kimliğine gerek yok — sadece
 * token ve Graph gerekiyor. Bu modül tam olarak o kadarını verir.
 */
@Module({
  imports: [
    // `state` parametresini imzalamak için; oturum token'ıyla aynı anahtar.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  providers: [MicrosoftOAuthService, MicrosoftAccountsService, OneDriveService],
  exports: [MicrosoftOAuthService, MicrosoftAccountsService, OneDriveService, JwtModule],
})
export class MicrosoftCoreModule {}
