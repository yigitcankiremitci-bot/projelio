import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { MicrosoftAccountsService } from "../microsoft/microsoft-accounts.service";
import { UsersService } from "../users/users.service";
import { MAIL_CONNECT_SCOPES, MicrosoftOAuthService } from "../microsoft/microsoft-oauth.service";
import { GraphMailService } from "./graph-mail.service";
import { MailboxService, type MailScope } from "./mailbox.service";

/**
 * E-posta modülünün gelen kutusu uçları.
 *
 * Sınıf düzeyinde guard YOK: Microsoft'un geri dönüş adresi (callback) oturum
 * başlığı olmadan geliyor. Diğer bütün uçlar tek tek JWT arkasında; callback'in
 * güvenliği imzalı `state` ile sağlanıyor.
 */
@Controller()
export class MailboxController {
  private readonly logger = new Logger(MailboxController.name);

  constructor(
    private mailbox: MailboxService,
    private oauth: MicrosoftOAuthService,
    private msAccounts: MicrosoftAccountsService,
    private graph: GraphMailService,
    // Yalnızca hata mesajında "hangi Projelio hesabına bağlı" diyebilmek için.
    private users: UsersService
  ) {}

  // ============================================================ Durum ve bağlama

  /** Entegrasyon bu kurulumda yapılandırılmış mı (ortam değişkenleri). */
  @Get("mail/status")
  @UseGuards(AuthGuard("jwt"))
  status() {
    return { configured: this.oauth.isDriveConfigured() };
  }

  @Get("organizations/:organizationId/mail/accounts")
  @UseGuards(AuthGuard("jwt"))
  listOrgAccounts(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Req() req: any
  ) {
    return this.mailbox.listAccounts({ organizationId, departmentId }, req.user.userId);
  }

  @Get("jobs/:jobId/mail/accounts")
  @UseGuards(AuthGuard("jwt"))
  listJobAccounts(@Param("jobId") jobId: string, @Req() req: any) {
    return this.mailbox.listAccounts({ jobId }, req.user.userId);
  }

  @Get("organizations/:organizationId/mail/connect-url")
  @UseGuards(AuthGuard("jwt"))
  connectOrg(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Query("shared") sharedMailbox: string | undefined,
    @Query("next") next: string | undefined,
    @Req() req: any
  ) {
    return this.buildConnectUrl({ organizationId, departmentId }, req.user.userId, next, sharedMailbox);
  }

  @Get("jobs/:jobId/mail/connect-url")
  @UseGuards(AuthGuard("jwt"))
  connectJob(
    @Param("jobId") jobId: string,
    @Query("shared") sharedMailbox: string | undefined,
    @Query("next") next: string | undefined,
    @Req() req: any
  ) {
    return this.buildConnectUrl({ jobId }, req.user.userId, next, sharedMailbox);
  }

  /**
   * Microsoft'un posta akışı için geri dönüş adresi.
   *
   * Depolama akışından ayrı bir adres kullanılıyor (bkz.
   * MicrosoftOAuthService.mailRedirectUri); ikisi tek adreste birleşseydi
   * modüller birbirini içe aktarmak zorunda kalırdı.
   */
  @Get("mail/microsoft/callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Query("error_description") errorDescription: string,
    @Res() res: Response
  ) {
    if (error) return res.redirect(this.returnUrl(state, { error: errorDescription || error }));
    if (!code || !state) {
      return res.redirect(this.returnUrl(state, { error: "Microsoft'tan beklenen yanıt gelmedi." }));
    }

    try {
      const parsed = this.oauth.verifyState(state);
      const scope = this.scopeFromState(parsed);

      const tokens = await this.oauth.exchangeCode(code, MAIL_CONNECT_SCOPES, this.oauth.mailRedirectUri);
      if (!tokens.id_token) throw new Error("id_token gelmedi");
      const identity = this.oauth.decodeIdentity(tokens.id_token);

      // Bir Microsoft hesabı yalnızca bir Projelio kullanıcısına bağlanabilir;
      // depolama akışındaki kuralın aynısı (bkz. MicrosoftController). Aksi
      // halde iki Projelio kullanıcısı aynı jetonu paylaşır ve biri diğerinin
      // postasını okuyabilir.
      //
      // Mesaj hangi hesaba bağlı olduğunu SÖYLER: bu noktaya gelebilmek için
      // kullanıcının o Microsoft hesabında zaten oturum açmış olması gerekiyor,
      // yani karşısındaki bilgi kendi bilgisi. Söylemediğimizde kullanıcı
      // "hangi hesap?" diye veritabanına bakmak zorunda kalıyordu.
      const ownedBySomeoneElse = await this.msAccounts.findByMsSub(identity.sub);
      if (ownedBySomeoneElse && ownedBySomeoneElse.userId !== parsed.userId) {
        // ÖLÜ KAYIT İSTİSNASI: bağlantı kesildiğinde satır SİLİNMEZ, yalnızca
        // jetonu boşaltılır (dosya kayıtları ona `on delete restrict` ile bağlı,
        // bkz. 034_microsoft_onedrive_storage.sql). Bu istisna olmasaydı eski
        // sahip bağlantıyı kaldırdıktan sonra o Microsoft hesabı Projelio'da
        // sonsuza kadar kilitli kalırdı — kimse bağlayamaz, satır da silinemez.
        //
        // Devralma güvenli: aynı `ms_sub`, yani aynı Microsoft hesabı. Yeni
        // sahip kendi jetonuyla bağlanıyor, eski sahibin erişimi zaten yok.
        const stillConnected = ownedBySomeoneElse.hasRefreshToken && !ownedBySomeoneElse.driveRevokedAt;
        if (stillConnected) {
          const owner = await this.users.findById(ownedBySomeoneElse.userId).catch(() => undefined);
          throw new Error(
            `Bu Microsoft hesabı (${identity.email}) zaten ${owner?.email ?? "başka bir"} Projelio hesabına bağlı. ` +
              "O hesapla giriş yapıp kutuyu oradan bağlayın ya da o hesabın Ayarlar ekranından bağlantıyı kaldırın."
          );
        }
        this.logger.warn(
          `Microsoft hesabı ${identity.email} devralınıyor: eski sahip ${ownedBySomeoneElse.userId} bağlantısı ölü.`
        );
      }

      // Ters durum: bu Projelio kullanıcısının BAŞKA bir Microsoft hesabı bağlı.
      // Şema kullanıcı başına tek hesap varsayıyor (findByUserId maybeSingle);
      // sessizce ikinci satır açmak sonraki her okumayı patlatırdı.
      const currentAccount = await this.msAccounts.findByUserId(parsed.userId);
      if (currentAccount && currentAccount.msSub !== identity.sub) {
        throw new Error(
          `Projelio hesabınıza zaten ${currentAccount.email} Microsoft hesabı bağlı. ` +
            `${identity.email} ile bağlanmak için önce Ayarlar'dan mevcut bağlantıyı kaldırın.`
        );
      }

      const account = await this.msAccounts.upsert({
        userId: parsed.userId,
        msSub: identity.sub,
        email: identity.email,
        refreshToken: tokens.refresh_token,
        scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
      });

      // Kutunun gerçek adresini Graph'a soruyoruz: id_token'daki e-posta ile
      // posta kutusunun adresi her zaman aynı olmuyor (takma adlar, UPN farkı).
      const token = await this.msAccounts.mailAccessToken(account.id);
      const probe = await this.graph.probe(token, parsed.sharedMailbox);

      const linked = await this.mailbox.linkAccount({
        scope,
        userId: parsed.userId,
        microsoftAccountId: account.id,
        address: parsed.sharedMailbox || probe.address || identity.email,
        displayName: probe.name ?? identity.name,
        sharedMailbox: parsed.sharedMailbox,
      });

      return res.redirect(this.returnUrl(state, { connected: linked.address }));
    } catch (err: any) {
      this.logger.error(`Posta bağlantısı tamamlanamadı: ${err?.message ?? String(err)}`);
      return res.redirect(this.returnUrl(state, { error: err?.message ?? "Posta bağlantısı tamamlanamadı." }));
    }
  }

  // ============================================================ Kutu ayarları

  @Patch("mail/accounts/:id")
  @UseGuards(AuthGuard("jwt"))
  updateAccount(
    @Param("id") id: string,
    @Body() body: { signature?: string; displayName?: string; active?: boolean },
    @Req() req: any
  ) {
    return this.mailbox.updateAccount(id, body, req.user.userId);
  }

  /** Kutuyu modülden kaldırır; Microsoft bağlantısına dokunmaz. */
  @Delete("mail/accounts/:id")
  @UseGuards(AuthGuard("jwt"))
  unlinkAccount(@Param("id") id: string, @Req() req: any) {
    return this.mailbox.unlinkAccount(id, req.user.userId);
  }

  // ============================================================ Posta

  @Get("mail/accounts/:id/folders")
  @UseGuards(AuthGuard("jwt"))
  folders(@Param("id") id: string, @Req() req: any) {
    return this.mailbox.listFolders(id, req.user.userId);
  }

  @Get("mail/accounts/:id/messages")
  @UseGuards(AuthGuard("jwt"))
  messages(
    @Param("id") id: string,
    @Query("folderId") folderId: string | undefined,
    @Query("skip") skip: string | undefined,
    @Query("search") search: string | undefined,
    @Req() req: any
  ) {
    return this.mailbox.listMessages(id, req.user.userId, {
      folderId,
      skip: skip ? Number(skip) : 0,
      search: search?.trim() || undefined,
    });
  }

  @Get("mail/accounts/:id/messages/:messageId")
  @UseGuards(AuthGuard("jwt"))
  message(@Param("id") id: string, @Param("messageId") messageId: string, @Req() req: any) {
    return this.mailbox.getMessage(id, messageId, req.user.userId);
  }

  @Patch("mail/accounts/:id/messages/:messageId/read")
  @UseGuards(AuthGuard("jwt"))
  markRead(
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Body("isRead") isRead: boolean,
    @Req() req: any
  ) {
    return this.mailbox.markRead(id, messageId, isRead ?? true, req.user.userId);
  }

  /** Lio yanıt taslağı yazar — göndermez. */
  @Post("mail/accounts/:id/messages/:messageId/draft")
  @UseGuards(AuthGuard("jwt"))
  draft(
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Body() body: { instruction?: string; tone?: string },
    @Req() req: any
  ) {
    return this.mailbox.draftReply(id, messageId, body, req.user.userId);
  }

  @Post("mail/accounts/:id/messages/:messageId/reply")
  @UseGuards(AuthGuard("jwt"))
  reply(
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Body() body: { text?: string; mode?: "reply" | "replyAll" | "forward"; to?: string[] },
    @Req() req: any
  ) {
    return this.mailbox.reply(id, messageId, body, req.user.userId);
  }

  // ============================================================ Yardımcılar

  private async buildConnectUrl(
    scope: MailScope,
    userId: string,
    next?: string,
    sharedMailbox?: string
  ): Promise<{ configured: boolean; url: string | null }> {
    if (!this.oauth.isDriveConfigured()) return { configured: false, url: null };

    const existing = await this.msAccounts.findByUserId(userId);
    const state = this.oauth.signState({
      userId,
      mode: "mail",
      organizationId: "organizationId" in scope ? scope.organizationId : undefined,
      departmentId: "organizationId" in scope ? scope.departmentId : undefined,
      jobId: "jobId" in scope ? scope.jobId : undefined,
      sharedMailbox: sharedMailbox?.trim() || undefined,
      next,
    });

    return {
      configured: true,
      url: this.oauth.buildAuthUrl({
        state,
        scopes: MAIL_CONNECT_SCOPES,
        redirectUri: this.oauth.mailRedirectUri,
        // Kullanıcının zaten bağlı bir Microsoft hesabı varsa onay ekranında
        // öne çıksın: yanlışlıkla ikinci bir hesapla bağlanmak, kutunun
        // hiç açılmamasına yol açıyor.
        loginHint: existing?.email,
      }),
    };
  }

  private scopeFromState(parsed: { organizationId?: string; departmentId?: string; jobId?: string }): MailScope {
    if (parsed.jobId) return { jobId: parsed.jobId };
    if (parsed.organizationId) {
      return { organizationId: parsed.organizationId, departmentId: parsed.departmentId };
    }
    throw new Error("Bağlantı isteğinde kapsam yok");
  }

  private returnUrl(state: string, params: { connected?: string; error?: string }): string {
    let next = "/";
    try {
      next = this.oauth.verifyState(state).next || "/";
    } catch {
      // State çözülemedi; kullanıcıyı kaybetmemek için anasayfaya düşeriz.
    }

    const url = new URL(`${this.oauth.webAppUrl}${next.startsWith("/") ? next : `/${next}`}`);
    if (params.connected) url.searchParams.set("mail", `connected:${params.connected}`);
    if (params.error) url.searchParams.set("mail", `error:${params.error}`);
    return url.toString();
  }
}
