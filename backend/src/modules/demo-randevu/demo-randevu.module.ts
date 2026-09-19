import { Module } from "@nestjs/common";
import { EmailModule } from "../auth/email.module";
import { DemoMeetModule } from "./demo-meet.module";
import { DemoRandevuAdminController, DemoRandevuController } from "./demo-randevu.controller";
import { DemoRandevuPublicController } from "./demo-randevu-public.controller";
import { DemoRandevuProcessor } from "./demo-randevu.processor";
import { DemoRandevuService } from "./demo-randevu.service";

/** Canlı demo randevuları (bkz. migration 120). */
@Module({
  imports: [EmailModule, DemoMeetModule],
  controllers: [DemoRandevuPublicController, DemoRandevuController, DemoRandevuAdminController],
  providers: [DemoRandevuService, DemoRandevuProcessor],
})
export class DemoRandevuModule {}
