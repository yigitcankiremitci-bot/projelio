import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BudgetService } from "./budget.service";
import { RecurringPaymentsService } from "./recurring-payments.service";
import { HizmetAnlasmasiService } from "./hizmet-anlasmasi.service";

@Controller("projects/:projectId/budget")
@UseGuards(AuthGuard("jwt"))
export class BudgetController {
  constructor(
    private budgetService: BudgetService,
    private recurringPaymentsService: RecurringPaymentsService,
    private hizmet: HizmetAnlasmasiService
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
  // Hizmet anlaşmaları: proje sahibi ile projede hizmet veren üye arasındaki
  // ücret ve ödemeler. Bütçe görüntüleme yetkisinden BAĞIMSIZ: üye sahibin
  // defterini görmeden kendi anlaşmasını görür (bkz. HizmetAnlasmasiService).
  @Get("hizmet")
  hizmetListesi(@Param("projectId") projectId: string, @Req() req: any) {
    return this.hizmet.liste(projectId, req.user.userId);
  }

  @Patch("hizmet/:userId")
  hizmetAnlasmasi(
    @Param("projectId") projectId: string,
    @Param("userId") memberUserId: string,
    @Body("agreedFee") agreedFee: number,
    @Req() req: any
  ) {
    return this.hizmet.anlasmaBelirle(projectId, memberUserId, agreedFee, req.user.userId);
  }

  @Post("hizmet/:userId/odeme")
  hizmetOdemesi(
    @Param("projectId") projectId: string,
    @Param("userId") memberUserId: string,
    @Body() body: { amount?: number; occurredAt?: string; description?: string },
    @Req() req: any
  ) {
    return this.hizmet.odemeEkle(projectId, memberUserId, body, req.user.userId);
  }

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
