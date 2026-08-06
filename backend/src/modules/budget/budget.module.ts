import { Module } from "@nestjs/common";
import { BudgetController } from "./budget.controller";
import { BudgetOverviewController } from "./budget-overview.controller";
import { DepartmentBudgetController } from "./department-budget.controller";
import { BudgetService } from "./budget.service";
import { RecurringPaymentsController } from "./recurring-payments.controller";
import { RecurringPaymentsService } from "./recurring-payments.service";
import { RecurringPaymentsProcessor } from "./recurring-payments.processor";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [BudgetController, BudgetOverviewController, DepartmentBudgetController, RecurringPaymentsController],
  providers: [BudgetService, RecurringPaymentsService, RecurringPaymentsProcessor],
  exports: [BudgetService, RecurringPaymentsService],
})
export class BudgetModule {}
