import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DriveService } from "./drive.service";
import { GoogleAccountsService } from "./google-accounts.service";
import { GoogleOAuthService } from "./google-oauth.service";

/**
 * Google Drive'ın "boru tesisatı": OAuth token yönetimi ve Drive API çağrıları.
 *
 * Neden GoogleModule'den ayrı:
 *   GoogleModule, "Google ile giriş" akışı için UsersModule'e bağımlı.
 *   UsersModule ise OrganizationsModule > JobsModule zincirini çekiyor.
 *   FilesModule bu paketin tamamını içeri alsaydı şu döngü doğardı:
 *
 *     JobsModule > FilesModule > GoogleModule > UsersModule
 *                > OrganizationsModule > JobsModule
 *
 *   Oysa dosya yükleyip indirmek için kullanıcı kimliğine hiç gerek yok —
 *   sadece token ve Drive API gerekiyor. Bu modül tam olarak o kadarını verir
 *   ve zinciri kırar.
 */
@Module({
  imports: [
    // `state` parametresini imzalamak için; oturum token'ıyla aynı anahtar.
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "change-me",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" },
    }),
  ],
  providers: [GoogleOAuthService, GoogleAccountsService, DriveService],
  exports: [GoogleOAuthService, GoogleAccountsService, DriveService, JwtModule],
})
export class GoogleCoreModule {}
