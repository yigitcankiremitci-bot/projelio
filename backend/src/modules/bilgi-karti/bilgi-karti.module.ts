import { Module } from "@nestjs/common";
import { BilgiKartiController } from "./bilgi-karti.controller";
import { BilgiKartiService } from "./bilgi-karti.service";
import { BilgiKartiOzetService } from "./bilgi-karti-ozet.service";
// Özetteki gelir/gider, bütçe modülünün kendi yetki kapısından geçiyor
// (bkz. BilgiKartiOzetService.paraBolumu) — ikinci bir kural yazılmadı.
import { BudgetModule } from "../budget/budget.module";

@Module({
  imports: [BudgetModule],
  controllers: [BilgiKartiController],
  providers: [BilgiKartiService, BilgiKartiOzetService],
  exports: [BilgiKartiService],
})
export class BilgiKartiModule {}
