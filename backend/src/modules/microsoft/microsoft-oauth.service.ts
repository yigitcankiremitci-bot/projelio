import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { isMicrosoftTokenCryptoConfigured } from "./microsoft-token-crypto.util";

// "common" tenant: hem kişisel (outlook.com/hotmail.com) hem iş/okul hesapları
// aynı uç noktadan geçer. Projelio kimin hangi organizasyona ait olduğuyla
// ilgilenmiyor, yalnızca OneDrive'a erişmek istiyor.
const AUTH_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

/**
 * OneDrive izinleri.
 *
 * `Files.ReadWrite.AppFolder`: uygulamanın kendi özel "uygulama klasörüne"
 * (/me/drive/special/approot) yazdığı/yüklediği dosyalar için — Projelio'nun
 * oluşturduğu ve içine dosya yüklediği klasör hâlâ bu izinle sınırlı.
 *
 * `Files.Read.All`: kullanıcı "Drive'dan dosya seç" akışını kullanıp
 * OneDrive'ının tamamını gözden geçirip mevcut bir dosyayı Projelio'ya
 * içe aktarmak istediğinde gerekiyor (bkz. OneDriveService.listFiles/copyFile).
 * Google tarafında bunun karşılığı Picker widget'ı ile scope genişletmeden
 * çözülüyor; Microsoft'ta Picker eşdeğeri olmadığından ve bu geniş iznin
 * onayı (ücretsiz yayıncı doğrulaması dışında) production'ı engellemediğinden
 * burada scope genişletme yolunu seçtik (bkz. proje kararları).
 *
 * Graph scope'ları v2.0 uç noktasında tam nitelikli (resource önekli) verilir;
 * openid/email/profile/offline_access ise standart OIDC scope'ları, önek almaz.
 */
export const MICROSOFT_LOGIN_SCOPES = ["openid", "email", "profile", "offline_access"];
export const ONEDRIVE_SCOPE = "https://graph.microsoft.com/Files.ReadWrite.AppFolder";
export const ONEDRIVE_BROWSE_SCOPE = "https://graph.microsoft.com/Files.Read.All";

/**
 * Posta izinleri (E-posta modülü gelen kutusu).
 *
 * `Mail.ReadWrite` okuma + okundu işaretleme + taslak oluşturma, `Mail.Send`
 * yanıt gönderme. Google'daki Gmail scope'larının aksine bunlar yıllık bağımsız
 * güvenlik denetimi (CASA) gerektirmiyor; Microsoft tarafında yayıncı
 * doğrulaması yeterli. E-posta modülünün önce Outlook ile başlamasının sebebi
 * bu (bkz. docs/moduller/15-eposta-gelen-kutusu.md §1).
 *
 * DEPOLAMA SCOPE'LARI BİLEREK BURADA YOK: posta bağlarken OneDrive izni de
 * istenirse, depolaması Google Drive olan bir kullanıcı farkında olmadan
 * "OneDrive hazır" durumuna düşer (bkz. MicrosoftAccountsService.isDriveReady)
 * ve depolama sağlayıcısı sessizce değişmiş gibi görünür. İki izin kümesi ayrı
 * onaylardan geçer.
 */
export const MAIL_SCOPES = [
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  // `User.Read` OLMADAN /me çağrılamaz — openid/profile yalnızca id_token
  // üretir, Graph'ın /me kaynağına erişim vermez. Kutunun gerçek adresini
  // (takma ad / UPN farkı) oradan okuduğumuz için gerekli; düşük ayrıcalıklı
  // ve yönetici onayı istemeyen bir izin.
  "https://graph.microsoft.com/User.Read",
];

/** OneDrive bağlama akışının istediği izinler. */
export const DRIVE_CONNECT_SCOPES = [...MICROSOFT_LOGIN_SCOPES, ONEDRIVE_SCOPE, ONEDRIVE_BROWSE_SCOPE];
/** Posta bağlama akışının istediği izinler. */
export const MAIL_CONNECT_SCOPES = [...MICROSOFT_LOGIN_SCOPES, ...MAIL_SCOPES];

export interface MicrosoftOAuthStatePayload {
  typ: "microsoft_oauth";
  /** Bu akış her zaman "connect": önce giriş yapmış kullanıcı OneDrive'ı bağlar. */
  userId: string;
  /**
   * Ne bağlanıyor: depolama mı posta mı.
   *
   * Verilmezse "drive" — bu alan eklenmeden önce imzalanmış (10 dakika ömürlü)
   * state'ler akış ortasında geçersizleşmesin diye.
   */
  mode?: "drive" | "mail";
  /** Posta akışında: kutunun bağlanacağı modül kapsamı. */
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  /**
   * Posta akışında: bağlanacak kutu kullanıcının kendi kutusu değilse
   * paylaşılan kutunun adresi (ör. info@sirket.com). Kullanıcının o kutuda
   * Exchange tarafında tam erişim yetkisi olmalı.
   */
  sharedMailbox?: string;
  /** Akış bitince kullanıcının döneceği ön yüz yolu. */
  next?: string;
}

export interface MicrosoftTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

export interface MicrosoftIdentity {
  sub: string;
  email: string;
  name?: string;
}

@Injectable()
export class MicrosoftOAuthService {
  private readonly logger = new Logger(MicrosoftOAuthService.name);

  constructor(private jwtService: JwtService) {}

  get clientId(): string | undefined {
    return process.env.MICROSOFT_CLIENT_ID?.trim();
  }

  private get clientSecret(): string | undefined {
    return process.env.MICROSOFT_CLIENT_SECRET?.trim();
  }

  get redirectUri(): string {
    return (
      process.env.MICROSOFT_REDIRECT_URI?.trim() ||
      `${process.env.BACKEND_URL?.trim() || "http://localhost:3000"}/auth/microsoft/callback`
    );
  }

  /**
   * Posta bağlama akışının dönüş adresi.
   *
   * Depolamadan AYRI bir adres: iki akışın geri dönüşü farklı controller'lara
   * düşüyor (MicrosoftController vs MailboxController) ve tek adres kullanmak
   * modüller arasında döngüsel bağımlılık doğuruyordu. Azure'da her iki URI de
   * kayıtlı olmalı.
   */
  get mailRedirectUri(): string {
    return (
      process.env.MICROSOFT_MAIL_REDIRECT_URI?.trim() ||
      `${process.env.BACKEND_URL?.trim() || "http://localhost:3000"}/mail/microsoft/callback`
    );
  }

  get webAppUrl(): string {
    return process.env.WEB_APP_URL?.trim() || "http://localhost:5173";
  }

  /** OneDrive özellikleri kullanılabilir mi? (istemci kimlikleri + token şifreleme anahtarı) */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  isDriveConfigured(): boolean {
    return this.isConfigured() && isMicrosoftTokenCryptoConfigured();
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new UnauthorizedException(
        "Microsoft entegrasyonu yapılandırılmamış (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET)."
      );
    }
  }

  /** google-oauth.service.ts'teki signState ile aynı gerekçe: state'i JWT olarak imzalıyoruz. */
  signState(payload: Omit<MicrosoftOAuthStatePayload, "typ">): string {
    return this.jwtService.sign({ ...payload, typ: "microsoft_oauth" }, { expiresIn: "10m" });
  }

  verifyState(state: string): MicrosoftOAuthStatePayload {
    let decoded: MicrosoftOAuthStatePayload;
    try {
      decoded = this.jwtService.verify<MicrosoftOAuthStatePayload>(state);
    } catch {
      throw new UnauthorizedException("Microsoft oturum isteği geçersiz veya süresi dolmuş.");
    }
    if (decoded?.typ !== "microsoft_oauth") {
      throw new UnauthorizedException("Microsoft oturum isteği geçersiz.");
    }
    return decoded;
  }

  buildAuthUrl(options: {
    state: string;
    loginHint?: string;
    scopes?: string[];
    /** Verilmezse depolama akışının adresi. */
    redirectUri?: string;
  }): string {
    this.assertConfigured();

    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: options.redirectUri ?? this.redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: (options.scopes ?? DRIVE_CONNECT_SCOPES).join(" "),
      // offline_access scope'u refresh_token için yeterli ama Microsoft da tıpkı
      // Google gibi, kullanıcı daha önce onay verdiyse consent ekranını atlayıp
      // sessiz geçebiliyor — bu durumda refresh_token gelmeyebilir. prompt=consent
      // ile her seferinde açıkça onay istenmesini garanti ediyoruz.
      prompt: "consent",
      state: options.state,
    });
    if (options.loginHint) params.set("login_hint", options.loginHint);

    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string, scopes?: string[], redirectUri?: string): Promise<MicrosoftTokenResponse> {
    this.assertConfigured();

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        // Kod hangi adrese verildiyse takas da onunla yapılmak zorunda.
        redirect_uri: redirectUri ?? this.redirectUri,
        grant_type: "authorization_code",
        scope: (scopes ?? DRIVE_CONNECT_SCOPES).join(" "),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Microsoft token exchange başarısız (${res.status}): ${body}`);
      throw new UnauthorizedException("Microsoft yetkilendirmesi tamamlanamadı.");
    }
    return (await res.json()) as MicrosoftTokenResponse;
  }

  /**
   * Refresh token ile yeni access token alır.
   *
   * `invalid_grant`, Google'daki gibi kalıcı bir hatadır (kullanıcı erişimi
   * iptal etti ya da token süresi doldu — Microsoft refresh token'ları 90 gün
   * kullanılmazsa kendiliğinden geçersizleşir). Çağıran taraf hesabı "revoked"
   * işaretleyip kullanıcıdan yeniden bağlanmasını istemeli.
   */
  async refreshAccessToken(
    refreshToken: string,
    /**
     * Hangi izinler için jeton isteniyor.
     *
     * Microsoft'ta erişim jetonu istenen scope kümesine göre çıkar: posta
     * okumak için OneDrive scope'lu bir jeton işe yaramaz. Kullanıcı o izni
     * hiç onaylamadıysa istek `invalid_grant`/`consent_required` ile döner ve
     * çağıran taraf "yeniden bağlanın" der.
     */
    scopes?: string[]
  ): Promise<{ accessToken: string; expiresIn: number } | { invalidGrant: true }> {
    this.assertConfigured();

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: (scopes ?? DRIVE_CONNECT_SCOPES).join(" "),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (body.includes("invalid_grant") || body.includes("AADSTS700082") || body.includes("AADSTS70008")) {
        return { invalidGrant: true };
      }
      this.logger.error(`Microsoft token yenileme başarısız (${res.status}): ${body}`);
      throw new UnauthorizedException("Microsoft erişimi yenilenemedi.");
    }

    const json = (await res.json()) as MicrosoftTokenResponse;
    return { accessToken: json.access_token, expiresIn: json.expires_in };
  }

  /**
   * Microsoft, Google'ın `/revoke` uç noktasına eşdeğer, herkese açık bir
   * "bu belirli refresh token'ı iptal et" API'si sunmuyor. Bağlantıyı
   * kaldırdığımızda kendi tarafımızdaki token'ı sileriz (bu, uygulamanın bir
   * daha erişememesi için yeterli); kullanıcı isterse tam iptali Microsoft
   * hesap ayarlarından (account.live.com/consent/Manage) kendisi yapabilir.
   */
  async revokeToken(_token: string): Promise<void> {
    this.logger.debug(
      "Microsoft için sunucu tarafında token iptali yok; yerel kayıt silinerek erişim kesiliyor."
    );
  }

  /**
   * id_token içindeki kimliği okur. Google'daki decodeIdentity ile aynı
   * gerekçe: token doğrudan Microsoft'un token uç noktasından, TLS üzerinden,
   * client_secret'ımızla kimlik doğrulanmış bir istekte alındı — imza
   * doğrulaması gerekmiyor.
   */
  decodeIdentity(idToken: string): MicrosoftIdentity {
    const parts = idToken.split(".");
    if (parts.length < 2) throw new UnauthorizedException("Microsoft kimlik bilgisi okunamadı.");

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload?.sub) throw new UnauthorizedException("Microsoft kimlik bilgisi eksik.");

    // Kişisel hesaplarda genelde `email` gelir; bazı iş/okul kiracılarında
    // yalnızca `preferred_username` (genelde UPN, e-posta biçiminde) olabilir.
    const email = payload.email ?? payload.preferred_username;
    if (!email) throw new UnauthorizedException("Microsoft hesabının e-postası alınamadı.");

    return {
      sub: String(payload.sub),
      email: String(email).toLowerCase(),
      name: payload.name ? String(payload.name) : undefined,
    };
  }
}
