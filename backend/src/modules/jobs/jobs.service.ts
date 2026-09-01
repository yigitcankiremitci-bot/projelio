import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Job } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { removeStaleUploadsInFolder } from "../../common/storage/public-upload.util";
import { ProjectsService } from "../projects/projects.service";
import { OperationsService } from "../operations/operations.service";
import { FilesService } from "../files/files.service";
import { AccessService } from "../../common/access/access.service";
import { applyOrder } from "../../common/reorder.util";
import { detectImageUpload, UPLOAD_CACHE_CONTROL } from "../../common/upload-image.util";

const COVER_BUCKET = "job-covers";

function mapJob(row: any): Job {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.users?.full_name ?? undefined,
    organizationId: row.organization_id ?? undefined,
    organizationName: row.organizations?.name ?? undefined,
    groupId: row.group_id ?? undefined,
    groupName: row.groups?.name ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private supabase: SupabaseService,
    private projectsService: ProjectsService,
    private operationsService: OperationsService,
    private filesService: FilesService,
    private access: AccessService
  ) {}

  // Kullanıcının sahibi olduğu işler + doğrudan iş ekibine alındığı (job_members,
  // daveti kabul etmiş) işler + içindeki herhangi bir projeye ekibe (üye/taşeron
  // fark etmez, onaylanmış şekilde) eklendiği işler. Böylece hem işe alınan kişi
  // hem de bir projeye taşeron olarak eklenen kullanıcı "İşlerim" ekranında o iş
  // dosyasını görür.
  async findAllForUser(userId: string): Promise<Job[]> {
    const { data: owned, error: ownedError } = await this.supabase.client
      .from("jobs")
      .select("*, users(full_name), organizations(name), groups(name)")
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (ownedError) throw ownedError;

    // İş ekibi üyelikleri: bir kullanıcı hiçbir projeye eklenmeden doğrudan işe
    // alınmış olabilir. Bu sorgu eksikti; işe alınan kişi bildirimi alıyor ama iş
    // anasayfasındaki "Katıldıklarım" listesine hiç düşmüyordu.
    // Yalnızca daveti KABUL EDİLMİŞ üyelikler sayılır — bekleyen/reddedilen davet
    // kullanıcının panosunu kirletmemeli.
    const { data: jobMemberships, error: jobMembershipError } = await this.supabase.client
      .from("job_members")
      .select("job_id")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (jobMembershipError) throw jobMembershipError;

    const hiredJobIds = Array.from(new Set((jobMemberships ?? []).map((m: any) => m.job_id).filter(Boolean)));
    let hiredJobs: any[] = [];
    if (hiredJobIds.length > 0) {
      const { data, error } = await this.supabase.client
        .from("jobs")
        .select("*, users(full_name), organizations(name), groups(name)")
        .in("id", hiredJobIds)
        .is("archived_at", null);
      if (error) throw error;
      hiredJobs = data ?? [];
    }

    const { data: memberships, error: membershipError } = await this.supabase.client
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (membershipError) throw membershipError;

    const memberProjectIds = (memberships ?? []).map((m: any) => m.project_id);
    let memberJobs: any[] = [];
    if (memberProjectIds.length > 0) {
      const { data: memberProjects, error: memberProjectsError } = await this.supabase.client
        .from("projects")
        .select("job_id")
        .in("id", memberProjectIds);
      if (memberProjectsError) throw memberProjectsError;

      const jobIds = Array.from(new Set((memberProjects ?? []).map((p: any) => p.job_id).filter(Boolean)));
      if (jobIds.length > 0) {
        const { data, error } = await this.supabase.client
          .from("jobs")
          .select("*, users(full_name), organizations(name), groups(name)")
          .in("id", jobIds)
          .is("archived_at", null);
        if (error) throw error;
        memberJobs = data ?? [];
      }
    }

    const byId = new Map<string, any>();
    for (const row of [...(owned ?? []), ...hiredJobs, ...memberJobs]) byId.set(row.id, row);

    const jobs = Array.from(byId.values())
      .map(mapJob)
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    // Anasayfa kartlarındaki proje sayısı göstergesi gerçek sayıyı göstersin:
    // (önceden yalnızca kullanıcının üyesi olduğu projeler sayılıyordu).
    const allJobIds = jobs.map((j) => j.id);
    if (allJobIds.length > 0) {
      const { data: projectRows } = await this.supabase.client
        .from("projects")
        .select("job_id")
        .in("job_id", allJobIds)
        .is("archived_at", null);
      const counts = new Map<string, number>();
      for (const p of projectRows ?? []) {
        counts.set(p.job_id, (counts.get(p.job_id) ?? 0) + 1);
      }
      for (const j of jobs) j.projectCount = counts.get(j.id) ?? 0;
    }
    return jobs;
  }

  async reorder(userId: string, ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client.from("jobs").select("id, owner_id").in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    // İş kartları sürükle-bırak: listede yalnızca sahibi olunan işler değil, ekip üyesi
    // olarak görülen işler de bulunabildiği için katı "hepsinin sahibi ol" kuralı tüm
    // sıralamayı reddediyor ve kartlar eski yerine dönüyordu. Kullanıcının panosunda
    // gördüğü işleri sıralamasına izin veriyoruz.
    const visibleJobs = await this.findAllForUser(userId);
    const visibleIds = new Set(visibleJobs.map((j) => j.id));
    if (rows.some((r: any) => !visibleIds.has(r.id))) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    await applyOrder(this.supabase.client, "jobs", ids);
  }

  async findOne(id: string): Promise<Job> {
    const { data, error } = await this.supabase.client
      .from("jobs")
      .select("*, users(full_name), organizations(name), groups(name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("İş bulunamadı");
    return mapJob(data);
  }

  // Bir iş ya bir Organization'a, ya doğrudan bir Group'a, ya da hiçbirine
  // (freelancer modu) bağlanabilir — ikisi birden set edilemez (DB'de de
  // jobs_org_or_group_exclusive CHECK constraint'i ile korunuyor). Bir işe bağlanan
  // organizasyon/grup, o işin altındaki tüm projelere de dolaylı olarak yansır.
  private assertOrgGroupExclusive(organizationId?: string | null, groupId?: string | null): void {
    if (organizationId && groupId) {
      throw new BadRequestException("Bir iş aynı anda hem bir organizasyona hem bir gruba bağlanamaz");
    }
  }

  async create(ownerId: string, data: Partial<Job>): Promise<Job> {
    this.assertOrgGroupExclusive(data.organizationId, data.groupId);
    const { data: row, error } = await this.supabase.client
      .from("jobs")
      .insert({
        owner_id: ownerId,
        title: data.title ?? "",
        description: data.description ?? null,
        organization_id: data.organizationId ?? null,
        group_id: data.groupId ?? null,
      })
      .select("*, users(full_name), organizations(name), groups(name)")
      .single();
    if (error) throw error;
    return mapJob(row);
  }

  // Bir Organization'a bağlı işler (organization sahibi/üyesi tüm işleri görür;
  // bunun dışındakiler yalnızca kendi görebildiği işleri görür).
  async findByOrganization(organizationId: string, requestingUserId?: string): Promise<Job[]> {
    const { data, error } = await this.supabase.client
      .from("jobs")
      .select("*, users(full_name), organizations(name), groups(name)")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const jobs = (data ?? []).map(mapJob);
    if (!requestingUserId) return jobs;

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (org?.owner_id === requestingUserId) return jobs;

    // Organizasyon üyeliği tüm işleri açar — TAŞERON HARİÇ. Taşeron dış
    // kaynaktır: bir departmanın kadrosunda ya da bir işin ekibinde olması,
    // şirketin diğer işlerini görmesini gerektirmez. Bu kısayol olmadığında
    // aşağıdaki findAllForUser kapsamına düşer (yalnızca ekli olduğu işler).
    if (!(await this.access.isSubcontractor(requestingUserId))) {
      const { data: orgMember } = await this.supabase.client
        .from("organization_members")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", requestingUserId)
        .eq("status", "approved")
        .maybeSingle();
      if (orgMember) return jobs;
    }

    const visibleJobs = await this.findAllForUser(requestingUserId);
    const visibleIds = new Set(visibleJobs.map((j) => j.id));
    return jobs.filter((j) => visibleIds.has(j.id));
  }

  // Bir Group'a doğrudan bağlı işler (bir Organization üzerinden değil).
  async findByGroup(groupId: string, requestingUserId?: string): Promise<Job[]> {
    const { data, error } = await this.supabase.client
      .from("jobs")
      .select("*, users(full_name), organizations(name), groups(name)")
      .eq("group_id", groupId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const jobs = (data ?? []).map(mapJob);
    if (!requestingUserId) return jobs;

    const { data: group } = await this.supabase.client.from("groups").select("owner_id").eq("id", groupId).maybeSingle();
    if (group?.owner_id === requestingUserId) return jobs;

    // Grup üyeliği de taşerona geniş erişim vermez (bkz. findByOrganization).
    if (!(await this.access.isSubcontractor(requestingUserId))) {
      const { data: groupMember } = await this.supabase.client
        .from("group_members")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", requestingUserId)
        .maybeSingle();
      if (groupMember) return jobs;
    }

    const visibleJobs = await this.findAllForUser(requestingUserId);
    const visibleIds = new Set(visibleJobs.map((j) => j.id));
    return jobs.filter((j) => visibleIds.has(j.id));
  }

  // Yalnızca işin sahibi iş detaylarını değiştirebilir / silebilir / arşivleyebilir.
  // (Önceden işe eklenen herkes değiştirebiliyordu.)
  private async assertOwner(id: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data } = await this.supabase.client.from("jobs").select("owner_id").eq("id", id).maybeSingle();
    if (!data) throw new NotFoundException("İş bulunamadı");
    if (data.owner_id !== userId) throw new ForbiddenException("Bu işi yalnızca iş sahibi düzenleyebilir");
  }

  async update(id: string, data: Partial<Job>, requestingUserId?: string): Promise<Job> {
    await this.assertOwner(id, requestingUserId);
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;
    if (data.organizationId !== undefined || data.groupId !== undefined) {
      const nextOrgId = data.organizationId !== undefined ? data.organizationId : undefined;
      const nextGroupId = data.groupId !== undefined ? data.groupId : undefined;
      this.assertOrgGroupExclusive(nextOrgId, nextGroupId);
      if (data.organizationId !== undefined) {
        patch.organization_id = data.organizationId ?? null;
        // Organization set edilirken group_id de gönderilmediyse çakışmaması için temizle.
        if (data.organizationId && data.groupId === undefined) patch.group_id = null;
      }
      if (data.groupId !== undefined) {
        patch.group_id = data.groupId ?? null;
        if (data.groupId && data.organizationId === undefined) patch.organization_id = null;
      }
    }

    const { data: row, error } = await this.supabase.client
      .from("jobs")
      .update(patch)
      .eq("id", id)
      .select("*, users(full_name), organizations(name), groups(name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("İş bulunamadı");

    // Organizasyon/grup bağı değiştiyse kimin neye erişeceği de değişmiştir:
    // yeni üst kademeye Drive izni verilmeli, eskisininki geri alınmalı.
    if (patch.organization_id !== undefined || patch.group_id !== undefined) {
      void this.filesService
        .syncJobShares(id)
        .catch((err) => this.logger.warn(`Drive izinleri eşitlenemedi (job=${id}): ${String(err)}`));
    }

    return mapJob(row);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    await this.assertOwner(id, requestingUserId);
    const { error } = await this.supabase.client.from("jobs").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string, requestingUserId?: string): Promise<Job> {
    await this.assertOwner(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("jobs")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, users(full_name), organizations(name), groups(name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("İş bulunamadı");

    // Bu işe bağlı tüm projeleri (ve onların görev/çıktılarını) da arşivle
    const { data: projects } = await this.supabase.client.from("projects").select("id").eq("job_id", id);
    for (const p of projects ?? []) {
      await this.projectsService.archive(p.id);
    }

    // Rutinler de aynı şekilde durdurulur; gelecekteki tekrarları veritabanı
    // tetikleyicisi geri çeker, geçmiş kayıtlar olduğu gibi kalır.
    const { data: operations } = await this.supabase.client.from("operations").select("id").eq("job_id", id);
    for (const o of operations ?? []) {
      await this.operationsService.archive(o.id);
    }

    return mapJob(row);
  }

  async restore(id: string, requestingUserId?: string): Promise<Job> {
    await this.assertOwner(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("jobs")
      .update({ archived_at: null })
      .eq("id", id)
      .select("*, users(full_name), organizations(name), groups(name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("İş bulunamadı");

    const { data: projects } = await this.supabase.client.from("projects").select("id").eq("job_id", id);
    for (const p of projects ?? []) {
      await this.projectsService.restore(p.id);
    }

    const { data: operations } = await this.supabase.client.from("operations").select("id").eq("job_id", id);
    for (const o of operations ?? []) {
      await this.operationsService.restore(o.id);
    }

    return mapJob(row);
  }

  async uploadCover(id: string, file: Express.Multer.File, requestingUserId?: string): Promise<Job> {
    await this.assertOwner(id, requestingUserId);
    // Tur ve uzanti istemcinin sozune degil, dosyanin ilk baytlarindaki
    // imzaya gore belirlenir (bkz. common/upload-image.util.ts).
    const { contentType, ext } = detectImageUpload(file);
    const path = `${id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(COVER_BUCKET)
      .upload(path, file.buffer, { contentType, upsert: true, cacheControl: UPLOAD_CACHE_CONTROL });
    if (uploadError) throw uploadError;

    const publicUrl = this.supabase.publicStorageUrl(COVER_BUCKET, path);

    const updated = await this.update(id, { coverImageUrl: publicUrl });

    // Kayıt güncellendikten SONRA temizle: güncelleme başarısız olursa eski görsel
    // yerinde kalsın, kayıt silinmiş bir dosyaya işaret etmesin.
    await removeStaleUploadsInFolder(this.supabase.client, COVER_BUCKET, path);

    return updated;
  }
}
