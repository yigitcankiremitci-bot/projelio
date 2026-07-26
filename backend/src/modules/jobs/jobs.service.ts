import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Job } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ProjectsService } from "../projects/projects.service";
import { applyOrder } from "../../common/reorder.util";

const COVER_BUCKET = "job-covers";

function mapJob(row: any): Job {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.users?.full_name ?? undefined,
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
  constructor(
    private supabase: SupabaseService,
    private projectsService: ProjectsService
  ) {}

  async findAllForUser(userId: string): Promise<Job[]> {
    const { data, error } = await this.supabase.client
      .from("jobs")
      .select("*, users(full_name)")
      .eq("owner_id", userId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapJob);
  }

  async reorder(userId: string, ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client.from("jobs").select("id, owner_id").in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length || rows.some((r: any) => r.owner_id !== userId)) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    await applyOrder(this.supabase.client, "jobs", ids);
  }

  async findOne(id: string): Promise<Job> {
    const { data, error } = await this.supabase.client
      .from("jobs")
      .select("*, users(full_name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("İş bulunamadı");
    return mapJob(data);
  }

  async create(ownerId: string, data: Partial<Job>): Promise<Job> {
    const { data: row, error } = await this.supabase.client
      .from("jobs")
      .insert({
        owner_id: ownerId,
        title: data.title ?? "",
        description: data.description ?? null,
      })
      .select("*, users(full_name)")
      .single();
    if (error) throw error;
    return mapJob(row);
  }

  async update(id: string, data: Partial<Job>): Promise<Job> {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;

    const { data: row, error } = await this.supabase.client
      .from("jobs")
      .update(patch)
      .eq("id", id)
      .select("*, users(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("İş bulunamadı");
    return mapJob(row);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client.from("jobs").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string): Promise<Job> {
    const { data: row, error } = await this.supabase.client
      .from("jobs")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, users(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("İş bulunamadı");

    // Bu işe bağlı tüm projeleri (ve onların görev/çıktılarını) da arşivle
    const { data: projects } = await this.supabase.client.from("projects").select("id").eq("job_id", id);
    for (const p of projects ?? []) {
      await this.projectsService.archive(p.id);
    }

    return mapJob(row);
  }

  async restore(id: string): Promise<Job> {
    const { data: row, error } = await this.supabase.client
      .from("jobs")
      .update({ archived_at: null })
      .eq("id", id)
      .select("*, users(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("İş bulunamadı");

    const { data: projects } = await this.supabase.client.from("projects").select("id").eq("job_id", id);
    for (const p of projects ?? []) {
      await this.projectsService.restore(p.id);
    }

    return mapJob(row);
  }

  async uploadCover(id: string, file: Express.Multer.File): Promise<Job> {
    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
    const path = `${id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(COVER_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = this.supabase.client.storage.from(COVER_BUCKET).getPublicUrl(path);

    return this.update(id, { coverImageUrl: publicUrlData.publicUrl });
  }
}
