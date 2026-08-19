import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { InstagramOAuthService, type InstagramProfile, type InstagramStatePayload } from "./instagram-oauth.service";
import { SocialMediaService, type SocialScope } from "./social-media.service";
import { SocialTokensService } from "./social-tokens.service";

/**
 * Instagram hesabının Projelio'ya bağlanması.
 *
 * Bağlantı, modüldeki bir `social_accounts` satırına iliştirilir — ayrı bir
 * "bağlı hesaplar" listesi kurmuyoruz. Sebep: kullanıcı hesabı zaten elle
 * eklemiş (kitlesini, tonunu, sorumlusunu yazmış) olabilir; bağlantı o kaydı
 * zenginleştirmeli, yanına ikinci bir satır koymamalı.
 *
 * Eşleme sırası:
 *   1. Aynı kapsamda aynı `external_account_id` → zaten bağlı, tazelenir
 *   2. Aynı kapsamda aynı kullanıcı adı (elle eklenmiş kayıt) → o kayda bağlanır
 *   3. Hiçbiri yoksa yeni kayıt açılır
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private supabase: SupabaseService,
    private oauth: InstagramOAuthService,
    private tokens: SocialTokensService,
    private social: SocialMediaService
  ) {}

  isConfigured(): boolean {
    return this.oauth.isConfigured();
  }

  /** "Instagram'ı bağla" düğmesinin gideceği adres. */
  async buildConnectUrl(
    scope: SocialScope,
    userId: string,
    next?: string
  ): Promise<{ configured: boolean; url: string | null }> {
    if (!this.isConfigured()) return { configured: false, url: null };
    // Bağlantıyı yalnızca modüle yazabilen biri kurabilir: yetkisiz bir üye
    // şirketin Instagram hesabını bağlayamamalı.
    await this.social.assertWritable(scope, userId);

    const state = this.oauth.signState({
      userId,
      organizationId: "organizationId" in scope ? scope.organizationId : undefined,
      departmentId: "organizationId" in scope ? scope.departmentId : undefined,
      jobId: "jobId" in scope ? scope.jobId : undefined,
      next,
    });
    return { configured: true, url: this.oauth.buildAuthUrl(state) };
  }

  /**
   * Meta'dan dönüşün işlenmesi.
   *
   * Kısa ömürlü jeton hiç saklanmaz: hemen uzun ömürlüye çevrilir. Aksi halde
   * kullanıcı bağlandıktan bir saat sonra sessizce kopardı.
   */
  async completeConnect(state: string, code: string): Promise<{ next?: string; accountId: string; username: string }> {
    const payload = this.oauth.verifyState(state);
    const scope = this.scopeFromState(payload);
    await this.social.assertWritable(scope, payload.userId);

    const short = await this.oauth.exchangeCode(code);
    const long = await this.oauth.exchangeLongLived(short.accessToken);
    const profile = await this.oauth.fetchProfile(long.accessToken);

    const accountId = await this.linkAccount(scope, payload.userId, profile, short.userId);
    await this.tokens.save(accountId, {
      accessToken: long.accessToken,
      expiresAt: new Date(Date.now() + long.expiresInSeconds * 1000),
      scopes: short.permissions,
    });

    await this.updateAccountRow(accountId, {
      provider: "instagram_login",
      connection_status: "connected",
      connection_error: null,
      external_account_id: profile.id,
      handle: profile.username,
      display_name: profile.name ?? null,
      avatar_url: profile.profilePictureUrl ?? null,
      follower_count: profile.followersCount ?? null,
      profile_url: `https://instagram.com/${profile.username}`,
      token_expires_at: new Date(Date.now() + long.expiresInSeconds * 1000).toISOString(),
      last_synced_at: new Date().toISOString(),
      active: true,
    });

    return { next: payload.next, accountId, username: profile.username };
  }

  /**
   * Bağlantıyı koparır.
   *
   * Hesap kaydı SİLİNMEZ, yalnızca `manual`'a döner: geçmiş gönderilerin hangi
   * hesaba gittiği ve hesabın kitle/ton notları kullanıcının emeği — bağlantı
   * kesildi diye kaybolmamalı.
   */
  async disconnect(accountId: string, userId: string): Promise<{ ok: true }> {
    const row = await this.accountRow(accountId);
    await this.social.assertWritable(this.social.scopeOfRow(row), userId);

    await this.tokens.remove(accountId);
    await this.updateAccountRow(accountId, {
      provider: "manual",
      connection_status: "manual",
      connection_error: null,
      external_account_id: null,
      token_expires_at: null,
    });
    return { ok: true };
  }

  /** Profil bilgisini (kullanıcı adı, takipçi) Instagram'dan tazeler. */
  async syncProfile(accountId: string): Promise<void> {
    const token = await this.tokens.read(accountId);
    if (!token) return;
    try {
      const profile = await this.oauth.fetchProfile(token.accessToken);
      await this.updateAccountRow(accountId, {
        handle: profile.username,
        follower_count: profile.followersCount ?? null,
        avatar_url: profile.profilePictureUrl ?? null,
        last_synced_at: new Date().toISOString(),
      });
    } catch (err) {
      // Profil tazeleme yayın kadar kritik değil: hata durumda hesabı
      // "kopuk" işaretlemiyoruz, yalnızca not düşüyoruz.
      this.logger.warn(`Instagram profili tazelenemedi (${accountId}): ${(err as Error).message}`);
    }
  }

  /**
   * Süresi yaklaşan jetonları yeniler.
   *
   * Instagram'da yenileme AYNI jetonu 60 gün daha uzatır; ayrı bir refresh
   * token yok. Süresi dolmuş jeton yenilenemez — bu yüzden eşik geniş.
   */
  async refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
    if (!this.isConfigured()) return { refreshed: 0, failed: 0 };

    const expiring = await this.tokens.findExpiring(10);
    let refreshed = 0;
    let failed = 0;

    for (const { accountId, token } of expiring) {
      const result = await this.oauth.refreshLongLived(token.accessToken);
      if ("invalid" in result) {
        failed++;
        await this.updateAccountRow(accountId, {
          connection_status: "expired",
          connection_error: result.message,
        });
        continue;
      }
      refreshed++;
      const expiresAt = new Date(Date.now() + result.expiresInSeconds * 1000);
      await this.tokens.save(accountId, {
        accessToken: result.accessToken,
        expiresAt,
        scopes: token.scopes,
      });
      await this.updateAccountRow(accountId, {
        connection_status: "connected",
        connection_error: null,
        token_expires_at: expiresAt.toISOString(),
      });
    }

    return { refreshed, failed };
  }

  // ============================================================ Yardımcılar

  private scopeFromState(payload: InstagramStatePayload): SocialScope {
    if (payload.jobId) return { jobId: payload.jobId };
    if (payload.organizationId) {
      return { organizationId: payload.organizationId, departmentId: payload.departmentId };
    }
    throw new BadRequestException("Bağlantı isteğinde kapsam yok");
  }

  private async accountRow(accountId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("social_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Hesap bulunamadı");
    return data;
  }

  private async updateAccountRow(accountId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.client
      .from("social_accounts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", accountId);
    if (error) throw error;
  }

  /** Bağlanan profili mevcut bir kayda iliştirir ya da yeni kayıt açar. */
  private async linkAccount(
    scope: SocialScope,
    userId: string,
    profile: InstagramProfile,
    externalId: string
  ): Promise<string> {
    const scopeColumns =
      "jobId" in scope
        ? { job_id: scope.jobId, organization_id: null, department_id: null }
        : { organization_id: scope.organizationId, job_id: null, department_id: scope.departmentId ?? null };

    const base = this.supabase.client
      .from("social_accounts")
      .select("id, external_account_id, handle")
      .eq("platform", "instagram")
      .is("archived_at", null);
    const scoped =
      "jobId" in scope ? base.eq("job_id", scope.jobId) : base.eq("organization_id", scope.organizationId);

    const { data: candidates, error } = await scoped;
    if (error) throw error;

    const byExternal = (candidates ?? []).find((a: any) => a.external_account_id === (profile.id || externalId));
    if (byExternal) return byExternal.id;

    // Elle eklenmiş kayıt: kullanıcı adı eşleşiyorsa onu bağlarız — aynı hesap
    // için ikinci bir satır açmak, geçmiş gönderileri iki kanala bölerdi.
    const byHandle = (candidates ?? []).find(
      (a: any) => a.handle?.toLowerCase() === profile.username.toLowerCase()
    );
    if (byHandle) return byHandle.id;

    const { data: created, error: insertError } = await this.supabase.client
      .from("social_accounts")
      .insert({
        ...scopeColumns,
        platform: "instagram",
        handle: profile.username,
        display_name: profile.name ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    return created.id;
  }
}
