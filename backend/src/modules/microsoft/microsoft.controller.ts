import { Body, Controller, Get, Logger, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { GoogleAccountsService } from "../google/google-accounts.service";
import { MicrosoftAccountsService } from "./microsoft-accounts.service";
import { MicrosoftAuthService } from "./microsoft-auth.service";
import { MicrosoftOAuthService, SIGN_IN_SCOPES } from "./microsoft-oauth.service";
import { OneDriveService } from "./onedrive.service";

/**
 * google.controller.ts'in Microsoft karşılığı: "Microsoft ile giriş" akışı ve
 * Ayarlar'daki OneDrive bağlama ekranı.
 *
 * İki mod da AYNI geri dönüş adresine (/auth/microsoft/callback) düşer; hangisi
 * olduğu imzalı `state` içinden okunur. Posta akışı ayrı bir adres kullanır
 * (bkz. microsoft-oauth.service.ts mailRedirectUri) — bu ikisi ise aynı adresi
 * paylaşabiliyor, çünkü ikisi de bu controller'da.
 */
@Controller()
export class MicrosoftController {
  private readonly logger = new Logger(MicrosoftController.name);

  constructor(
    private oauth: MicrosoftOAuthService,
    private accounts: MicrosoftAccountsService,
    private oneDrive: OneDriveService,
    private microsoftAuth: MicrosoftAuthService,
    // Depolama sağlayıcısı yalnızca biri olabilir (bkz. microsoft.module.ts).
    private googleAccounts: GoogleAccountsService
  ) {}

  // ------------------------------------------------------------------- giriş

  /** Ön yüz "Microsoft ile devam et" düğmesi buradan yönlendirme adresini alır. */
  @Get("auth/microsoft/url")
  loginUrl(@Query("next") next?: string) {
    // Giriş için jeton şifreleme anahtarı GEREKMEZ (refresh token saklamıyoruz,
    // bkz. SIGN_IN_SCOPES): isDriveConfigured değil isConfigured'a bakılır.
    if (!this.oauth.isConfigured()) {
      return { configured: false as const, url: null };
    }
    const state = this.oauth.signState({ mode: "login", next });
    return {
      configured: true as const,
      url: this.oauth.buildAuthUrl({ state, scopes: SIGN_IN_SCOPES, prompt: "select_account" }),
    };
  }

  /** Devir kodunu gerçek oturum token'ıyla takas eder (bkz. GoogleController.exchange). */
  @Post("auth/microsoft/exchange")
  exchange(@Body("code") code: string) {
    return { token: this.microsoftAuth.consumeHandoff(code) };
  }

  // ---------------------------------------------------------------- bağlama

  /** Ayarlar ekranındaki "OneDrive'ı bağla" düğmesi buradan yönlendirme adresini alır. */
  @Get("microsoft/connect-url")
  @UseGuards(AuthGuard("jwt"))
  async connectUrl(@Req() req: any, @Query("next") next?: string) {
    if (!this.oauth.isDriveConfigured()) {
      return { configured: false as const, url: null };
    }

    // Depolama sağlayıcısı yalnızca biri olabilir: Google Drive zaten
    // bağlıysa kullanıcı önce onu kaldırmadan OneDrive'ı bağlayamaz.
    const googleAccount = await this.googleAccounts.findByUserId(req.user.userId);
    if (this.googleAccounts.isDriveReady(googleAccount)) {
      return { configured: true as const, url: null, blockedBy: "google" as const };
    }

    const existing = await this.accounts.findByUserId(req.user.userId);
    const state = this.oauth.signState({ userId: req.user.userId, next });

    return {
      configured: true as const,
      url: this.oauth.buildAuthUrl({ state, loginHint: existing?.email }),
    };
  }

  /**
   * Microsoft'un geri dönüş adresi. Hem giriş hem OneDrive bağlama akışı buraya
   * düşer; hangisi olduğu imzalı `state` içinden okunur.
   *
   * Sonuç her hâlükârda ön yüze yönlendirmedir — kullanıcı bu adreste ham JSON
   * görmemeli.
   */
  @Get("auth/microsoft/callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Res() res: Response
  ) {
    const web = this.oauth.webAppUrl;

    if (error) {
      // Kullanıcı onay ekranında "İptal" dedi. Dönüş ekranı, giriş denemesiyle
      // OneDrive bağlama denemesini ayırt edebilsin diye modu da taşıyoruz —
      // yoksa girişte "Ayarlara dön" diyen bir hata kartı çıkardı.
      const params = new URLSearchParams({ error });
      if (this.modeFromState(state) === "login") params.set("mode", "login");
      return res.redirect(`${web}/microsoft/return?${params.toString()}`);
    }

    try {
      const parsed = this.oauth.verifyState(state);
      // Kod hangi izin kümesiyle alındıysa takas da onunla yapılır; giriş
      // akışında OneDrive izinleri hiç istenmedi.
      const tokens = await this.oauth.exchangeCode(
        code,
        parsed.mode === "login" ? SIGN_IN_SCOPES : undefined
      );
      if (!tokens.id_token) throw new Error("id_token gelmedi");

      const identity = this.oauth.decodeIdentity(tokens.id_token);
      const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);
      const next = parsed.next && parsed.next.startsWith("/") ? parsed.next : undefined;

      if (parsed.mode === "login") {
        const { token, isNewUser } = await this.microsoftAuth.loginWithMicrosoft(identity);
        // Oturum jetonu URL'e KONMAZ; tek kullanımlık devir kodu verilir
        // (gerekçe: common/auth/oauth-handoff.ts).
        const loginParams = new URLSearchParams({ code: this.microsoftAuth.createHandoff(token) });
        if (isNewUser) loginParams.set("new", "1");
        if (next) loginParams.set("next", next);
        return res.redirect(`${web}/microsoft/return?${loginParams.toString()}`);
      }

      if (!parsed.userId) throw new Error("Microsoft oturum isteği geçersiz.");

      const ownedBySomeoneElse = await this.accounts.findByMsSub(identity.sub);
      if (ownedBySomeoneElse && ownedBySomeoneElse.userId !== parsed.userId) {
        throw new Error("Bu Microsoft hesabı başka bir Projelio kullanıcısına bağlı.");
      }
      const current = await this.accounts.findByUserId(parsed.userId);
      if (current && current.msSub !== identity.sub) {
        throw new Error(`Hesabınıza zaten ${current.email} bağlı. Önce mevcut bağlantıyı kaldırın.`);
      }

      // Yarış durumuna karşı: kullanıcı bu ekrana geldikten sonra başka bir
      // sekmede Google Drive'ı bağlamış olabilir.
      const googleAccount = await this.googleAccounts.findByUserId(parsed.userId);
      if (this.googleAccounts.isDriveReady(googleAccount)) {
        throw new Error(
          "Zaten Google Drive bağlısınız. Depolama sağlayıcısını değiştirmek için önce Ayarlar'dan Drive bağlantısını kaldırın."
        );
      }

      await this.accounts.upsert({
        userId: parsed.userId,
        msSub: identity.sub,
        email: identity.email,
        refreshToken: tokens.refresh_token,
        scopes,
      });
      await this.ensureRootFolder(parsed.userId);

      const params = new URLSearchParams({ connected: "1" });
      if (next) params.set("next", next);
      return res.redirect(`${web}/microsoft/return?${params.toString()}`);
    } catch (err: any) {
      this.logger.error(`Microsoft callback hatası: ${err?.message ?? String(err)}`);
      const message = err?.response?.message ?? err?.message ?? "Microsoft işlemi tamamlanamadı.";
      const params = new URLSearchParams({ error: message });
      if (this.modeFromState(state) === "login") params.set("mode", "login");
      return res.redirect(`${web}/microsoft/return?${params.toString()}`);
    }
  }

  // ------------------------------------------------------------------- OneDrive

  /** Ayarlar ekranındaki OneDrive kartı bu bilgiyi gösterir. */
  @Get("microsoft/status")
  @UseGuards(AuthGuard("jwt"))
  async status(@Req() req: any) {
    const configured = this.oauth.isDriveConfigured();
    const account = await this.accounts.findByUserId(req.user.userId);
    const driveReady = this.accounts.isDriveReady(account);

    let quota: { limitBytes?: number; usageBytes?: number } | undefined;
    if (driveReady && account) {
      try {
        const accessToken = await this.accounts.getAccessToken(account.id);
        quota = await this.oneDrive.getQuota(accessToken);
      } catch {
        // Kota bilgisi alınamazsa ekran yine çalışsın; kritik değil.
      }
    }

    // Depolama sağlayıcısı yalnızca biri olabilir: Google Drive zaten
    // kullanılıyorsa ön yüz "OneDrive'ı bağla" düğmesini kilitli göstermeli.
    const googleAccount = driveReady ? undefined : await this.googleAccounts.findByUserId(req.user.userId);
    const lockedByOtherProvider = !driveReady && this.googleAccounts.isDriveReady(googleAccount);

    return {
      lockedByOtherProvider,
      configured,
      connected: Boolean(account),
      email: account?.email,
      driveReady,
      needsReconnect: Boolean(account && account.driveRevokedAt),
      quota,
    };
  }

  @Post("microsoft/disconnect")
  @UseGuards(AuthGuard("jwt"))
  async disconnect(@Req() req: any) {
    await this.accounts.disconnectDrive(req.user.userId);
    return { ok: true };
  }

  // ----------------------------------------------------------------- yardımcı

  /**
   * Hata yolunda modu okur. Sessizce yutar: state bozuksa/süresi dolmuşsa da
   * kullanıcıya hata kartını göstermek zorundayız, mod yalnızca kartın
   * metnini seçiyor.
   */
  private modeFromState(state?: string): string | undefined {
    if (!state) return undefined;
    try {
      return this.oauth.verifyState(state).mode;
    } catch {
      return undefined;
    }
  }

  /** Kullanıcının OneDrive'ında uygulama klasörünü hazırlar (approot'un id'sini çözüp saklar). */
  private async ensureRootFolder(userId: string): Promise<void> {
    const account = await this.accounts.findByUserId(userId);
    if (!this.accounts.isDriveReady(account)) return;
    if (account.rootFolderId) return;

    try {
      const accessToken = await this.accounts.getAccessToken(account.id);
      const folder = await this.oneDrive.getAppRootFolder(accessToken);
      await this.accounts.setRootFolderId(account.id, folder.id);
    } catch (err) {
      // Kök klasör ilk dosya yüklemesinde de çözülecek; burada başarısız olmak
      // bağlantıyı geçersiz kılmamalı.
      this.logger.warn(`OneDrive uygulama klasörü çözülemedi: ${String(err)}`);
    }
  }
}
