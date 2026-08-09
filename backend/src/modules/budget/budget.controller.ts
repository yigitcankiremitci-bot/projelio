import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BudgetService } from "./budget.service";

@Controller("projects/:projectId/budget")
@UseGuards(AuthGuard("jwt"))
export class BudgetController {
  constructor(private budgetService: BudgetService) {}

  @Get()
  findAll(@Param("projectId") projectId: string, @Req() req: any) {
    return this.budgetService.findByProject(projectId, req.user.userId);
  }

  @Post()
  add(@Param("projectId") projectId: string, @Body() body: any, @Req() req: any) {
    return this.budgetService.add(projectId, body, req.user.userId);
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
