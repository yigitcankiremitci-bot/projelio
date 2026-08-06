import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BudgetService } from "./budget.service";

// Departmanın "Bütçe" sekmesi: proje bütçesinin (anlaşılan ücret/collection
// progress) aksine departmanın "anlaşılan ücret" kavramı yok — burası daha
// basit bir gelir/gider defteri (bkz. anasayfa bütçe defteriyle aynı mantık,
// yalnızca departmana bağlı).
@Controller("departments/:departmentId/budget")
@UseGuards(AuthGuard("jwt"))
export class DepartmentBudgetController {
  constructor(private budgetService: BudgetService) {}

  @Get()
  findAll(@Param("departmentId") departmentId: string) {
    return this.budgetService.findByDepartment(departmentId);
  }

  @Post()
  add(@Param("departmentId") departmentId: string, @Body() body: any, @Req() req: any) {
    return this.budgetService.addForDepartment(departmentId, body, req.user.userId);
  }

  @Delete(":id")
  remove(@Param("departmentId") _departmentId: string, @Param("id") id: string, @Req() req: any) {
    return this.budgetService.removeForDepartment(id, req.user.userId);
  }
}
