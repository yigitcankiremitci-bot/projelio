import { Injectable, Logger } from "@nestjs/common";
import type { JobMember } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { FilesService } from "../files/files.service";
import { NotificationsService } from "../notifications/notifications.service";

function mapJobMember(row: any): JobMember {
  return {
    id: row.id,
    jobId: row.job_id,
    userId: row.user_id,
    title: row.title ?? undefined,
    joinedAt: row.joined_at,
    fullName: row.users?.full_name ?? undefined,
    email: row.users?.email ?? undefined,
    username: row.users?.username ?? undefined,
    activeTaskId: row.users?.active_task_id ?? undefined,
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
   * İşe alınan kişi işin kök klasörüne erişim kazanır (yani tüm projelerin
   * dosyalarına); çıkarıldığında izin geri alınır. Bu adım atlanırsa ayrılan
   * kişinin Google hesabı işin dosyalarına erişmeye devam eder.
   *
   * Beklemeden çağrılır: işe alma yanıtı Drive'ın yavaşlığına takılmasın.
   */
  private syncDriveShares(jobId: string): void {
    void this.filesService
      .syncJobShares(jobId)
      .catch((err) => this.logger.warn(`Drive izinleri eşitlenemedi (job=${jobId}): ${String(err)}`));
  }

  async findByJob(jobId: string): Promise<JobMember[]> {
    const { data, error } = await this.supabase.client
      .from("job_members")
      .select("*, users(full_name, email, username, active_task_id)")
      .eq("job_id", jobId)
      .order("joined_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapJobMember);
  }

  // İş sahibi kullanıcıyı arayıp doğrudan işe alır (onay beklemez).
  // "title": işe alanın serbest yazdığı görev/unvan; sadece görüntüleme amaçlıdır.
  async hire(jobId: string, userId: string, title?: string): Promise<JobMember> {
    const { data: row, error } = await this.supabase.client
      .from("job_members")
      .insert({ job_id: jobId, user_id: userId, title: title?.trim() || null })
      .select("*, users(full_name, email, username)")
      .single();
    if (error) throw error;
    void this.notificationsService.notifyUser(
      userId,
      "member_joined",
      "İşe Alındın",
      "Bir işe eklendin.",
      `/jobs/${jobId}`
    );
    this.syncDriveShares(jobId);
    return mapJobMember(row);
  }

  async remove(id: string): Promise<void> {
    // İzin geri alınabilmesi için hangi işe ait olduğunu SİLMEDEN ÖNCE öğren.
    const { data: existing } = await this.supabase.client
      .from("job_members")
      .select("job_id")
      .eq("id", id)
      .maybeSingle();

    const { error } = await this.supabase.client.from("job_members").delete().eq("id", id);
    if (error) throw error;

    if (existing?.job_id) this.syncDriveShares(existing.job_id);
  }
}
