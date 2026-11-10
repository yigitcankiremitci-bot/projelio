import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { DepartmentMember } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { decideDepartmentAccess } from "../departments/department-access";
import { KoltukService } from "../../common/koltuk/koltuk.service";
import { EmailService } from "../auth/email.service";
import { getWebAppUrl } from "../../common/config/env";
import { kadroDavetiEpostasi } from "./kadro-daveti-eposta";

function mapDepartmentMember(row: any): DepartmentMember {
  return {
    id: row.id,
    departmentId: row.department_id,
    userId: row.user_id ?? undefined,
    inviteEmail: row.invite_email ?? undefined,
    role: row.role,
    title: row.title ?? undefined,
    reportsTo: row.reports_to ?? undefined,
    status: row.status,
    accessUntil: row.access_until ?? undefined,
    invitedBy: row.invited_by ?? undefined,
    joinedAt: row.joined_at,
    fullName: row.users?.full_name ?? undefined,
    email: row.users?.email ?? undefined,
    username: row.users?.username ?? undefined,
  };
}

// "Kadro": bir departmana bağlı pozisyon + kişi. Doküman akışı: önce pozisyon
// (rol/unvan) tanımlanır — kişi zaten sistemde ise userId ile, değilse
// inviteEmail ile — sonra ilgili kişi daveti onaylar (respond).
@Injectable()
export class DepartmentMembersService {
  private readonly logger = new Logger(DepartmentMembersService.name);

  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService,
    private koltuklar: KoltukService,
    private emailService: EmailService
  ) {}

  /** E-postayı küçük harfe çevirip o adresin Projelio hesabını arar (yoksa null). */
  private async epostaninHesabi(eposta: string): Promise<{ id: string; locale?: string | null } | null> {
    // ilike: kayıtlı adres büyük harf içeriyor olabilir; joker karakterler kaçırılır.
    const desen = eposta.replace(/[\\%_]/g, (k) => `\\${k}`);
    const { data } = await this.supabase.client
      .from("users")
      .select("id, locale")
      .ilike("email", desen)
      .limit(1)
      .maybeSingle();
    return (data as any) ?? null;
  }

  private async assertOrgOwner(departmentId: string, userId?: string): Promise<string> {
    const { data: dept, error } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (error) throw error;
    if (!dept) throw new NotFoundException("Departman bulunamadı");
    if (!userId) return dept.organization_id;

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    if (org && org.owner_id !== userId) {
      // Sahibi değilse departman yöneticisi olup olmadığına bak.
      const { data: managerRow } = await this.supabase.client
        .from("department_members")
        .select("id")
        .eq("department_id", departmentId)
        .eq("user_id", userId)
        .eq("role", "manager")
        .eq("status", "approved")
        .maybeSingle();
      if (!managerRow) throw new ForbiddenException("Bu departmanı yalnızca organizasyon sahibi veya departman yöneticisi düzenleyebilir");
    }
    return dept.organization_id;
  }

  /**
   * Kadro listesini kim görebilir: organizasyon sahibi, departman yöneticisi,
   * organizasyonun onaylı üyesi ve departmanın çalışanları. TAŞERON göremez —
   * dış kaynak, organizasyonun kadrosunu (isim/e-posta) bilmemeli.
   *
   * Yetkisi olmayan kullanıcı boş liste değil, YALNIZCA kendi kaydını görür:
   * bekleyen davetini onaylayabilmesi için o satıra ihtiyacı var
   * (bkz. DepartmentMembersList — kendi pending davetinde Onayla/Reddet çıkar).
   */
  private async canViewRoster(departmentId: string, userId: string): Promise<boolean> {
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
    if (org?.owner_id === userId) return true;

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
      isOrgMember: !!orgMember,
      membershipRole: membership?.role as DepartmentMember["role"] | undefined,
    }).canViewTeam;
  }

  async findByDepartment(departmentId: string, requestingUserId?: string): Promise<DepartmentMember[]> {
    const { data, error } = await this.supabase.client
      .from("department_members")
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .eq("department_id", departmentId)
      .neq("status", "removed")
      .order("joined_at", { ascending: true });
    if (error) throw error;
    const members = (data ?? []).map(mapDepartmentMember);
    if (!requestingUserId) return members;
    if (await this.canViewRoster(departmentId, requestingUserId)) return members;
    return members.filter((m) => m.userId === requestingUserId);
  }

  async invite(
    departmentId: string,
    data: { userId?: string; inviteEmail?: string; role?: DepartmentMember["role"]; title?: string },
    requestingUserId?: string
  ): Promise<DepartmentMember> {
    await this.assertOrgOwner(departmentId, requestingUserId);
    if (!data.userId && !data.inviteEmail) {
      throw new BadRequestException("Kadroya bir kullanıcı ya da davet e-postası gerekli");
    }
    // Kurucu ya da yönetici kendini ekliyorsa davet anlamsız: kendi daveti
    // kendisi onaylayacaktı. Yetki zaten assertOrgOwner'dan geçti, kayıt
    // doğrudan onaylı açılır ve bildirim gitmez — kurucu böylece kendini bir
    // departmana yönetici (sorumlu) olarak atayabiliyor.
    const davetEpostasi = data.userId ? undefined : data.inviteEmail?.trim().toLowerCase();
    // E-postayla davet edilen kişinin zaten hesabı varsa davet doğrudan ona
    // bağlanır: uygulama içi bildirimi alır ve departman sayfasında daveti
    // görür. Bağlanmazsa kayıt `invited` olarak user_id'siz kalıyor ve kişi
    // daveti hiçbir yerde göremiyordu.
    let aliciDili: string | null | undefined;
    if (davetEpostasi) {
      const hesap = await this.epostaninHesabi(davetEpostasi);
      if (hesap) {
        data = { ...data, userId: hesap.id, inviteEmail: undefined };
        aliciDili = hesap.locale;
      }
    }
    const kendisi = !!data.userId && data.userId === requestingUserId;
    // Yer yoksa davet bile açılmasın: kişi kabul edince "yer dolu" görmesin.
    // E-postayla davette kişi henüz belli değil; kontrol kabulde (respond).
    if (data.userId) {
      await this.koltuklar.departmanaEklenebilir(departmentId, data.userId, { taseronRolu: data.role === "subcontractor" });
    }

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .insert({
        department_id: departmentId,
        user_id: data.userId ?? null,
        invite_email: data.userId ? null : data.inviteEmail?.trim().toLowerCase(),
        role: data.role ?? "employee",
        title: data.title?.trim() || null,
        status: kendisi ? "approved" : data.userId ? "pending" : "invited",
        invited_by: requestingUserId ?? null,
      })
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu kişi zaten bu departmanın kadrosunda");
      throw error;
    }

    if (data.userId && !kendisi) {
      // link: bildirime tıklayınca doğrudan departman sayfasına gider — orada
      // DepartmentMembersList kendi bekleyen davetini algılayıp Onayla/Reddet
      // düğmelerini gösterir (bkz. respond()).
      this.notificationsService.notifyUserSafe(
        data.userId,
        "team_invite",
        "Kadro Daveti",
        "Bir departmanın kadrosuna davet edildin.",
        `/departments/${departmentId}`
      );
    }

    // Yönetici bir e-posta adresi yazdıysa o adrese davet e-postası gider —
    // kişinin hesabı olsun olmasın. Beklenmez: e-postanın gitmemesi daveti geri almaz.
    if (davetEpostasi && !kendisi) {
      void this.davetEpostasiGonder(departmentId, davetEpostasi, !!data.userId, aliciDili, requestingUserId);
    }

    return mapDepartmentMember(row);
  }

  /** Davet e-postasını hazırlayıp gönderir. HATA FIRLATMAZ, yalnızca loglar. */
  private async davetEpostasiGonder(
    departmentId: string,
    eposta: string,
    hesabiVar: boolean,
    dil: string | null | undefined,
    davetEdenId?: string
  ): Promise<void> {
    try {
      const [{ data: dept }, { data: davetEden }] = await Promise.all([
        this.supabase.client.from("departments").select("name, organizations(name)").eq("id", departmentId).maybeSingle(),
        davetEdenId
          ? this.supabase.client.from("users").select("full_name").eq("id", davetEdenId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const mail = kadroDavetiEpostasi({
        davetEdenAdi: (davetEden as any)?.full_name ?? "Ekip yöneticin",
        departmanAdi: (dept as any)?.name ?? "Departman",
        sirketAdi: (dept as any)?.organizations?.name ?? undefined,
        hesabiVar,
        davetUrl: `${getWebAppUrl()}/departments/${departmentId}`,
        eposta,
        dil: dil === "en" ? "en" : "tr",
      });
      const gitti = await this.emailService.sendPrepared(eposta, mail);
      if (!gitti) this.logger.warn(`Kadro daveti e-postası gönderilemedi: ${eposta}`);
    } catch (err) {
      this.logger.warn(`Kadro daveti e-postası hazırlanamadı (${eposta}): ${(err as any)?.message ?? err}`);
    }
  }

  async updatePosition(
    id: string,
    data: { role?: DepartmentMember["role"]; title?: string; reportsTo?: string },
    requestingUserId?: string
  ): Promise<DepartmentMember> {
    const existing = await this.findById(id);
    await this.assertOrgOwner(existing.departmentId, requestingUserId);

    const patch: Record<string, unknown> = {};
    if (data.role !== undefined) patch.role = data.role;
    if (data.title !== undefined) patch.title = data.title.trim() || null;
    if (data.reportsTo !== undefined) patch.reports_to = data.reportsTo || null;

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .update(patch)
      .eq("id", id)
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kadro kaydı bulunamadı");
    return mapDepartmentMember(row);
  }

  private async findById(id: string): Promise<DepartmentMember> {
    const { data, error } = await this.supabase.client
      .from("department_members")
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kadro kaydı bulunamadı");
    return mapDepartmentMember(data);
  }

  // Davet edilen kişi kendisi onaylar/reddeder. E-posta ile davet edilmiş ama
  // henüz user_id bağlanmamışsa, onaylayan kişinin hesabıyla ilk burada eşleşir.
  /**
   * Davet edilen kişinin bu departmandaki bekleyen daveti + davetin neye
   * olduğunu anlatacak kadar ad.
   *
   * Neden ayrı bir uç: "Kadro Daveti" bildirimi /departments/:id'ye gidiyor,
   * ama davetli henüz kadroda olmadığı için GET /departments/:id 403 dönüyor ve
   * sayfa bomboş açılıyordu — Onayla/Reddet düğmeleri o boş sayfanın içinde
   * kaldığından davet hiç kabul edilemiyordu (2026-11-04, müşteri önünde).
   * Departmanın kendisini davetliye açmak yerine yalnızca davetin kendisi ve
   * departman/şirket ADI veriliyor: kabul edilene kadar başka hiçbir şey görünmez.
   */
  async myInvite(
    departmentId: string,
    userId: string
  ): Promise<{ invite: DepartmentMember | null; departmentName?: string; organizationName?: string }> {
    const { data: bagli, error } = await this.supabase.client
      .from("department_members")
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .eq("department_id", departmentId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (error) throw error;
    let row: any = bagli;
    // Davet kişi hesap açmadan önce e-postasına yapılmışsa kayıt user_id'siz
    // `invited` durumunda bekler; kişiyi e-postasından tanıyıp onu da göster.
    // Onaylayınca respond() aynı e-posta kontrolüyle kaydı ona bağlar.
    if (!row) {
      const { data: kisi } = await this.supabase.client.from("users").select("email").eq("id", userId).maybeSingle();
      const eposta = (kisi as any)?.email?.trim().toLowerCase();
      if (eposta) {
        const { data: epostaIle, error: hata } = await this.supabase.client
          .from("department_members")
          .select("*, users!department_members_user_id_fkey(full_name, email, username)")
          .eq("department_id", departmentId)
          .is("user_id", null)
          .eq("invite_email", eposta)
          .eq("status", "invited")
          .limit(1)
          .maybeSingle();
        if (hata) throw hata;
        row = epostaIle;
      }
    }
    if (!row) return { invite: null };

    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("name, organizations(name)")
      .eq("id", departmentId)
      .maybeSingle();
    return {
      invite: mapDepartmentMember(row),
      departmentName: (dept as any)?.name ?? undefined,
      organizationName: (dept as any)?.organizations?.name ?? undefined,
    };
  }

  async respond(id: string, approve: boolean, requestingUserId: string): Promise<DepartmentMember> {
    const existing = await this.findById(id);
    if (existing.userId && existing.userId !== requestingUserId) {
      throw new ForbiddenException("Bu daveti yalnızca davet edilen kişi yanıtlayabilir");
    }
    // Yalnızca bekleyen davet yanıtlanır. Kontrol yokken kadrodan çıkarılmış
    // (removed) ya da daveti reddetmiş biri aynı kaydı "approve" ile kendi
    // kendine yeniden onaylayıp departmana geri girebiliyordu.
    if (existing.status !== "pending" && existing.status !== "invited") {
      throw new BadRequestException("Bu davet artık geçerli değil");
    }
    // E-postayla açılmış davet (user_id boş) yalnızca o e-postanın sahibine
    // bağlanabilir; yoksa kaydın kimliğini bilen herkes onu üstlenebilirdi.
    if (!existing.userId) {
      const { data: user } = await this.supabase.client
        .from("users")
        .select("email")
        .eq("id", requestingUserId)
        .maybeSingle();
      const eposta = (user as any)?.email?.trim().toLowerCase();
      if (!eposta || eposta !== existing.inviteEmail?.trim().toLowerCase()) {
        throw new ForbiddenException("Bu daveti yalnızca davet edilen kişi yanıtlayabilir");
      }
    }

    // Davet atıldığında yer vardı ama kabule kadar dolmuş olabilir.
    if (approve) {
      await this.koltuklar.departmanaEklenebilir(existing.departmentId, requestingUserId, {
        taseronRolu: existing.role === "subcontractor",
      });
    }

    const patch: Record<string, unknown> = { status: approve ? "approved" : "rejected" };
    if (!existing.userId) patch.user_id = requestingUserId;

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .update(patch)
      .eq("id", id)
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kadro kaydı bulunamadı");

    const member = mapDepartmentMember(row);

    // Onaylandığında daveti gönderen kişiye anlık bildirim gider — link departman
    // sayfasına gider, orada açık olan liste soket üzerinden bunu görüp kendini
    // yeniler (bkz. DepartmentMembersList.tsx).
    if (approve && member.invitedBy) {
      void this.notificationsService.notifyUser(
        member.invitedBy,
        "member_joined",
        "Kadro Onayı",
        // Adı bilinmiyorsa AYRI bir metin: yedek değeri parametre olarak
        // geçmek, İngilizce cümlenin ortasında Türkçe bir sözcük bırakırdı
        // (params çevrilmez, yalnızca kalıp çevrilir).
        member.fullName
          ? { metin: "{kisi} departman davetini onayladı ve kadroya katıldı.", params: { kisi: member.fullName } }
          : "Bir kullanıcı departman davetini onayladı ve kadroya katıldı.",
        `/departments/${member.departmentId}`
      );
    }

    return member;
  }

  // İşten çıkarma / kadrodan ayrılma. accessUntil verilirse belirtilen tarihe kadar
  // sınırlı görünürlük tanınır (Doküman 1, işten çıkarma bölümü).
  /**
   * Kullanıcının kendi isteğiyle departman kadrosundan ayrılması.
   *
   * `remove` yöneticinin birini çıkarmasıdır ve org sahipliği ister; burada
   * yetki "o kayıt benim olmak". Kayıt silinmez, `status='removed'` olur —
   * kadro geçmişi (ne zaman katıldı, ne zaman ayrıldı) korunmalı.
   */
  async leave(departmentId: string, userId: string): Promise<{ success: true; pendingApproval: boolean }> {
    const { data: row } = await this.supabase.client
      .from("department_members")
      .select("id, status, role")
      .eq("department_id", departmentId)
      .eq("user_id", userId)
      .neq("status", "removed")
      .maybeSingle();
    if (!row) throw new NotFoundException("Bu departmanda bir kadro kaydın yok");
    if (row.status === "leave_pending") {
      throw new BadRequestException("Ayrılma talebin zaten onay bekliyor");
    }

    // SON yönetici mi? Öyleyse ayrılma doğrudan gerçekleşmez; organizasyon
    // sahibinin onayına düşer (bkz. 061). Departman yöneticisiz kalırsa kimse
    // kadroya kişi davet edemez, bütçeye kayıt giremez, görev yönetemez.
    const isLastManager = row.role === "manager" && (await this.countActiveManagers(departmentId)) <= 1;

    const { error } = await this.supabase.client
      .from("department_members")
      .update({ status: isLastManager ? "leave_pending" : "removed" })
      .eq("id", row.id);
    if (error) throw error;

    if (isLastManager) {
      await this.notifyOwnerOfLeaveRequest(departmentId, userId);
    }
    return { success: true, pendingApproval: isLastManager };
  }

  /** Departmanda hâlâ yetkili sayılan yönetici sayısı (leave_pending dahil). */
  private async countActiveManagers(departmentId: string): Promise<number> {
    const { data } = await this.supabase.client
      .from("department_members")
      .select("id")
      .eq("department_id", departmentId)
      .eq("role", "manager")
      .in("status", ["approved", "leave_pending"]);
    return (data ?? []).length;
  }

  private async notifyOwnerOfLeaveRequest(departmentId: string, leavingUserId: string): Promise<void> {
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("name, organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (!dept) return;
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    if (!org?.owner_id) return;

    const { data: user } = await this.supabase.client
      .from("users")
      .select("full_name")
      .eq("id", leavingUserId)
      .maybeSingle();

    void this.notificationsService.notifyUser(
      org.owner_id,
      "role_updated",
      "Ayrılma onayı bekliyor",
      user?.full_name
        ? {
            metin: '{kisi}, "{departman}" departmanının son yöneticisi ve ayrılmak istiyor. Onaylamadan ayrılamaz.',
            params: { kisi: user.full_name, departman: dept.name },
          }
        : {
            metin: 'Bir yönetici, "{departman}" departmanının son yöneticisi ve ayrılmak istiyor. Onaylamadan ayrılamaz.',
            params: { departman: dept.name },
          },
      `/departments/${departmentId}?tab=team`
    );
  }

  /**
   * Organizasyon sahibinin ayrılma talebine yanıtı. Onaylanırsa kadro kaydı
   * kapanır, reddedilirse kişi yöneticiliğine geri döner.
   */
  async respondToLeaveRequest(id: string, approve: boolean, requestingUserId?: string): Promise<DepartmentMember> {
    const existing = await this.findById(id);
    await this.assertOrgOwner(existing.departmentId, requestingUserId);
    if (existing.status !== "leave_pending") {
      throw new BadRequestException("Bu kayıt için bekleyen bir ayrılma talebi yok");
    }

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .update({ status: approve ? "removed" : "approved" })
      .eq("id", id)
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kadro kaydı bulunamadı");

    if (existing.userId) {
      void this.notificationsService.notifyUser(
        existing.userId,
        "role_updated",
        approve ? "Ayrılma onaylandı" : "Ayrılma reddedildi",
        approve
          ? "Departman kadrosundan ayrıldın."
          : "Ayrılma talebin reddedildi; departman yöneticiliğin devam ediyor.",
        `/departments/${existing.departmentId}?tab=team`
      );
    }
    return mapDepartmentMember(row);
  }

  async remove(id: string, accessUntil: string | undefined, requestingUserId?: string): Promise<DepartmentMember> {
    const existing = await this.findById(id);
    await this.assertOrgOwner(existing.departmentId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .update({ status: "removed", access_until: accessUntil ?? null })
      .eq("id", id)
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kadro kaydı bulunamadı");
    return mapDepartmentMember(row);
  }
}
