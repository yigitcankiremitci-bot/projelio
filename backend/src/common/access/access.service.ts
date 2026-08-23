import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AccountType, DepartmentMemberRole, OrganizationAccess } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { decideDepartmentAccess } from "../../modules/departments/department-access";
import { SURFACE_MESSAGE, isSubcontractorAccount, seesAllProjectsOfJob, type RestrictedSurface } from "./subcontractor";

/**
 * Görünürlüğün tek kapısı.
 *
 * Uygulama "sahibi olan yapar" varsayımıyla büyüdüğü için okuma uç noktalarının
 * çoğu hiç yetki sormuyordu: oturum açmış herhangi bir kullanıcı /jobs/:id,
 * /organizations/:id/products, /groups/:id gibi uçları çağırıp başkasının
 * verisini okuyabiliyordu. Kontrolleri uç uç dağıtmak yerine buraya topluyoruz;
 * yarın eklenen bir uç da aynı kapıdan geçsin.
 *
 * Kapsam sorularının cevabı hiyerarşiye göre yukarı doğru genişler:
 *   Grup > Organizasyon > (Departman | İş) > Proje > Görev
 * Üst kademede yetkisi olan alt kademeyi de görür; tersi geçerli değildir.
 */
@Injectable()
export class AccessService {
  // account_type nadiren değişir ama her yetki kontrolünde sorulur; kısa ömürlü
  // önbellek istek başına onlarca gereksiz sorguyu önler.
  private accountTypeCache = new Map<string, { value: AccountType | null; at: number }>();
  private static readonly ACCOUNT_TTL_MS = 60_000;

  constructor(private supabase: SupabaseService) {}

  // ------------------------------------------------------------ Hesap tipi

  async accountType(userId: string): Promise<AccountType | null> {
    const hit = this.accountTypeCache.get(userId);
    if (hit && Date.now() - hit.at < AccessService.ACCOUNT_TTL_MS) return hit.value;

    const { data } = await this.supabase.client
      .from("users")
      .select("account_type")
      .eq("id", userId)
      .maybeSingle();
    const value = (data?.account_type ?? null) as AccountType | null;
    this.accountTypeCache.set(userId, { value, at: Date.now() });
    return value;
  }

  async isSubcontractor(userId?: string): Promise<boolean> {
    if (!userId) return false;
    return isSubcontractorAccount(await this.accountType(userId));
  }

  /** Taşerona tamamen kapalı yüzeyler (bütçe, ekip listesi, ayarlar…). */
  async assertNotSubcontractor(userId: string | undefined, surface: RestrictedSurface): Promise<void> {
    if (!userId) return;
    if (await this.isSubcontractor(userId)) {
      throw new ForbiddenException(SURFACE_MESSAGE[surface]);
    }
  }

  // --------------------------------------------------------------- Proje

  async canViewProject(projectId: string, userId: string): Promise<boolean> {
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) return true;

    // Projeye doğrudan atanmış onaylı üye — taşeronun tek meşru yolu budur.
    const { data: membership } = await this.supabase.client
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (membership) return true;

    // İş üzerinden dolaylı erişim yalnızca taşeron OLMAYANLAR için geçerli.
    if (project.job_id && !(await this.isSubcontractor(userId))) {
      return this.canViewJob(project.job_id, userId);
    }
    return false;
  }

  async assertCanViewProject(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;
    if (!(await this.canViewProject(projectId, userId))) {
      throw new ForbiddenException("Bu projeyi görüntüleme yetkiniz yok");
    }
  }

  // ------------------------------------------------------------------ İş

  async canViewJob(jobId: string, userId: string): Promise<boolean> {
    const { data: job } = await this.supabase.client
      .from("jobs")
      .select("owner_id, organization_id, group_id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) throw new NotFoundException("İş bulunamadı");
    if (job.owner_id === userId) return true;

    const { data: jobMember } = await this.supabase.client
      .from("job_members")
      .select("id")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (jobMember) return true;

    // İşin herhangi bir projesine atanmış olmak da işi görmeye yeter:
    // taşeron çalıştığı projenin bağlı olduğu iş dosyasını görebilmeli.
    const { data: memberships } = await this.supabase.client
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId)
      .eq("status", "approved");
    const ids = (memberships ?? []).map((m: any) => m.project_id);
    if (ids.length > 0) {
      const { data: projects } = await this.supabase.client
        .from("projects")
        .select("id")
        .eq("job_id", jobId)
        .in("id", ids)
        .limit(1);
      if ((projects ?? []).length > 0) return true;
    }

    // Üst kademe: işin bağlı olduğu organizasyonun/grubun sahibi veya üyesi.
    // Taşeron için bu yol kapalı — kurumsal kademeye hiç dahil değildir.
    if (await this.isSubcontractor(userId)) return false;
    if (job.organization_id) return this.canViewOrganization(job.organization_id, userId);
    if (job.group_id) return this.canViewGroup(job.group_id, userId);
    return false;
  }

  async assertCanViewJob(jobId: string, userId?: string): Promise<void> {
    if (!userId) return;
    if (!(await this.canViewJob(jobId, userId))) {
      throw new ForbiddenException("Bu işi görüntüleme yetkiniz yok");
    }
  }

  /** İşin TÜM projeleri mi görünür, yoksa yalnızca atandıkları mı? */
  async seesAllProjectsOfJob(jobId: string, userId: string): Promise<boolean> {
    const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", jobId).maybeSingle();
    const { data: jobMember } = await this.supabase.client
      .from("job_members")
      .select("id")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    return seesAllProjectsOfJob({
      isJobOwner: job?.owner_id === userId,
      isApprovedJobMember: !!jobMember,
      isSubcontractor: await this.isSubcontractor(userId),
    });
  }

  // -------------------------------------------------------- Organizasyon

  async canViewOrganization(organizationId: string, userId: string): Promise<boolean> {
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id, group_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    if (org.owner_id === userId) return true;

    const { data: orgMember } = await this.supabase.client
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (orgMember) return true;

    // Bir departmanın onaylı kadrosunda olmak organizasyonu görmeye yeter
    // (taşeron dahil: çalıştığı departmanın şirketini görmesi gerekir).
    const { data: deptRows } = await this.supabase.client
      .from("departments")
      .select("id")
      .eq("organization_id", organizationId);
    const deptIds = (deptRows ?? []).map((d: any) => d.id);
    if (deptIds.length > 0) {
      const { data: membership } = await this.supabase.client
        .from("department_members")
        .select("id")
        .in("department_id", deptIds)
        .eq("user_id", userId)
        .eq("status", "approved")
        .limit(1);
      if ((membership ?? []).length > 0) return true;
    }

    if (await this.isSubcontractor(userId)) return false;
    if (org.group_id) return this.canViewGroup(org.group_id, userId);
    return false;
  }

  /**
   * Organizasyon seviyesindeki görünürlük — arayüz sekmelerinin kaynağı.
   *
   * Bunu departman listesinden ÇIKARMIYORUZ: hiç departmana bağlı olmayan bir
   * kullanıcı (ör. yalnızca bir işe alınmış taşeron) boş liste döndürüyor ve
   * "kısıt yok" gibi okunuyordu — Bütçe sekmesi bu yüzden açık kalıyordu.
   */
  async organizationAccess(organizationId: string, userId: string): Promise<OrganizationAccess> {
    const none: OrganizationAccess = {
      role: "none",
      canView: false,
      canViewBudget: false,
      canViewCommercial: false,
      canManage: false,
    };

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");

    if (org.owner_id === userId) {
      return { role: "owner", canView: true, canViewBudget: true, canViewCommercial: true, canManage: true };
    }

    const canView = await this.canViewOrganization(organizationId, userId);
    if (!canView) return none;

    // Taşeron organizasyonu görebilir (çalıştığı departman/iş orada) ama
    // kurumsal hiçbir yüzeyi göremez.
    if (await this.isSubcontractor(userId)) {
      return { role: "subcontractor", canView: true, canViewBudget: false, canViewCommercial: false, canManage: false };
    }

    // Departman yöneticiliği şirket bütçesini görmeye yeter; sıradan kadro ve
    // organizasyon üyeliği yetmez.
    const { data: deptRows } = await this.supabase.client
      .from("departments")
      .select("id")
      .eq("organization_id", organizationId);
    const deptIds = (deptRows ?? []).map((d: any) => d.id);
    if (deptIds.length > 0) {
      const { data: managerRows } = await this.supabase.client
        .from("department_members")
        .select("id")
        .in("department_id", deptIds)
        .eq("user_id", userId)
        .eq("role", "manager")
        .eq("status", "approved")
        .limit(1);
      if ((managerRows ?? []).length > 0) {
        return {
          role: "department_manager",
          canView: true,
          canViewBudget: true,
          canViewCommercial: true,
          canManage: false,
        };
      }
    }

    const { data: orgMember } = await this.supabase.client
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();

    return {
      role: orgMember ? "member" : "staff",
      canView: true,
      canViewBudget: false,
      canViewCommercial: true,
      canManage: false,
    };
  }

  async assertCanViewOrganization(organizationId: string, userId?: string): Promise<void> {
    if (!userId) return;
    if (!(await this.canViewOrganization(organizationId, userId))) {
      throw new ForbiddenException("Bu organizasyonu görüntüleme yetkiniz yok");
    }
  }

  // ---------------------------------------------------------------- Grup

  async canViewGroup(groupId: string, userId: string): Promise<boolean> {
    const { data: group } = await this.supabase.client
      .from("groups")
      .select("owner_id")
      .eq("id", groupId)
      .maybeSingle();
    if (!group) throw new NotFoundException("Grup bulunamadı");
    if (group.owner_id === userId) return true;
    // Taşeron hiçbir zaman grup (holding) kademesine dahil değildir.
    if (await this.isSubcontractor(userId)) return false;

    const { data: member } = await this.supabase.client
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    return !!member;
  }

  async assertCanViewGroup(groupId: string, userId?: string): Promise<void> {
    if (!userId) return;
    if (!(await this.canViewGroup(groupId, userId))) {
      throw new ForbiddenException("Bu grubu görüntüleme yetkiniz yok");
    }
  }

  // ----------------------------------------------------------- Departman

  /**
   * Departman görünürlüğü. Karar mantığı departments/department-access.ts'te;
   * burada yalnızca gerçekler toplanır. DepartmentsService'i enjekte etmiyoruz:
   * o servis de bu servisi kullanacağı için döngüsel bağımlılık doğardı.
   */
  async departmentAccess(departmentId: string, userId: string) {
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (!dept) throw new NotFoundException("Departman bulunamadı");

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    if (org?.owner_id === userId) {
      return decideDepartmentAccess({ isOrgOwner: true, isOrgMember: true });
    }

    const { data: orgMember } = await this.supabase.client
      .from("organization_members")
      .select("id")
      .eq("organization_id", dept.organization_id)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    const { data: membership } = await this.supabase.client
      .from("department_members")
      .select("role")
      .eq("department_id", departmentId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();

    return decideDepartmentAccess({
      isOrgOwner: false,
      // Taşeron hesabı organizasyon üyeliği üzerinden geniş yetki kazanamaz.
      isOrgMember: !!orgMember && !(await this.isSubcontractor(userId)),
      membershipRole: membership?.role as DepartmentMemberRole | undefined,
    });
  }

  async assertCanViewDepartment(departmentId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const access = await this.departmentAccess(departmentId, userId);
    if (!access.canView) throw new ForbiddenException("Bu departmanı görüntüleme yetkiniz yok");
  }

  // --------------------------------------------------------------- Rutin

  /** Rutin (operation), bağlı olduğu işin görünürlüğünü devralır. */
  async assertCanViewOperation(operationId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: op } = await this.supabase.client
      .from("operations")
      .select("owner_id, job_id")
      .eq("id", operationId)
      .maybeSingle();
    if (!op) throw new NotFoundException("Rutin bulunamadı");
    if (op.owner_id === userId) return;
    if (op.job_id) return this.assertCanViewJob(op.job_id, userId);
    throw new ForbiddenException("Bu rutini görüntüleme yetkiniz yok");
  }

  // ---------------------------------------------------------------- Görev

  /** Görev, bağlı olduğu projenin/departmanın görünürlüğünü devralır. */
  async assertCanViewTask(taskId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: task } = await this.supabase.client
      .from("tasks")
      .select("project_id, department_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!task) throw new NotFoundException("Görev bulunamadı");
    if (task.project_id) return this.assertCanViewProject(task.project_id, userId);
    if (task.department_id) return this.assertCanViewDepartment(task.department_id, userId);
    throw new ForbiddenException("Bu görevi görüntüleme yetkiniz yok");
  }

  // ------------------------------------------------------------ Paylaşım

  /**
   * Paylaşım (post), yapıldığı proje/departman/organizasyonun görünürlüğünü
   * devralır. Sosyal akış uçları uzun süre yalnızca oturum kontrolü yapıyordu;
   * ID'yi bilen herkes başka bir şirketin akışını okuyup oraya yazabiliyordu.
   */
  async assertCanViewPost(postId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: post } = await this.supabase.client
      .from("project_posts")
      .select("project_id, department_id, organization_id")
      .eq("id", postId)
      .maybeSingle();
    if (!post) throw new NotFoundException("Paylaşım bulunamadı");
    if (post.project_id) return this.assertCanViewProject(post.project_id, userId);
    if (post.department_id) return this.assertCanViewDepartment(post.department_id, userId);
    if (post.organization_id) return this.assertCanViewOrganization(post.organization_id, userId);
    throw new ForbiddenException("Bu paylaşımı görüntüleme yetkiniz yok");
  }

  /** Paylaşım yorumu, bağlı olduğu paylaşımın görünürlüğünü devralır. */
  async assertCanViewPostComment(commentId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: comment } = await this.supabase.client
      .from("post_comments")
      .select("post_id")
      .eq("id", commentId)
      .maybeSingle();
    if (!comment) throw new NotFoundException("Yorum bulunamadı");
    return this.assertCanViewPost(comment.post_id, userId);
  }
}
