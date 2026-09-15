import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { getJwtExpiresIn, getJwtSecret } from "../../common/config/env";
import { EmailModule } from "../auth/email.module";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FileDownloadLinksController } from "./file-download-links.controller";
import { FileDownloadLinksService } from "./file-download-links.service";
import { PublicFileLinkController } from "./public-file-link.controller";

/**
 * Üyelik gerektirmeyen dosya indirme bağlantıları (bkz. migration 114).
 *
 * Bağımlılık yönü TEK YÖNLÜ: bu modül FilesModule'ü içeri alır, o bunu almaz —
 * dosya sistemi bağlantıların varlığından habersiz kalsın (aynı karar için bkz.
 * file-links.module.ts).
 */
@Module({
  imports: [
    FilesModule,
    EmailModule,
    NotificationsModule,
    PassportModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [FileDownloadLinksController, PublicFileLinkController],
  providers: [FileDownloadLinksService],
})
export class FileDownloadLinksModule {}
