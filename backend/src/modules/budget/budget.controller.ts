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

  @Get("margin")
  async margin(@Param("projectId") projectId: string, @Query("totalBudget") totalBudget: string) {
    const remainingMargin = await this.budgetService.calculateRemainingMargin(projectId, Number(totalBudget));
    return { remainingMargin };
  }

  // Excel / PDF dışa aktarma: gerçek implementasyon exceljs / pdfkit ile
  @Get("export")
  export(@Param("projectId") projectId: string, @Query("format") format: "xlsx" | "pdf") {
    return { message: `Export (${format}) endpoint - implementasyon bekleniyor`, projectId };
  }
}
