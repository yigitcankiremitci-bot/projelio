import { Module } from "@nestjs/common";
import { DemoSifirlamaService } from "./demo-sifirlama.service";
import { DemoAnlikGoruntuService } from "./demo-anlik-goruntu.service";
import { DemoZiyaretService } from "./demo-ziyaret.service";
import { DemoZiyaretController } from "./demo-ziyaret.controller";

@Module({
  controllers: [DemoZiyaretController],
  providers: [DemoSifirlamaService, DemoAnlikGoruntuService, DemoZiyaretService],
  exports: [DemoSifirlamaService, DemoAnlikGoruntuService, DemoZiyaretService],
})
export class DemoModule {}
