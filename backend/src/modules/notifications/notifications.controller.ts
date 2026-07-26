import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { PushSubscriptionPayload } from "@projelio/shared";
import { NotificationsService } from "./notifications.service";

interface AuthedRequest {
  user: { userId: string; email: string; role: string };
}

@Controller("notifications")
@UseGuards(AuthGuard("jwt"))
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findMine(@Req() req: AuthedRequest) {
    return this.notificationsService.findForUser(req.user.userId);
  }

  @Get("vapid-public-key")
  getVapidPublicKey() {
    return { publicKey: this.notificationsService.getVapidPublicKey() };
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @Req() req: AuthedRequest) {
    return this.notificationsService.markRead(id, req.user.userId);
  }

  @Patch("read-all")
  markAllRead(@Req() req: AuthedRequest) {
    return this.notificationsService.markAllRead(req.user.userId);
  }

  @Post("subscribe")
  subscribe(@Body() body: PushSubscriptionPayload, @Req() req: AuthedRequest) {
    return this.notificationsService.saveSubscription(req.user.userId, body);
  }

  @Post("unsubscribe")
  unsubscribe(@Body("endpoint") endpoint: string) {
    return this.notificationsService.removeSubscription(endpoint);
  }
}
