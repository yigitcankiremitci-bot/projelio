import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { DriveNotConnectedError, DriveReauthRequiredError } from "../google/google-accounts.service";
import { ONEDRIVE_SCOPE, MicrosoftOAuthService } from "./microsoft-oauth.service";
import { decryptMicrosoftToken, encryptMicrosoftToken } from "./microsoft-token-crypto.util";

export interface MicrosoftAccount {
  id: string;
  userId: string;
  msSub: string;
  email: string;
  pictureUrl?: string;
  scopes: string[];
  rootFolderId?: string;
  hasRefreshToken: boolean;
  driveRevokedAt?: string;
  connectedAt: string;
}

function mapAccount(row: any): MicrosoftAccount {
  return {
    id: row.id,
    userId: row.user_id,
    msSub: row.ms_sub,
    email: row.email,
    pictureUrl: row.picture_url ?? undefined,
    scopes: row.scopes ?? [],
    rootFolderId: row.root_folder_id ?? undefined,
    hasRefreshToken: Boolean(row.refresh_token_enc),
    driveRevokedAt: row.drive_revoked_at ?? undefined,
    connectedAt: row.connected_at,
  };
}

/** Erişim token'ı bellekte tutulur; ~1 saat ömürlü olduğu için veritabanına yazılmaz. */
interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

/**
 * google-accounts.service.ts'in OneDrive karşılığı — birebir aynı desen.
 *
 * Google'dan fark: burada "giriş" akışı yok, her kayıt zaten var olan bir
 * Projelio kullanıcısına `upsert` ile bağlanır (bkz. microsoft.controller.ts).
 */
@Injectable()
export class MicrosoftAccountsService {
  private readonly logger = new Logger(MicrosoftAccountsService.name);
  private readonly accessTokenCache = new Map<string, CachedAccessToken>();

  constructor(
    private supabase: SupabaseService,
    private oauth: MicrosoftOAuthService
  ) {}

  async findByMsSub(msSub: string): Promise<MicrosoftAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .select()
      .eq("ms_sub", msSub)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  async findByUserId(userId: string): Promise<MicrosoftAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .select()
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  async findById(id: string): Promise<MicrosoftAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  /** Zaten giriş yapmış bir kullanıcının Microsoft hesabını bağlar (google-auth.service.ts'teki connectToExistingUser ile aynı desen). */
  async upsert(params: {
    userId: string;
    msSub: string;
    email: string;
    pictureUrl?: string;
    refreshToken?: string;
    scopes: string[];
  }): Promise<MicrosoftAccount> {
    const existing = await this.findByMsSub(params.msSub);

    const patch: Record<string, unknown> = {
      user_id: params.userId,
      ms_sub: params.msSub,
      email: params.email,
      picture_url: params.pictureUrl ?? null,
      scopes: params.scopes,
    };

    if (params.refreshToken) {
      patch.refresh_token_enc = encryptMicrosoftToken(params.refreshToken);
      patch.drive_revoked_at = null;
      patch.last_refreshed_at = new Date().toISOString();
    }

    if (existing) {
      patch.scopes = Array.from(new Set([...existing.scopes, ...params.scopes]));

      const { data, error } = await this.supabase.client
        .from("microsoft_accounts")
        .update(patch)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      this.accessTokenCache.delete(existing.id);
      return mapAccount(data);
    }

    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .insert(patch)
      .select()
      .single();
    if (error) throw error;
    return mapAccount(data);
  }

  async setRootFolderId(accountId: string, folderId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("microsoft_accounts")
      .update({ root_folder_id: folderId })
      .eq("id", accountId);
    if (error) throw error;
  }

  async markRevoked(accountId: string): Promise<void> {
    this.accessTokenCache.delete(accountId);
    const { error } = await this.supabase.client
      .from("microsoft_accounts")
      .update({ drive_revoked_at: new Date().toISOString() })
      .eq("id", accountId);
    if (error) throw error;
  }

  /** OneDrive bağlantısını keser; kayıt tamamen silinmez (dosya kayıtları FK ile ona bağlı kalır). */
  async disconnectDrive(userId: string): Promise<void> {
    const account = await this.findByUserId(userId);
    if (!account) return;

    const refreshToken = await this.readRefreshToken(account.id);
    if (refreshToken) await this.oauth.revokeToken(refreshToken);

    this.accessTokenCache.delete(account.id);

    const { error } = await this.supabase.client
      .from("microsoft_accounts")
      .update({
        refresh_token_enc: null,
        root_folder_id: null,
        drive_revoked_at: new Date().toISOString(),
        scopes: account.scopes.filter((s) => s !== ONEDRIVE_SCOPE),
      })
      .eq("id", account.id);
    if (error) throw error;
  }

  private async readRefreshToken(accountId: string): Promise<string | undefined> {
    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .select("refresh_token_enc")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.refresh_token_enc) return undefined;

    try {
      return decryptMicrosoftToken(data.refresh_token_enc);
    } catch (err) {
      this.logger.error(`Refresh token çözülemedi (account=${accountId}): ${String(err)}`);
      await this.markRevoked(accountId);
      return undefined;
    }
  }

  async getAccessToken(accountId: string): Promise<string> {
    const cached = this.accessTokenCache.get(accountId);
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
      .from("microsoft_accounts")
      .update({ last_refreshed_at: new Date().toISOString() })
      .eq("id", accountId)
      .then(undefined, () => undefined);

    return result.accessToken;
  }

  /** Kullanıcının OneDrive'ı gerçekten kullanılabilir durumda mı? */
  isDriveReady(account: MicrosoftAccount | undefined): account is MicrosoftAccount {
    return Boolean(
      account && account.hasRefreshToken && !account.driveRevokedAt && account.scopes.includes(ONEDRIVE_SCOPE)
    );
  }
}
