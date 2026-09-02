import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { WhatsappService } from "./whatsapp.service";

/**
 * WhatsApp köprüsünün JWT'li uçları. Webhook ayrı controller'da
 * (whatsapp-webhook.controller.ts): güvenlik modeli tamamen farklı.
 *
 * Yetki servis katmanında: organizasyon sahibi bağlantıyı yönetir
 * (whatsapp-access.ts), organizasyonu görebilen herkes kendi bildirim
 * ayarını yapar.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class WhatsappController {
  constructor(private whatsapp: WhatsappService) {}

  // ============================================================ Ayarlar ekranı (her kullanıcı)

  /** Sunucuda yapılandırılmış mı + organizasyon başına bağlantı ve kendi durumum. */
  @Get("whatsapp/me")
  overview(@Req() req: any) {
    return this.whatsapp.overviewForUser(req.user.userId);
  }

  @Post("whatsapp/me/link-code")
  linkCode(@Body() body: { organizationId: string }, @Req() req: any) {
    return this.whatsapp.createLinkCode(body.organizationId, req.user.userId);
  }

  @Post("whatsapp/me/opt-out")
  optOut(@Body() body: { organizationId: string }, @Req() req: any) {
    return this.whatsapp.optOutMe(body.organizationId, req.user.userId);
  }

  // ============================================================ Bağlantı (organizasyon sahibi)

  @Post("organizations/:organizationId/whatsapp/connection/start")
  start(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.whatsapp.startConnection(organizationId, req.user.userId);
  }

  /** QR, data-URL olarak JSON içinde (img etiketi yetki başlığı taşıyamaz). */
  @Get("organizations/:organizationId/whatsapp/connection/qr")
  qr(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.whatsapp.getQr(organizationId, req.user.userId);
  }

  @Post("organizations/:organizationId/whatsapp/connection/pairing-code")
  pairingCode(@Param("organizationId") organizationId: string, @Body() body: { phone: string }, @Req() req: any) {
    return this.whatsapp.requestPairingCode(organizationId, req.user.userId, body.phone ?? "");
  }

  @Post("organizations/:organizationId/whatsapp/connection/logout")
  logout(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.whatsapp.logout(organizationId, req.user.userId);
  }

  // ============================================================ Kişiler ve konuşmalar (organizasyon sahibi)

  @Get("organizations/:organizationId/whatsapp/contacts")
  contacts(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.whatsapp.listContacts(organizationId, req.user.userId);
  }

  @Get("whatsapp/threads/:threadId/messages")
  messages(@Param("threadId") threadId: string, @Query("limit") limit: string | undefined, @Req() req: any) {
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.whatsapp.listThreadMessages(threadId, req.user.userId, n);
  }

  @Post("whatsapp/threads/:threadId/messages")
  send(@Param("threadId") threadId: string, @Body() body: { body: string }, @Req() req: any) {
    return this.whatsapp.queueThreadMessage(threadId, req.user.userId, body.body ?? "");
  }
}
