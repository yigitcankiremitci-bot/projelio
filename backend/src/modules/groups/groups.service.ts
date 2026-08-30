import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Group } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { removeStaleUploadsInFolder } from "../../common/storage/public-upload.util";
import { JobsService } from "../jobs/jobs.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { applyOrder } from "../../common/reorder.util";
import { detectImageUpload } from "../../common/upload-image.util";

const COVER_BUCKET = "group-covers";

function mapGroup(row: any): Group {
  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    ownerName: row.users?.full_name ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

@Injectable()
export class GroupsService {
  constructor(
    private supabase: SupabaseService,
    private jobsService: JobsService,
    private organizationsService: OrganizationsService
  ) {}

  async findAllForUser(userId: string): Promise<Group[]> {
    const { data: owned, error: ownedError } = await this.supabase.client
      .from("groups")
      .select("*, users(full_name)")
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (ownedError) throw ownedError;

    const { data: memberships, error: membershipError } = await this.supabase.client
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId);
    if (membershipError) throw membershipError;

    const memberGroupIds = (memberships ?? []).map((m: any) => m.group_id);
    let memberGroups: any[] = [];
    if (memberGroupIds.length > 0) {
      const { data, error } = await this.supabase.client
        .from("groups")
        .select("*, users(full_name)")
        .in("id", memberGroupIds)
        .is("archived_at", null);
      if (error) throw error;
      memberGroups = data ?? [];
    }

    const byId = new Map<string, any>();
    for (const row of [...(owned ?? []), ...memberGroups]) byId.set(row.id, row);

    const groups = Array.from(byId.values())
      .map(mapGroup)
      .sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    const groupIds = groups.map((g) => g.id);
    if (groupIds.length > 0) {
      const { data: orgRows } = await this.supabase.client
        .from("organizations")
        .select("group_id")
        .in("group_id", groupIds)
        .is("archived_at", null);
      const orgCounts = new Map<string, number>();
      for (const o of orgRows ?? []) {
        orgCounts.set(o.group_id, (orgCounts.get(o.group_id) ?? 0) + 1);
      }

      const { data: jobRows } = await this.supabase.client
        .from("jobs")
        .select("group_id")
        .in("group_id", groupIds)
        .is("archived_at", null);
      const jobCounts = new Map<string, number>();
      for (const j of jobRows ?? []) {
        jobCounts.set(j.group_id, (jobCounts.get(j.group_id) ?? 0) + 1);
      }

      for (const g of groups) {
        g.organizationCount = orgCounts.get(g.id) ?? 0;
        g.jobCount = jobCounts.get(g.id) ?? 0;
      }
    }

    return groups;
  }

  async reorder(userId: string, ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client.from("groups").select("id, owner_id").in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    const visible = await this.findAllForUser(userId);
    const visibleIds = new Set(visible.map((g) => g.id));
    if (rows.some((r: any) => !visibleIds.has(r.id))) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    await applyOrder(this.supabase.client, "groups", ids);
  }

  async findOne(id: string): Promise<Group> {
    const { data, error } = await this.supabase.client
      .from("groups")
      .select("*, users(full_name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Grup bulunamadı");
    return mapGroup(data);
  }

  async create(ownerId: string, data: Partial<Group>): Promise<Group> {
    const { data: row, error } = await this.supabase.client
      .from("groups")
      .insert({
        owner_id: ownerId,
        name: data.name ?? "",
        description: data.description ?? null,
      })
      .select("*, users(full_name)")
      .single();
    if (error) throw error;
    return mapGroup(row);
  }

  private async assertOwner(id: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data } = await this.supabase.client.from("groups").select("owner_id").eq("id", id).maybeSingle();
    if (!data) throw new NotFoundException("Grup bulunamadı");
    if (data.owner_id !== userId) throw new ForbiddenException("Bu grubu yalnızca sahibi düzenleyebilir");
  }

  async update(id: string, data: Partial<Group>, requestingUserId?: string): Promise<Group> {
    await this.assertOwner(id, requestingUserId);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;

    const { data: row, error } = await this.supabase.client
      .from("groups")
      .update(patch)
      .eq("id", id)
      .select("*, users(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Grup bulunamadı");
    return mapGroup(row);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    await this.assertOwner(id, requestingUserId);
    const { error } = await this.supabase.client.from("groups").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string, requestingUserId?: string): Promise<Group> {
    await this.assertOwner(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("groups")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, users(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Grup bulunamadı");

    // Gruba doğrudan bağlı işleri arşivle (kendi projelerini/görevlerini de kademeli arşivler)
    const { data: jobs } = await this.supabase.client.from("jobs").select("id").eq("group_id", id);
    for (const j of jobs ?? []) {
      await this.jobsService.archive(j.id);
    }

    // Gruba bağlı organizasyonları arşivle (onlar da kendi işlerini/projelerini arşivler)
    const { data: orgs } = await this.supabase.client.from("organizations").select("id").eq("group_id", id);
    for (const o of orgs ?? []) {
      await this.organizationsService.archive(o.id);
    }

    return mapGroup(row);
  }

  async restore(id: string, requestingUserId?: string): Promise<Group> {
    await this.assertOwner(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("groups")
      .update({ archived_at: null })
      .eq("id", id)
      .select("*, users(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Grup bulunamadı");

    const { data: jobs } = await this.supabase.client.from("jobs").select("id").eq("group_id", id);
    for (const j of jobs ?? []) {
      await this.jobsService.restore(j.id);
    }

    return mapGroup(row);
  }

  async uploadCover(id: string, file: Express.Multer.File, requestingUserId?: string): Promise<Group> {
    await this.assertOwner(id, requestingUserId);
    // Tur ve uzanti istemcinin sozune degil, dosyanin ilk baytlarindaki
    // imzaya gore belirlenir (bkz. common/upload-image.util.ts).
    const { contentType, ext } = detectImageUpload(file);
    const path = `${id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(COVER_BUCKET)
      .upload(path, file.buffer, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const publicUrl = this.supabase.publicStorageUrl(COVER_BUCKET, path);

    const updated = await this.update(id, { coverImageUrl: publicUrl });

    // Kayıt güncellendikten SONRA temizle: güncelleme başarısız olursa eski görsel
    // yerinde kalsın, kayıt silinmiş bir dosyaya işaret etmesin.
    await removeStaleUploadsInFolder(this.supabase.client, COVER_BUCKET, path);

    return updated;
  }
}
