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

export interface MicrosoftOAuthStatePayload {
  typ: "microsoft_oauth";
  /** Bu akış her zaman "connect": önce giriş yapmış kullanıcı OneDrive'ı bağlar. */
  userId: string;
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

  buildAuthUrl(options: { state: string; loginHint?: string }): string {
    this.assertConfigured();

    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: [...MICROSOFT_LOGIN_SCOPES, ONEDRIVE_SCOPE, ONEDRIVE_BROWSE_SCOPE].join(" "),
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

  async exchangeCode(code: string): Promise<MicrosoftTokenResponse> {
    this.assertConfigured();

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
        scope: [...MICROSOFT_LOGIN_SCOPES, ONEDRIVE_SCOPE, ONEDRIVE_BROWSE_SCOPE].join(" "),
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
    refreshToken: string
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
        scope: [...MICROSOFT_LOGIN_SCOPES, ONEDRIVE_SCOPE, ONEDRIVE_BROWSE_SCOPE].join(" "),
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
