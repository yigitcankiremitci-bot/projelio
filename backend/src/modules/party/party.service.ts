import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  Party,
  PartyActivity,
  PartyActivityType,
  PartyContact,
  PartyDuplicate,
  PartyRole,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ModuleMembersService } from "../module-members/module-members.service";
import { addRole, findDuplicates } from "./party-dedup";

// Müşteri modülü bu varlığa bakar; yetki de o modülün üzerinden çözülür.
const MODULE_KEY = "crm_musteri";

function mapParty(row: any): Party {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    partyType: row.party_type,
    displayName: row.display_name,
    legalName: row.legal_name ?? undefined,
    taxNumber: row.tax_number ?? undefined,
    taxOffice: row.tax_office ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    address: row.address ?? undefined,
    roles: row.roles ?? [],
    status: row.status,
    source: row.source ?? undefined,
    ownerUserId: row.owner_user_id ?? undefined,
    parentPartyId: row.parent_party_id ?? undefined,
    linkedUserId: row.linked_user_id ?? undefined,
    mergedIntoId: row.merged_into_id ?? undefined,
    data: row.data ?? {},
    notes: row.notes ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
    ownerName: row.owner?.full_name ?? undefined,
  };
}

function mapContact(row: any): PartyContact {
  return {
    id: row.id,
    partyId: row.party_id,
    name: row.name,
    title: row.title ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    isPrimary: row.is_primary,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

function mapActivity(row: any): PartyActivity {
  return {
    id: row.id,
    partyId: row.party_id,
    type: row.type,
    occurredAt: row.occurred_at,
    summary: row.summary,
    userId: row.user_id ?? undefined,
    relatedType: row.related_type ?? undefined,
    relatedId: row.related_id ?? undefined,
    createdAt: row.created_at,
    userName: row.users?.full_name ?? undefined,
  };
}

export interface PartyScope {
  organizationId?: string;
  jobId?: string;
  departmentId?: string;
}

/**
 * Ortak varlık: dış dünyadaki kişi ve kurumlar.
 *
 * Satış ve Müşteri İlişkileri departmanları AYNI kayıtlara bakar — daha önce
 * iki ayrı modül anahtarıyla iki ayrı kayıt tutuluyordu ve aynı müşteri
 * bölünüyordu. Bkz. 046_party_and_customer_merge.sql
 */
@Injectable()
export class PartyService {
  constructor(
    private supabase: SupabaseService,
    private moduleMembers: ModuleMembersService
  ) {}

  private readonly OWNER_JOIN = "*, owner:users!party_owner_user_id_fkey(full_name)";

  // ============================================================ Yetki

  private async access(scope: PartyScope, userId?: string) {
    return scope.jobId
      ? this.moduleMembers.resolveJobAccess(scope.jobId, MODULE_KEY, userId)
      : this.moduleMembers.resolveOrganizationAccess(
          scope.organizationId!,
          MODULE_KEY,
          userId,
          scope.departmentId
        );
  }

  private async assertCanWrite(scope: PartyScope, userId?: string): Promise<void> {
    if (!userId) return;
    const a = await this.access(scope, userId);
    if (!a.canWrite) {
      throw new ForbiddenException(
        "Müşteri kaydını yalnızca organizasyon sahibi, departman yöneticisi veya modüle atanmış kişiler değiştirebilir"
      );
    }
  }

  /** Kaydın sahibinden (organizasyon/iş) kapsamı türetir. */
  private scopeOf(party: Party): PartyScope {
    return { organizationId: party.organizationId, jobId: party.jobId };
  }

  // ============================================================ Okuma

  async findAll(scope: PartyScope, opts: { role?: PartyRole; includeArchived?: boolean } = {}): Promise<Party[]> {
    let query = this.supabase.client
      .from("party")
      .select(this.OWNER_JOIN)
      // Birleştirilmiş kayıtlar listede görünmez; hedefleri zaten listede.
      .is("merged_into_id", null)
      .order("display_name", { ascending: true });

    query = scope.jobId ? query.eq("job_id", scope.jobId) : query.eq("organization_id", scope.organizationId);
    if (!opts.includeArchived) query = query.is("archived_at", null);
    if (opts.role) query = query.contains("roles", [opts.role]);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapParty);
  }

  async findOne(id: string): Promise<Party> {
    const { data, error } = await this.supabase.client
      .from("party")
      .select(this.OWNER_JOIN)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return mapParty(data);
  }

  // ============================================================ Tekilleştirme

  /**
   * Kaydetmeden önce olası kopyaları döndürür. Arayüz bunu "Bu kaydı daha önce
   * girmiş olabilirsiniz" uyarısı için kullanır; vergi numarası eşleşmesi
   * kaydı tamamen engeller.
   */
  async checkDuplicates(
    scope: PartyScope,
    input: { displayName?: string; taxNumber?: string; email?: string; excludeId?: string }
  ): Promise<PartyDuplicate[]> {
    // Aday havuzu tüm kayıtlar: benzerlik karşılaştırması normalleştirme
    // gerektirdiği için SQL'de değil bellekte yapılıyor. Organizasyon başına
    // müşteri sayısı bu ölçekte sorun çıkarmaz; büyürse trigram indeksine geçilir.
    const candidates = await this.findAll(scope);
    return findDuplicates(input, candidates);
  }

  // ============================================================ Yazma

  async create(
    scope: PartyScope,
    payload: Partial<Party> & { displayName?: string },
    userId?: string
  ): Promise<Party> {
    if (!payload.displayName?.trim()) throw new BadRequestException("Ad gerekli");
    await this.assertCanWrite(scope, userId);

    const duplicates = await this.checkDuplicates(scope, {
      displayName: payload.displayName,
      taxNumber: payload.taxNumber,
      email: payload.email,
    });
    const blocking = duplicates.find((d) => d.severity === "block");
    if (blocking) {
      throw new BadRequestException(
        `Bu vergi numarası zaten "${blocking.party.displayName}" kaydında kayıtlı`
      );
    }

    const { data: row, error } = await this.supabase.client
      .from("party")
      .insert({
        organization_id: scope.organizationId ?? null,
        job_id: scope.jobId ?? null,
        party_type: payload.partyType ?? "company",
        display_name: payload.displayName.trim(),
        legal_name: payload.legalName ?? null,
        tax_number: payload.taxNumber ?? null,
        tax_office: payload.taxOffice ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        website: payload.website ?? null,
        address: payload.address ?? null,
        roles: payload.roles?.length ? payload.roles : ["lead"],
        status: payload.status ?? "active",
        source: payload.source ?? null,
        // Sorumlu belirtilmediyse kaydı açan kişi üstlenir; sahipsiz müşteri
        // kimsenin takip etmediği müşteridir.
        owner_user_id: payload.ownerUserId ?? userId ?? null,
        parent_party_id: payload.parentPartyId ?? null,
        data: payload.data ?? {},
        notes: payload.notes ?? null,
        created_by: userId ?? null,
      })
      .select(this.OWNER_JOIN)
      .single();

    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu vergi numarası zaten kayıtlı");
      throw error;
    }

    const party = mapParty(row);
    await this.logActivity(party.id, "sistem", "Kayıt oluşturuldu", userId);
    return party;
  }

  async update(id: string, payload: Partial<Party>, userId?: string): Promise<Party> {
    const existing = await this.findOne(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);

    if (payload.taxNumber && payload.taxNumber !== existing.taxNumber) {
      const duplicates = await this.checkDuplicates(this.scopeOf(existing), {
        taxNumber: payload.taxNumber,
        excludeId: id,
      });
      if (duplicates.some((d) => d.severity === "block")) {
        throw new BadRequestException("Bu vergi numarası başka bir kayıtta kullanılıyor");
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const assign = (key: string, value: unknown) => {
      if (value !== undefined) patch[key] = value;
    };
    assign("party_type", payload.partyType);
    assign("display_name", payload.displayName?.trim());
    assign("legal_name", payload.legalName);
    assign("tax_number", payload.taxNumber);
    assign("tax_office", payload.taxOffice);
    assign("email", payload.email);
    assign("phone", payload.phone);
    assign("website", payload.website);
    assign("address", payload.address);
    assign("roles", payload.roles);
    assign("status", payload.status);
    assign("source", payload.source);
    assign("owner_user_id", payload.ownerUserId);
    assign("parent_party_id", payload.parentPartyId);
    assign("data", payload.data);
    assign("notes", payload.notes);

    const { data: row, error } = await this.supabase.client
      .from("party")
      .update(patch)
      .eq("id", id)
      .select(this.OWNER_JOIN)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapParty(row);
  }

  /** Arşivleme — silme değil. Geçmiş kayıtlardaki referanslar korunur. */
  async archive(id: string, userId?: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);
    const { error } = await this.supabase.client
      .from("party")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async restore(id: string, userId?: string): Promise<Party> {
    const existing = await this.findOne(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);
    const { data: row, error } = await this.supabase.client
      .from("party")
      .update({ archived_at: null })
      .eq("id", id)
      .select(this.OWNER_JOIN)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapParty(row);
  }

  /**
   * Rol ekleme. Diğer modüller bunu çağırır: ilk fatura kesildiğinde
   * `customer` rolü eklenir, `lead` silinmez.
   */
  async addRoleTo(id: string, role: PartyRole, userId?: string): Promise<Party> {
    const existing = await this.findOne(id);
    await this.assertCanWrite(this.scopeOf(existing), userId);
    const next = addRole(existing.roles, role);
    if (next.length === existing.roles.length) return existing;

    const { data: row, error } = await this.supabase.client
      .from("party")
      .update({ roles: next, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(this.OWNER_JOIN)
      .maybeSingle();
    if (error) throw error;
    await this.logActivity(id, "sistem", `"${role}" rolü eklendi`, userId);
    return mapParty(row);
  }

  /**
   * Yinelenen kayıtları birleştirir: alt kayıtlar hedefe taşınır, kaynak
   * silinmez, merged_into_id ile işaretlenir (geri alınabilsin diye).
   */
  async merge(sourceId: string, targetId: string, userId?: string): Promise<Party> {
    if (sourceId === targetId) throw new BadRequestException("Kayıt kendisiyle birleştirilemez");
    const source = await this.findOne(sourceId);
    const target = await this.findOne(targetId);
    if (source.mergedIntoId) throw new BadRequestException("Bu kayıt zaten birleştirilmiş");

    const scope = this.scopeOf(target);
    if (!userId) return target;
    const a = await this.access(scope, userId);
    if (!a.canManageTeam) {
      throw new ForbiddenException("Birleştirmeyi yalnızca modül yöneticisi yapabilir");
    }

    await this.supabase.client.from("party_contact").update({ party_id: targetId }).eq("party_id", sourceId);
    await this.supabase.client.from("party_activity").update({ party_id: targetId }).eq("party_id", sourceId);

    // Kaynağın rolleri hedefe aktarılır: birleşen kayıt "tedarikçi" ise hedef
    // de artık tedarikçidir.
    const mergedRoles = source.roles.reduce((acc, r) => addRole(acc, r), target.roles);
    await this.supabase.client
      .from("party")
      .update({ roles: mergedRoles, updated_at: new Date().toISOString() })
      .eq("id", targetId);

    await this.supabase.client
      .from("party")
      .update({ merged_into_id: targetId, archived_at: new Date().toISOString() })
      .eq("id", sourceId);

    await this.logActivity(targetId, "sistem", `"${source.displayName}" kaydı bu kayda birleştirildi`, userId);
    return this.findOne(targetId);
  }

  // ============================================================ Kişiler

  async findContacts(partyId: string): Promise<PartyContact[]> {
    const { data, error } = await this.supabase.client
      .from("party_contact")
      .select("*")
      .eq("party_id", partyId)
      .is("archived_at", null)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapContact);
  }

  async addContact(partyId: string, payload: Partial<PartyContact>, userId?: string): Promise<PartyContact> {
    if (!payload.name?.trim()) throw new BadRequestException("Kişi adı gerekli");
    const party = await this.findOne(partyId);
    await this.assertCanWrite(this.scopeOf(party), userId);

    // Birincil muhatap tektir; yenisi işaretlenirse eskisi düşer.
    if (payload.isPrimary) {
      await this.supabase.client
        .from("party_contact")
        .update({ is_primary: false })
        .eq("party_id", partyId)
        .is("archived_at", null);
    }

    const { data: row, error } = await this.supabase.client
      .from("party_contact")
      .insert({
        party_id: partyId,
        name: payload.name.trim(),
        title: payload.title ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        is_primary: payload.isPrimary ?? false,
        notes: payload.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapContact(row);
  }

  async removeContact(contactId: string, userId?: string): Promise<void> {
    const { data: contact } = await this.supabase.client
      .from("party_contact")
      .select("party_id")
      .eq("id", contactId)
      .maybeSingle();
    if (!contact) throw new NotFoundException("Kişi bulunamadı");
    const party = await this.findOne(contact.party_id);
    await this.assertCanWrite(this.scopeOf(party), userId);

    const { error } = await this.supabase.client
      .from("party_contact")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", contactId);
    if (error) throw error;
  }

  // ============================================================ Aktivite

  async findActivities(partyId: string): Promise<PartyActivity[]> {
    const { data, error } = await this.supabase.client
      .from("party_activity")
      .select("*, users!party_activity_user_id_fkey(full_name)")
      .eq("party_id", partyId)
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map(mapActivity);
  }

  async addActivity(partyId: string, payload: Partial<PartyActivity>, userId?: string): Promise<PartyActivity> {
    if (!payload.summary?.trim()) throw new BadRequestException("Açıklama gerekli");
    const party = await this.findOne(partyId);
    await this.assertCanWrite(this.scopeOf(party), userId);
    return this.logActivity(
      partyId,
      (payload.type as PartyActivityType) ?? "not",
      payload.summary.trim(),
      userId,
      payload.occurredAt
    );
  }

  /**
   * Aktivite kaydı. Diğer servisler de bunu çağırabilir (fatura kesildi,
   * destek talebi açıldı) — "sistem" türü kullanıcı girişi olmadığını belirtir.
   */
  async logActivity(
    partyId: string,
    type: PartyActivityType,
    summary: string,
    userId?: string,
    occurredAt?: string,
    related?: { type: string; id: string }
  ): Promise<PartyActivity> {
    const { data: row, error } = await this.supabase.client
      .from("party_activity")
      .insert({
        party_id: partyId,
        type,
        summary,
        user_id: userId ?? null,
        occurred_at: occurredAt ?? new Date().toISOString(),
        related_type: related?.type ?? null,
        related_id: related?.id ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapActivity(row);
  }
}
