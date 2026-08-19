import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  SocialAccount,
  SocialMediaOverview,
  SocialPost,
  SocialPostMedia,
  SocialPostTarget,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ModuleMembersService } from "../module-members/module-members.service";

/**
 * Sosyal Medya modülünün (pd_sosyal_medya) servisi.
 *
 * Diğer modüllerden farkı kendi tablolarını kullanması (bkz.
 * 054_social_media.sql): hesap yönetimi ve "aynı içerik birden çok kanalda"
 * ilişkisi module_records'ın tek jsonb sütununa sığmıyordu.
 *
 * Yetki kurgusu module_records ile birebir aynı: karar ModuleMembersService'te
 * tek yerde veriliyor (organizasyon sahibi > departman yöneticisi > modül
 * üyesi), burada kopyalanmıyor.
 */

export const SOCIAL_MODULE_KEY = "pd_sosyal_medya";

/** Kaydın sahibi: ya organizasyon (şirket departmanı) ya iş (serbest çalışan). */
export type SocialScope = { organizationId: string; departmentId?: string } | { jobId: string };

export interface SocialAccountInput {
  platform?: string;
  handle?: string;
  displayName?: string;
  profileUrl?: string;
  avatarUrl?: string;
  followerCount?: number;
  audienceNote?: string;
  toneNote?: string;
  postingFrequency?: string;
  color?: string;
  ownerUserId?: string | null;
  active?: boolean;
  departmentId?: string;
}

export interface SocialPostInput {
  title?: string;
  caption?: string;
  hashtags?: string;
  linkUrl?: string;
  firstComment?: string;
  contentType?: string;
  campaign?: string;
  status?: string;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  assigneeId?: string | null;
  reach?: number | null;
  engagement?: number | null;
  clicks?: number | null;
  resultNote?: string;
  departmentId?: string;
  /** Hangi hesaplarda yayımlanacak. Verilirse hedef listesi bununla değiştirilir. */
  accountIds?: string[];
  /** Kanala özel metinler: hesap id → metin. */
  captionOverrides?: Record<string, string>;
}

const PLATFORMS = new Set([
  "instagram",
  "facebook",
  "x",
  "linkedin",
  "tiktok",
  "youtube",
  "pinterest",
  "threads",
  "blog",
  "other",
]);

const CONTENT_TYPES = new Set([
  "image",
  "video",
  "carousel",
  "story",
  "reel",
  "text",
  "article",
  "poll",
  "other",
]);

const POST_STATUSES = new Set([
  "idea",
  "draft",
  "ready",
  "approved",
  "scheduled",
  "published",
  "failed",
  "cancelled",
]);

function mapAccount(row: any, ownerName?: string): SocialAccount {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    platform: row.platform,
    handle: row.handle,
    displayName: row.display_name ?? undefined,
    profileUrl: row.profile_url ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    followerCount: row.follower_count ?? undefined,
    audienceNote: row.audience_note ?? undefined,
    toneNote: row.tone_note ?? undefined,
    postingFrequency: row.posting_frequency ?? undefined,
    color: row.color ?? undefined,
    ownerUserId: row.owner_user_id ?? undefined,
    ownerName,
    provider: row.provider ?? "manual",
    connectionStatus: row.connection_status ?? "manual",
    connectionError: row.connection_error ?? undefined,
    externalAccountId: row.external_account_id ?? undefined,
    tokenExpiresAt: row.token_expires_at ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    active: row.active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
}

function mapTarget(row: any): SocialPostTarget {
  return {
    id: row.id,
    postId: row.post_id,
    accountId: row.account_id,
    captionOverride: row.caption_override ?? undefined,
    status: row.status ?? "pending",
    externalPostId: row.external_post_id ?? undefined,
    externalUrl: row.external_url ?? undefined,
    errorMessage: row.error_message ?? undefined,
    publishedAt: row.published_at ?? undefined,
    attemptedAt: row.attempted_at ?? undefined,
  };
}

function mapMedia(row: any): SocialPostMedia {
  // files satırı ilişkisel seçimle geldiyse (files(...)) gösterim
  // bilgilerini de taşırız; gelmediyse yalnızca referans döner.
  const file = row.files ?? undefined;
  return {
    id: row.id,
    postId: row.post_id,
    fileId: row.file_id,
    sortOrder: row.sort_order ?? 0,
    altText: row.alt_text ?? undefined,
    name: file?.name ?? undefined,
    mimeType: file?.mime_type ?? undefined,
    webViewLink: file?.web_view_link ?? undefined,
    iconLink: file?.icon_link ?? undefined,
  };
}

function mapPost(row: any, assigneeName?: string): SocialPost {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    title: row.title,
    caption: row.caption ?? undefined,
    hashtags: row.hashtags ?? undefined,
    linkUrl: row.link_url ?? undefined,
    firstComment: row.first_comment ?? undefined,
    contentType: row.content_type ?? "image",
    campaign: row.campaign ?? undefined,
    status: row.status ?? "draft",
    scheduledAt: row.scheduled_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    assigneeId: row.assignee_id ?? undefined,
    assigneeName,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    taskId: row.task_id ?? undefined,
    reach: row.reach ?? undefined,
    engagement: row.engagement ?? undefined,
    clicks: row.clicks ?? undefined,
    resultNote: row.result_note ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    targets: (row.social_post_targets ?? []).map(mapTarget),
    media: (row.social_post_media ?? []).map(mapMedia).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** Boş metni null'a çevirir: veritabanında "" ile NULL aynı şey sayılmasın. */
function nullable(value: string | undefined | null): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

@Injectable()
export class SocialMediaService {
  constructor(
    private supabase: SupabaseService,
    private moduleMembers: ModuleMembersService
  ) {}

  // ============================================================ Yetki

  private async access(scope: SocialScope, userId?: string) {
    if ("jobId" in scope) return this.moduleMembers.resolveJobAccess(scope.jobId, SOCIAL_MODULE_KEY, userId);
    return this.moduleMembers.resolveOrganizationAccess(
      scope.organizationId,
      SOCIAL_MODULE_KEY,
      userId,
      scope.departmentId
    );
  }

  private async assertCanRead(scope: SocialScope, userId?: string): Promise<void> {
    if (!userId) return;
    const access = await this.access(scope, userId);
    if (!access.canRead) throw new ForbiddenException("Bu modülü görme yetkiniz yok");
  }

  /**
   * Yazma yetkisinin dışarıya açık hali.
   *
   * Instagram bağlama akışı (InstagramService) da aynı kapıdan geçmeli:
   * "hesabı bu kapsama ekleyebilir misin" sorusunun cevabı iki yerde ayrı ayrı
   * hesaplanırsa er geç ayrışır.
   */
  async assertWritable(scope: SocialScope, userId?: string): Promise<void> {
    await this.assertCanWrite(scope, userId);
  }

  /** Kaydın sahibinden kapsamı türetir — dışarıdan da sorulabilsin diye açık. */
  scopeOfRow(row: { organization_id?: string | null; job_id?: string | null; department_id?: string | null }): SocialScope {
    return this.scopeOf(row);
  }

  private async assertCanWrite(scope: SocialScope, userId?: string): Promise<void> {
    if (!userId) return;
    const access = await this.access(scope, userId);
    if (!access.canWrite) {
      throw new ForbiddenException(
        "Sosyal medya kayıtlarını yalnızca organizasyon sahibi, departman yöneticisi veya modüle atanmış kişiler düzenleyebilir"
      );
    }
  }

  /** Kaydın sahibinden kapsamı türetir — düzenleme/silme yetkisi buradan sorulur. */
  private scopeOf(row: { organization_id?: string | null; job_id?: string | null; department_id?: string | null }): SocialScope {
    return row.job_id
      ? { jobId: row.job_id }
      : { organizationId: row.organization_id as string, departmentId: row.department_id ?? undefined };
  }

  private scopeColumns(scope: SocialScope): Record<string, unknown> {
    return "jobId" in scope
      ? { job_id: scope.jobId, organization_id: null, department_id: null }
      : {
          organization_id: scope.organizationId,
          job_id: null,
          department_id: scope.departmentId ?? null,
        };
  }

  // ============================================================ Okuma

  /**
   * Modül açılışının tek isteği.
   *
   * Hesaplar ve gönderiler ayrı uçlardan çekilseydi panel iki ayrı yükleme
   * durumu yönetmek zorunda kalırdı; takvim de hesap renkleri gelmeden bir kez
   * renksiz çizilirdi.
   */
  async overview(scope: SocialScope, userId?: string): Promise<SocialMediaOverview> {
    await this.assertCanRead(scope, userId);
    const [accounts, posts] = await Promise.all([this.listAccounts(scope), this.listPosts(scope)]);
    return { accounts, posts };
  }

  private scopeFilter(query: any, scope: SocialScope) {
    return "jobId" in scope ? query.eq("job_id", scope.jobId) : query.eq("organization_id", scope.organizationId);
  }

  /**
   * Kullanıcı adlarını tek sorguda çözer.
   *
   * Hesap sorumlusu ve içerik sorumlusu için satır satır sorgu atmak 40
   * gönderilik bir ayda 40 istek olurdu.
   */
  private async resolveUserNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
    if (unique.length === 0) return new Map();
    const { data } = await this.supabase.client.from("users").select("id, full_name").in("id", unique);
    return new Map((data ?? []).map((u: any) => [u.id, u.full_name as string]));
  }

  async listAccounts(scope: SocialScope): Promise<SocialAccount[]> {
    const { data, error } = await this.scopeFilter(
      this.supabase.client.from("social_accounts").select("*").is("archived_at", null),
      scope
    ).order("created_at", { ascending: true });
    if (error) throw error;
    const rows = data ?? [];
    const names = await this.resolveUserNames(rows.map((r: any) => r.owner_user_id));
    return rows.map((r: any) => mapAccount(r, r.owner_user_id ? names.get(r.owner_user_id) : undefined));
  }

  async listPosts(scope: SocialScope): Promise<SocialPost[]> {
    const { data, error } = await this.scopeFilter(
      this.supabase.client
        .from("social_posts")
        .select(
          "*, social_post_targets(*), social_post_media(*, files(name, mime_type, web_view_link, icon_link))"
        )
        .is("archived_at", null),
      scope
    ).order("scheduled_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    const rows = data ?? [];
    const names = await this.resolveUserNames(rows.map((r: any) => r.assignee_id));
    return rows.map((r: any) => mapPost(r, r.assignee_id ? names.get(r.assignee_id) : undefined));
  }

  async findPost(id: string, userId?: string): Promise<SocialPost> {
    const { data, error } = await this.supabase.client
      .from("social_posts")
      .select(
        "*, social_post_targets(*), social_post_media(*, files(name, mime_type, web_view_link, icon_link))"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Gönderi bulunamadı");
    await this.assertCanRead(this.scopeOf(data), userId);
    const names = await this.resolveUserNames([data.assignee_id]);
    return mapPost(data, data.assignee_id ? names.get(data.assignee_id) : undefined);
  }

  // ============================================================ Hesaplar

  async createAccount(scope: SocialScope, input: SocialAccountInput, userId?: string): Promise<SocialAccount> {
    await this.assertCanWrite(scope, userId);
    if (!input.platform || !PLATFORMS.has(input.platform)) throw new BadRequestException("Geçerli bir platform seçin");
    if (!input.handle?.trim()) throw new BadRequestException("Hesap adı gerekli");

    const { data, error } = await this.supabase.client
      .from("social_accounts")
      .insert({
        ...this.scopeColumns(scope),
        platform: input.platform,
        // Kullanıcı "@" ile de yazabilir; tek biçimde saklıyoruz.
        handle: input.handle.trim().replace(/^@/, ""),
        display_name: nullable(input.displayName) ?? null,
        profile_url: nullable(input.profileUrl) ?? null,
        avatar_url: nullable(input.avatarUrl) ?? null,
        follower_count: input.followerCount ?? null,
        audience_note: nullable(input.audienceNote) ?? null,
        tone_note: nullable(input.toneNote) ?? null,
        posting_frequency: nullable(input.postingFrequency) ?? null,
        color: nullable(input.color) ?? null,
        owner_user_id: input.ownerUserId || null,
        created_by: userId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAccount(data);
  }

  async updateAccount(id: string, input: SocialAccountInput, userId?: string): Promise<SocialAccount> {
    const existing = await this.rawAccount(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.platform !== undefined) {
      if (!PLATFORMS.has(input.platform)) throw new BadRequestException("Geçerli bir platform seçin");
      patch.platform = input.platform;
    }
    if (input.handle !== undefined) {
      if (!input.handle.trim()) throw new BadRequestException("Hesap adı gerekli");
      patch.handle = input.handle.trim().replace(/^@/, "");
    }
    if (input.displayName !== undefined) patch.display_name = nullable(input.displayName);
    if (input.profileUrl !== undefined) patch.profile_url = nullable(input.profileUrl);
    if (input.avatarUrl !== undefined) patch.avatar_url = nullable(input.avatarUrl);
    if (input.followerCount !== undefined) patch.follower_count = input.followerCount;
    if (input.audienceNote !== undefined) patch.audience_note = nullable(input.audienceNote);
    if (input.toneNote !== undefined) patch.tone_note = nullable(input.toneNote);
    if (input.postingFrequency !== undefined) patch.posting_frequency = nullable(input.postingFrequency);
    if (input.color !== undefined) patch.color = nullable(input.color);
    if (input.ownerUserId !== undefined) patch.owner_user_id = input.ownerUserId || null;
    if (input.active !== undefined) patch.active = input.active;

    const { data, error } = await this.supabase.client
      .from("social_accounts")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Hesap bulunamadı");
    return mapAccount(data);
  }

  /**
   * Hesabı arşivler.
   *
   * Silmiyoruz: geçmiş gönderilerin hangi hesapta yayımlandığı bilgisi
   * kaybolmamalı. Arşivlenen hesap listelerde görünmez, yeni gönderilerde
   * seçilemez, ama eski hedef satırları yerinde kalır.
   */
  async archiveAccount(id: string, userId?: string): Promise<{ ok: true }> {
    const existing = await this.rawAccount(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);
    const { error } = await this.supabase.client
      .from("social_accounts")
      .update({ archived_at: new Date().toISOString(), active: false })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  }

  private async rawAccount(id: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("social_accounts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Hesap bulunamadı");
    return data;
  }

  // ============================================================ Gönderiler

  async createPost(scope: SocialScope, input: SocialPostInput, userId?: string): Promise<SocialPost> {
    await this.assertCanWrite(scope, userId);
    if (!input.title?.trim()) throw new BadRequestException("Başlık gerekli");
    this.assertEnums(input);

    const { data, error } = await this.supabase.client
      .from("social_posts")
      .insert({
        ...this.scopeColumns(scope),
        title: input.title.trim(),
        caption: nullable(input.caption) ?? null,
        hashtags: nullable(input.hashtags) ?? null,
        link_url: nullable(input.linkUrl) ?? null,
        first_comment: nullable(input.firstComment) ?? null,
        content_type: input.contentType ?? "image",
        campaign: nullable(input.campaign) ?? null,
        status: input.status ?? "draft",
        scheduled_at: input.scheduledAt || null,
        assignee_id: input.assigneeId || null,
        created_by: userId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;

    if (input.accountIds?.length) {
      await this.replaceTargets(data.id, input.accountIds, input.captionOverrides ?? {});
    }
    await this.syncTargetSchedule(data.id, data.scheduled_at, data.status);
    return this.findPost(data.id, userId);
  }

  async updatePost(id: string, input: SocialPostInput, userId?: string): Promise<SocialPost> {
    const existing = await this.rawPost(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);
    this.assertEnums(input);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) {
      if (!input.title.trim()) throw new BadRequestException("Başlık gerekli");
      patch.title = input.title.trim();
    }
    if (input.caption !== undefined) patch.caption = nullable(input.caption);
    if (input.hashtags !== undefined) patch.hashtags = nullable(input.hashtags);
    if (input.linkUrl !== undefined) patch.link_url = nullable(input.linkUrl);
    if (input.firstComment !== undefined) patch.first_comment = nullable(input.firstComment);
    if (input.contentType !== undefined) patch.content_type = input.contentType;
    if (input.campaign !== undefined) patch.campaign = nullable(input.campaign);
    if (input.scheduledAt !== undefined) patch.scheduled_at = input.scheduledAt || null;
    if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId || null;
    if (input.reach !== undefined) patch.reach = input.reach;
    if (input.engagement !== undefined) patch.engagement = input.engagement;
    if (input.clicks !== undefined) patch.clicks = input.clicks;
    if (input.resultNote !== undefined) patch.result_note = nullable(input.resultNote);

    if (input.status !== undefined) {
      patch.status = input.status;
      // "Yayımlandı" işaretlendiğinde yayın anı bir kez damgalanır: kullanıcı
      // durumu ileri geri aldığında ilk yayın tarihi kaybolmasın.
      if (input.status === "published" && !existing.published_at) {
        patch.published_at = new Date().toISOString();
      }
      if (input.status === "approved" && !existing.approved_at) {
        patch.approved_at = new Date().toISOString();
        patch.approved_by = userId ?? null;
      }
    }

    const { data, error } = await this.supabase.client
      .from("social_posts")
      .update(patch)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Gönderi bulunamadı");

    if (input.accountIds) {
      await this.replaceTargets(id, input.accountIds, input.captionOverrides ?? {});
    }
    await this.syncTargetSchedule(
      id,
      input.scheduledAt !== undefined ? (input.scheduledAt || null) : (existing.scheduled_at ?? null),
      (patch.status as string) ?? existing.status
    );
    return this.findPost(id, userId);
  }

  /**
   * Yayın kuyruğunun okuduğu saat.
   *
   * Gönderinin `scheduled_at`'ı hedeflere KOPYALANIR (bkz. 058). İki sebep:
   *
   *  1. Yayımlanmış bir hedefin geçmişi, gönderi sonradan başka bir tarihe
   *     çekildiğinde bozulmamalı — kopya olduğu için bozulmuyor.
   *  2. Kuyruk tek tabloda, tek indeksle çalışıyor; her turda gönderilere
   *     join atmıyor.
   *
   * Kuyruğa yalnızca yayın kararı verilmiş içerik girer: taslak ve fikir
   * aşamasındaki bir gönderi, tarihi geçmiş olsa bile kendiliğinden çıkmaz.
   */
  private async syncTargetSchedule(
    postId: string,
    scheduledAt: string | null,
    status: string
  ): Promise<void> {
    const queueable = status === "scheduled" || status === "approved" || status === "ready";
    const publishAt = queueable ? scheduledAt : null;

    const { error } = await this.supabase.client
      .from("social_post_targets")
      .update({ publish_at: publishAt })
      .eq("post_id", postId)
      // Yayımlanmış ya da kalıcı hata almış hedeflere dokunulmaz: ilki geçmiş,
      // ikincisi kullanıcının müdahalesini bekliyor.
      .in("status", ["pending", "scheduled"]);
    if (error) throw error;
  }

  /** Takvimde sürükleyerek tarih değiştirme — tek alan, tek istek. */
  async reschedule(id: string, scheduledAt: string | null, userId?: string): Promise<SocialPost> {
    return this.updatePost(id, { scheduledAt }, userId);
  }

  async archivePost(id: string, userId?: string): Promise<{ ok: true }> {
    const existing = await this.rawPost(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);
    const { error } = await this.supabase.client
      .from("social_posts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  }

  async restorePost(id: string, userId?: string): Promise<SocialPost> {
    const existing = await this.rawPost(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);
    const { error } = await this.supabase.client
      .from("social_posts")
      .update({ archived_at: null })
      .eq("id", id);
    if (error) throw error;
    return this.findPost(id, userId);
  }

  private assertEnums(input: SocialPostInput): void {
    if (input.contentType && !CONTENT_TYPES.has(input.contentType)) {
      throw new BadRequestException("Geçersiz içerik türü");
    }
    if (input.status && !POST_STATUSES.has(input.status)) {
      throw new BadRequestException("Geçersiz durum");
    }
  }

  private async rawPost(id: string): Promise<any> {
    const { data, error } = await this.supabase.client.from("social_posts").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Gönderi bulunamadı");
    return data;
  }

  /**
   * Hedef listesini istenen hâle getirir.
   *
   * Hepsini silip yeniden yazmıyoruz: yayımlanmış bir hedefin dış gönderi
   * kimliği ve yayın tarihi vardır, silinirse "bu içerik nerede yayımlandı"
   * bilgisi kaybolur. Yalnızca listeden çıkarılanlar silinir, kalanların
   * kanala özel metni güncellenir, yeni gelenler eklenir.
   */
  private async replaceTargets(
    postId: string,
    accountIds: string[],
    overrides: Record<string, string>
  ): Promise<void> {
    const { data: existing, error } = await this.supabase.client
      .from("social_post_targets")
      .select("id, account_id")
      .eq("post_id", postId);
    if (error) throw error;

    const wanted = new Set(accountIds);
    const current = new Map((existing ?? []).map((t: any) => [t.account_id as string, t.id as string]));

    const removed = (existing ?? []).filter((t: any) => !wanted.has(t.account_id)).map((t: any) => t.id);
    if (removed.length > 0) {
      const { error: delError } = await this.supabase.client
        .from("social_post_targets")
        .delete()
        .in("id", removed);
      if (delError) throw delError;
    }

    const added = accountIds.filter((id) => !current.has(id));
    if (added.length > 0) {
      const { error: insError } = await this.supabase.client.from("social_post_targets").insert(
        added.map((accountId) => ({
          post_id: postId,
          account_id: accountId,
          caption_override: overrides[accountId]?.trim() || null,
        }))
      );
      if (insError) throw insError;
    }

    for (const accountId of accountIds) {
      const targetId = current.get(accountId);
      if (!targetId) continue;
      const { error: updError } = await this.supabase.client
        .from("social_post_targets")
        .update({ caption_override: overrides[accountId]?.trim() || null })
        .eq("id", targetId);
      if (updError) throw updError;
    }
  }

  // ============================================================ Medya

  /**
   * Gönderiye dosya iliştirir.
   *
   * Dosyanın kendisi Projelio'nun mevcut dosya altyapısında (Drive/OneDrive)
   * durur — buraya kopyalanmaz. Böylece görsel dosya ekranında da görünür ve
   * paylaşım izinleri tek yerden yönetilir.
   */
  async attachMedia(
    postId: string,
    body: { fileId?: string; altText?: string },
    userId?: string
  ): Promise<SocialPost> {
    const post = await this.rawPost(postId);
    await this.assertCanWrite(this.scopeOf(post), userId);
    if (!body.fileId) throw new BadRequestException("fileId gerekli");

    const { data: file } = await this.supabase.client
      .from("files")
      .select("id")
      .eq("id", body.fileId)
      .maybeSingle();
    if (!file) throw new NotFoundException("Dosya bulunamadı");

    const { data: last } = await this.supabase.client
      .from("social_post_media")
      .select("sort_order")
      .eq("post_id", postId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = ((last?.[0]?.sort_order as number) ?? -1) + 1;

    const { error } = await this.supabase.client.from("social_post_media").upsert(
      {
        post_id: postId,
        file_id: body.fileId,
        sort_order: nextOrder,
        alt_text: nullable(body.altText) ?? null,
      },
      { onConflict: "post_id,file_id" }
    );
    if (error) throw error;
    return this.findPost(postId, userId);
  }

  async detachMedia(mediaId: string, userId?: string): Promise<{ ok: true }> {
    const { data: media, error } = await this.supabase.client
      .from("social_post_media")
      .select("id, post_id")
      .eq("id", mediaId)
      .maybeSingle();
    if (error) throw error;
    if (!media) throw new NotFoundException("Medya bulunamadı");

    const post = await this.rawPost(media.post_id);
    await this.assertCanWrite(this.scopeOf(post), userId);
    // Yalnızca bağ koparılır; dosya Drive'da ve dosya listesinde kalır.
    const { error: delError } = await this.supabase.client
      .from("social_post_media")
      .delete()
      .eq("id", mediaId);
    if (delError) throw delError;
    return { ok: true };
  }
}
