import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { GoogleCoreModule } from "../google/google-core.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [
    // Bilerek GoogleModule değil: o UsersModule'ü çeker ve
    // Jobs > Files > Google > Users > Organizations > Jobs döngüsü doğar.
    GoogleCoreModule,
    NotificationsModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "change-me",
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" },
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
