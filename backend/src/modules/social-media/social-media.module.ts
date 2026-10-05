import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { FilesModule } from "../files/files.module";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";
import { LioOneriService } from "./lio-oneri.service";
import { SosyalLioService } from "./sosyal-lio.service";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { IcerikAnaliziController } from "./icerik-analizi.controller";
import { IcerikAnaliziService } from "./icerik-analizi.service";
import { InstagramController } from "./instagram.controller";
import { InstagramInsightsService } from "./instagram-insights.service";
import { InstagramOAuthService } from "./instagram-oauth.service";
import { InstagramPublishService } from "./instagram-publish.service";
import { InstagramService } from "./instagram.service";
import { SocialCredentialsController } from "./social-credentials.controller";
import { SocialCredentialsService } from "./social-credentials.service";
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
    // Lio'nun açıklama/etiket önerisi: kredi defteri, sağlayıcı yönlendirici ve
    // ses çözümleme tek yerden (bkz. LioOneriService).
    AiAssistantModule,
    // Lio'nun sosyal medya araçları: kullanıcının hesaplarını bulmak için.
    OrganizationsModule,
    JobsModule,
    // OAuth `state` imzası için — Google akışıyla aynı desen.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [SocialMediaController, InstagramController, SocialCredentialsController, IcerikAnaliziController],
  providers: [
    SocialMediaService,
    SocialTokensService,
    SocialCredentialsService,
    InstagramOAuthService,
    InstagramService,
    InstagramPublishService,
    SocialPublishService,
    SocialPublishProcessor,
    LioOneriService,
    SosyalLioService,
    InstagramInsightsService,
    IcerikAnaliziService,
  ],
  exports: [SocialMediaService, SosyalLioService],
})
export class SocialMediaModule {}
