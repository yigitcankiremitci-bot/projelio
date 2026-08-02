import { Body, Controller, Get, Logger, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { GoogleAccountsService } from "./google-accounts.service";
import { GoogleAuthService } from "./google-auth.service";
import { DRIVE_SCOPE, GoogleOAuthService, LOGIN_SCOPES } from "./google-oauth.service";
import { DriveService } from "./drive.service";

@Controller()
export class GoogleController {
  private readonly logger = new Logger(GoogleController.name);

  constructor(
    private oauth: GoogleOAuthService,
    private googleAuth: GoogleAuthService,
    private accounts: GoogleAccountsService,
    private drive: DriveService
  ) {}

  // ------------------------------------------------------------------- giriş

  /** Ön yüz "Google ile devam et" düğmesi buradan yönlendirme adresini alır. */
  @Get("auth/google/url")
  loginUrl(@Query("next") next?: string) {
    if (!this.oauth.isConfigured()) {
      return { configured: false as const, url: null };
    }
    const state = this.oauth.signState({ mode: "login", next });
    return {
      configured: true as const,
      url: this.oauth.buildAuthUrl({ scopes: LOGIN_SCOPES, state }),
    };
  }

  /** Giriş yapmış kullanıcı Drive'ı bağlarken kullanılır (incremental authorization). */
  @Get("google/connect-url")
  @UseGuards(AuthGuard("jwt"))
  async connectUrl(@Req() req: any, @Query("next") next?: string) {
    if (!this.oauth.isDriveConfigured()) {
      return { configured: false as const, url: null };
    }

    const existing = await this.accounts.findByUserId(req.user.userId);
    const state = this.oauth.signState({ mode: "connect", userId: req.user.userId, next });

    return {
      configured: true as const,
      url: this.oauth.buildAuthUrl({
        scopes: [...LOGIN_SCOPES, DRIVE_SCOPE],
        state,
        // Hesap seçme ekranında doğru hesabı öne çıkarır; kullanıcı yanlışlıkla
        // ikinci bir Google hesabıyla bağlanmaya çalışmasın.
        loginHint: existing?.email,
      }),
    };
  }

  /**
   * Google'ın geri dönüş adresi. Hem giriş hem Drive bağlama akışı buraya düşer;
   * hangisi olduğu imzalı `state` içinden okunur.
   *
   * Sonuç her hâlükârda ön yüze yönlendirmedir — kullanıcı bu adreste ham JSON
   * görmemeli.
   */
  @Get("auth/google/callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Res() res: Response
  ) {
    const web = this.oauth.webAppUrl;

    if (error) {
      // Kullanıcı onay ekranında "İptal" dedi.
      return res.redirect(`${web}/google/return?error=${encodeURIComponent(error)}`);
    }

    try {
      const parsed = this.oauth.verifyState(state);
      const tokens = await this.oauth.exchangeCode(code);
      if (!tokens.id_token) throw new Error("id_token gelmedi");

      const identity = this.oauth.decodeIdentity(tokens.id_token);
      const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);
      const next = parsed.next && parsed.next.startsWith("/") ? parsed.next : undefined;

      if (parsed.mode === "connect" && parsed.userId) {
        await this.googleAuth.connectToExistingUser(parsed.userId, identity, {
          refreshToken: tokens.refresh_token,
          scopes,
        });
        await this.ensureRootFolder(parsed.userId);

        const params = new URLSearchParams({ connected: "1" });
        if (next) params.set("next", next);
        return res.redirect(`${web}/google/return?${params.toString()}`);
      }

      const { token, isNewUser } = await this.googleAuth.loginWithGoogle(identity, {
        refreshToken: tokens.refresh_token,
        scopes,
      });
      if (scopes.includes(DRIVE_SCOPE)) {
        await this.ensureRootFolderByToken(token).catch(() => undefined);
      }

      const params = new URLSearchParams({ code: this.googleAuth.createHandoff(token) });
      if (isNewUser) params.set("new", "1");
      if (next) params.set("next", next);
      return res.redirect(`${web}/google/return?${params.toString()}`);
    } catch (err: any) {
      this.logger.error(`Google callback hatası: ${err?.message ?? String(err)}`);
      const message = err?.response?.message ?? err?.message ?? "Google girişi tamamlanamadı.";
      return res.redirect(`${web}/google/return?error=${encodeURIComponent(message)}`);
    }
  }

  /** Devir kodunu gerçek oturum token'ıyla takas eder. */
  @Post("auth/google/exchange")
  exchange(@Body("code") code: string) {
    return { token: this.googleAuth.consumeHandoff(code) };
  }

  // ------------------------------------------------------------------- Drive

  /** Ayarlar ekranındaki Drive kartı bu bilgiyi gösterir. */
  @Get("google/status")
  @UseGuards(AuthGuard("jwt"))
  async status(@Req() req: any) {
    const configured = this.oauth.isDriveConfigured();
    const account = await this.accounts.findByUserId(req.user.userId);
    const driveReady = this.accounts.isDriveReady(account);

    let quota: { limitBytes?: number; usageBytes?: number } | undefined;
    if (driveReady && account) {
      try {
        const accessToken = await this.accounts.getAccessToken(account.id);
        quota = await this.drive.getQuota(accessToken);
      } catch {
        // Kota bilgisi alınamazsa ekran yine çalışsın; kritik değil.
      }
    }

    return {
      configured,
      connected: Boolean(account),
      email: account?.email,
      pictureUrl: account?.pictureUrl,
      driveReady,
      // Kullanıcı Drive'ı bağlamıştı ama erişim koptu (iptal/invalid_grant).
      needsReconnect: Boolean(account && account.driveRevokedAt),
      quota,
    };
  }

  @Post("google/disconnect")
  @UseGuards(AuthGuard("jwt"))
  async disconnect(@Req() req: any) {
    await this.accounts.disconnectDrive(req.user.userId);
    return { ok: true };
  }

  // ----------------------------------------------------------------- yardımcı

  /** Kullanıcının Drive'ında "Projelio" kök klasörünü hazırlar. */
  private async ensureRootFolder(userId: string): Promise<void> {
    const account = await this.accounts.findByUserId(userId);
    if (!this.accounts.isDriveReady(account)) return;
    if (account.rootFolderId) return;

    try {
      const accessToken = await this.accounts.getAccessToken(account.id);
      const folder = await this.drive.findOrCreateFolder(accessToken, "Projelio");
      await this.accounts.setRootFolderId(account.id, folder.id);
    } catch (err) {
      // Klasör ilk dosya yüklemesinde de oluşturulacak; burada başarısız olmak
      // bağlantıyı geçersiz kılmamalı.
      this.logger.warn(`Projelio kök klasörü oluşturulamadı: ${String(err)}`);
    }
  }

  private async ensureRootFolderByToken(jwt: string): Promise<void> {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    if (payload?.sub) await this.ensureRootFolder(String(payload.sub));
  }
}
