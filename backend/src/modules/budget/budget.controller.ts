import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BudgetService } from "./budget.service";

@Controller("projects/:projectId/budget")
@UseGuards(AuthGuard("jwt"))
export class BudgetController {
  constructor(private budgetService: BudgetService) {}

  @Get()
  findAll(@Param("projectId") projectId: string) {
    return this.budgetService.findByProject(projectId);
  }

  @Post()
  add(@Param("projectId") projectId: string, @Body() body: any) {
    return this.budgetService.add(projectId, body);
  }

  // remainingMargin: eldeki net (tahsil edilen − harcanan).
  // expectedPayment: müşteriden henüz tahsil edilmemiş alacak.
  @Get("margin")
  async margin(@Param("projectId") projectId: string, @Query("totalBudget") totalBudget: string) {
    const [remainingMargin, expectedPayment] = await Promise.all([
      this.budgetService.calculateRemainingMargin(projectId),
      this.budgetService.calculateExpectedPayment(projectId, Number(totalBudget) || 0),
    ]);
    return { remainingMargin, expectedPayment };
  }

  // Excel / PDF dışa aktarma: gerçek implementasyon exceljs / pdfkit ile
  @Get("export")
  export(@Param("projectId") projectId: string, @Query("format") format: "xlsx" | "pdf") {
    return { message: `Export (${format}) endpoint - implementasyon bekleniyor`, projectId };
  }
}
