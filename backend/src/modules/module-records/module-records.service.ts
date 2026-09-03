import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ModuleRecord, ModuleRecordVersion, ModuleStatsResponse, ModuleUsageStat } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ModuleMembersService } from "../module-members/module-members.service";

function mapModuleRecord(row: any): ModuleRecord {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    moduleKey: row.module_key,
    data: row.data ?? {},
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    // A1 (form) alanları — diğer arketiplerde boş kalır.
    draftData: row.draft_data ?? undefined,
    scopeRef: row.scope_ref ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function mapVersion(row: any): ModuleRecordVersion {
  return {
    id: row.id,
    recordId: row.record_id,
    data: row.data ?? {},
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at,
    note: row.note ?? undefined,
  };
}

// Tam özellikli hale getirilen modüllerin (Gelir-Gider, Fatura, Müşteri, İşe
// Alım vb.) kayıtları — bkz. ProductsService ile aynı desen (yetki: organizasyon
// sahibi ya da ilgili departmanın onaylı yöneticisi).
//
// Bir kayıt iki sahipten birine bağlanır: organizasyon (şirket/işletme
// departmanlarındaki modüller) ya da iş (serbest çalışanın anasayfadan bir işe
// attığı modüller). Bkz. 037_freelancer_modules.sql.
@Injectable()
export class ModuleRecordsService {
  constructor(
    private supabase: SupabaseService,
    private moduleMembers: ModuleMembersService
  ) {}

  /**
   * Serbest çalışan tarafı: işin sahibi ya da modüle atanmış kişi yazabilir.
   * (042 öncesinde yalnızca iş sahibiydi.)
   */
  private async assertCanManageJob(jobId: string, moduleKey: string, userId?: string): Promise<void> {
    if (!userId) return;
    const access = await this.moduleMembers.resolveJobAccess(jobId, moduleKey, userId);
    if (!access.canWrite) {
      throw new ForbiddenException("Bu kaydı yalnızca işin sahibi veya modüle atanmış kişiler düzenleyebilir");
    }
  }

  /**
   * Yazma yetkisi. Yetki çözümlemesi ModuleMembersService'te tek yerde tanımlı:
   * organizasyon sahibi > departman yöneticisi > modül üyesi (bkz. 042).
   *
   * 042 öncesinde yalnızca organizasyon sahibi ve departman yöneticisi
   * yazabiliyordu; modüle atanan sıradan çalışanlar kayıt giremiyordu.
   */
  private async assertCanManage(
    organizationId: string,
    moduleKey: string,
    departmentId?: string,
    userId?: string
  ): Promise<void> {
    if (!userId) return;
    const access = await this.moduleMembers.resolveOrganizationAccess(
      organizationId,
      moduleKey,
      userId,
      departmentId
    );
    if (!access.canWrite) {
      throw new ForbiddenException(
        "Bu kaydı yalnızca organizasyon sahibi, departman yöneticisi veya modüle atanmış kişiler düzenleyebilir"
      );
    }
  }

  /**
   * OKUMA da yetkiye bağlı. Eskiden bu metot userId almıyordu: organizasyon
   * id'sini bilen herhangi bir oturumlu kullanıcı — bir departmana taşeron
   * olarak eklenmiş biri dahil — şirketin Gelir-Gider defterini
   * (`?moduleKey=fm_gelir_gider`, bkz. OrgBudgetPanel) okuyabiliyordu.
   *
   * Filtre kayıt kayıt değil, (modül, departman) çifti başına çözülür: aynı
   * çift için tek yetki sorgusu yeter, yüzlerce kayıt yüzlerce sorgu açmasın.
   */
  async findByOrganization(
    organizationId: string,
    moduleKey?: string,
    requestingUserId?: string
  ): Promise<ModuleRecord[]> {
    let query = this.supabase.client
      .from("module_records")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (moduleKey) query = query.eq("module_key", moduleKey);
    const { data, error } = await query;
    if (error) throw error;
    const records = (data ?? []).map(mapModuleRecord);
    if (!requestingUserId) return records;

    const readable = new Map<string, boolean>();
    const scopeKey = (r: ModuleRecord) => `${r.moduleKey}::${r.departmentId ?? ""}`;
    for (const key of new Set(records.map(scopeKey))) {
      const [mk, deptId] = key.split("::");
      const access = await this.moduleMembers.resolveOrganizationAccess(
        organizationId,
        mk,
        requestingUserId,
        deptId || undefined
      );
      readable.set(key, access.canRead);
    }
    return records.filter((r) => readable.get(scopeKey(r)));
  }

  async findByJob(jobId: string, moduleKey?: string): Promise<ModuleRecord[]> {
    let query = this.supabase.client
      .from("module_records")
      .select("*")
      .eq("job_id", jobId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (moduleKey) query = query.eq("module_key", moduleKey);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapModuleRecord);
  }

  async createForJob(
    jobId: string,
    payload: { moduleKey?: string; data?: Record<string, unknown> },
    requestingUserId?: string
  ): Promise<ModuleRecord> {
    if (!payload.moduleKey) throw new BadRequestException("moduleKey gerekli");
    await this.assertCanManageJob(jobId, payload.moduleKey, requestingUserId);

    // Kayıt yalnızca o işe gerçekten atanmış bir modüle girilebilir — aksi halde
    // anasayfada görünmeyen bir modüle veri yazılabilirdi.
    const { data: assigned } = await this.supabase.client
      .from("job_modules")
      .select("id")
      .eq("job_id", jobId)
      .eq("module_key", payload.moduleKey)
      .maybeSingle();
    if (!assigned) throw new BadRequestException("Bu modül bu işe atanmamış");

    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .insert({
        organization_id: null,
        job_id: jobId,
        module_key: payload.moduleKey,
        data: payload.data ?? {},
        created_by: requestingUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapModuleRecord(row);
  }

  /**
   * TOPLU kayıt ekleme — dosyadan içe aktarma için (bkz. ai-sheet-import.ts).
   *
   * create()/createForJob() her kayıt için ayrı yetki kontrolü ve ayrı insert
   * yapıyor; 100 satırlık bir tablo 200 gidiş dönüş demekti. Burada yetki bir
   * kez doğrulanır, satırlar tek insert ile yazılır.
   *
   * Veri DOĞRULAMASI çağıranın işidir (bkz. normalizeModuleData): tanımda
   * olmayan bir anahtar hiçbir ekranda görünmez, o yüzden buraya süzülmüş veri
   * gelmeli.
   */
  async createMany(
    target: { organizationId?: string; jobId?: string; departmentId?: string; moduleKey: string },
    rows: Record<string, unknown>[],
    requestingUserId: string
  ): Promise<{ id: string }[]> {
    if (!rows.length) return [];
    if (!target.moduleKey) throw new BadRequestException("moduleKey gerekli");

    if (target.jobId) {
      await this.assertCanManageJob(target.jobId, target.moduleKey, requestingUserId);
      const { data: assigned } = await this.supabase.client
        .from("job_modules")
        .select("id")
        .eq("job_id", target.jobId)
        .eq("module_key", target.moduleKey)
        .maybeSingle();
      if (!assigned) throw new BadRequestException("Bu modül bu işe atanmamış");
    } else if (target.organizationId) {
      await this.assertCanManage(target.organizationId, target.moduleKey, target.departmentId, requestingUserId);
    } else {
      throw new BadRequestException("organizationId ya da jobId gerekli");
    }

    const { data, error } = await this.supabase.client
      .from("module_records")
      .insert(
        rows.map((data) => ({
          organization_id: target.jobId ? null : target.organizationId,
          job_id: target.jobId ?? null,
          department_id: target.jobId ? null : (target.departmentId ?? null),
          module_key: target.moduleKey,
          data,
          created_by: requestingUserId,
        }))
      )
      .select("id");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ id: row.id as string }));
  }

  async findOne(id: string): Promise<ModuleRecord> {
    const { data, error } = await this.supabase.client.from("module_records").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return mapModuleRecord(data);
  }

  async create(
    organizationId: string,
    data: { departmentId?: string; moduleKey?: string; data?: Record<string, unknown>; scopeRef?: string },
    requestingUserId?: string
  ): Promise<ModuleRecord> {
    if (!data.moduleKey) throw new BadRequestException("moduleKey gerekli");
    await this.assertCanManage(organizationId, data.moduleKey, data.departmentId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .insert({
        organization_id: organizationId,
        department_id: data.departmentId ?? null,
        module_key: data.moduleKey,
        data: data.data ?? {},
        // A1: kapsam başına tek kayıt. Boş = organizasyon kapsamı.
        scope_ref: data.scopeRef ?? null,
        created_by: requestingUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapModuleRecord(row);
  }

  /** Kaydın sahibine (organizasyon ya da iş) göre doğru yetki kontrolünü seçer. */
  /** Okuma yetkisi (canRead). Sürüm geçmişi gibi by-id okuma uçları için. */
  private async assertCanViewRecord(record: ModuleRecord, userId?: string): Promise<void> {
    if (!userId) throw new ForbiddenException("Bu kaydı görme yetkin yok");
    const access = record.jobId
      ? await this.moduleMembers.resolveJobAccess(record.jobId, record.moduleKey, userId)
      : await this.moduleMembers.resolveOrganizationAccess(
          record.organizationId!,
          record.moduleKey,
          userId,
          record.departmentId
        );
    if (!access.canRead) throw new ForbiddenException("Bu kaydı görme yetkin yok");
  }

  private async assertCanManageRecord(record: ModuleRecord, userId?: string): Promise<void> {
    if (record.jobId) return this.assertCanManageJob(record.jobId, record.moduleKey, userId);
    if (record.organizationId) {
      return this.assertCanManage(record.organizationId, record.moduleKey, record.departmentId, userId);
    }
    throw new NotFoundException("Kayıt bulunamadı");
  }

  async update(id: string, patchData: Record<string, unknown>, requestingUserId?: string): Promise<ModuleRecord> {
    const existing = await this.findOne(id);
    await this.assertCanManageRecord(existing, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .update({ data: patchData, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapModuleRecord(row);
  }

  // ============================================================ Kullanım göstergeleri (yerleşim)
  //
  // Sekme yerleşiminin girdisi. Yeni tablo yok: modülün açılma tarihi
  // organization_modules/job_modules'tan, hacim ve son hareket module_records'tan,
  // atanmışlık module_members'tan geliyor.
  //
  // Toplama SQL'de değil burada yapılıyor: PostgREST'te group by dolambaçlı ve
  // satır sayısı (bir organizasyonun tüm modül kayıtları) bunu gerektirecek
  // ölçekte değil. Ölçek büyürse tek bir view'a taşınır, sözleşme değişmez.
  // Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §4

  private aggregate(
    rows: { module_key: string; created_at?: string; updated_at?: string; job_id?: string }[]
  ): Map<string, { count: number; lastActivityAt?: string; jobId?: string }> {
    const byModule = new Map<string, { count: number; lastActivityAt?: string; jobId?: string }>();
    for (const row of rows) {
      const current = byModule.get(row.module_key) ?? { count: 0 };
      current.count += 1;
      const touched = row.updated_at ?? row.created_at;
      if (touched && (!current.lastActivityAt || touched > current.lastActivityAt)) {
        current.lastActivityAt = touched;
        // Modül birden fazla işe atanmış olabilir; sekme en son çalışılanı açar.
        if (row.job_id) current.jobId = row.job_id;
      }
      byModule.set(row.module_key, current);
    }
    return byModule;
  }

  private async moduleNames(keys: string[]): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();
    const { data } = await this.supabase.client.from("module_catalog").select("key, name").in("key", keys);
    return new Map((data ?? []).map((r: any) => [r.key, r.name as string]));
  }

  async organizationModuleStats(organizationId: string, userId?: string): Promise<ModuleStatsResponse> {
    const [enabled, records, assignments, departments, org] = await Promise.all([
      this.supabase.client
        .from("organization_modules")
        .select("module_key, created_at")
        .eq("organization_id", organizationId),
      this.supabase.client
        .from("module_records")
        .select("module_key, created_at, updated_at")
        .eq("organization_id", organizationId)
        .is("archived_at", null),
      userId
        ? this.supabase.client
            .from("module_members")
            .select("module_key")
            .eq("organization_id", organizationId)
            .eq("user_id", userId)
            .eq("status", "approved")
            .is("removed_at", null)
        : Promise.resolve({ data: [] as any[] }),
      this.supabase.client.from("departments").select("id").eq("organization_id", organizationId),
      this.supabase.client.from("organizations").select("owner_id").eq("id", organizationId).maybeSingle(),
    ]);

    const departmentIds = (departments.data ?? []).map((d: any) => d.id as string);
    // Kullanıcı sayısı: onaylı departman üyeleri + sahibi. Aynı kişi birden çok
    // departmanda olabilir, bu yüzden tekilleştiriliyor.
    const people = new Set<string>();
    if ((org as any)?.data?.owner_id) people.add((org as any).data.owner_id);
    if (departmentIds.length > 0) {
      const { data: members } = await this.supabase.client
        .from("department_members")
        .select("user_id")
        .in("department_id", departmentIds)
        .eq("status", "approved");
      for (const m of members ?? []) if (m.user_id) people.add(m.user_id as string);
    }

    const usage = this.aggregate((records.data ?? []) as any[]);
    const assigned = new Set((assignments.data ?? []).map((a: any) => a.module_key as string));
    const keys = (enabled.data ?? []).map((e: any) => e.module_key as string);
    const names = await this.moduleNames(keys);

    const modules: ModuleUsageStat[] = (enabled.data ?? []).map((e: any) => {
      const stat = usage.get(e.module_key);
      return {
        moduleKey: e.module_key,
        moduleName: names.get(e.module_key) ?? e.module_key,
        recordCount: stat?.count ?? 0,
        lastActivityAt: stat?.lastActivityAt,
        enabledAt: e.created_at,
        assignedToMe: assigned.has(e.module_key),
      };
    });

    return {
      size: { userCount: people.size, departmentCount: departmentIds.length },
      modules,
    };
  }

  /**
   * Serbest çalışan anasayfası: kullanıcının KENDİ işlerine atadığı modüller.
   *
   * Ekip üyesi olarak dahil olduğu işler dışarıda: anasayfanın sekme çubuğu
   * kişinin kendi işini yönettiği yer, başkasının işinin modülü oraya çıkmamalı.
   */
  async myJobModuleStats(userId: string): Promise<ModuleStatsResponse> {
    const { data: jobs } = await this.supabase.client.from("jobs").select("id").eq("owner_id", userId);
    const jobIds = (jobs ?? []).map((j: any) => j.id as string);
    if (jobIds.length === 0) {
      return { size: { userCount: 1, departmentCount: 0 }, modules: [] };
    }

    const [enabled, records, assignments] = await Promise.all([
      this.supabase.client.from("job_modules").select("module_key, job_id, created_at").in("job_id", jobIds),
      this.supabase.client
        .from("module_records")
        .select("module_key, job_id, created_at, updated_at")
        .in("job_id", jobIds)
        .is("archived_at", null),
      this.supabase.client
        .from("module_members")
        .select("module_key")
        .in("job_id", jobIds)
        .eq("user_id", userId)
        .eq("status", "approved")
        .is("removed_at", null),
    ]);

    const usage = this.aggregate((records.data ?? []) as any[]);
    const assigned = new Set((assignments.data ?? []).map((a: any) => a.module_key as string));

    // Aynı modül birden fazla işe atanmış olabilir; sekme için tek satıra
    // indiriliyor: en erken atama tarihi, en son çalışılan iş.
    const byKey = new Map<string, { jobId: string; enabledAt: string }>();
    for (const row of (enabled.data ?? []) as any[]) {
      const current = byKey.get(row.module_key);
      if (!current || row.created_at < current.enabledAt) {
        byKey.set(row.module_key, { jobId: row.job_id, enabledAt: row.created_at });
      }
    }

    const names = await this.moduleNames(Array.from(byKey.keys()));
    const modules: ModuleUsageStat[] = Array.from(byKey.entries()).map(([key, meta]) => {
      const stat = usage.get(key);
      return {
        moduleKey: key,
        moduleName: names.get(key) ?? key,
        recordCount: stat?.count ?? 0,
        lastActivityAt: stat?.lastActivityAt,
        enabledAt: meta.enabledAt,
        assignedToMe: assigned.has(key),
        jobId: stat?.jobId ?? meta.jobId,
      };
    });

    // Serbest çalışan tek kişidir: departman yok, en küçük ölçek.
    return { size: { userCount: 1, departmentCount: 0 }, modules };
  }

  // ============================================================ A1 — taslak / onay / sürüm
  //
  // A1 (Form / Doküman) modüllerinde "kaydet" ile "yayımla" ayrıdır:
  // düzenleme draft_data'ya yazılır ve okuma görünümü hâlâ onaylı metni
  // gösterir; onay verildiğinde yürürlükteki metin sürüm arşivine taşınır ve
  // taslak yürürlüğe girer.
  //
  // Kural: ONAY DIŞINDA HİÇBİR YOL yürürlükteki metni değiştiremez. update()
  // yalnızca diğer arketiplerde kullanılır; A1 panelleri saveDraft/approve
  // çağırır.
  // Bkz. docs/moduller/20-motor-a1-form.md §4

  /** Onay yetkisi: taslak yazmak yetmez, yayımlamak ayrı yetkidir. */
  private async assertCanApproveRecord(record: ModuleRecord, userId?: string): Promise<void> {
    if (!userId) return;
    const access = record.jobId
      ? await this.moduleMembers.resolveJobAccess(record.jobId, record.moduleKey, userId)
      : await this.moduleMembers.resolveOrganizationAccess(
          record.organizationId!,
          record.moduleKey,
          userId,
          record.departmentId
        );
    // canManageTeam = sahip / departman yöneticisi / modül yöneticisi.
    if (!access.canManageTeam) {
      throw new ForbiddenException("Bu metni yalnızca modül yöneticisi veya organizasyon sahibi onaylayabilir");
    }
  }

  /** Taslağı kaydeder. Yürürlükteki metne dokunmaz. */
  async saveDraft(id: string, draftData: Record<string, unknown>, requestingUserId?: string): Promise<ModuleRecord> {
    const existing = await this.findOne(id);
    await this.assertCanManageRecord(existing, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .update({ draft_data: draftData, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapModuleRecord(row);
  }

  /** Taslağı atar; yürürlükteki metin olduğu gibi kalır. */
  async discardDraft(id: string, requestingUserId?: string): Promise<ModuleRecord> {
    const existing = await this.findOne(id);
    await this.assertCanManageRecord(existing, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .update({ draft_data: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapModuleRecord(row);
  }

  /**
   * Taslağı yürürlüğe alır.
   *
   * Sıra önemli: önce ESKİ metin arşive yazılır, sonra yenisi yürürlüğe geçer.
   * Ters sırada bir hata olursa eski metin kaybolurdu.
   */
  async approve(id: string, note?: string, requestingUserId?: string): Promise<ModuleRecord> {
    const existing = await this.findOne(id);
    await this.assertCanApproveRecord(existing, requestingUserId);

    if (!existing.draftData) {
      throw new BadRequestException("Onaylanacak bir değişiklik yok");
    }

    // İlk onayda yürürlükte anlamlı bir metin olmayabilir (kayıt taslak olarak
    // doğdu); boş bir sürüm satırı yazmanın değeri yok.
    const hasPrevious = Object.keys(existing.data ?? {}).length > 0;
    if (hasPrevious) {
      const { error: versionError } = await this.supabase.client.from("module_record_versions").insert({
        record_id: id,
        data: existing.data,
        approved_by: requestingUserId ?? null,
        note: note ?? null,
      });
      if (versionError) throw versionError;
    }

    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .update({ data: existing.draftData, draft_data: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapModuleRecord(row);
  }

  /** Sürüm geçmişi — yeniden eskiye. */
  async listVersions(id: string, userId?: string): Promise<ModuleRecordVersion[]> {
    await this.assertCanViewRecord(await this.findOne(id), userId);
    const { data, error } = await this.supabase.client
      .from("module_record_versions")
      .select("*")
      .eq("record_id", id)
      .order("approved_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapVersion);
  }

  /**
   * Eski bir sürüme dönüş.
   *
   * Doğrudan yürürlüğe GİRMEZ: eski metin taslağa yüklenir, kullanıcı okur ve
   * onaylarsa yayımlanır. Böylece "geri al" tek tuşla sessizce yayın yapmaz.
   */
  async revertToVersion(id: string, versionId: string, requestingUserId?: string): Promise<ModuleRecord> {
    const existing = await this.findOne(id);
    await this.assertCanApproveRecord(existing, requestingUserId);

    const { data: version, error } = await this.supabase.client
      .from("module_record_versions")
      .select("*")
      .eq("id", versionId)
      .eq("record_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!version) throw new NotFoundException("Sürüm bulunamadı");

    return this.saveDraft(id, version.data ?? {}, requestingUserId);
  }

  /**
   * Kayıt silinmez, arşivlenir.
   *
   * Finansal ve sözleşmesel kayıtlarda sert silme kabul edilemez: hem denetim
   * izi kaybolur hem Denetim panelinin okuyacağı veri kalmaz. Arşivlenen kayıt
   * listelerden düşer (findByOrganization/findByJob archived_at is null filtreler)
   * ama veritabanında durur.
   * Bkz. docs/moduller/00-modul-mimarisi.md — "arşivle, silme" arketip kararı.
   */
  async remove(id: string, requestingUserId?: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.assertCanManageRecord(existing, requestingUserId);
    const { error } = await this.supabase.client
      .from("module_records")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  /** Arşivden geri alma — arayüzdeki "geri al" akışı bunu çağırır. */
  async restore(id: string, requestingUserId?: string): Promise<ModuleRecord> {
    const existing = await this.findOne(id);
    await this.assertCanManageRecord(existing, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .update({ archived_at: null })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapModuleRecord(row);
  }
}
