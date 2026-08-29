import { Module } from "@nestjs/common";
import { DemoSifirlamaService } from "./demo-sifirlama.service";

@Module({
  providers: [DemoSifirlamaService],
  exports: [DemoSifirlamaService],
})
export class DemoModule {}
