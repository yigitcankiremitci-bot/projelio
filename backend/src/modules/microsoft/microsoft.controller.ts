import { Controller, Get, Logger, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { GoogleAccountsService } from "../google/google-accounts.service";
import { MicrosoftAccountsService } from "./microsoft-accounts.service";
import { MicrosoftOAuthService } from "./microsoft-oauth.service";
import { OneDriveService } from "./onedrive.service";

/**
 * google.controller.ts'in OneDrive karşılığı — ama yalnızca "connect" modu var.
 *
 * Google'dan fark: "Microsoft ile giriş" diye bir akış yok. Kullanıcı zaten
 * Projelio'ya girişini yapmış olmalı (JwtAuthGuard); bu uç noktalar yalnızca
 * o hesaba bir OneDrive bağlantısı ekler/kaldırır.
 */
@Controller()
export class MicrosoftController {
  private readonly logger = new Logger(MicrosoftController.name);

  constructor(
    private oauth: MicrosoftOAuthService,
    private accounts: MicrosoftAccountsService,
    private oneDrive: OneDriveService,
    // Depolama sağlayıcısı yalnızca biri olabilir (bkz. microsoft.module.ts).
    private googleAccounts: GoogleAccountsService
  ) {}

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
   * Microsoft'un geri dönüş adresi.
   *
   * Google'daki callback'ten farklı olarak burada tek bir mod var (connect);
   * sonuç yine ön yüze yönlendirmedir, kullanıcı bu adreste ham JSON görmez.
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
      return res.redirect(`${web}/microsoft/return?error=${encodeURIComponent(error)}`);
    }

    try {
      const parsed = this.oauth.verifyState(state);
      const tokens = await this.oauth.exchangeCode(code);
      if (!tokens.id_token) throw new Error("id_token gelmedi");

      const identity = this.oauth.decodeIdentity(tokens.id_token);
      const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);
      const next = parsed.next && parsed.next.startsWith("/") ? parsed.next : undefined;

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
      const message = err?.response?.message ?? err?.message ?? "Microsoft bağlantısı tamamlanamadı.";
      return res.redirect(`${web}/microsoft/return?error=${encodeURIComponent(message)}`);
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
