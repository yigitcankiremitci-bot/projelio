import { Module } from "@nestjs/common";
import { SiteApiController, WebSitesiController } from "./web-sitesi.controller";
import { WebSitesiProcessor } from "./web-sitesi.processor";
import { WebSitesiService } from "./web-sitesi.service";

/** Web sitesi eklentisi — bkz. web-sitesi.service.ts ve docs/web-sitesi-eklentisi.md. */
@Module({
  controllers: [WebSitesiController, SiteApiController],
  providers: [WebSitesiService, WebSitesiProcessor],
})
export class WebSitesiModule {}
