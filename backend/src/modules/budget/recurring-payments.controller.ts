import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RecurringPaymentsService, toDateString } from "./recurring-payments.service";

@Controller("budget/recurring")
@UseGuards(AuthGuard("jwt"))
export class RecurringPaymentsController {
  constructor(private recurringPaymentsService: RecurringPaymentsService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.recurringPaymentsService.findAllForUser(req.user.userId);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.recurringPaymentsService.create(req.user.userId, body);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.recurringPaymentsService.update(id, req.user.userId, body);
  }

  // Elle "Ödendi": vadesi gelmiş ödeme, ertesi sabahki cron'u beklemeden
  // deftere işlenir. Bugünün tarihi sunucudan alınıyor — istemciden gelen bir
  // tarih, geçmişe kayıt atmanın kapısını açardı.
  @Post(":id/ode")
  markPaid(@Param("id") id: string, @Req() req: any) {
    return this.recurringPaymentsService.odendiIsaretle(id, req.user.userId, toDateString(new Date()));
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.recurringPaymentsService.remove(id, req.user.userId);
  }
}
