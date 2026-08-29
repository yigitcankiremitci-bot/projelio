import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UploadRateLimitGuard } from "../../common/guards/upload-rate-limit.guard";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { AiAssistantService } from "./ai-assistant.service";
import { AiCreditsService } from "./ai-credits.service";
import { AiCreditOrdersService } from "./ai-credit-orders.service";
import { AiPaymentProvider } from "./ai-payment.provider";
import { AiConversationsService } from "./ai-conversations.service";
import { toActiveFileInfo } from "./ai-assistant.service";
import { AiSpeechService } from "./ai-speech.service";
import { calculateSpeechCost } from "./ai-credits.config";
import {
  AiAttachmentsService,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_UPLOAD_BYTES,
} from "./ai-attachments.service";
import { DEFAULT_TTS_VOICE, MAX_SPEECH_CHARS, TTS_VOICES } from "./ai-speech.service";
import {
  COMMISSION_RATE,
  CREDIT_CONFIRM_THRESHOLD,
  CREDIT_UNIT_USD,
  DEFAULT_TIER,
  MIN_BALANCE_TO_START,
  MODEL_TIERS,
} from "./ai-credits.config";

@Controller("ai")
@UseGuards(AuthGuard("jwt"))
export class AiAssistantController {
  constructor(
    private aiAssistantService: AiAssistantService,
    private creditsService: AiCreditsService,
    private conversationsService: AiConversationsService,
    private attachmentsService: AiAttachmentsService,
    private speechService: AiSpeechService,
    private creditOrders: AiCreditOrdersService,
    private payment: AiPaymentProvider
  ) {}

  // --- Sohbet ------------------------------------------------------------

  // Kullanıcının mesajını işler. conversationId verilmezse yeni sohbet açılır.
  // Kritik bir işlem tetiklenirse çalıştırmadan önce { type: "confirmation", ... } döner.
  @Post("chat")
  chat(
    @Req() req: any,
    @Body()
    body: { message: string; conversationId?: string; tier?: string; attachmentIds?: string[] }
  ) {
    return this.aiAssistantService.chat(
      req.user.userId,
      req.user.role,
      body.message,
      body.conversationId,
      body.tier,
      body.attachmentIds
    );
  }

  // Kritik bir işlemi kullanıcı onayından sonra (ya da vazgeçildiğinde) sonuçlandırır.
  @Post("confirm")
  confirm(@Req() req: any, @Body() body: { actionId: string; confirmed: boolean }) {
    return this.aiAssistantService.confirmAction(body.actionId, req.user.userId, !!body.confirmed);
  }

  // Uzayan bir isteği (kredi eşiği ya da adım sınırı nedeniyle duraklatılmış)
  // sürdürür veya durdurur. `tier` verilirse koşu o modelle devam eder.
  @Post("continue")
  continueRun(
    @Req() req: any,
    @Body() body: { runId: string; confirmed: boolean; tier?: string; approveAll?: boolean }
  ) {
    return this.aiAssistantService.continueRun(
      body.runId,
      req.user.userId,
      !!body.confirmed,
      body.tier,
      !!body.approveAll
    );
  }

  // Kullanıcının seçebileceği model kademeleri (arayüzdeki model seçici bunu okur).
  @Get("models")
  models() {
    return {
      defaultTier: DEFAULT_TIER,
      tiers: Object.values(MODEL_TIERS),
      maxAttachments: MAX_ATTACHMENTS_PER_MESSAGE,
    };
  }

  // --- Dosya ekleri -------------------------------------------------------
  // Ekler sohbetten AYRI hazırlanır: dosya bir kez okunur (ses çözümleme gibi
  // ücretli işler bir kez yapılır), arayüz sonucu hemen gösterir, kullanıcı
  // mesajını yazıp gönderirken yalnızca ek kimliklerini iletir.

  @Post("attachments")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_UPLOAD_BYTES, files: 1 },
    })
  )
  uploadAttachment(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { conversationId?: string }
  ) {
    return this.attachmentsService.prepareFromUpload(req.user.userId, file, body?.conversationId);
  }

  // Sesli komut: kayıt yazıya çevrilir ve metin döner. Ek olarak İLİŞTİRİLMEZ —
  // kullanıcı metni görüp düzeltebilsin diye yazı kutusuna konur.
  @Post("transcribe")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_UPLOAD_BYTES, files: 1 },
    })
  )
  transcribe(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { conversationId?: string }
  ) {
    return this.attachmentsService.transcribeCommand(req.user.userId, file, body?.conversationId);
  }

  /**
   * Metni doğal sese çevirir (isteğe bağlı, ücretli).
   *
   * Tarayıcının ücretsiz sentezine ALTERNATİF: kullanıcı arayüzden seçtiyse
   * buraya gelinir. Bedel karakterle orantılı ve önden kesin biliniyor, o yüzden
   * bakiye kontrolü tahminle değil gerçek tutarla yapılır.
   */
  @Post("speak")
  async speak(
    @Req() req: any,
    @Body() body: { text: string; conversationId?: string; voice?: string }
  ) {
    const text = (body?.text ?? "").trim();
    if (!text) throw new BadRequestException("Seslendirilecek metin boş.");

    const chars = Math.min(text.length, MAX_SPEECH_CHARS);
    const balance = await this.creditsService.assertCanStart(req.user.userId);
    this.creditsService.assertBalanceCovers(balance, calculateSpeechCost(chars).credits);

    const result = await this.speechService.synthesize(text, body?.voice);
    const { credits, balanceAfter } = await this.creditsService.chargeSpeech({
      userId: req.user.userId,
      chars: result.chars,
      conversationId: body?.conversationId,
    });

    return { ...result, creditsCharged: credits, balance: balanceAfter };
  }

  // Doğal ses seçenekleri (arayüzdeki ses seçici bunu okur).
  @Get("voices")
  voices() {
    return { defaultVoice: DEFAULT_TTS_VOICE, voices: TTS_VOICES };
  }

  // Projelio'da zaten kayıtlı bir dosyayı okur (yetki kontrolü FilesService'te).
  @Post("attachments/from-file")
  attachProjelioFile(@Req() req: any, @Body() body: { fileId: string; conversationId?: string }) {
    return this.attachmentsService.prepareFromProjelioFile(req.user.userId, body?.fileId, body?.conversationId);
  }

  // Kullanıcının Drive/OneDrive'ındaki, Projelio'ya aktarılmamış bir dosyayı okur.
  @Post("attachments/from-cloud")
  attachCloudFile(@Req() req: any, @Body() body: { sourceFileId: string; conversationId?: string }) {
    return this.attachmentsService.prepareFromCloud(req.user.userId, body?.sourceFileId, body?.conversationId);
  }

  // OneDrive gezinmesi. Google'da bunun yerine tarayıcıdaki resmi Picker açılır.
  @Get("attachments/browse")
  browseCloud(@Req() req: any, @Query("folderId") folderId?: string) {
    return this.attachmentsService.browseCloud(req.user.userId, folderId);
  }

  // Arayüz hangi seçiciyi açacağını buradan öğrenir.
  @Get("attachments/source")
  attachmentSource(@Req() req: any) {
    return this.attachmentsService.connectedProvider(req.user.userId);
  }

  // Sohbete sabitlenmiş dosyalar: iş bitene kadar her turda modele gönderiliyorlar,
  // dolayısıyla her tur ücretlendiriliyorlar. Kullanıcı hangilerinin açık olduğunu
  // görebilmeli ve istediğinde kaldırabilmeli.
  @Get("conversations/:id/files")
  async activeFiles(@Req() req: any, @Param("id") id: string) {
    await this.conversationsService.assertOwner(id, req.user.userId);
    return { files: toActiveFileInfo(await this.conversationsService.getActiveFiles(id)) };
  }

  @Delete("conversations/:id/files")
  async clearActiveFiles(@Req() req: any, @Param("id") id: string) {
    await this.conversationsService.assertOwner(id, req.user.userId);
    const files = await this.conversationsService.getActiveFiles(id);
    this.attachmentsService.releaseMany(req.user.userId, files.map((f) => f.id));
    await this.conversationsService.setActiveFiles(id, []);
    return { files: [] };
  }

  @Delete("attachments/:id")
  removeAttachment(@Req() req: any, @Param("id") id: string) {
    this.attachmentsService.discard(req.user.userId, id);
    return { ok: true };
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
    return {
      ...balance,
      minBalanceToStart: MIN_BALANCE_TO_START,
      confirmThreshold: CREDIT_CONFIRM_THRESHOLD,
    };
  }

  @Get("credits/transactions")
  transactions(@Req() req: any, @Query("limit") limit?: string) {
    return this.creditsService.listTransactions(req.user.userId, Number(limit) || 50);
  }

  // --- Kredi yükleme (self-servis) ----------------------------------------

  // Satılan paketler. Fiyat sunucuda hesaplanır (bkz. ai-credits.config
  // CREDIT_PACKAGES); istemci fiyat göndermez, yalnızca paket anahtarı seçer.
  @Get("credit-packages")
  creditPackages() {
    return {
      packages: this.creditOrders.listPackages(),
      // Arayüz, ödeme otomatik alınamıyorsa havale yönergesi gösterir.
      paymentConfigured: this.payment.isConfigured(),
    };
  }

  @Get("credit-orders")
  myCreditOrders(@Req() req: any) {
    return this.creditOrders.listMine(req.user.userId);
  }

  /**
   * Sipariş açar. DİKKAT: bu uç krediyi YÜKLEMEZ, yalnızca ödeme bekleyen bir
   * kayıt oluşturur. Kredi ancak ödeme doğrulandıktan sonra yüklenir.
   */
  @Post("credit-orders")
  async createCreditOrder(@Req() req: any, @Body() body: { packageKey: string }) {
    const order = await this.creditOrders.create(req.user.userId, body?.packageKey);
    // Ödeme sağlayıcısı bağlıysa kullanıcı oraya yönlendirilir; değilse null döner
    // ve arayüz elle ödeme yönergesini gösterir (bkz. AiPaymentProvider).
    const checkout = await this.payment.createCheckout(order);
    return { order, checkoutUrl: checkout?.redirectUrl ?? null };
  }

  @Post("credit-orders/:id/cancel")
  cancelCreditOrder(@Req() req: any, @Param("id") id: string) {
    return this.creditOrders.cancel(req.user.userId, id);
  }

  // --- Yönetim ------------------------------------------------------------

  // Kredi siparişleri (yönetici). Ödeme bekleyenleri süzmek için ?status= verilir.
  @Get("admin/credit-orders")
  adminCreditOrders(@Req() req: any, @Query("status") status?: string) {
    this.assertAdmin(req);
    return this.creditOrders.listAll(status as any);
  }

  /**
   * Yönetici ödemeyi doğrular ve kredi yüklenir.
   *
   * Ödeme sağlayıcısı bağlanana kadar krediyi yüklemenin self-servis akıştaki tek
   * yolu budur — sipariş açmak tek başına kredi kazandırmaz. Entegrasyon geldiğinde
   * sağlayıcının webhook'u da aynı servis metodunu çağıracak.
   */
  @Post("admin/credit-orders/:id/mark-paid")
  markCreditOrderPaid(@Req() req: any, @Param("id") id: string, @Body() body: { reference?: string; note?: string }) {
    this.assertAdmin(req);
    return this.creditOrders.markPaid(id, req.user.userId, { reference: body?.reference, note: body?.note });
  }

  // "Ödendi ama kredi yüklenemedi" durumunda yeniden dener (bkz. retryCredit).
  @Post("admin/credit-orders/:id/retry-credit")
  retryCreditOrder(@Req() req: any, @Param("id") id: string) {
    this.assertAdmin(req);
    return this.creditOrders.retryCredit(id, req.user.userId);
  }

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

  // Admin, Anthropic Console'daki Cost sayfasından okuduğu gerçek ömür boyu maliyeti
  // buraya bir referans noktası olarak kaydeder (bkz. AiCreditsService.recordCostCheckpoint).
  @Post("admin/provider-balance/checkpoint")
  async providerBalanceCheckpoint(@Req() req: any, @Body() body: { amountUsd: number; description?: string }) {
    this.assertAdmin(req);
    await this.creditsService.recordCostCheckpoint(Number(body.amountUsd), body.description, req.user.userId);
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
      confirmThreshold: CREDIT_CONFIRM_THRESHOLD,
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
