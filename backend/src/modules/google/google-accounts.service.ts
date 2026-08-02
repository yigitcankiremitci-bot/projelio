import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { DRIVE_SCOPE, GoogleOAuthService } from "./google-oauth.service";
import { decryptToken, encryptToken } from "./token-crypto.util";

export interface GoogleAccount {
  id: string;
  userId: string;
  googleSub: string;
  email: string;
  pictureUrl?: string;
  scopes: string[];
  rootFolderId?: string;
  hasRefreshToken: boolean;
  driveRevokedAt?: string;
  connectedAt: string;
}

function mapAccount(row: any): GoogleAccount {
  return {
    id: row.id,
    userId: row.user_id,
    googleSub: row.google_sub,
    email: row.email,
    pictureUrl: row.picture_url ?? undefined,
    scopes: row.scopes ?? [],
    rootFolderId: row.root_folder_id ?? undefined,
    hasRefreshToken: Boolean(row.refresh_token_enc),
    driveRevokedAt: row.drive_revoked_at ?? undefined,
    connectedAt: row.connected_at,
  };
}

/** Erişim token'ı bellekte tutulur; 1 saat ömürlü olduğu için veritabanına yazılmaz. */
interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

export class DriveNotConnectedError extends BadRequestException {
  constructor(message = "Google Drive bağlı değil. Ayarlar'dan Drive hesabınızı bağlayın.") {
    super(message);
  }
}

export class DriveReauthRequiredError extends BadRequestException {
  constructor(message = "Google Drive erişimi sona ermiş. Ayarlar'dan yeniden bağlanın.") {
    super(message);
  }
}

@Injectable()
export class GoogleAccountsService {
  private readonly logger = new Logger(GoogleAccountsService.name);
  private readonly accessTokenCache = new Map<string, CachedAccessToken>();

  constructor(
    private supabase: SupabaseService,
    private oauth: GoogleOAuthService
  ) {}

  async findByGoogleSub(googleSub: string): Promise<GoogleAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select()
      .eq("google_sub", googleSub)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  async findByUserId(userId: string): Promise<GoogleAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select()
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  async findById(id: string): Promise<GoogleAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  /**
   * Google'dan dönen kimliği ve token'ları kaydeder.
   *
   * Aynı google_sub ile ikinci kez gelindiğinde kayıt güncellenir. refresh_token
   * yalnızca Google gönderdiğinde yazılır — göndermediği durumda eldeki token
   * hâlâ geçerlidir ve üzerine null yazmak erişimi koparırdı.
   */
  async upsert(params: {
    userId: string;
    googleSub: string;
    email: string;
    pictureUrl?: string;
    refreshToken?: string;
    scopes: string[];
  }): Promise<GoogleAccount> {
    const existing = await this.findByGoogleSub(params.googleSub);

    const patch: Record<string, unknown> = {
      user_id: params.userId,
      google_sub: params.googleSub,
      email: params.email,
      picture_url: params.pictureUrl ?? null,
      scopes: params.scopes,
    };

    if (params.refreshToken) {
      patch.refresh_token_enc = encryptToken(params.refreshToken);
      patch.drive_revoked_at = null;
      patch.last_refreshed_at = new Date().toISOString();
    }

    if (existing) {
      // Scope'lar birikimlidir: kullanıcı önce girişle gelir, sonra Drive'ı
      // bağlar. Yeni istek eski izinleri kapsamıyorsa da kaybetmemeliyiz.
      patch.scopes = Array.from(new Set([...existing.scopes, ...params.scopes]));

      const { data, error } = await this.supabase.client
        .from("google_accounts")
        .update(patch)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      this.accessTokenCache.delete(existing.id);
      return mapAccount(data);
    }

    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .insert(patch)
      .select()
      .single();
    if (error) throw error;
    return mapAccount(data);
  }

  async setRootFolderId(accountId: string, folderId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("google_accounts")
      .update({ root_folder_id: folderId })
      .eq("id", accountId);
    if (error) throw error;
  }

  async markRevoked(accountId: string): Promise<void> {
    this.accessTokenCache.delete(accountId);
    const { error } = await this.supabase.client
      .from("google_accounts")
      .update({ drive_revoked_at: new Date().toISOString() })
      .eq("id", accountId);
    if (error) throw error;
  }

  /** Drive bağlantısını keser; giriş kimliği korunur, böylece kullanıcı giriş yapmaya devam edebilir. */
  async disconnectDrive(userId: string): Promise<void> {
    const account = await this.findByUserId(userId);
    if (!account) return;

    const refreshToken = await this.readRefreshToken(account.id);
    if (refreshToken) await this.oauth.revokeToken(refreshToken);

    this.accessTokenCache.delete(account.id);

    const { error } = await this.supabase.client
      .from("google_accounts")
      .update({
        refresh_token_enc: null,
        root_folder_id: null,
        drive_revoked_at: new Date().toISOString(),
        scopes: account.scopes.filter((s) => s !== DRIVE_SCOPE),
      })
      .eq("id", account.id);
    if (error) throw error;
  }

  private async readRefreshToken(accountId: string): Promise<string | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select("refresh_token_enc")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.refresh_token_enc) return undefined;

    try {
      return decryptToken(data.refresh_token_enc);
    } catch (err) {
      // Anahtar değişmiş ya da kayıt bozulmuş olabilir. Sessizce yanlış davranmak
      // yerine hesabı iptal işaretleyip kullanıcıdan yeniden bağlanmasını isteriz.
      this.logger.error(`Refresh token çözülemedi (account=${accountId}): ${String(err)}`);
      await this.markRevoked(accountId);
      return undefined;
    }
  }

  /**
   * Kullanılabilir bir access token döndürür. Önce bellekteki önbelleğe bakar,
   * yoksa refresh token ile yenisini alır.
   */
  async getAccessToken(accountId: string): Promise<string> {
    const cached = this.accessTokenCache.get(accountId);
    // 60 saniyelik pay: token isteğin ortasında sona ermesin.
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const account = await this.findById(accountId);
    if (!account) throw new DriveNotConnectedError();
    if (account.driveRevokedAt) throw new DriveReauthRequiredError();

    const refreshToken = await this.readRefreshToken(accountId);
    if (!refreshToken) throw new DriveNotConnectedError();

    const result = await this.oauth.refreshAccessToken(refreshToken);
    if ("invalidGrant" in result) {
      await this.markRevoked(accountId);
      throw new DriveReauthRequiredError();
    }

    this.accessTokenCache.set(accountId, {
      token: result.accessToken,
      expiresAt: Date.now() + result.expiresIn * 1000,
    });

    void this.supabase.client
      .from("google_accounts")
      .update({ last_refreshed_at: new Date().toISOString() })
      .eq("id", accountId)
      .then(undefined, () => undefined);

    return result.accessToken;
  }

  /** Kullanıcının Drive'ı gerçekten kullanılabilir durumda mı? */
  isDriveReady(account: GoogleAccount | undefined): account is GoogleAccount {
    return Boolean(
      account && account.hasRefreshToken && !account.driveRevokedAt && account.scopes.includes(DRIVE_SCOPE)
    );
  }
}
