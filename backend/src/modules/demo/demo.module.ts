import { Module } from "@nestjs/common";
import { DemoSifirlamaService } from "./demo-sifirlama.service";
import { DemoAnlikGoruntuService } from "./demo-anlik-goruntu.service";

@Module({
  providers: [DemoSifirlamaService, DemoAnlikGoruntuService],
  exports: [DemoSifirlamaService, DemoAnlikGoruntuService],
})
export class DemoModule {}
