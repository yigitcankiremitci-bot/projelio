import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { CreationRequest, CreationRequestKind, CreationRequestInput } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccessService } from "../../common/access/access.service";
import { NotificationsService } from "../notifications/notifications.service";
import { JobsService } from "../jobs/jobs.service";
import { ProjectsService } from "../projects/projects.service";
import { canRespond, needsApproval, resolveApprovers } from "./creation-approval";

function mapRequest(row: any): CreationRequest {
  return {
    id: row.id,
    kind: row.kind,
    requesterId: row.requester_id,
    requesterName: row.requester?.full_name ?? undefined,
    organizationId: row.organization_id ?? undefined,
    organizationName: row.organizations?.name ?? undefined,
    jobId: row.job_id ?? undefined,
    jobTitle: row.jobs?.title ?? undefined,
    payload: row.payload ?? {},
    status: row.status,
    decidedBy: row.decided_by ?? undefined,
    decidedAt: row.decided_at ?? undefined,
    decisionNote: row.decision_note ?? undefined,
    createdEntityId: row.created_entity_id ?? undefined,
    createdAt: row.created_at,
  };
}

// İlişkili adları tek sorguda getir. requester için FK adını açıkça veriyoruz:
// tabloda users'a iki FK var (requester_id, decided_by) ve PostgREST hangisini
// kastettiğimizi bilemiyor (bkz. department_members'taki aynı sorun).
const SELECT = "*, requester:users!creation_requests_requester_id_fkey(full_name), organizations(name), jobs(title)";

/**
 * Taşeronun iş/proje açma talepleri.
 *
 * Akış: taşeron "aç" der → kayıt AÇILMAZ, talep oluşur → yetkililere bildirim
 * (+ push) gider → biri onaylayınca gerçek kayıt talebin payload'ından doğar.
 * Reddedilirse talep gerekçesiyle saklanır.
 */
@Injectable()
export class CreationRequestsService {
  private readonly logger = new Logger(CreationRequestsService.name);

  constructor(
    private supabase: SupabaseService,
    private access: AccessService,
    private notifications: NotificationsService,
    private jobsService: JobsService,
    private projectsService: ProjectsService
  ) {}

  // ------------------------------------------------------------- Karar girdisi

  /**
   * Bu kullanıcı bu kaydı doğrudan açabilir mi? Jobs/Projects controller'ları
   * kayıt açmadan önce buna sorar (bkz. needsApproval).
   */
  async requiresApproval(
    kind: CreationRequestKind,
    userId: string,
    scope: { organizationId?: string | null; jobId?: string | null }
  ): Promise<boolean> {
    const isSubcontractor = await this.access.isSubcontractor(userId);
    if (!isSubcontractor) return false;

    if (kind === "project") {
      if (!scope.jobId) return false; // işsiz proje: kendi defteri
      const { data: job } = await this.supabase.client
        .from("jobs")
        .select("owner_id")
        .eq("id", scope.jobId)
        .maybeSingle();
      if (!job) throw new NotFoundException("İş bulunamadı");
      return needsApproval("project", { isSubcontractor, isJobOwner: job.owner_id === userId });
    }

    if (!scope.organizationId) {
      return needsApproval("job", { isSubcontractor, hasOrganization: false });
    }
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", scope.organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    return needsApproval("job", {
      isSubcontractor,
      hasOrganization: true,
      isOrganizationOwner: org.owner_id === userId,
    });
  }

  /** Talebi kimler onaylayabilir (bkz. resolveApprovers). */
  private async approversFor(request: CreationRequest): Promise<string[]> {
    if (request.kind === "project") {
      const { data: job } = await this.supabase.client
        .from("jobs")
        .select("owner_id")
        .eq("id", request.jobId!)
        .maybeSingle();
      return resolveApprovers("project", request.requesterId, { jobOwnerId: job?.owner_id });
    }

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", request.organizationId!)
      .maybeSingle();

    // Talebi açanın kadrosunda olduğu departmanların yöneticileri de karar
    // verebilir — akış tek kişiye bağlı kalmasın.
    const { data: myDepts } = await this.supabase.client
      .from("department_members")
      .select("department_id")
      .eq("user_id", request.requesterId)
      .eq("status", "approved");
    const deptIds = (myDepts ?? []).map((d: any) => d.department_id);

    let managerIds: string[] = [];
    if (deptIds.length > 0) {
      const { data: managers } = await this.supabase.client
        .from("department_members")
        .select("user_id")
        .in("department_id", deptIds)
        .eq("role", "manager")
        .eq("status", "approved");
      managerIds = (managers ?? []).map((m: any) => m.user_id).filter(Boolean);
    }

    return resolveApprovers("job", request.requesterId, {
      organizationOwnerId: org?.owner_id,
      departmentManagerIds: managerIds,
    });
  }

  // ------------------------------------------------------------------ Oluşturma

  async create(requesterId: string, input: CreationRequestInput): Promise<CreationRequest> {
    if (input.kind === "project" && !input.jobId) {
      throw new BadRequestException("Proje talebi için bir iş seçilmeli");
    }
    if (input.kind === "job" && !input.organizationId) {
      throw new BadRequestException("İş talebi için bir organizasyon seçilmeli");
    }
    // Talep açmak da bir erişimdir: göremediği bir işe/organizasyona talep
    // açamasın.
    if (input.kind === "project") await this.access.assertCanViewJob(input.jobId!, requesterId);
    else await this.access.assertCanViewOrganization(input.organizationId!, requesterId);

    const { data: row, error } = await this.supabase.client
      .from("creation_requests")
      .insert({
        kind: input.kind,
        requester_id: requesterId,
        organization_id: input.kind === "job" ? input.organizationId : null,
        job_id: input.kind === "project" ? input.jobId : null,
        payload: input.payload ?? {},
      })
      .select(SELECT)
      .single();
    if (error) throw error;

    const request = mapRequest(row);
    void this.notifyApprovers(request);
    return request;
  }

  private async notifyApprovers(request: CreationRequest): Promise<void> {
    try {
      const approvers = await this.approversFor(request);
      const what = request.kind === "job" ? "iş" : "proje";
      const title = String(request.payload?.title ?? "").trim() || `(başlıksız ${what})`;
      const who = request.requesterName ?? "Bir taşeron";
      await Promise.all(
        approvers.map((userId) =>
          this.notifications.notifyUser(
            userId,
            "creation_request",
            "Onay Bekleyen Talep",
            `${who}, "${title}" adlı ${what} açmak için onayınızı bekliyor.`,
            "/?tab=jobs"
          )
        )
      );
    } catch (err) {
      this.logger.warn(`Onay bildirimi gönderilemedi (request=${request.id}): ${String(err)}`);
    }
  }

  // ------------------------------------------------------------------- Listeler

  /** Talebi açanın kendi listesi. */
  async findMine(userId: string): Promise<CreationRequest[]> {
    const { data, error } = await this.supabase.client
      .from("creation_requests")
      .select(SELECT)
      .eq("requester_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRequest);
  }

  /**
   * Kullanıcının karar vermesi beklenen bekleyen talepler. Bildirim çanı bunu
   * okur (bkz. /me/job-invites ile aynı desen).
   *
   * Bekleyen talep sayısı küçük olduğu için onaylayıcı listesini talep başına
   * çözüyoruz; kapsam bazlı bir SQL'e sıkıştırmak departman yöneticiliği
   * kuralını sorguya gömmek olurdu.
   */
  async findPendingForApprover(userId: string): Promise<CreationRequest[]> {
    const { data, error } = await this.supabase.client
      .from("creation_requests")
      .select(SELECT)
      .eq("status", "pending")
      .neq("requester_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const requests = (data ?? []).map(mapRequest);
    const mine: CreationRequest[] = [];
    for (const r of requests) {
      const approvers = await this.approversFor(r);
      if (approvers.includes(userId)) mine.push(r);
    }
    return mine;
  }

  // -------------------------------------------------------------------- Karar

  async respond(
    id: string,
    approve: boolean,
    requestingUserId: string,
    note?: string
  ): Promise<CreationRequest> {
    const { data: row } = await this.supabase.client
      .from("creation_requests")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Talep bulunamadı");

    const request = mapRequest(row);
    if (!canRespond(request.status)) {
      throw new BadRequestException("Bu talep zaten yanıtlanmış");
    }

    const approvers = await this.approversFor(request);
    if (!approvers.includes(requestingUserId)) {
      throw new ForbiddenException("Bu talebi yanıtlama yetkiniz yok");
    }

    let createdEntityId: string | undefined;
    if (approve) createdEntityId = await this.materialize(request);

    const { data: updated, error } = await this.supabase.client
      .from("creation_requests")
      .update({
        status: approve ? "approved" : "rejected",
        decided_by: requestingUserId,
        decided_at: new Date().toISOString(),
        decision_note: note?.trim() || null,
        created_entity_id: createdEntityId ?? null,
      })
      .eq("id", id)
      // Yarış koşulu: iki yönetici aynı anda tıklarsa yalnızca ilki yazar.
      .eq("status", "pending")
      .select(SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new BadRequestException("Bu talep zaten yanıtlanmış");

    const result = mapRequest(updated);
    void this.notifyRequester(result, approve);
    return result;
  }

  /**
   * Onaylanan talebi gerçek kayda dönüştürür.
   *
   * Kayıt TALEBİ AÇAN kişinin adına açılır (owner_id = requesterId): işi/projeyi
   * yürütecek olan odur, onaylayan yalnızca izin vermiştir.
   */
  private async materialize(request: CreationRequest): Promise<string> {
    const p = request.payload ?? {};
    if (request.kind === "job") {
      const job = await this.jobsService.create(request.requesterId, {
        title: String(p.title ?? ""),
        description: p.description ? String(p.description) : undefined,
        organizationId: request.organizationId,
      });
      return job.id;
    }
    const project = await this.projectsService.create(request.requesterId, {
      jobId: request.jobId,
      title: String(p.title ?? ""),
      description: p.description ? String(p.description) : undefined,
      totalBudget: typeof p.totalBudget === "number" ? p.totalBudget : 0,
      startDate: p.startDate ? String(p.startDate) : undefined,
      deadline: p.deadline ? String(p.deadline) : undefined,
    });
    return project.id;
  }

  private async notifyRequester(request: CreationRequest, approved: boolean): Promise<void> {
    try {
      const what = request.kind === "job" ? "iş" : "proje";
      const title = String(request.payload?.title ?? "").trim() || `(başlıksız ${what})`;
      const link = approved
        ? request.kind === "job"
          ? `/jobs/${request.createdEntityId}`
          : `/projects/${request.createdEntityId}`
        : undefined;
      await this.notifications.notifyUser(
        request.requesterId,
        "creation_request_answered",
        approved ? "Talebiniz Onaylandı" : "Talebiniz Reddedildi",
        approved
          ? `"${title}" açıldı.`
          : `"${title}" talebi reddedildi.${request.decisionNote ? ` Gerekçe: ${request.decisionNote}` : ""}`,
        link
      );
    } catch (err) {
      this.logger.warn(`Talep yanıtı bildirilemedi (request=${request.id}): ${String(err)}`);
    }
  }

  /** Talep sahibi kendi bekleyen talebini geri çekebilir. */
  async cancel(id: string, requestingUserId: string): Promise<CreationRequest> {
    const { data: row } = await this.supabase.client
      .from("creation_requests")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Talep bulunamadı");
    if (row.requester_id !== requestingUserId) {
      throw new ForbiddenException("Bu talebi yalnızca sahibi geri çekebilir");
    }
    if (!canRespond(row.status)) throw new BadRequestException("Bu talep zaten yanıtlanmış");

    const { data: updated, error } = await this.supabase.client
      .from("creation_requests")
      .update({ status: "cancelled", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select(SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new BadRequestException("Bu talep zaten yanıtlanmış");
    return mapRequest(updated);
  }
}
