import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Organization } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { removeStaleUploadsInFolder } from "../../common/storage/public-upload.util";
import { JobsService } from "../jobs/jobs.service";
import { AccessService } from "../../common/access/access.service";
import { applyOrder } from "../../common/reorder.util";
import { detectImageUpload } from "../../common/upload-image.util";

const COVER_BUCKET = "organization-covers";

function mapOrganization(row: any): Organization {
  return {
    id: row.id,
    groupId: row.group_id ?? undefined,
    groupName: row.groups?.name ?? undefined,
    ownerId: row.owner_id ?? undefined,
    ownerName: row.users?.full_name ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    orgType: row.org_type ?? "sirket",
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    private supabase: SupabaseService,
    private jobsService: JobsService,
    private access: AccessService
  ) {}

  // Kullanıcının sahibi olduğu organizasyonlar + üyesi olduğu (approved) organizasyonlar
  // + onaylı kadrosunda olduğu bir departmanın bağlı olduğu organizasyonlar (bir
  // çalışan/taşeron departmana kabul edildiğinde — "işe başladığında" — o
  // organizasyon ve departmanları sidebar'da görünmeye başlasın).
  async findAllForUser(userId: string): Promise<Organization[]> {
    const { data: owned, error: ownedError } = await this.supabase.client
      .from("organizations")
      .select("*, users(full_name), groups(name)")
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (ownedError) throw ownedError;

    const { data: memberships, error: membershipError } = await this.supabase.client
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (membershipError) throw membershipError;

    const memberOrgIds = (memberships ?? []).map((m: any) => m.organization_id);
    let memberOrgs: any[] = [];
    if (memberOrgIds.length > 0) {
      const { data, error } = await this.supabase.client
        .from("organizations")
        .select("*, users(full_name), groups(name)")
        .in("id", memberOrgIds)
        .is("archived_at", null);
      if (error) throw error;
      memberOrgs = data ?? [];
    }

    const { data: deptMemberships, error: deptMembershipError } = await this.supabase.client
      .from("department_members")
      .select("department_id")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (deptMembershipError) throw deptMembershipError;

    const deptIds = (deptMemberships ?? []).map((m: any) => m.department_id);
    let deptOrgs: any[] = [];
    if (deptIds.length > 0) {
      const { data: depts, error: deptsError } = await this.supabase.client
        .from("departments")
        .select("organization_id")
        .in("id", deptIds);
      if (deptsError) throw deptsError;
      const deptOrgIds = Array.from(new Set((depts ?? []).map((d: any) => d.organization_id)));
      if (deptOrgIds.length > 0) {
        const { data, error } = await this.supabase.client
          .from("organizations")
          .select("*, users(full_name), groups(name)")
          .in("id", deptOrgIds)
          .is("archived_at", null);
        if (error) throw error;
        deptOrgs = data ?? [];
      }
    }

    const byId = new Map<string, any>();
    for (const row of [...(owned ?? []), ...memberOrgs, ...deptOrgs]) byId.set(row.id, row);

    const orgs = Array.from(byId.values())
      .map(mapOrganization)
      .sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      const { data: jobRows } = await this.supabase.client
        .from("jobs")
        .select("organization_id")
        .in("organization_id", orgIds)
        .is("archived_at", null);
      const counts = new Map<string, number>();
      for (const j of jobRows ?? []) {
        counts.set(j.organization_id, (counts.get(j.organization_id) ?? 0) + 1);
      }
      for (const o of orgs) o.jobCount = counts.get(o.id) ?? 0;
    }

    return orgs;
  }

  // Bir Group'a bağlı organizasyonlar (GroupDetail sayfası için).
  async findByGroupId(groupId: string): Promise<Organization[]> {
    const { data, error } = await this.supabase.client
      .from("organizations")
      .select("*, users(full_name), groups(name)")
      .eq("group_id", groupId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const orgs = (data ?? []).map(mapOrganization);

    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      const { data: jobRows } = await this.supabase.client
        .from("jobs")
        .select("organization_id")
        .in("organization_id", orgIds)
        .is("archived_at", null);
      const counts = new Map<string, number>();
      for (const j of jobRows ?? []) {
        counts.set(j.organization_id, (counts.get(j.organization_id) ?? 0) + 1);
      }
      for (const o of orgs) o.jobCount = counts.get(o.id) ?? 0;
    }

    return orgs;
  }

  async reorder(userId: string, ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client
      .from("organizations")
      .select("id, owner_id")
      .in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    const visible = await this.findAllForUser(userId);
    const visibleIds = new Set(visible.map((o) => o.id));
    if (rows.some((r: any) => !visibleIds.has(r.id))) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    await applyOrder(this.supabase.client, "organizations", ids);
  }

  // requestingUserId verilirse organizasyon yalnızca ona erişimi olanlara açılır:
  // sahibi, onaylı üyesi ya da bir departmanının onaylı kadrosunda olan kişi
  // (findAllForUser ile TAM AYNI daire — sidebar'da görünmeyen bir organizasyon
  // doğrudan URL ile de açılamamalı). Verilmezse (dahili çağrılar) kontrol atlanır.
  async findOne(id: string, requestingUserId?: string): Promise<Organization> {
    const { data, error } = await this.supabase.client
      .from("organizations")
      .select("*, users(full_name), groups(name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Organizasyon bulunamadı");

    const organization = mapOrganization(data);

    if (requestingUserId) {
      // Görünürlük ve sekme yetkileri tek kaynaktan (bkz. AccessService).
      const access = await this.access.organizationAccess(id, requestingUserId);
      if (!access.canView) {
        throw new ForbiddenException("Bu organizasyonu görüntüleme yetkiniz yok");
      }
      organization.viewerAccess = access;
    }

    return organization;
  }

  async create(ownerId: string, data: Partial<Organization>): Promise<Organization> {
    const { data: row, error } = await this.supabase.client
      .from("organizations")
      .insert({
        owner_id: ownerId,
        group_id: data.groupId ?? null,
        name: data.name ?? "",
        description: data.description ?? null,
        org_type: data.orgType === "isletme" ? "isletme" : "sirket",
      })
      .select("*, users(full_name), groups(name)")
      .single();
    if (error) throw error;
    return mapOrganization(row);
  }

  private async assertOwner(id: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data } = await this.supabase.client.from("organizations").select("owner_id").eq("id", id).maybeSingle();
    if (!data) throw new NotFoundException("Organizasyon bulunamadı");
    if (data.owner_id !== userId) throw new ForbiddenException("Bu organizasyonu yalnızca sahibi düzenleyebilir");
  }

  async update(id: string, data: Partial<Organization>, requestingUserId?: string): Promise<Organization> {
    await this.assertOwner(id, requestingUserId);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.groupId !== undefined) patch.group_id = data.groupId ?? null;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;
    if (data.orgType !== undefined) patch.org_type = data.orgType === "isletme" ? "isletme" : "sirket";

    const { data: row, error } = await this.supabase.client
      .from("organizations")
      .update(patch)
      .eq("id", id)
      .select("*, users(full_name), groups(name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Organizasyon bulunamadı");
    return mapOrganization(row);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    await this.assertOwner(id, requestingUserId);
    const { error } = await this.supabase.client.from("organizations").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string, requestingUserId?: string): Promise<Organization> {
    await this.assertOwner(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("organizations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, users(full_name), groups(name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Organizasyon bulunamadı");

    // Bu organizasyona bağlı tüm işleri (ve onların projelerini/görevlerini) da arşivle
    const { data: jobs } = await this.supabase.client.from("jobs").select("id").eq("organization_id", id);
    for (const j of jobs ?? []) {
      await this.jobsService.archive(j.id);
    }

    return mapOrganization(row);
  }

  async restore(id: string, requestingUserId?: string): Promise<Organization> {
    await this.assertOwner(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("organizations")
      .update({ archived_at: null })
      .eq("id", id)
      .select("*, users(full_name), groups(name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Organizasyon bulunamadı");

    const { data: jobs } = await this.supabase.client.from("jobs").select("id").eq("organization_id", id);
    for (const j of jobs ?? []) {
      await this.jobsService.restore(j.id);
    }

    return mapOrganization(row);
  }

  async uploadCover(id: string, file: Express.Multer.File, requestingUserId?: string): Promise<Organization> {
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
