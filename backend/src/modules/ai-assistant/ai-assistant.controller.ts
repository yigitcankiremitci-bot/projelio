import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AiAssistantService } from "./ai-assistant.service";
import { AiCreditsService } from "./ai-credits.service";
import { AiConversationsService } from "./ai-conversations.service";
import { COMMISSION_RATE, CREDIT_UNIT_USD, MIN_BALANCE_TO_START } from "./ai-credits.config";

@Controller("ai")
@UseGuards(AuthGuard("jwt"))
export class AiAssistantController {
  constructor(
    private aiAssistantService: AiAssistantService,
    private creditsService: AiCreditsService,
    private conversationsService: AiConversationsService
  ) {}

  // --- Sohbet ------------------------------------------------------------

  // Kullanıcının mesajını işler. conversationId verilmezse yeni sohbet açılır.
  // Kritik bir işlem tetiklenirse çalıştırmadan önce { type: "confirmation", ... } döner.
  @Post("chat")
  chat(@Req() req: any, @Body() body: { message: string; conversationId?: string }) {
    return this.aiAssistantService.chat(req.user.userId, req.user.role, body.message, body.conversationId);
  }

  // Kritik bir işlemi kullanıcı onayından sonra (ya da vazgeçildiğinde) sonuçlandırır.
  @Post("confirm")
  confirm(@Req() req: any, @Body() body: { actionId: string; confirmed: boolean }) {
    return this.aiAssistantService.confirmAction(body.actionId, req.user.userId, !!body.confirmed);
  }

  // --- Sohbet geçmişi ----------------------------------------------------

  @Get("conversations")
  listConversations(@Req() req: any) {
    return this.conversationsService.list(req.user.userId);
  }

  @Post("conversations")
  createConversation(@Req() req: any, @Body() body: { title?: string }) {
    return this.conversationsService.create(req.user.userId, body?.title);
  }

  @Get("conversations/:id/messages")
  getMessages(@Req() req: any, @Param("id") id: string) {
    return this.conversationsService.getMessages(id, req.user.userId);
  }

  @Patch("conversations/:id")
  renameConversation(@Req() req: any, @Param("id") id: string, @Body("title") title: string) {
    return this.conversationsService.rename(id, req.user.userId, title);
  }

  @Delete("conversations/:id")
  deleteConversation(@Req() req: any, @Param("id") id: string) {
    return this.conversationsService.remove(id, req.user.userId);
  }

  // --- Krediler -----------------------------------------------------------

  @Get("credits")
  async credits(@Req() req: any) {
    const balance = await this.creditsService.getBalance(req.user.userId);
    return { ...balance, minBalanceToStart: MIN_BALANCE_TO_START };
  }

  @Get("credits/transactions")
  transactions(@Req() req: any, @Query("limit") limit?: string) {
    return this.creditsService.listTransactions(req.user.userId, Number(limit) || 50);
  }

  // --- Yönetim ------------------------------------------------------------

  // Tüm kullanıcıların AI kredi bakiyesini tek listede döner (admin paneli için).
  @Get("admin/users-credits")
  usersCredits(@Req() req: any) {
    this.assertAdmin(req);
    return this.creditsService.listAllBalances();
  }

  // Admin bir kullanıcıya kredi yükler. (Ödeme sağlayıcısı entegre edilene kadar
  // bakiye yüklemenin tek yolu budur.)
  @Post("admin/credits/topup")
  topUp(
    @Req() req: any,
    @Body() body: { userId: string; credits: number; description?: string }
  ) {
    this.assertAdmin(req);
    return this.creditsService.grant(
      body.userId,
      Number(body.credits),
      "topup",
      body.description ?? "Yönetici tarafından yüklendi",
      req.user.userId
    );
  }

  // Projelio'nun Anthropic hesabında tahmini kalan bakiye (bkz. AiCreditsService.getProviderBalanceStatus).
  @Get("admin/provider-balance")
  providerBalance(@Req() req: any) {
    this.assertAdmin(req);
    return this.creditsService.getProviderBalanceStatus();
  }

  // Admin, Anthropic konsolunda hesaba gerçek para yükledikten sonra bunu burada kaydeder.
  @Post("admin/provider-balance/topup")
  async providerBalanceTopUp(@Req() req: any, @Body() body: { amountUsd: number; description?: string }) {
    this.assertAdmin(req);
    await this.creditsService.topUpProviderBalance(Number(body.amountUsd), body.description, req.user.userId);
    return this.creditsService.getProviderBalanceStatus();
  }

  // Projelio'nun marj raporu: ham Anthropic maliyeti, kullanıcıdan alınan bedel ve kâr.
  @Get("admin/margin")
  margin(@Req() req: any, @Query("days") days?: string) {
    this.assertAdmin(req);
    return this.creditsService.getMarginReport(Number(days) || 30);
  }

  @Get("admin/pricing")
  pricing(@Req() req: any) {
    this.assertAdmin(req);
    return {
      commissionRate: COMMISSION_RATE,
      creditUnitUsd: CREDIT_UNIT_USD,
      minBalanceToStart: MIN_BALANCE_TO_START,
      creditsPerUsd: Math.round(1 / CREDIT_UNIT_USD),
    };
  }

  // Teşhis: anahtar tanımlı mı, hangi model kullanılıyor, Anthropic API'ye erişilebiliyor mu?
  @Get("health")
  health(@Req() req: any) {
    this.assertAdmin(req);
    return this.aiAssistantService.health();
  }

  private assertAdmin(req: any): void {
    if (req.user?.role !== "admin") throw new ForbiddenException("Bu işlem için yönetici yetkisi gerekiyor.");
  }
}
