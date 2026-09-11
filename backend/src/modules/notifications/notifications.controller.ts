import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { NotificationEmailPrefs, PushSubscriptionPayload } from "@projelio/shared";
import { NotificationsService } from "./notifications.service";
import { NotificationEmailPrefsService } from "./notification-email-prefs.service";
import { NotificationEmailProcessor } from "./notification-email.processor";

interface AuthedRequest {
  user: { userId: string; email: string; role: string };
}

@Controller("notifications")
@UseGuards(AuthGuard("jwt"))
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private emailPrefs: NotificationEmailPrefsService,
    private emailProcessor: NotificationEmailProcessor
  ) {}

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

  // ──────────────────────────────────────────── Bildirim e-postaları (102)

  @Get("email-prefs")
  getEmailPrefs(@Req() req: AuthedRequest) {
    return this.emailPrefs.findForUser(req.user.userId);
  }

  /**
   * Kısmi gövde kabul edilir: gönderilmeyen alan "sıfırla" değil "olduğu gibi
   * kalsın" demektir (bkz. save). Güncellenmemiş bir istemci yeni bir alanı
   * göndermediğinde kullanıcının ayarını silmemeli.
   */
  @Patch("email-prefs")
  saveEmailPrefs(@Body() body: Partial<NotificationEmailPrefs>, @Req() req: AuthedRequest) {
    return this.emailPrefs.save(req.user.userId, body);
  }

  /**
   * "Deneme e-postası gönder". Kullanıcının kurulumunun gerçekten çalıştığını
   * saniyeler içinde göstermenin tek yolu; bkz. denemeGonder'deki gerekçe.
   */
  @Post("email-prefs/test")
  testEmail(@Req() req: AuthedRequest) {
    return this.emailProcessor.denemeGonder(req.user.userId);
  }
}
