import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { GorevButceService } from "./gorev-butce.service";

/**
 * Görev bütçesi onay akışının uçları.
 *
 * tasks modülünde DEĞİL, burada: akış tamamen bütçeye ait (talep → onay →
 * deftere işleme) ve tasks.service zaten 1250 satır. Eski
 * `PATCH /tasks/:id/budget-status` ucu duruyor ama artık yalnızca durum
 * etiketini değiştiriyor; onay kararı buradan geçiyor.
 */
@Controller("budget/tasks")
@UseGuards(AuthGuard("jwt"))
export class GorevButceController {
  constructor(private gorevButce: GorevButceService) {}

  /**
   * Bir proje ya da departmanın görev bütçesi talepleri.
   *
   * `?scope=project&id=...` biçiminde: iki ayrı uç yazmak yerine tek uç,
   * çünkü iki tarafın da döndürdüğü şey aynı liste.
   */
  @Get()
  talepler(@Query("scope") scope: string, @Query("id") id: string) {
    return this.gorevButce.talepler(scope === "department" ? "department" : "project", id);
  }

  /** "Bu görev için para gerekiyor" — talebi işi yapan kişi açar. */
  @Post(":taskId/request")
  talepEt(
    @Param("taskId") taskId: string,
    @Body() body: { amount: number; currency?: string; note?: string },
    @Req() req: any
  ) {
    return this.gorevButce.talepEt(taskId, body, req.user.userId);
  }

  /** Yöneticinin kararı. Reddedilen talep silinmez, gerekçesiyle durur. */
  @Post(":taskId/decision")
  karar(@Param("taskId") taskId: string, @Body() body: { approve: boolean; note?: string }, @Req() req: any) {
    return this.gorevButce.karar(taskId, !!body.approve, body.note, req.user.userId);
  }

  /** Onaylanmış bütçeyi öder ve deftere gerçek gider satırını düşer. */
  @Post(":taskId/pay")
  ode(@Param("taskId") taskId: string, @Req() req: any) {
    return this.gorevButce.odendiIsaretle(taskId, req.user.userId);
  }

  /** Yanlışlıkla "ödendi" denmişse geri alır; defterdeki satır da silinir. */
  @Post(":taskId/unpay")
  geriAl(@Param("taskId") taskId: string, @Req() req: any) {
    return this.gorevButce.odemeyiGeriAl(taskId, req.user.userId);
  }
}
