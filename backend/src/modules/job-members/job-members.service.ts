import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { JobMember } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import {
  canRespondToInvite,
  inviteAnswerNotificationBody,
  inviteNotificationBody,
  reinviteDecision,
} from "./job-invite";
import { FilesService } from "../files/files.service";
import { NotificationsService } from "../notifications/notifications.service";

function mapJobMember(row: any): JobMember {
  return {
    id: row.id,
    jobId: row.job_id,
    userId: row.user_id,
    title: row.title ?? undefined,
    status: row.status ?? "approved",
    joinedAt: row.joined_at,
    respondedAt: row.responded_at ?? undefined,
    fullName: row.users?.full_name ?? undefined,
    email: row.users?.email ?? undefined,
    username: row.users?.username ?? undefined,
    activeTaskId: row.users?.active_task_id ?? undefined,
    invitedBy: row.invited_by ?? undefined,
    invitedByName: row.inviter?.full_name ?? undefined,
    jobTitle: row.jobs?.title ?? undefined,
  };
}

@Injectable()
export class JobMembersService {
  private readonly logger = new Logger(JobMembersService.name);

  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService,
    private filesService: FilesService
  ) {}

  /**
   * İş ekibi değiştiğinde Drive klasör izinlerini yeniden hizalar.
   *
   * Daveti KABUL EDEN kişi işin kök klasörüne erişim kazanır (yani tüm projelerin
   * dosyalarına); reddettiğinde ya da çıkarıldığında izin geri alınır. Bu adım
   * atlanırsa ayrılan kişinin Google hesabı işin dosyalarına erişmeye devam eder.
   *
   * Beklemeden çağrılır: yanıt Drive'ın yavaşlığına takılmasın.
   */
  private syncDriveShares(jobId: string): void {
    void this.filesService
      .syncJobShares(jobId)
      .catch((err) => this.logger.warn(`Drive izinleri eşitlenemedi (job=${jobId}): ${String(err)}`));
  }

  async findByJob(jobId: string): Promise<JobMember[]> {
    const { data, error } = await this.supabase.client
      .from("job_members")
      .select("*, users!job_members_user_id_fkey(full_name, email, username, active_task_id), inviter:users!job_members_invited_by_fkey(full_name)")
      .eq("job_id", jobId)
      .order("joined_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapJobMember);
  }

  // Kullanıcının yanıt bekleyen iş davetleri. Bildirim çanı ve iş sayfasındaki
  // davet şeridi bunu okur; iş adı ve davet eden kişi burada birleştirilir ki
  // arayüz ayrıca sorgu atmak zorunda kalmasın.
  async findPendingForUser(userId: string): Promise<JobMember[]> {
    const { data, error } = await this.supabase.client
      .from("job_members")
      .select("*, jobs(title), inviter:users!job_members_invited_by_fkey(full_name)")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("joined_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapJobMember);
  }

  // İşi yalnızca sahibi yönetebilir: davet gönderme ve üyeyi çıkarma ona açık.
  private async assertIsJobOwner(jobId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", jobId).maybeSingle();
    if (!job) throw new NotFoundException("İş bulunamadı");
    if (job.owner_id !== userId) throw new ForbiddenException("Bu işe yalnızca iş sahibi kişi ekleyebilir");
  }

  /**
   * İş sahibi bir kullanıcıyı işe davet eder — kayıt "pending" açılır, kişi
   * kabul edene kadar işe dair hiçbir şey görmez.
   *
   * Önceden bu metot kişiyi doğrudan ekliyordu ve "Bir işe eklendin." diyen,
   * kimin hangi işe eklediğini yazmayan bir bildirim gönderiyordu.
   *
   * "title": davet edenin serbest yazdığı görev/unvan; sadece görüntüleme amaçlıdır.
   */
  async hire(jobId: string, userId: string, title?: string, requestingUserId?: string): Promise<JobMember> {
    await this.assertIsJobOwner(jobId, requestingUserId);

    const { data: job } = await this.supabase.client
      .from("jobs")
      .select("title, owner_id, users(full_name)")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) throw new NotFoundException("İş bulunamadı");

    // Aynı kişi daha önce davet edilip reddettiyse UNIQUE (job_id, user_id)
    // yeni satır açmaya izin vermez; var olan kaydı yeniden davete çeviriyoruz.
    const { data: existing } = await this.supabase.client
      .from("job_members")
      .select("id, status")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .maybeSingle();

    const patch = {
      title: title?.trim() || null,
      status: "pending",
      invited_by: requestingUserId ?? job.owner_id ?? null,
      responded_at: null,
    };

    const decision = reinviteDecision(existing);
    // Zaten ekipteyse dokunma: onaylı bir üyeyi tekrar onaya düşürmek olurdu.
    if (decision === "already-member" && existing) return this.getById(existing.id);

    let row: any;
    if (decision === "revive" && existing) {
      const { data, error } = await this.supabase.client
        .from("job_members")
        .update(patch)
        .eq("id", existing.id)
        .select("*, users!job_members_user_id_fkey(full_name, email, username), inviter:users!job_members_invited_by_fkey(full_name)")
        .single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await this.supabase.client
        .from("job_members")
        .insert({ job_id: jobId, user_id: userId, ...patch })
        .select("*, users!job_members_user_id_fkey(full_name, email, username), inviter:users!job_members_invited_by_fkey(full_name)")
        .single();
      if (error) throw error;
      row = data;
    }

    // Bildirim artık kimin hangi işe davet ettiğini yazar; kabul/ret düğmeleri
    // bildirim çanında bu tipe (job_invite) bakılarak gösterilir.
    void this.notificationsService.notifyUser(
      userId,
      "job_invite",
      "İşe davet edildin",
      inviteNotificationBody((job as any).users?.full_name, job.title),
      `/jobs/${jobId}`
    );

    // Drive izni KASITLI olarak burada verilmiyor: kabul edilene kadar davet
    // edilen kişinin işin dosyalarına erişmemesi gerekiyor (bkz. respond()).
    return mapJobMember(row);
  }

  private async getById(memberId: string): Promise<JobMember> {
    const { data, error } = await this.supabase.client
      .from("job_members")
      .select("*, users!job_members_user_id_fkey(full_name, email, username), inviter:users!job_members_invited_by_fkey(full_name)")
      .eq("id", memberId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Davet bulunamadı");
    return mapJobMember(data);
  }

  /**
   * Daveti kabul veya reddeder. Yalnızca davet edilen kişi yanıt verebilir —
   * iş sahibi başkasının yerine kabul edemez (yoksa onay mekanizması anlamsız
   * olurdu; sahibi vazgeçtiyse remove() ile daveti geri çeker).
   */
  async respond(memberId: string, approve: boolean, requestingUserId?: string): Promise<JobMember> {
    const { data: existing } = await this.supabase.client
      .from("job_members")
      .select("id, job_id, user_id, status, invited_by")
      .eq("id", memberId)
      .maybeSingle();
    if (!existing) throw new NotFoundException("Davet bulunamadı");
    if (!canRespondToInvite({ userId: existing.user_id }, requestingUserId)) {
      throw new ForbiddenException("Bu daveti yalnızca davet edilen kişi yanıtlayabilir");
    }

    const { data: row, error } = await this.supabase.client
      .from("job_members")
      .update({
        status: approve ? "approved" : "rejected",
        responded_at: new Date().toISOString(),
      })
      .eq("id", memberId)
      .select("*, users!job_members_user_id_fkey(full_name, email, username), jobs(title), inviter:users!job_members_invited_by_fkey(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Davet bulunamadı");

    const member = mapJobMember(row);

    // İş sahibi yanıtı görsün: davet ettiği kişinin listede neden görünüp
    // görünmediğini tahmin etmek zorunda kalmasın.
    const { data: job } = await this.supabase.client
      .from("jobs")
      .select("owner_id, title")
      .eq("id", existing.job_id)
      .maybeSingle();
    const responderName = member.fullName ?? "Davet ettiğin kişi";
    if (job?.owner_id) {
      void this.notificationsService.notifyUser(
        job.owner_id,
        "job_invite_answered",
        approve ? "Davet kabul edildi" : "Davet reddedildi",
        inviteAnswerNotificationBody(responderName, job.title, approve),
        `/jobs/${existing.job_id}`
      );
    }

    // Kabul erişim kazandırır, ret (daha önce onaylıysa) geri alır.
    this.syncDriveShares(existing.job_id);
    return member;
  }

  // Ekipten çıkarma: yalnızca işin sahibi başkasını çıkarabilir; kişinin kendisi
  // her zaman ayrılabilir. Eskiden hiç kontrol yoktu — üyelik id'sini bilen
  // herhangi biri başkasını ekipten atabiliyordu.
  /**
   * Kullanıcının bu işe bağlanma yolları. Bir iş kullanıcının listesinde ÜÇ
   * sebeple durabiliyor (bkz. JobsService.findAllForUser): işin sahibi olmak,
   * iş kadrosunda (job_members) olmak ve işin PROJELERİNDEN birinin ekibinde
   * (project_members) olmak. Üçüncüsü tek başına yeter: kadro kaydı hiç
   * olmadan yalnızca bir projeye eklenmiş kişi de işi görür.
   *
   * "Ayrılabilir miyim" sorusunun cevabı bu yüzden yalnızca job_members'a
   * bakılarak verilemez.
   */
  async findMyTies(
    jobId: string,
    userId: string
  ): Promise<{ member: JobMember | null; projectCount: number; canLeave: boolean }> {
    const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", jobId).maybeSingle();
    if (!job) throw new NotFoundException("İş bulunamadı");

    const { data: rows, error } = await this.supabase.client
      .from("job_members")
      .select("*")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .order("joined_at", { ascending: true });
    if (error) throw error;
    const member = (rows ?? []).map(mapJobMember).find((m) => m.status === "approved") ?? null;

    const projectIds = await this.myProjectMemberships(jobId, userId);

    return {
      member,
      projectCount: projectIds.length,
      // İş sahibi kendi işinden ayrılamaz; ayrılsa iş sahipsiz kalırdı.
      canLeave: job.owner_id !== userId && (member !== null || projectIds.length > 0),
    };
  }

  /** Bu işin projelerinde kullanıcının üyelik kayıtları (kendi projeleri hariç). */
  private async myProjectMemberships(jobId: string, userId: string): Promise<string[]> {
    const { data: projects } = await this.supabase.client
      .from("projects")
      .select("id, owner_id")
      .eq("job_id", jobId);
    // Kendi kurduğu projeden ayrılamaz (bkz. MembersService.leaveProject);
    // listeye alınsa silinemeyecek bir şey vaat edilmiş olurdu.
    const ids = (projects ?? []).filter((p: any) => p.owner_id !== userId).map((p: any) => p.id);
    if (ids.length === 0) return [];

    const { data: memberships } = await this.supabase.client
      .from("project_members")
      .select("id")
      .eq("user_id", userId)
      .in("project_id", ids);
    return (memberships ?? []).map((m: any) => m.id);
  }

  /**
   * İşten ayrılma. Kadro kimliğini kullanıcının bilmesini gerektirmez —
   * "jobs/:jobId/members" listesini göremeyen taşeron için tek yol bu.
   *
   * KADRO KAYDINI SİLMEK TEK BAŞINA YETMİYOR: iş, projelerinden birinin
   * ekibinde olmak yüzünden de listede kalıyor (bkz. findMyTies). İlk sürüm
   * yalnızca job_members'ı siliyordu ve kullanıcı "ayrıldım ama iş hâlâ
   * duruyor" diyordu — hatta kadro kaydı hiç olmayan, yalnızca projeye
   * eklenmiş kişi için ayrılma ucu 404 veriyordu.
   *
   * Kadro kaydının silinmesini remove üstlenir ki Drive izinlerinin geri
   * alınması (syncDriveShares) iki ayrı yerde yaşamasın.
   */
  async leaveJob(jobId: string, userId: string): Promise<void> {
    const { data: job } = await this.supabase.client
      .from("jobs")
      .select("owner_id, title")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) throw new NotFoundException("İş bulunamadı");
    if (job.owner_id === userId) throw new ForbiddenException("İş sahibi kendi işinden ayrılamaz");

    const { data: rows } = await this.supabase.client
      .from("job_members")
      .select("id")
      .eq("job_id", jobId)
      .eq("user_id", userId);

    let ayrildi = false;
    for (const row of rows ?? []) {
      await this.remove(row.id, userId);
      ayrildi = true;
    }

    const projectMemberIds = await this.myProjectMemberships(jobId, userId);
    if (projectMemberIds.length > 0) {
      const { error } = await this.supabase.client.from("project_members").delete().in("id", projectMemberIds);
      if (error) throw error;
      ayrildi = true;
    }

    if (!ayrildi) throw new NotFoundException("Bu işte bir kadro kaydın yok");

    // İş sahibi haberdar olsun: ekipten biri sessizce düşmesin
    // (aynı gerekçe MembersService.leaveProject'te de yazılı).
    if (job.owner_id) {
      const { data: user } = await this.supabase.client
        .from("users")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      this.notificationsService.notifyUserSafe(
        job.owner_id,
        "role_updated",
        "Ekipten ayrılma",
        user?.full_name
          ? { metin: '{kisi}, "{is}" işinden ayrıldı.', params: { kisi: user.full_name, is: job.title } }
          : { metin: 'Bir ekip üyesi "{is}" işinden ayrıldı.', params: { is: job.title } },
        `/jobs/${jobId}`
      );
    }
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    // İzin geri alınabilmesi için hangi işe ait olduğunu SİLMEDEN ÖNCE öğren.
    const { data: existing } = await this.supabase.client
      .from("job_members")
      .select("job_id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (requestingUserId && existing) {
      if (existing.user_id !== requestingUserId) {
        const { data: job } = await this.supabase.client
          .from("jobs")
          .select("owner_id")
          .eq("id", existing.job_id)
          .maybeSingle();
        if (job?.owner_id !== requestingUserId) {
          throw new ForbiddenException("Ekipten çıkarma işlemini yalnızca iş sahibi yapabilir");
        }
      }
    }

    const { error } = await this.supabase.client.from("job_members").delete().eq("id", id);
    if (error) throw error;

    if (existing?.job_id) this.syncDriveShares(existing.job_id);
  }
}
