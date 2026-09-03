import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { WhatsappService } from "./whatsapp.service";

/**
 * WhatsApp köprüsünün kullanıcı uçları. Numara yönetimi ayrı controller'da
 * (whatsapp-admin.controller.ts, yalnız role=admin); webhook ayrı
 * (whatsapp-webhook.controller.ts, HMAC).
 */
@Controller("whatsapp")
@UseGuards(AuthGuard("jwt"))
export class WhatsappController {
  constructor(private whatsapp: WhatsappService) {}

  // ============================================================ Ayarlar ekranı

  /** Sunucuda yapılandırılmış mı, havuz hazır mı, bana atanmış numara ve kendi durumum. */
  @Get("me")
  overview(@Req() req: any) {
    return this.whatsapp.overviewForUser(req.user.userId);
  }

  /** Eşleştirme kodu; gerekiyorsa önce havuzdan numara atanır. */
  @Post("me/link-code")
  linkCode(@Req() req: any) {
    return this.whatsapp.createLinkCode(req.user.userId);
  }

  @Post("me/opt-out")
  optOut(@Req() req: any) {
    return this.whatsapp.optOutMe(req.user.userId);
  }

  /** Numarayı hesaptan ayırır (cihaz/numara değişti); yeniden bağlanmak kod ister. */
  @Post("me/unlink")
  unlink(@Req() req: any) {
    return this.whatsapp.unlinkMe(req.user.userId);
  }

  // ============================================================ Müşteri konuşmaları

  @Get("threads")
  myThreads(@Query("limit") limit: string | undefined, @Req() req: any) {
    return this.whatsapp.listMyCustomerThreads(req.user.userId, clampLimit(limit));
  }

  /** Müşteriyle konuşma açar (varsa döner). Gövde: { phone } veya { partyId }, isteğe bağlı displayName. */
  @Post("threads")
  async openThread(@Body() body: { phone?: string; partyId?: string; displayName?: string }, @Req() req: any) {
    const { thread } = await this.whatsapp.openCustomerThread(req.user.userId, body, body.displayName);
    return { id: thread.id };
  }

  @Get("threads/:threadId/messages")
  messages(@Param("threadId") threadId: string, @Query("limit") limit: string | undefined, @Req() req: any) {
    return this.whatsapp.listThreadMessages(threadId, req.user.userId, clampLimit(limit));
  }

  @Post("threads/:threadId/messages")
  send(@Param("threadId") threadId: string, @Body() body: { body: string }, @Req() req: any) {
    return this.whatsapp.queueThreadMessage(threadId, req.user.userId, body.body ?? "", "user");
  }

  /** Lio bu konuşmadaki müşteri mesajlarını kendi yanıtlasın mı. */
  @Patch("threads/:threadId/auto-reply")
  autoReply(@Param("threadId") threadId: string, @Body() body: { enabled: boolean }, @Req() req: any) {
    return this.whatsapp.setAutoReply(threadId, req.user.userId, Boolean(body.enabled));
  }
}

function clampLimit(raw: string | undefined): number {
  return Math.min(Math.max(Number(raw) || 50, 1), 200);
}
