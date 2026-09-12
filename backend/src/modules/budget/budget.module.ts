import { Module } from "@nestjs/common";
import { BudgetController } from "./budget.controller";
import { BudgetOverviewController } from "./budget-overview.controller";
import { DepartmentBudgetController } from "./department-budget.controller";
import { BudgetService } from "./budget.service";
import { RecurringPaymentsController } from "./recurring-payments.controller";
import { RecurringPaymentsService } from "./recurring-payments.service";
import { RecurringPaymentsProcessor } from "./recurring-payments.processor";
import { NotificationsModule } from "../notifications/notifications.module";
// Bütçe hiyerarşisi: iş / departman / şirket / holding kademeleri tek koddan
// geçiyor (bkz. butce-kademe.service.ts).
import { ButceErisimService } from "./butce-erisim.service";
import { ButceKademeService } from "./butce-kademe.service";
import { ButceHiyerarsiService } from "./butce-hiyerarsi.service";
import { ButceKademeController } from "./butce-kademe.controller";
import { GorevButceService } from "./gorev-butce.service";
import { GorevButceController } from "./gorev-butce.controller";

@Module({
  imports: [NotificationsModule],
  controllers: [
    BudgetController,
    BudgetOverviewController,
    DepartmentBudgetController,
    RecurringPaymentsController,
    ButceKademeController,
    GorevButceController,
  ],
  providers: [
    BudgetService,
    RecurringPaymentsService,
    RecurringPaymentsProcessor,
    ButceErisimService,
    ButceKademeService,
    ButceHiyerarsiService,
    GorevButceService,
  ],
  exports: [BudgetService, RecurringPaymentsService, ButceErisimService, ButceHiyerarsiService, GorevButceService],
})
export class BudgetModule {}
