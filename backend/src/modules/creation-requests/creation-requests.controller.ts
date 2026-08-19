import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { CreationRequestInput } from "@projelio/shared";
import { CreationRequestsService } from "./creation-requests.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class CreationRequestsController {
  constructor(private service: CreationRequestsService) {}

  /** Taşeronun kendi talepleri (bekleyen + geçmiş). */
  @Get("me/creation-requests")
  findMine(@Req() req: any) {
    return this.service.findMine(req.user.userId);
  }

  /**
   * Karar vermem beklenen bekleyen talepler — bildirim çanı bunu okur
   * (bkz. /me/job-invites ile aynı desen).
   */
  @Get("me/pending-approvals")
  findPending(@Req() req: any) {
    return this.service.findPendingForApprover(req.user.userId);
  }

  // Normalde istemci bu ucu doğrudan çağırmaz: POST /jobs ve POST /projects
  // taşeron için otomatik olarak talebe dönüşür (bkz. JobsController.create).
  // Uç yine de açık — "onaya gönder" akışını ayrıca tetiklemek gerekebilir.
  @Post("creation-requests")
  create(@Req() req: any, @Body() body: CreationRequestInput) {
    return this.service.create(req.user.userId, body);
  }

  @Patch("creation-requests/:id/respond")
  respond(
    @Param("id") id: string,
    @Body() body: { approve?: boolean; note?: string },
    @Req() req: any
  ) {
    return this.service.respond(id, body.approve === true, req.user.userId, body.note);
  }

  /** Talep sahibi bekleyen talebini geri çeker. */
  @Delete("creation-requests/:id")
  cancel(@Param("id") id: string, @Req() req: any) {
    return this.service.cancel(id, req.user.userId);
  }
}
