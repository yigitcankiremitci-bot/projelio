import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BudgetService } from "./budget.service";
import { ButceKademeService } from "./butce-kademe.service";

// Anasayfadaki bütçe sekmesi: kullanıcının kendi defteri (tüm projelerinin bütçeleri
// + projeye bağlı olmayan genel gelir/giderler).
@Controller("budget")
@UseGuards(AuthGuard("jwt"))
export class BudgetOverviewController {
  constructor(
    private budgetService: BudgetService,
    private kademe: ButceKademeService
  ) {}

  @Get("overview")
  overview(@Req() req: any) {
    return this.budgetService.getOverview(req.user.userId);
  }

  @Get("transactions")
  transactions(@Req() req: any) {
    return this.budgetService.findAllForUser(req.user.userId);
  }

  // Şirketlerin açık alacak/borçları — vade takibi için. Gerçekleşen para
  // olmadığı için hareketlerle aynı listede değil, ayrı uçta (bkz. service).
  @Get("receivables")
  receivables(@Req() req: any) {
    return this.budgetService.findOpenReceivablesForUser(req.user.userId);
  }

  @Post("transactions")
  create(@Req() req: any, @Body() body: any) {
    return this.budgetService.createForUser(req.user.userId, body);
  }

  // Düzenleme ve silme kaydın hangi deftere ait olduğuna bakmaz: yetki kuralı
  // servis tarafında kaydın bağlamından (proje / departman / kişisel) türetilir.
  // Böylece proje bütçe paneli de departman paneli de aynı ucu kullanabiliyor.
  @Patch("transactions/:id")
  update(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.budgetService.updateTransaction(id, body, req.user.userId);
  }

  /**
   * Deftere girilmiş tek seferlik bir kaydı düzenli gelir/gidere çevirir.
   *
   * Kaydın KENDİSİ durur: o para gerçekten çıktı. Yeni düzenli ödeme bir
   * sonraki vadeden başlar, yoksa aynı ay iki kez işlenirdi.
   *
   * Kademe ucunda (/budget/scope/...) değil burada: işlem kaydın kendisine
   * ait ve kaydın hangi kademede olduğu zaten satırında yazılı.
   */
  @Post("transactions/:id/recurring")
  duzenliyeCevir(
    @Param("id") id: string,
    @Body() body: { interval?: string; reminderDaysBefore?: number },
    @Req() req: any
  ) {
    return this.kademe.duzenliyeCevir(id, body, req.user.userId);
  }

  @Delete("transactions/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.budgetService.removeTransaction(id, req.user.userId);
  }
}
