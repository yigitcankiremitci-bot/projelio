import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { isTokenCryptoConfigured } from "./token-crypto.util";
import { getWebAppUrl } from "../../common/config/env";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/** Sadece giriş için gereken izinler. Kullanıcıya "kim olduğunu" sorar, dosyalarına dokunmaz. */
export const LOGIN_SCOPES = ["openid", "email", "profile"];

/**
 * Drive izni.
 *
 * `drive.file`, Google'ın "non-sensitive" saydığı tek Drive scope'udur: yalnızca
 * uygulamanın kendi oluşturduğu ya da kullanıcının Picker ile açıkça seçtiği
 * dosyalara erişir. Geniş `drive` scope'u "restricted" sınıfındadır ve yıllık
 * bağımsız güvenlik denetimi (CASA) gerektirir — bize gerekmiyor.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type OAuthMode = "login" | "connect";

export interface OAuthStatePayload {
  typ: "google_oauth";
  mode: OAuthMode;
  /** connect modunda: izni hangi Projelio kullanıcısına bağlayacağız. */
  userId?: string;
  /** Akış bitince kullanıcının döneceği ön yüz yolu. */
  next?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(private jwtService: JwtService) {}

  get clientId(): string | undefined {
    return process.env.GOOGLE_CLIENT_ID?.trim();
  }

  private get clientSecret(): string | undefined {
    return process.env.GOOGLE_CLIENT_SECRET?.trim();
  }

  get redirectUri(): string {
    return (
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      `${process.env.BACKEND_URL?.trim() || "http://localhost:3000"}/auth/google/callback`
    );
  }

  get webAppUrl(): string {
    return getWebAppUrl();
  }

  /** Google giriş/Drive özellikleri kullanılabilir mi? */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /** Drive özellikleri ayrıca token şifreleme anahtarı ister. */
  isDriveConfigured(): boolean {
    return this.isConfigured() && isTokenCryptoConfigured();
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new UnauthorizedException(
        "Google entegrasyonu yapılandırılmamış (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)."
      );
    }
  }

  /**
   * CSRF koruması için `state` parametresi.
   *
   * Ön yüz (Netlify) ile backend (Render) farklı alan adlarında olduğu için
   * çerez tabanlı state güvenilir değil — üçüncü taraf çerezleri engellenebiliyor.
   * Bunun yerine state'i JWT olarak imzalıyoruz: saldırgan geçerli bir state
   * üretemez, backend de sunucu tarafında oturum tutmak zorunda kalmaz.
   */
  signState(payload: Omit<OAuthStatePayload, "typ">): string {
    return this.jwtService.sign({ ...payload, typ: "google_oauth" }, { expiresIn: "10m" });
  }

  verifyState(state: string): OAuthStatePayload {
    let decoded: OAuthStatePayload;
    try {
      decoded = this.jwtService.verify<OAuthStatePayload>(state);
    } catch {
      throw new UnauthorizedException("Google oturum isteği geçersiz veya süresi dolmuş.");
    }
    if (decoded?.typ !== "google_oauth") {
      throw new UnauthorizedException("Google oturum isteği geçersiz.");
    }
    return decoded;
  }

  buildAuthUrl(options: { scopes: string[]; state: string; loginHint?: string }): string {
    this.assertConfigured();

    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: options.scopes.join(" "),
      // offline + consent olmadan refresh_token gelmez. Google refresh token'ı
      // yalnızca ilk onayda döndürür; consent'i zorlamazsak kullanıcı ikinci kez
      // bağlandığında elimizde token olmaz.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: options.state,
    });
    if (options.loginHint) params.set("login_hint", options.loginHint);

    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleTokenResponse> {
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
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Google token exchange başarısız (${res.status}): ${body}`);
      throw new UnauthorizedException("Google yetkilendirmesi tamamlanamadı.");
    }
    return (await res.json()) as GoogleTokenResponse;
  }

  /**
   * Refresh token ile yeni access token alır.
   *
   * `invalid_grant` kalıcı bir hatadır (kullanıcı erişimi iptal etti, şifresini
   * değiştirdi ya da onay ekranı "Testing" modunda olduğu için token 7 günde
   * süresi doldu). Tekrar denemek işe yaramaz; çağıran taraf hesabı "revoked"
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
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (body.includes("invalid_grant")) return { invalidGrant: true };
      this.logger.error(`Google token yenileme başarısız (${res.status}): ${body}`);
      throw new UnauthorizedException("Google erişimi yenilenemedi.");
    }

    const json = (await res.json()) as GoogleTokenResponse;
    return { accessToken: json.access_token, expiresIn: json.expires_in };
  }

  async revokeToken(token: string): Promise<void> {
    try {
      await fetch(REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch (error) {
      // İptal edilemese de yerel kayıt silinecek; kullanıcı istediğinde
      // Google hesap ayarlarından erişimi kaldırabilir.
      this.logger.warn(`Google token iptali başarısız: ${String(error)}`);
    }
  }

  /**
   * id_token içindeki kimliği okur.
   *
   * İmza doğrulaması yapılmıyor çünkü bu token doğrudan Google'ın token
   * uç noktasından, TLS üzerinden, bizim client_secret'ımızla kimlik
   * doğrulanmış bir istekte alındı. Araya girecek bir taraf yok. (Token bize
   * tarayıcı üzerinden gelseydi imza doğrulaması zorunlu olurdu.)
   */
  decodeIdentity(idToken: string): GoogleIdentity {
    const parts = idToken.split(".");
    if (parts.length < 2) throw new UnauthorizedException("Google kimlik bilgisi okunamadı.");

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException("Google kimlik bilgisi eksik.");
    }

    return {
      sub: String(payload.sub),
      email: String(payload.email).toLowerCase(),
      emailVerified: payload.email_verified === true || payload.email_verified === "true",
      name: payload.name ? String(payload.name) : undefined,
      picture: payload.picture ? String(payload.picture) : undefined,
    };
  }
}
