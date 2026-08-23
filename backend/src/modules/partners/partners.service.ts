import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Partner, PartnerModuleGrant } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";

function mapPartner(row: any): Partner {
  return {
    id: row.id,
    groupId: row.group_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    userId: row.user_id ?? undefined,
    inviteEmail: row.invite_email ?? undefined,
    equityPercent: row.equity_percent != null ? Number(row.equity_percent) : 0,
    grantedBy: row.granted_by ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    fullName: row.users?.full_name ?? undefined,
    email: row.users?.email ?? undefined,
    username: row.users?.username ?? undefined,
  };
}

function mapGrant(row: any): PartnerModuleGrant {
  return {
    id: row.id,
    partnerId: row.partner_id,
    moduleKey: row.module_key,
    createdAt: row.created_at,
  };
}

// Holding/şirket/işletmeye hisse yüzdesiyle ortak olan kişiler. Ortağı ekleyen
// kişi, ortağın hangi modülleri görebileceğini partner_module_grants ile ayrıca belirler.
@Injectable()
export class PartnersService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  private async assertOwner(target: { groupId?: string; organizationId?: string }, userId?: string): Promise<void> {
    if (!userId) return;
    if (target.organizationId) {
      const { data } = await this.supabase.client
        .from("organizations")
        .select("owner_id")
        .eq("id", target.organizationId)
        .maybeSingle();
      if (!data) throw new NotFoundException("Organizasyon bulunamadı");
      if (data.owner_id !== userId) throw new ForbiddenException("Ortak eklemek/düzenlemek yalnızca sahibine aittir");
    } else if (target.groupId) {
      const { data } = await this.supabase.client.from("groups").select("owner_id").eq("id", target.groupId).maybeSingle();
      if (!data) throw new NotFoundException("Grup bulunamadı");
      if (data.owner_id !== userId) throw new ForbiddenException("Ortak eklemek/düzenlemek yalnızca sahibine aittir");
    }
  }

  async findByOrganization(organizationId: string): Promise<Partner[]> {
    const { data, error } = await this.supabase.client
      .from("partners")
      // partners'ın users'a iki ayrı FK'sı var (user_id, granted_by) — PostgREST
      // hangi ilişkiyi kastettiğimizi bilemeyip belirsizlik hatası veriyordu
      // (department_members'taki aynı sorun, bkz. department-members.service.ts).
      .select("*, users!partners_user_id_fkey(full_name, email, username)")
      .eq("organization_id", organizationId)
      .neq("status", "removed");
    if (error) throw error;
    return (data ?? []).map(mapPartner);
  }

  async findByGroup(groupId: string): Promise<Partner[]> {
    const { data, error } = await this.supabase.client
      .from("partners")
      // partners'ın users'a iki ayrı FK'sı var (user_id, granted_by) — PostgREST
      // hangi ilişkiyi kastettiğimizi bilemeyip belirsizlik hatası veriyordu
      // (department_members'taki aynı sorun, bkz. department-members.service.ts).
      .select("*, users!partners_user_id_fkey(full_name, email, username)")
      .eq("group_id", groupId)
      .neq("status", "removed");
    if (error) throw error;
    return (data ?? []).map(mapPartner);
  }

  private async findById(id: string): Promise<Partner> {
    const { data, error } = await this.supabase.client
      .from("partners")
      // partners'ın users'a iki ayrı FK'sı var (user_id, granted_by) — PostgREST
      // hangi ilişkiyi kastettiğimizi bilemeyip belirsizlik hatası veriyordu
      // (department_members'taki aynı sorun, bkz. department-members.service.ts).
      .select("*, users!partners_user_id_fkey(full_name, email, username)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Ortaklık kaydı bulunamadı");
    return mapPartner(data);
  }

  async invite(
    target: { groupId?: string; organizationId?: string },
    data: { userId?: string; inviteEmail?: string; equityPercent: number },
    requestingUserId?: string
  ): Promise<Partner> {
    await this.assertOwner(target, requestingUserId);
    if (!data.userId && !data.inviteEmail) throw new BadRequestException("Bir kullanıcı ya da davet e-postası gerekli");
    if (!data.equityPercent || data.equityPercent <= 0 || data.equityPercent > 100) {
      throw new BadRequestException("Hisse yüzdesi 0-100 arasında olmalı");
    }

    const { data: row, error } = await this.supabase.client
      .from("partners")
      .insert({
        group_id: target.groupId ?? null,
        organization_id: target.organizationId ?? null,
        user_id: data.userId ?? null,
        invite_email: data.userId ? null : data.inviteEmail?.trim().toLowerCase(),
        equity_percent: data.equityPercent,
        granted_by: requestingUserId ?? null,
        status: data.userId ? "pending" : "invited",
      })
      // partners'ın users'a iki ayrı FK'sı var (user_id, granted_by) — PostgREST
      // hangi ilişkiyi kastettiğimizi bilemeyip belirsizlik hatası veriyordu
      // (department_members'taki aynı sorun, bkz. department-members.service.ts).
      .select("*, users!partners_user_id_fkey(full_name, email, username)")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu kişi zaten ortak olarak ekli");
      throw error;
    }

    if (data.userId) {
      void this.notificationsService.notifyUser(
        data.userId,
        "team_invite",
        "Ortaklık Daveti",
        `%${data.equityPercent} hisse ile ortaklığa davet edildin.`
      );
    }

    return mapPartner(row);
  }

  async updateEquity(id: string, equityPercent: number, requestingUserId?: string): Promise<Partner> {
    const existing = await this.findById(id);
    await this.assertOwner(existing, requestingUserId);
    if (!equityPercent || equityPercent <= 0 || equityPercent > 100) {
      throw new BadRequestException("Hisse yüzdesi 0-100 arasında olmalı");
    }
    const { data: row, error } = await this.supabase.client
      .from("partners")
      .update({ equity_percent: equityPercent })
      .eq("id", id)
      // partners'ın users'a iki ayrı FK'sı var (user_id, granted_by) — PostgREST
      // hangi ilişkiyi kastettiğimizi bilemeyip belirsizlik hatası veriyordu
      // (department_members'taki aynı sorun, bkz. department-members.service.ts).
      .select("*, users!partners_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Ortaklık kaydı bulunamadı");
    return mapPartner(row);
  }

  async respond(id: string, approve: boolean, requestingUserId: string): Promise<Partner> {
    const existing = await this.findById(id);
    if (existing.userId && existing.userId !== requestingUserId) {
      throw new ForbiddenException("Bu daveti yalnızca davet edilen kişi yanıtlayabilir");
    }
    const patch: Record<string, unknown> = { status: approve ? "approved" : "rejected" };
    if (!existing.userId) patch.user_id = requestingUserId;

    const { data: row, error } = await this.supabase.client
      .from("partners")
      .update(patch)
      .eq("id", id)
      // partners'ın users'a iki ayrı FK'sı var (user_id, granted_by) — PostgREST
      // hangi ilişkiyi kastettiğimizi bilemeyip belirsizlik hatası veriyordu
      // (department_members'taki aynı sorun, bkz. department-members.service.ts).
      .select("*, users!partners_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Ortaklık kaydı bulunamadı");
    return mapPartner(row);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    const existing = await this.findById(id);
    await this.assertOwner(existing, requestingUserId);
    const { error } = await this.supabase.client.from("partners").update({ status: "removed" }).eq("id", id);
    if (error) throw error;
  }

  async findGrants(partnerId: string, userId?: string): Promise<PartnerModuleGrant[]> {
    // Bir ortağın modül izinlerini görmek sahiplik düzeyinde bir bilgi; eskiden
    // hiçbir kontrol yoktu, UUID'yi bilen herkes okuyabiliyordu.
    const partner = await this.findById(partnerId);
    await this.assertOwner({ organizationId: partner.organizationId, groupId: partner.groupId }, userId);
    const { data, error } = await this.supabase.client.from("partner_module_grants").select("*").eq("partner_id", partnerId);
    if (error) throw error;
    return (data ?? []).map(mapGrant);
  }

  async grantModule(partnerId: string, moduleKey: string, requestingUserId?: string): Promise<PartnerModuleGrant> {
    const existing = await this.findById(partnerId);
    await this.assertOwner(existing, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("partner_module_grants")
      .upsert(
        { partner_id: partnerId, module_key: moduleKey, granted_by: requestingUserId ?? null },
        { onConflict: "partner_id,module_key", ignoreDuplicates: true }
      )
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (row) return mapGrant(row);
    const { data: existingGrant, error: existingError } = await this.supabase.client
      .from("partner_module_grants")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("module_key", moduleKey)
      .single();
    if (existingError) throw existingError;
    return mapGrant(existingGrant);
  }

  async revokeModule(partnerId: string, moduleKey: string, requestingUserId?: string): Promise<void> {
    const existing = await this.findById(partnerId);
    await this.assertOwner(existing, requestingUserId);
    const { error } = await this.supabase.client
      .from("partner_module_grants")
      .delete()
      .eq("partner_id", partnerId)
      .eq("module_key", moduleKey);
    if (error) throw error;
  }
}
