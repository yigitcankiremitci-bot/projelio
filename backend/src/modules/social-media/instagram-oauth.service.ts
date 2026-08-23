import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createTokenCrypto } from "../../common/crypto/token-crypto";
import { extractMetaError } from "./publish-format";
import { getWebAppUrl } from "../../common/config/env";

/**
 * Instagram bağlantısı — "Instagram API with Instagram Login" yolu.
 *
 * NEDEN BU YOL: Meta iki yol sunuyor. Facebook Login for Business, kullanıcının
 * Instagram hesabını bir Facebook Sayfasına bağlamış olmasını şart koşuyor ve
 * beş izin istiyor. Business Login for Instagram ise doğrudan Instagram
 * profesyonel hesabıyla çalışıyor: iki izin (instagram_business_basic,
 * instagram_business_content_publish), sayfa zorunluluğu yok. Küçük işletme ve
 * serbest çalışan için ilk yol pratikte kurulamıyordu.
 *
 * Karşılığında verilen: büyük videolar için "resumable upload" yalnızca Facebook
 * Login yolunda var. Bizde medya zaten public bir adresten okunuyor (bkz.
 * InstagramPublishService), o yüzden kayıp değil.
 *
 * JETON YAŞAM DÖNGÜSÜ (Google'dan farklı, dikkat):
 *   kod → kısa ömürlü jeton (1 saat)
 *       → uzun ömürlü jeton (60 gün)
 *       → yenileme: AYNI jeton uzatılır, ayrı bir refresh token YOK
 *
 * Ve kritik kural: uzun ömürlü jeton ancak **süresi dolmadan** ve en az 24
 * saatlik olduğunda yenilenebilir. Süresi geçmiş jeton yenilenemez — kullanıcı
 * yeniden bağlanmak zorunda kalır. Bu yüzden yenileme işi süre dolmadan günler
 * önce çalışır (bkz. SocialPublishProcessor).
 */

/** Yetkilendirme ekranı. */
const AUTH_ENDPOINT = "https://www.instagram.com/oauth/authorize";
/** Kod → kısa ömürlü jeton. */
const TOKEN_ENDPOINT = "https://api.instagram.com/oauth/access_token";
/** Graph tabanı: uzun ömürlü jeton, yenileme, profil, yayın. */
export const IG_GRAPH_HOST = "https://graph.instagram.com";
/** Meta API sürümü çeyrekte bir artıyor; tek yerde tutuluyor. */
export const IG_API_VERSION = "v21.0";

/**
 * İstenen izinler.
 *
 * `instagram_business_basic` profil ve medya okuma, `..._content_publish` yayın.
 * İkisi de App Review ister; geliştirme modunda yalnızca uygulamada rolü olan
 * hesaplarla çalışır.
 */
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export interface InstagramStatePayload {
  typ: "instagram_oauth";
  /** İzni hangi Projelio kullanıcısı veriyor. */
  userId: string;
  /** Hesap hangi kapsama açılacak (organizasyon+departman ya da iş). */
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  /** Akış bitince kullanıcının döneceği ön yüz yolu. */
  next?: string;
}

export interface InstagramProfile {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  followersCount?: number;
  accountType?: string;
}

const tokenCrypto = createTokenCrypto("SOCIAL_TOKEN_ENC_KEY");

/** Jeton şifreleyici — SocialTokensService bunu kullanır. */
export const socialTokenCrypto = tokenCrypto;

@Injectable()
export class InstagramOAuthService {
  private readonly logger = new Logger(InstagramOAuthService.name);

  constructor(private jwtService: JwtService) {}

  private get clientId(): string | undefined {
    return process.env.INSTAGRAM_APP_ID?.trim();
  }

  private get clientSecret(): string | undefined {
    return process.env.INSTAGRAM_APP_SECRET?.trim();
  }

  get redirectUri(): string {
    return (
      process.env.INSTAGRAM_REDIRECT_URI?.trim() ||
      `${process.env.BACKEND_URL?.trim() || "http://localhost:3000"}/social/instagram/callback`
    );
  }

  get webAppUrl(): string {
    return getWebAppUrl();
  }

  /**
   * Entegrasyon kullanılabilir mi.
   *
   * Jeton şifreleme anahtarı da şart: anahtar yoksa jetonu saklayamayız ve
   * "bağlandı ama yayımlayamıyor" gibi yarım bir durum doğar. Arayüz bu bayrağa
   * bakıp düğmeyi hiç göstermiyor.
   */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && tokenCrypto.isConfigured());
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new UnauthorizedException(
        "Instagram entegrasyonu yapılandırılmamış (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / SOCIAL_TOKEN_ENC_KEY)."
      );
    }
  }

  /**
   * CSRF koruması: `state` imzalı bir JWT.
   *
   * Google akışıyla aynı gerekçe — ön yüz ve backend farklı alan adlarında,
   * çerez tabanlı state üçüncü taraf çerez engellerine takılıyor. Ayrıca
   * hesabın hangi kapsama açılacağını da state taşıyor: geri dönüşte
   * kullanıcıya "bu hesabı nereye ekleyeyim" diye sormak zorunda kalmıyoruz.
   */
  signState(payload: Omit<InstagramStatePayload, "typ">): string {
    return this.jwtService.sign({ ...payload, typ: "instagram_oauth" }, { expiresIn: "10m" });
  }

  verifyState(state: string): InstagramStatePayload {
    let decoded: InstagramStatePayload;
    try {
      decoded = this.jwtService.verify<InstagramStatePayload>(state);
    } catch {
      throw new UnauthorizedException("Instagram bağlantı isteği geçersiz veya süresi dolmuş.");
    }
    if (decoded?.typ !== "instagram_oauth") {
      throw new UnauthorizedException("Instagram bağlantı isteği geçersiz.");
    }
    return decoded;
  }

  buildAuthUrl(state: string): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: IG_SCOPES.join(","),
      state,
      // Kullanıcı ikinci bir hesabı bağlamak istediğinde Instagram, oturumdaki
      // hesabı sormadan onaylıyordu; yanlış hesap bağlanıyordu.
      force_reauth: "true",
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  /** Yetkilendirme kodu → kısa ömürlü (1 saat) jeton + Instagram kullanıcı kimliği. */
  async exchangeCode(code: string): Promise<{ accessToken: string; userId: string; permissions?: string[] }> {
    this.assertConfigured();

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri,
        code,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Instagram kod takası başarısız (${res.status}): ${body}`);
      throw new UnauthorizedException("Instagram yetkilendirmesi tamamlanamadı.");
    }

    const json = (await res.json()) as {
      access_token: string;
      user_id: number | string;
      permissions?: string[] | string;
    };
    return {
      accessToken: json.access_token,
      userId: String(json.user_id),
      permissions: Array.isArray(json.permissions)
        ? json.permissions
        : typeof json.permissions === "string"
          ? json.permissions.split(",").filter(Boolean)
          : undefined,
    };
  }

  /** Kısa ömürlü jeton → 60 günlük uzun ömürlü jeton. */
  async exchangeLongLived(shortLivedToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
    this.assertConfigured();

    const params = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: this.clientSecret!,
      access_token: shortLivedToken,
    });
    const res = await fetch(`${IG_GRAPH_HOST}/access_token?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Instagram uzun ömürlü jeton alınamadı (${res.status}): ${body}`);
      throw new UnauthorizedException("Instagram bağlantısı kalıcı hale getirilemedi.");
    }

    const json = (await res.json()) as { access_token: string; expires_in: number };
    return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
  }

  /**
   * Uzun ömürlü jetonu 60 gün daha uzatır.
   *
   * Kalıcı hata (jeton süresi dolmuş, kullanıcı erişimi iptal etmiş) tekrar
   * denemeye değmez: çağıran taraf hesabı `expired`/`revoked` işaretleyip
   * kullanıcıdan yeniden bağlanmasını ister.
   */
  async refreshLongLived(
    longLivedToken: string
  ): Promise<{ accessToken: string; expiresInSeconds: number } | { invalid: true; message: string }> {
    this.assertConfigured();

    const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: longLivedToken });
    const res = await fetch(`${IG_GRAPH_HOST}/refresh_access_token?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(`Instagram jeton yenileme başarısız (${res.status}): ${body}`);
      return { invalid: true, message: extractMetaError(body) };
    }

    const json = (await res.json()) as { access_token: string; expires_in: number };
    return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
  }

  /** Bağlanan hesabın profili — kullanıcı adı, tür, takipçi. */
  async fetchProfile(accessToken: string): Promise<InstagramProfile> {
    const params = new URLSearchParams({
      fields: "id,username,name,profile_picture_url,followers_count,account_type",
      access_token: accessToken,
    });
    const res = await fetch(`${IG_GRAPH_HOST}/${IG_API_VERSION}/me?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Instagram profili okunamadı (${res.status}): ${body}`);
      throw new UnauthorizedException(extractMetaError(body));
    }

    const json = (await res.json()) as {
      id: string;
      username: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
      account_type?: string;
    };
    return {
      id: json.id,
      username: json.username,
      name: json.name,
      profilePictureUrl: json.profile_picture_url,
      followersCount: json.followers_count,
      accountType: json.account_type,
    };
  }
}
