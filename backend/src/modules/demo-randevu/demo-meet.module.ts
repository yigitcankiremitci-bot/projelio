import { Module } from "@nestjs/common";
import { GoogleCoreModule } from "../google/google-core.module";
import { DemoMeetService } from "./demo-meet.service";

/**
 * Otomatik Google Meet — AYRI MODÜL, çünkü iki yerden kullanılıyor: Google'ın
 * ortak OAuth dönüşü (GoogleModule) bağlantıyı kaydediyor, randevu servisi
 * (DemoRandevuModule) etkinliği açıyor. İkisi birbirini içeri almadan buradan
 * besleniyor; döngüsel bağımlılık olmuyor.
 */
@Module({
  imports: [GoogleCoreModule],
  providers: [DemoMeetService],
  exports: [DemoMeetService],
})
export class DemoMeetModule {}
