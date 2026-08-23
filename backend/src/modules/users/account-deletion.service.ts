import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { verifyPassword } from "../../common/password.util";
import { UsersService } from "./users.service";
import { EmailService } from "../auth/email.service";
import {
  decideJobOwnership,
  decideOrgOwnership,
  describeBlockers,
  type BlockingOwnership,
} from "./account-deletion.rules";

/**
 * Hesap silme (KVKK m.11 / GDPR silme hakkı).
 *
 * TASARIM: docs/hesap-silme.md — okumadan değiştirme, şemada iki tuzak var.
 *
 * Özet: `users` satırı SİLİNMEZ, anonimleştirilir. `users(id)`'ye 66 yabancı
 * anahtar bakıyor ve `projects.owner_id` / `jobs.owner_id` `on delete cascade`;
 * satırı gerçekten silmek, kişinin sahibi olduğu her şeyi — içindeki ekip
 * arkadaşlarının işiyle birlikte — uçururdu.
 *
 * Üç kategori:
 *   A. Gerçekten silinen: yalnızca o kişiyi ilgilendiren kişisel veri.
 *   B. Anonimleştirilen: `users` satırının kimlik alanları.
 *   C. Sahiplik: işler kurala göre silinir ya da anonim sahiplikte bırakılır;
 *      organizasyon/grup sahipliği silmeyi ENGELLER (bkz. describeBlockers).
 *
 * İKİ AŞAMALI: "sil" demek hemen silmiyor. Talep alınınca yalnızca `deleted_at`
 * yazılıyor ve giriş kapanıyor — veri 30 gün olduğu gibi duruyor. Kullanıcı bu
 * süre içinde aynı e-postayla giriş yaparsa hesabı geri açılıyor. Süre dolunca
 * AccountPurgeProcessor asıl silmeyi yapıyor.
 *
 * NEDEN: hesap silme çoğu zaman anlık bir kararla veriliyor ve geri alınamıyor.
 * 30 gün, "yanlışlıkla sildim" ile "gerçekten gitmek istiyorum" arasındaki farkı
 * ayırmaya yetiyor; kullanıcı da gitmeden önce verisini indirebiliyor.
 */
/** Talep ile asıl silme arasındaki bekleme. */
export const GRACE_PERIOD_DAYS = 30;

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private supabase: SupabaseService,
    private usersService: UsersService,
    private emailService: EmailService
  ) {}

  /**
   * Silmeden ÖNCE kullanıcıya ne olacağını anlatabilmek için: engel var mı ve
   * hangi işler silinecek. Ekran bunu gösterip onay alıyor.
   */
  async previewDeletion(userId: string): Promise<{
    blocker: string | null;
    silinecekIsler: string[];
    korunacakIsler: string[];
  }> {
    const [orglar, isler] = await Promise.all([this.classifyOwnedOrgs(userId), this.classifyOwnedJobs(userId)]);
    return {
      blocker: describeBlockers(orglar.engeller),
      silinecekIsler: [...isler.silinecek.map((j) => j.title), ...orglar.silinecekAdlar],
      korunacakIsler: isler.korunacak.map((j) => j.title),
    };
  }

  /**
   * Silme TALEBİ alır — henüz hiçbir şey silinmez.
   *
   * @param password Hesabın şifresi. Google ile açılmış (şifresiz) hesaplarda
   *                 atlanır — orada şifre diye bir şey yok.
   */
  async requestDeletion(userId: string, password?: string): Promise<{ ok: true; purgeAt: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException("Kullanıcı bulunamadı.");
    if (user.deletedAt) throw new BadRequestException("Bu hesap zaten silinmiş.");

    // Şifre doğrulaması: oturumu ele geçiren birinin hesabı silmesini engeller.
    // Şifre değiştirmede de aynı gerekçeyle isteniyor (bkz. UsersService.changePassword).
    if (user.passwordHash) {
      if (!password) throw new BadRequestException("Hesabını silmek için şifreni gir.");
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw new UnauthorizedException("Şifre hatalı.");
      }
    }

    const { engeller } = await this.classifyOwnedOrgs(userId);
    const engel = describeBlockers(engeller);
    if (engel) throw new BadRequestException(engel);

    // Bu aşamada HİÇBİR ŞEY silinmiyor: yalnızca saat başlatılıyor. Veri 30 gün
    // olduğu gibi duruyor ki kullanıcı fikrini değiştirirse geri dönebilsin.
    const now = new Date();
    const { error } = await this.supabase.client
      .from("users")
      .update({ deleted_at: now.toISOString() })
      .eq("id", userId);
    if (error) throw error;

    const purgeAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Bilgilendirme e-postası: kullanıcı ne zaman ne olacağını ve nasıl geri
    // döneceğini bilmeli. Gönderilemezse talep yine de geçerli — e-posta
    // sağlayıcı arızası hesabı kilitli bırakmamalı.
    try {
      await this.emailService.sendAccountDeletionScheduled(user.email, purgeAt, GRACE_PERIOD_DAYS);
    } catch {
      // EmailService kendi hatasını logluyor.
    }

    this.logger.log(`Hesap silme talebi alındı: ${userId} · asıl silme ${purgeAt.toISOString()}`);
    return { ok: true, purgeAt: purgeAt.toISOString() };
  }

  /**
   * Bekleme süresi içinde geri dönüş. Giriş akışı çağırıyor: doğru şifreyle
   * gelen kullanıcı zaten kimliğini kanıtlamış oluyor, ayrıca bir onay istemek
   * "geri gelmek zor olsun" demek olurdu.
   */
  async restoreAccount(userId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("users")
      .update({ deleted_at: null })
      .eq("id", userId);
    if (error) throw error;
    this.logger.log(`Hesap geri alındı: ${userId}`);
  }

  /**
   * Bekleme süresi dolmuş hesapları gerçekten siler. Zamanlanmış iş çağırıyor
   * (bkz. account-purge.processor.ts).
   */
  async purgeExpiredAccounts(): Promise<number> {
    const esik = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase.client
      .from("users")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", esik)
      // Zaten anonimleştirilmiş satırlar tekrar işlenmesin.
      .not("password_hash", "is", null);
    if (error) throw error;

    let silinen = 0;
    for (const row of data ?? []) {
      const id = (row as any).id as string;
      try {
        await this.purgeAccount(id);
        silinen++;
      } catch (e) {
        this.logger.error(`Hesap silinemedi (${id}): ${(e as Error).message}`);
      }
    }
    return silinen;
  }

  /**
   * ASIL silme. Sıra önemli: önce sahiplik (silinecek işler kendi alt verisini
   * cascade ile götürür), sonra kişisel veri, en son anonimleştirme.
   * Anonimleştirme sona bırakılıyor ki yarıda kalan bir silme "giriş yapamayan
   * ama verisi duran" bir hesap bırakmasın.
   */
  private async purgeAccount(userId: string): Promise<void> {
    await this.applyOrgOwnership(userId);
    await this.applyJobOwnership(userId);
    await this.deletePersonalData(userId);
    await this.anonymizeUser(userId);
    this.logger.log(`Hesap kalıcı olarak silindi (anonimleştirildi): ${userId}`);
  }

  // ============================================================ C. Sahiplik

  /**
   * Sahip olunan organizasyon/gruplar: hangileri engel, hangileri hesapla
   * birlikte silinecek.
   *
   * Ayrım `decideOrgOwnership` ile: içinde başka onaylı insan varsa engel,
   * yoksa kullanıcının kişisel verisi sayılıp siliniyor. Tek kişilik bir şirket
   * için engel çıkarmak kullanıcıyı çıkmaza sokuyordu — devredecek kimse yok.
   */
  private async classifyOwnedOrgs(userId: string): Promise<{
    engeller: BlockingOwnership[];
    silinecekOrgIds: string[];
    silinecekGrupIds: string[];
    silinecekAdlar: string[];
  }> {
    const [orgs, gruplar] = await Promise.all([
      this.supabase.client.from("organizations").select("id, name, group_id").eq("owner_id", userId),
      this.supabase.client.from("groups").select("id, name").eq("owner_id", userId),
    ]);

    const engeller: BlockingOwnership[] = [];
    const silinecekOrgIds: string[] = [];
    const silinecekGrupIds: string[] = [];
    const silinecekAdlar: string[] = [];

    for (const org of orgs.data ?? []) {
      const kisi = await this.countOtherPeopleInOrg((org as any).id, userId);
      if (decideOrgOwnership({ otherApprovedPeopleCount: kisi }) === "engelle") {
        engeller.push({ tur: "organizasyon", ad: (org as any).name ?? "adsız" });
      } else {
        silinecekOrgIds.push((org as any).id);
        silinecekAdlar.push(`${(org as any).name ?? "adsız"} (organizasyon)`);
      }
    }

    for (const grup of gruplar.data ?? []) {
      // Grup, altındaki organizasyonları kapsıyor: içlerinden biri bile
      // engelliyse grup da engellidir.
      const { data: altOrgs } = await this.supabase.client
        .from("organizations")
        .select("id")
        .eq("group_id", (grup as any).id);

      let kisi = await this.countPartners({ group_id: (grup as any).id }, userId);
      for (const alt of altOrgs ?? []) {
        kisi += await this.countOtherPeopleInOrg((alt as any).id, userId);
      }

      if (decideOrgOwnership({ otherApprovedPeopleCount: kisi }) === "engelle") {
        engeller.push({ tur: "grup", ad: (grup as any).name ?? "adsız" });
      } else {
        silinecekGrupIds.push((grup as any).id);
        silinecekAdlar.push(`${(grup as any).name ?? "adsız"} (grup)`);
      }
    }

    return { engeller, silinecekOrgIds, silinecekGrupIds, silinecekAdlar };
  }

  /** Departman kadrosu + ortaklar; yalnızca onaylı ve silinen kullanıcı dışındakiler. */
  private async countOtherPeopleInOrg(organizationId: string, userId: string): Promise<number> {
    const { data: depts } = await this.supabase.client
      .from("departments")
      .select("id")
      .eq("organization_id", organizationId);

    let toplam = await this.countPartners({ organization_id: organizationId }, userId);

    for (const d of depts ?? []) {
      const { count } = await this.supabase.client
        .from("department_members")
        .select("id", { count: "exact", head: true })
        .eq("department_id", (d as any).id)
        .eq("status", "approved")
        .neq("user_id", userId);
      toplam += count ?? 0;
    }
    return toplam;
  }

  private async countPartners(scope: Record<string, string>, userId: string): Promise<number> {
    let q = this.supabase.client
      .from("partners")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .neq("user_id", userId);
    for (const [k, v] of Object.entries(scope)) q = q.eq(k, v);
    const { count } = await q;
    return count ?? 0;
  }

  private async classifyOwnedJobs(
    userId: string
  ): Promise<{ silinecek: { id: string; title: string }[]; korunacak: { id: string; title: string }[] }> {
    const { data: jobs, error } = await this.supabase.client
      .from("jobs")
      .select("id, title")
      .eq("owner_id", userId);
    if (error) throw error;

    const silinecek: { id: string; title: string }[] = [];
    const korunacak: { id: string; title: string }[] = [];

    for (const job of jobs ?? []) {
      const { count } = await this.supabase.client
        .from("job_members")
        .select("id", { count: "exact", head: true })
        .eq("job_id", (job as any).id)
        .eq("status", "approved")
        .neq("user_id", userId);

      const karar = decideJobOwnership({ jobId: (job as any).id, otherApprovedMemberCount: count ?? 0 });
      (karar === "sil" ? silinecek : korunacak).push({ id: (job as any).id, title: (job as any).title ?? "adsız" });
    }

    return { silinecek, korunacak };
  }

  private async applyJobOwnership(userId: string): Promise<void> {
    const { silinecek } = await this.classifyOwnedJobs(userId);
    if (silinecek.length === 0) return;

    // Tek kişilik işler gerçekten siliniyor; projeler/görevler/dosya kayıtları
    // `on delete cascade` ile birlikte gidiyor (bkz. 006_jobs.sql).
    const { error } = await this.supabase.client
      .from("jobs")
      .delete()
      .in(
        "id",
        silinecek.map((j) => j.id)
      );
    if (error) throw error;

    // Korunacak işlerin owner_id'si DEĞİŞMİYOR: users satırı duruyor ve
    // anonimleştiriliyor, yani sahip "Silinmiş kullanıcı" olarak görünüyor.
    // Üyelerin erişimi job_members üzerinden sürüyor.
  }

  /** Tek kişilik organizasyon ve gruplar hesapla birlikte silinir. */
  private async applyOrgOwnership(userId: string): Promise<void> {
    const { silinecekOrgIds, silinecekGrupIds } = await this.classifyOwnedOrgs(userId);

    // Grup önce: altındaki organizasyonları cascade ile götürüyor, ayrıca
    // silinmelerine gerek kalmıyor.
    if (silinecekGrupIds.length) {
      const { error } = await this.supabase.client.from("groups").delete().in("id", silinecekGrupIds);
      if (error) throw error;
    }
    if (silinecekOrgIds.length) {
      const { error } = await this.supabase.client.from("organizations").delete().in("id", silinecekOrgIds);
      // Gruba bağlı olanlar yukarıdaki cascade ile gitmiş olabilir; kalanı sileriz.
      if (error) throw error;
    }
  }

  // ============================================================ A. Kişisel veri

  /**
   * Yalnızca o kişiyi ilgilendiren, kimsenin işine yaramayacak veri.
   *
   * `users` satırı silinmediği için bu tabloların `on delete cascade` kuralları
   * ÇALIŞMAZ — hepsi burada açıkça siliniyor. Yeni bir kişisel tablo eklenirse
   * buraya da eklenmeli.
   */
  private async deletePersonalData(userId: string): Promise<void> {
    const tablolar = [
      "push_subscriptions",
      "personal_todos",
      "personal_task_prefs",
      "notifications",
      "google_accounts",
      "microsoft_accounts",
      "password_reset_tokens",
      "email_verification_tokens",
      "ai_conversations",
      "ai_credit_balances",
    ];

    for (const tablo of tablolar) {
      const { error } = await this.supabase.client.from(tablo).delete().eq("user_id", userId);
      // Tek bir tablonun silinememesi tüm işlemi durdurmasın — ama sessiz de
      // kalmasın: kalan kişisel veri fark edilmeli.
      if (error) this.logger.error(`Kişisel veri silinemedi (${tablo}, ${userId}): ${error.message}`);
    }
  }

  // ============================================================ B. Anonimleştirme

  private async anonymizeUser(userId: string): Promise<void> {
    const kisaId = userId.replace(/-/g, "").slice(0, 8);

    const { error } = await this.supabase.client
      .from("users")
      .update({
        full_name: "Silinmiş kullanıcı",
        // Benzersizlik kısıtı korunsun diye kimliğe bağlı; .invalid alan adı
        // RFC 2606 gereği hiçbir zaman gerçek bir adrese çözülmez.
        email: `silinmis+${kisaId}@projelio.invalid`,
        username: `silinmis_${kisaId}`,
        password_hash: null,
        avatar_url: null,
        title: null,
        bio: null,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw error;
  }
}
