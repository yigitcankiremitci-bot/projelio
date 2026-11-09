import { Module } from "@nestjs/common";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PartyModule } from "../party/party.module";
import { WebSitesiB2bService } from "./web-sitesi-b2b.service";
import { PortalKullanicilariController, SiteApiController, WebSitesiController } from "./web-sitesi.controller";
import { WebSitesiProcessor } from "./web-sitesi.processor";
import { WebSitesiService } from "./web-sitesi.service";

/** Web sitesi eklentisi — bkz. web-sitesi.service.ts ve docs/web-sitesi-eklentisi.md. */
@Module({
  imports: [PartyModule, ModuleMembersModule, NotificationsModule],
  controllers: [WebSitesiController, SiteApiController, PortalKullanicilariController],
  providers: [WebSitesiService, WebSitesiProcessor, WebSitesiB2bService],
})
export class WebSitesiModule {}
