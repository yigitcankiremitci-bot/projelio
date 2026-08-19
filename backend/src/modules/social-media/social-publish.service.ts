import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { InstagramPublishService, PublishError } from "./instagram-publish.service";
import { buildCaption, mediaFileIds } from "./publish-format";
import { SocialMediaService, type SocialScope } from "./social-media.service";

/**
 * Yayının orkestrasyonu: kim, neyi, hangi hesaba, ne zaman.
 *
 * Platforma özel her şey InstagramPublishService'te; burada platformdan
 * bağımsız kurallar var — yetki, metin birleştirme, yeniden deneme, durum
 * geçişleri ve bildirim. LinkedIn/X eklendiğinde bu dosya bir `switch` kazanır,
 * yeniden yazılmaz.
 *
 * YAYIN HEDEF BAZINDA YÜRÜR. Üç hesaba giden bir içerikte biri hata verdiğinde
 * diğer ikisi yayımlanmış olmalı; "gönderi başarısız" demek yanlış olurdu.
 */

/** Geçici hatada bekleme: 2, 4, 8… dakika, en fazla 6 saat. */
function backoffMs(attemptCount: number): number {
  return Math.min(2 ** attemptCount * 60_000, 6 * 60 * 60 * 1000);
}

/** Bu kadar denemeden sonra geçici hata da kalıcı sayılır. */
const MAX_ATTEMPTS = 6;

interface TargetContext {
  target: any;
  post: any;
  account: any;
}

@Injectable()
export class SocialPublishService {
  private readonly logger = new Logger(SocialPublishService.name);

  constructor(
    private supabase: SupabaseService,
    private instagram: InstagramPublishService,
    private social: SocialMediaService,
    private notifications: NotificationsService
  ) {}

  // ============================================================ Dış uçlar

  /** "Şimdi paylaş": gönderinin yayımlanmamış bütün hedeflerini dener. */
  async publishPostNow(postId: string, userId: string): Promise<{ published: number; failed: number }> {
    const post = await this.loadPost(postId);
    await this.social.assertWritable(this.scopeOfPost(post), userId);

    const targets = (post.social_post_targets ?? []).filter((t: any) => t.status !== "published");
    if (targets.length === 0) throw new BadRequestException("Yayımlanacak kanal yok");

    let published = 0;
    let failed = 0;
    for (const target of targets) {
      const ok = await this.runTarget({ target, post, account: await this.loadAccount(target.account_id) }, false);
      ok ? published++ : failed++;
    }
    await this.syncPostStatus(postId);
    return { published, failed };
  }

  /** Tek bir kanalı yeniden dener (hata sonrası "tekrar dene" düğmesi). */
  async publishTargetNow(targetId: string, userId: string): Promise<{ ok: boolean }> {
    const { target, post } = await this.loadTarget(targetId);
    await this.social.assertWritable(this.scopeOfPost(post), userId);

    const ok = await this.runTarget({ target, post, account: await this.loadAccount(target.account_id) }, false);
    await this.syncPostStatus(post.id);
    return { ok };
  }

  /**
   * Kuyruk turu: vakti gelmiş hedefleri yayımlar.
   *
   * Tek turda işlenen hedef sayısı sınırlı — bir kullanıcının 200 gönderilik
   * takvimi diğer herkesin yayınını geciktirmesin ve Meta'nın kotası tek turda
   * tüketilmesin.
   */
  async runQueue(limit = 20): Promise<{ published: number; failed: number; skipped: number }> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .from("social_post_targets")
      .select("*")
      .in("status", ["pending", "scheduled"])
      .not("publish_at", "is", null)
      .lte("publish_at", now)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .order("publish_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    let published = 0;
    let failed = 0;
    let skipped = 0;

    for (const target of data ?? []) {
      const post = await this.loadPost(target.post_id).catch(() => null);
      const account = await this.loadAccount(target.account_id).catch(() => null);
      // Gönderi arşivlendiyse ya da iptal edildiyse kuyruk onu yayımlamaz;
      // kullanıcının "vazgeçtim" kararı zamanlayıcıdan güçlüdür.
      if (!post || !account || post.archived_at || post.status === "cancelled") {
        await this.updateTarget(target.id, { status: "skipped", publish_at: null });
        skipped++;
        continue;
      }
      const ok = await this.runTarget({ target, post, account }, true);
      ok ? published++ : failed++;
      await this.syncPostStatus(post.id);
    }

    return { published, failed, skipped };
  }

  // ============================================================ Çekirdek

  private async runTarget(ctx: TargetContext, automatic: boolean): Promise<boolean> {
    const { target, post, account } = ctx;

    try {
      if (account.platform !== "instagram") {
        throw new PublishError(
          `${account.platform} için otomatik yayın henüz yok; içerik elle paylaşılmalı.`,
          true
        );
      }
      if (account.connection_status !== "connected" || !account.external_account_id) {
        throw new PublishError("Hesap Instagram'a bağlı değil. Hesaplar sekmesinden bağlayın.", true);
      }

      await this.updateTarget(target.id, { attempted_at: new Date().toISOString() });

      const result = await this.instagram.publish({
        accountId: account.id,
        externalAccountId: account.external_account_id,
        caption: buildCaption(post, target),
        mediaFileIds: mediaFileIds(post),
        // Dosyalar kullanıcı yetkisiyle okunur; sistem adına arka kapı yok.
        // Zamanlanmış yayında içeriği oluşturan kişi adına hareket edilir.
        actingUserId: post.created_by ?? post.assignee_id,
        existingContainerId: target.container_id,
        onContainer: (containerId) => this.updateTarget(target.id, { container_id: containerId }),
      });

      await this.updateTarget(target.id, {
        status: "published",
        external_post_id: result.externalPostId,
        external_url: result.externalUrl ?? null,
        published_at: new Date().toISOString(),
        error_message: null,
        next_attempt_at: null,
        publish_at: null,
        container_id: null,
      });

      // Başarı bildirimi yalnızca OTOMATİK yayında: kullanıcı düğmeye kendi
      // bastıysa sonucu zaten ekranda görüyor, bildirim gürültü olur.
      if (automatic) {
        await this.notify(
          post,
          "social_post_published",
          "Instagram gönderisi yayımlandı",
          `"${post.title}" @${account.handle} hesabında yayımlandı.`,
          result.externalUrl
        );
      }
      return true;
    } catch (err) {
      await this.handleFailure(ctx, err, automatic);
      return false;
    }
  }

  private async handleFailure(ctx: TargetContext, err: unknown, automatic: boolean): Promise<void> {
    const { target, post, account } = ctx;
    const attempts = (target.attempt_count ?? 0) + 1;
    const publishError = err instanceof PublishError ? err : null;
    const message = publishError?.message ?? (err as Error).message ?? "Bilinmeyen hata";
    // Deneme sayısı tükendiyse geçici hata da kalıcı sayılır: sonsuza kadar
    // yeniden denenen bir kuyruk, sessizce büyüyen bir borçtur.
    const permanent = (publishError?.permanent ?? true) || attempts >= MAX_ATTEMPTS;

    this.logger.warn(`Yayın başarısız (hedef ${target.id}, deneme ${attempts}): ${message}`);

    await this.updateTarget(target.id, {
      status: permanent ? "failed" : target.status,
      attempt_count: attempts,
      error_message: message,
      next_attempt_at: permanent
        ? null
        : new Date(Date.now() + (publishError?.retryAfterMs ?? backoffMs(attempts))).toISOString(),
    });

    // Kullanıcı ekrandayken (elle yayın) hata zaten dönüyor; bildirim yalnızca
    // otomatik yayında ve yalnızca artık denenmeyecekse.
    if (automatic && permanent) {
      await this.notify(
        post,
        "social_post_failed",
        "Instagram gönderisi yayımlanamadı",
        `"${post.title}" @${account.handle} hesabında yayımlanamadı: ${message}`
      );
    }
  }

  /**
   * Gönderinin durumu hedeflerinden türetilir.
   *
   * Kural: hepsi yayımlandıysa gönderi "yayımlandı", hiçbiri yayımlanmadı ve
   * en az biri kalıcı hata aldıysa "başarısız". Karışık durumda (biri çıktı
   * biri düştü) gönderi yayımlanmış sayılır — içerik dünyaya çıkmıştır; hangi
   * kanalın düştüğü hedef satırında görünür.
   */
  private async syncPostStatus(postId: string): Promise<void> {
    const post = await this.loadPost(postId);
    const targets = post.social_post_targets ?? [];
    if (targets.length === 0) return;

    const published = targets.filter((t: any) => t.status === "published");
    const failed = targets.filter((t: any) => t.status === "failed");

    const next =
      published.length > 0 ? "published" : failed.length === targets.length ? "failed" : post.status;
    if (next === post.status) return;

    await this.supabase.client
      .from("social_posts")
      .update({
        status: next,
        published_at: next === "published" ? (post.published_at ?? new Date().toISOString()) : post.published_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
  }

  // ============================================================ Yardımcılar

  private async notify(
    post: any,
    type: "social_post_published" | "social_post_failed",
    title: string,
    body: string,
    link?: string
  ): Promise<void> {
    // Sorumlu yoksa içeriği açan kişi haberdar edilir; ikisi aynıysa tek bildirim.
    const recipients = new Set([post.assignee_id, post.created_by].filter(Boolean) as string[]);
    for (const userId of recipients) {
      await this.notifications.notifyUser(userId, type, title, body, link).catch((err) => {
        this.logger.warn(`Bildirim gönderilemedi: ${(err as Error).message}`);
      });
    }
  }

  private scopeOfPost(post: any): SocialScope {
    return this.social.scopeOfRow(post);
  }

  private async loadPost(postId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("social_posts")
      .select("*, social_post_targets(*), social_post_media(*)")
      .eq("id", postId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Gönderi bulunamadı");
    return data;
  }

  private async loadTarget(targetId: string): Promise<{ target: any; post: any }> {
    const { data, error } = await this.supabase.client
      .from("social_post_targets")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Yayın hedefi bulunamadı");
    return { target: data, post: await this.loadPost(data.post_id) };
  }

  private async loadAccount(accountId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("social_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Hesap bulunamadı");
    return data;
  }

  private async updateTarget(targetId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.client.from("social_post_targets").update(patch).eq("id", targetId);
    if (error) throw error;
  }
}
