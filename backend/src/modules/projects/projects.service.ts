import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Project } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { removeStaleUploadsInFolder } from "../../common/storage/public-upload.util";
import { TasksService } from "../tasks/tasks.service";
import { OutputsService } from "../outputs/outputs.service";
import { AccessService } from "../../common/access/access.service";
import { applyOrder } from "../../common/reorder.util";
import { detectImageUpload, UPLOAD_CACHE_CONTROL } from "../../common/upload-image.util";

const COVER_BUCKET = "project-covers";

function mapProject(row: any): Project {
  return {
    id: row.id,
    jobId: row.job_id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    totalBudget: Number(row.total_budget),
    startDate: row.start_date,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private supabase: SupabaseService,
    private tasksService: TasksService,
    private outputsService: OutputsService,
    private access: AccessService
  ) {}

  // Kullanıcının sahibi olduğu projeler + ekibine (üye/taşeron fark etmez, onaylanmış
  // şekilde) eklendiği projeler. Böylece ekibe eklenen bir taşeron da o projeyi
  // "Projelerim" / görev listesi gibi ekranlarda görebilir.
  async findAllForUser(userId: string): Promise<Project[]> {
    const { data: owned, error: ownedError } = await this.supabase.client
      .from("projects")
      .select()
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (ownedError) throw ownedError;

    const { data: memberships, error: membershipError } = await this.supabase.client
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (membershipError) throw membershipError;

    const memberProjectIds = (memberships ?? []).map((m: any) => m.project_id);
    let memberProjects: any[] = [];
    if (memberProjectIds.length > 0) {
      const { data, error } = await this.supabase.client
        .from("projects")
        .select()
        .in("id", memberProjectIds)
        .is("archived_at", null);
      if (error) throw error;
      memberProjects = data ?? [];
    }

    const byId = new Map<string, any>();
    for (const row of [...(owned ?? []), ...memberProjects]) byId.set(row.id, row);

    return Array.from(byId.values())
      .map(mapProject)
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  async findByJob(jobId: string, requestingUserId?: string): Promise<Project[]> {
    const { data, error } = await this.supabase.client
      .from("projects")
      .select()
      .eq("job_id", jobId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const projects = (data ?? []).map(mapProject);
    if (!requestingUserId) return projects;

    // Görünürlük kısıtı: iş sahibi ve işe alınmış iş ekibi üyeleri tüm projeleri
    // görür — TAŞERON HARİÇ. Taşeron işe alınmış olsa bile yalnızca açıkça
    // atandığı projeleri görür ("sadece ekli olduğu projeyi ve işi görmeli").
    // Karar AccessService.seesAllProjectsOfJob'da, saf kuralı
    // common/access/subcontractor.ts içinde.
    if (await this.access.seesAllProjectsOfJob(jobId, requestingUserId)) return projects;

    const { data: memberships } = await this.supabase.client
      .from("project_members")
      .select("project_id")
      .eq("user_id", requestingUserId)
      .eq("status", "approved");
    const memberProjectIds = new Set((memberships ?? []).map((m: any) => m.project_id));
    return projects.filter((p) => p.ownerId === requestingUserId || memberProjectIds.has(p.id));
  }

  async reorder(userId: string, ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client.from("projects").select("id, owner_id, job_id").in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    const distinctJobIds = new Set(rows.map((r: any) => r.job_id));
    if (distinctJobIds.size > 1) {
      throw new BadRequestException("Sıralanan projeler aynı işe ait olmalı");
    }
    // Proje sahibinin dışında, işe alınan iş ekibi üyeleri de (job_members) o işin
    // proje kartlarını sıralayabilmeli — sadece asıl proje sahibiyle sınırlı kalmasın.
    const ownsAll = rows.every((r: any) => r.owner_id === userId);
    if (!ownsAll) {
      const jobId = rows[0].job_id;
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", jobId).maybeSingle();
      const isJobOwner = job?.owner_id === userId;
      let isJobMember = false;
      if (!isJobOwner) {
        const { data: member } = await this.supabase.client
          .from("job_members")
          .select("id")
          .eq("job_id", jobId)
          .eq("user_id", userId)
          .eq("status", "approved")
          .maybeSingle();
        isJobMember = !!member;
      }
      if (!isJobOwner && !isJobMember) {
        throw new BadRequestException("Geçersiz sıralama isteği");
      }
    }
    await applyOrder(this.supabase.client, "projects", ids);
  }

  async findOne(id: string, requestingUserId?: string): Promise<Project> {
    const { data, error } = await this.supabase.client
      .from("projects")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Proje bulunamadı");
    await this.assertCanView(id, data, requestingUserId);
    return mapProject(data);
  }

  // Proje detayını kimler görebilir: proje sahibi, projenin onaylı üyeleri ve
  // (taşeron olmayan) iş/organizasyon kademesi. Kural tek yerde:
  // AccessService.canViewProject — findByJob'daki liste kuralıyla aynı kaynak.
  private async assertCanView(projectId: string, _projectRow: unknown, userId?: string): Promise<void> {
    await this.access.assertCanViewProject(projectId, userId);
  }

  async create(ownerId: string, data: Partial<Project>): Promise<Project> {
    const { data: row, error } = await this.supabase.client
      .from("projects")
      .insert({
        owner_id: ownerId,
        job_id: data.jobId,
        title: data.title ?? "",
        description: data.description ?? null,
        total_budget: data.totalBudget ?? 0,
        start_date: (data.startDate ?? new Date().toISOString()).slice(0, 10),
        deadline: (data.deadline ?? new Date().toISOString()).slice(0, 10),
      })
      .select()
      .single();
    if (error) throw error;
    return mapProject(row);
  }

  /**
   * "Bu projeyi yönetebilir mi?" — dışarıya açık hâli.
   *
   * Paylaşım linkleri de aynı kuralı kullanıyor (bkz. project-shares.service.ts):
   * projeyi kim düzenleyebiliyorsa, dışarıya link verme yetkisi de onda.
   *
   * userId BURADA ZORUNLU. Aşağıdaki assertCanManage `!userId` durumunda sessizce
   * geçiriyor (eski çağrı yerlerinin bazıları kimliksiz çağırıyordu); bir paylaşım
   * linki için bu "kimliksiz istek her şeyi yapabilir" demek olurdu.
   */
  async assertCanManageProject(id: string, userId: string): Promise<void> {
    if (!userId) throw new ForbiddenException("Bu işlem için giriş yapmalısınız");
    await this.assertCanManage(id, userId);
  }

  // Proje detaylarını yalnızca projenin sahibi ya da bağlı olduğu işin sahibi
  // değiştirebilir. (Önceden işe/projeye eklenen herkes değiştirebiliyordu.)
  private async assertCanManage(id: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, job_id")
      .eq("id", id)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) return;
    if (project.job_id) {
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", project.job_id).maybeSingle();
      if (job?.owner_id === userId) return;
    }
    throw new ForbiddenException("Bu projeyi yalnızca proje veya iş sahibi düzenleyebilir");
  }

  async update(id: string, data: Partial<Project>, requestingUserId?: string): Promise<Project> {
    await this.assertCanManage(id, requestingUserId);
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.totalBudget !== undefined) patch.total_budget = data.totalBudget;
    if (data.startDate !== undefined) patch.start_date = data.startDate.slice(0, 10);
    if (data.deadline !== undefined) patch.deadline = data.deadline.slice(0, 10);
    if (data.status !== undefined) patch.status = data.status;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;

    const { data: row, error } = await this.supabase.client
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Proje bulunamadı");
    return mapProject(row);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    await this.assertCanManage(id, requestingUserId);
    const { error } = await this.supabase.client.from("projects").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string, requestingUserId?: string): Promise<Project> {
    await this.assertCanManage(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Proje bulunamadı");

    // Projeye bağlı üst seviye görevleri arşivle (alt görevler TasksService.archive içinde kademeli arşivlenir)
    const { data: tasks } = await this.supabase.client
      .from("tasks")
      .select("id")
      .eq("project_id", id)
      .is("parent_task_id", null);
    for (const t of tasks ?? []) {
      await this.tasksService.archive(t.id);
    }

    // Projeye bağlı çıktıları arşivle
    const { data: outputs } = await this.supabase.client.from("outputs").select("id").eq("project_id", id);
    for (const o of outputs ?? []) {
      await this.outputsService.archive(o.id);
    }

    return mapProject(row);
  }

  async restore(id: string, requestingUserId?: string): Promise<Project> {
    await this.assertCanManage(id, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("projects")
      .update({ archived_at: null })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Proje bulunamadı");

    const { data: tasks } = await this.supabase.client
      .from("tasks")
      .select("id")
      .eq("project_id", id)
      .is("parent_task_id", null);
    for (const t of tasks ?? []) {
      await this.tasksService.restore(t.id);
    }

    const { data: outputs } = await this.supabase.client.from("outputs").select("id").eq("project_id", id);
    for (const o of outputs ?? []) {
      await this.outputsService.restore(o.id);
    }

    return mapProject(row);
  }

  async uploadCover(id: string, file: Express.Multer.File, requestingUserId?: string): Promise<Project> {
    await this.assertCanManage(id, requestingUserId);
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
