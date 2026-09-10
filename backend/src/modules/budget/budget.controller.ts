import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BudgetService } from "./budget.service";
import { RecurringPaymentsService } from "./recurring-payments.service";

@Controller("projects/:projectId/budget")
@UseGuards(AuthGuard("jwt"))
export class BudgetController {
  constructor(
    private budgetService: BudgetService,
    private recurringPaymentsService: RecurringPaymentsService
  ) {}

  @Get()
  findAll(@Param("projectId") projectId: string, @Req() req: any) {
    return this.budgetService.findByProject(projectId, req.user.userId);
  }

  @Post()
  add(@Param("projectId") projectId: string, @Body() body: any, @Req() req: any) {
    return this.budgetService.add(projectId, body, req.user.userId);
  }

  // Projeye bağlı düzenli ödemeler. Kasa'dan bir projeye düzenli gider
  // girildiğinde o yük deftere ancak vadesi gelince işleniyor; o güne kadar
  // proje bütçesinde hiçbir izi yoktu ve proje "gideri yokmuş" gibi
  // görünüyordu. Burası henüz işlenmemiş yükü de görünür kılıyor.
  @Get("recurring")
  async recurring(@Param("projectId") projectId: string, @Req() req: any) {
    await this.budgetService.assertCanViewBudget(projectId, req.user.userId);
    return this.recurringPaymentsService.findByProject(projectId);
  }

  // remainingMargin: eldeki net (tahsil edilen − harcanan).
  // expectedPayment: müşteriden henüz tahsil edilmemiş alacak. totalBudget artık
  // istemciden değil sunucudaki güncel proje kaydından okunuyor (bkz. BudgetService).
  @Get("margin")
  async margin(@Param("projectId") projectId: string, @Req() req: any) {
    const [remainingMargin, expectedPayment] = await Promise.all([
      this.budgetService.calculateRemainingMargin(projectId, req.user.userId),
      this.budgetService.calculateExpectedPayment(projectId, req.user.userId),
    ]);
    return { remainingMargin, expectedPayment };
  }

  // Excel / PDF dışa aktarma: gerçek implementasyon exceljs / pdfkit ile
  @Get("export")
  export(@Param("projectId") projectId: string, @Query("format") format: "xlsx" | "pdf") {
    return { message: `Export (${format}) endpoint - implementasyon bekleniyor`, projectId };
  }
}
