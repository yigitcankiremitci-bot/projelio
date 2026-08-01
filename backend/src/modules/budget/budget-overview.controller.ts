import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BudgetService } from "./budget.service";

// Anasayfadaki bütçe sekmesi: kullanıcının kendi defteri (tüm projelerinin bütçeleri
// + projeye bağlı olmayan genel gelir/giderler).
@Controller("budget")
@UseGuards(AuthGuard("jwt"))
export class BudgetOverviewController {
  constructor(private budgetService: BudgetService) {}

  @Get("overview")
  overview(@Req() req: any) {
    return this.budgetService.getOverview(req.user.userId);
  }

  @Get("transactions")
  transactions(@Req() req: any) {
    return this.budgetService.findAllForUser(req.user.userId);
  }

  @Post("transactions")
  create(@Req() req: any, @Body() body: any) {
    return this.budgetService.createForUser(req.user.userId, body);
  }

  @Delete("transactions/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.budgetService.removeForUser(id, req.user.userId);
  }
}
