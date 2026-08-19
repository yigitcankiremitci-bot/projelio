import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { FilesModule } from "../files/files.module";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { InstagramController } from "./instagram.controller";
import { InstagramOAuthService } from "./instagram-oauth.service";
import { InstagramPublishService } from "./instagram-publish.service";
import { InstagramService } from "./instagram.service";
import { SocialMediaController } from "./social-media.controller";
import { SocialMediaService } from "./social-media.service";
import { SocialPublishProcessor } from "./social-publish.processor";
import { SocialPublishService } from "./social-publish.service";
import { SocialTokensService } from "./social-tokens.service";
import { getJwtSecret, getJwtExpiresIn } from "../../common/config/env";

@Module({
  imports: [
    // Kim yazabilir kararı ModuleMembersService'te tek yerde çözülüyor
    // (organizasyon sahibi > departman yöneticisi > modül üyesi).
    ModuleMembersModule,
    // Yayın anında görsel/video Drive/OneDrive'dan okunur (bkz.
    // InstagramPublishService.stageMedia).
    FilesModule,
    // Zamanlanmış yayının sonucu sorumluya bildirilir.
    NotificationsModule,
    // OAuth `state` imzası için — Google akışıyla aynı desen.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [SocialMediaController, InstagramController],
  providers: [
    SocialMediaService,
    SocialTokensService,
    InstagramOAuthService,
    InstagramService,
    InstagramPublishService,
    SocialPublishService,
    SocialPublishProcessor,
  ],
  exports: [SocialMediaService],
})
export class SocialMediaModule {}
