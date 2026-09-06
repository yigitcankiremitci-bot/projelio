import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { DriveNotConnectedError, DriveReauthRequiredError } from "../google/google-accounts.service";
import {
  DRIVE_CONNECT_SCOPES,
  MAIL_CONNECT_SCOPES,
  MAIL_SCOPES,
  ONEDRIVE_SCOPE,
  MicrosoftOAuthService,
} from "./microsoft-oauth.service";
import { decryptMicrosoftToken, encryptMicrosoftToken } from "./microsoft-token-crypto.util";
import { TekUcus } from "../../common/tek-ucus";

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
  /** Kullanıcının verdiği ad ("Şirket OneDrive'ı"). */
  label?: string;
  /** Bu hesapla Microsoft ile giriş yapılabilir mi (bkz. migration 088). */
  isLoginIdentity: boolean;
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
    label: row.label ?? undefined,
    // Migration 088 öncesi satırlarda kolon yok; eski davranış "tek hesap = giriş kimliği".
    isLoginIdentity: row.is_login_identity ?? true,
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

  /**
   * Kullanıcının VARSAYILAN Microsoft hesabı (bkz. GoogleAccountsService.findByUserId
   * — aynı gerekçe: artık kullanıcı başına birden fazla hesap olabilir).
   *
   * Posta modülü de buradan besleniyor: kutu bağlanırken hangi hesabın
   * kullanılacağı bu sıralamaya göre belirlenir.
   */
  async findByUserId(userId: string): Promise<MicrosoftAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .select()
      .eq("user_id", userId)
      .order("is_login_identity", { ascending: false })
      .order("connected_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  /** Kullanıcının bağlı BÜTÜN Microsoft hesapları. */
  async listByUserId(userId: string): Promise<MicrosoftAccount[]> {
    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .select()
      .eq("user_id", userId)
      .order("connected_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapAccount);
  }

  /** Kullanıcının GİRİŞ kimliği olan Microsoft hesabı (depo hesapları giriş açmaz). */
  async findLoginIdentity(userId: string): Promise<MicrosoftAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .select()
      .eq("user_id", userId)
      .eq("is_login_identity", true)
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
    /** Bkz. GoogleAccountsService.upsert — verilmezse ilk hesap giriş kimliği olur. */
    isLoginIdentity?: boolean;
    label?: string;
  }): Promise<MicrosoftAccount> {
    const existing = await this.findByMsSub(params.msSub);

    const patch: Record<string, unknown> = {
      user_id: params.userId,
      ms_sub: params.msSub,
      email: params.email,
      scopes: params.scopes,
    };
    // Yalnızca gerçekten fotoğraf geldiyse yazılır: her upsert'te `null`
    // basılsaydı, fotoğraf taşımayan bir akış (ör. giriş) daha önce kaydedilmiş
    // fotoğrafı silerdi.
    if (params.pictureUrl !== undefined) patch.picture_url = params.pictureUrl;
    if (params.label !== undefined) patch.label = params.label || null;

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
      this.clearTokenCache(existing.id);
      return mapAccount(data);
    }

    patch.is_login_identity = params.isLoginIdentity ?? !(await this.findLoginIdentity(params.userId));

    const { data, error } = await this.supabase.client
      .from("microsoft_accounts")
      .insert(patch)
      .select()
      .single();
    if (error) throw error;
    return mapAccount(data);
  }

  async setLabel(accountId: string, label: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("microsoft_accounts")
      .update({ label: label.trim() || null })
      .eq("id", accountId);
    if (error) throw error;
  }

  async setRootFolderId(accountId: string, folderId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("microsoft_accounts")
      .update({ root_folder_id: folderId })
      .eq("id", accountId);
    if (error) throw error;
  }

  async markRevoked(accountId: string): Promise<void> {
    this.clearTokenCache(accountId);
    const { error } = await this.supabase.client
      .from("microsoft_accounts")
      .update({ drive_revoked_at: new Date().toISOString() })
      .eq("id", accountId);
    if (error) throw error;
  }

  /**
   * OneDrive bağlantısını keser; kayıt tamamen silinmez (dosya kayıtları FK ile
   * ona bağlı kalır).
   *
   * POSTA HÂLÂ BAĞLIYSA refresh token KORUNUR. Aynı Microsoft hesabı iki ayrı
   * şeye izin vermiş olabiliyor (depolama + posta); "OneDrive'ı kaldır" demek
   * "gelen kutumu da kapat" demek değildir. Yalnızca depolamaya ait izinler ve
   * kök klasör temizlenir.
   */
  async disconnectDrive(userId: string, accountId?: string): Promise<void> {
    const account = accountId ? await this.findById(accountId) : await this.findByUserId(userId);
    if (!account) return;
    if (account.userId !== userId) throw new BadRequestException("Bu hesap size ait değil.");

    // `: boolean` şart: isMailReady bir tip koruyucusu (`account is MicrosoftAccount`)
    // ve TS bunu takma ad üzerinden daraltıyor — açık anotasyon olmadan
    // `!mailStillConnected` dalında hesap never'a düşüyor.
    const target: MicrosoftAccount = account;
    const mailStillConnected: boolean = this.isMailReady(target);
    const refreshToken = await this.readRefreshToken(target.id);
    if (refreshToken && !mailStillConnected) await this.oauth.revokeToken(refreshToken);

    this.clearTokenCache(target.id);

    // Ne giriş kimliği ne de posta için gerekli olan bir depo hesabı: satırı
    // tutmanın anlamı yok. FK kısıtı (on delete restrict) hâlâ dosya saklayan
    // bir hesabı silmemizi engeller.
    if (!target.isLoginIdentity && !mailStillConnected) {
      const { error: delError } = await this.supabase.client
        .from("microsoft_accounts")
        .delete()
        .eq("id", target.id);
      if (delError && (delError as any).code === "23503") {
        throw new BadRequestException(
          "Bu hesapta saklanan dosyalar var. Önce ilgili şirket/departman için başka bir depo hesabı seçin."
        );
      }
      if (delError) throw delError;
      return;
    }

    const { error } = await this.supabase.client
      .from("microsoft_accounts")
      .update({
        refresh_token_enc: mailStillConnected ? undefined : null,
        root_folder_id: null,
        drive_revoked_at: mailStillConnected ? null : new Date().toISOString(),
        scopes: target.scopes.filter((s) => s !== ONEDRIVE_SCOPE),
      })
      .eq("id", target.id);
    if (error) throw error;
  }

  /**
   * Posta bağlantısını keser.
   *
   * Simetrik: depolama hâlâ bağlıysa jeton korunur, yalnızca posta izinleri
   * listeden düşer. İkisi de kalmadıysa jeton silinir.
   */
  async disconnectMail(accountId: string): Promise<void> {
    const account = await this.findById(accountId);
    if (!account) return;

    const driveStillConnected = this.isDriveReady(account);
    this.clearTokenCache(account.id);

    const { error } = await this.supabase.client
      .from("microsoft_accounts")
      .update({
        refresh_token_enc: driveStillConnected ? undefined : null,
        scopes: account.scopes.filter((s) => !MAIL_SCOPES.includes(s)),
      })
      .eq("id", account.id);
    if (error) throw error;
  }

  /** Bir hesabın bütün izin kümeleri için önbelleğini temizler. */
  private clearTokenCache(accountId: string): void {
    for (const key of this.accessTokenCache.keys()) {
      if (key.startsWith(`${accountId}::`)) this.accessTokenCache.delete(key);
    }
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

  /**
   * @param scopes Hangi izinler için jeton isteniyor. Verilmezse OneDrive
   * kümesi — bu metot eskiden yalnızca depolama için çağrılıyordu ve mevcut
   * çağrı yerleri değişmesin. Posta için MAIL_CONNECT_SCOPES geçilir.
   */
  async getAccessToken(accountId: string, scopes?: string[]): Promise<string> {
    const requested = scopes ?? DRIVE_CONNECT_SCOPES;
    // Önbellek anahtarına izin kümesi de girer: OneDrive için alınmış bir jeton
    // posta uçlarında 403 döner, aynı kutuda tutulursa sessiz bir hata olur.
    const cacheKey = `${accountId}::${requested.join(" ")}`;

    const cached = this.accessTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    // Aynı hesap+izin kümesi için EŞZAMANLI yenileme yapılmaz.
    //
    // Google tarafındaki (google-accounts.service.ts) ile aynı gerekçe, ama burada
    // sonucu daha ağır: Azure AD eşzamanlı yenileme isteklerine kısıtlama (throttling)
    // uyguluyor ve refresh token rotasyonunda son yazan kazandığı için diğer
    // isteklerin jetonu geçersizleşiyor — kullanıcı sebepsiz "yeniden bağlanın" görür.
    //
    // Kilit anahtarı önbellekle AYNI: izin kümesi farklıysa jeton da farklı,
    // ikisi birbirini beklememeli.
    return this.tekUcus.calistir(cacheKey, () => this.refreshAccessTokenNow(accountId, requested, cacheKey));
  }

  /** Hesap+izin kümesi başına tek yenileme (bkz. common/tek-ucus.ts). */
  private readonly tekUcus = new TekUcus<string>();

  private async refreshAccessTokenNow(accountId: string, requested: string[], cacheKey: string): Promise<string> {
    const account = await this.findById(accountId);
    if (!account) throw new DriveNotConnectedError();
    if (account.driveRevokedAt) throw new DriveReauthRequiredError();

    const refreshToken = await this.readRefreshToken(accountId);
    if (!refreshToken) throw new DriveNotConnectedError();

    const result = await this.oauth.refreshAccessToken(refreshToken, requested);
    if ("invalidGrant" in result) {
      await this.markRevoked(accountId);
      throw new DriveReauthRequiredError();
    }

    this.accessTokenCache.set(cacheKey, {
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

  /** Posta okuma/gönderme izinleri verilmiş mi? */
  isMailReady(account: MicrosoftAccount | undefined): account is MicrosoftAccount {
    return Boolean(
      account &&
        account.hasRefreshToken &&
        !account.driveRevokedAt &&
        MAIL_SCOPES.every((s) => account.scopes.includes(s))
    );
  }

  /** Posta uçlarının kullanacağı erişim jetonu — doğru izin kümesiyle. */
  mailAccessToken(accountId: string): Promise<string> {
    return this.getAccessToken(accountId, MAIL_CONNECT_SCOPES);
  }
}
