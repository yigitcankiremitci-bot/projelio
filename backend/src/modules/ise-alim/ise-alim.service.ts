import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  DepartmentMemberRole,
  EkipHesabiSecenekleri,
  IseAlimDaveti,
  IseAlimDurumu,
  IseAlimGirdisi,
  SirketEkibi,
  SirketEkibiUyesi,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { NotificationsService } from "../notifications/notifications.service";
import { UsersService } from "../users/users.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { EkipHesaplariService } from "../ekip-hesaplari/ekip-hesaplari.service";
import { davetGirdisiniDogrula, gecerliSecim, kabulPlani } from "./ise-alim-kurallari";

type DavetSatiri = {
  id: string;
  organization_id: string;
  user_id: string;
  invited_by: string | null;
  pozisyon: string | null;
  is_tanimi: string | null;
  departmanlar: { departmentId: string; role: DepartmentMemberRole }[];
  moduller: { departmentId: string; moduleKey: string }[];
  status: IseAlimDurumu;
  created_at: string;
  responded_at: string | null;
};

/**
 * İşe alım daveti (bkz. migration 143).
 *
 * Projelio'da hesabı OLAN biri tek formla şirkete davet edilir; kabul edene
 * kadar kadroya ve modüllere hiçbir şey yazılmaz. Kabulde satırlar mevcut
 * department_members / module_members tablolarına onaylı olarak gider —
 * ikinci bir yetki modeli yok, kişi davetle gelmiş her çalışan gibi görünür.
 *
 * Kim davet edebilir sorusunun cevabı Ekip Hesapları'nınkiyle AYNI ve oradan
 * geliyor (EkipHesaplariService.secenekler): şirket sahibi her departmana,
 * departman yöneticisi yalnızca yönettiklerine.
 */
@Injectable()
export class IseAlimService {
  constructor(
    private supabase: SupabaseService,
    private usersService: UsersService,
    private notifications: NotificationsService,
    private ekipHesaplari: EkipHesaplariService,
    private realtime: RealtimeGateway
  ) {}

  /**
   * Şirket ve davetteki departman sayfalarına "değişti" sinyali.
   *
   * Genel interceptor (RealtimeChangeInterceptor) sinyali isteği atanın
   * BULUNDUĞU odaya gönderir — kabulü davet edilen kişi kendi davet
   * sayfasından yapıyor, o odalarda değil. Bu yüzden şirket sayfası açık olan
   * yönetici Ekip'i ve departman kartlarındaki kişi sayısını ancak sayfayı
   * yenileyince görüyordu.
   */
  private odalariTazele(satir: DavetSatiri, actorId: string, path: string): void {
    const meta = { method: "POST", path, actorId };
    this.realtime.notifyRoom(`organization:${satir.organization_id}`, meta);
    for (const d of satir.departmanlar) this.realtime.notifyRoom(`department:${d.departmentId}`, meta);
  }

  /** İşe alım yetkisi yoksa null — "Ekip" listesi yine görünsün diye fırlatmaz. */
  private async secenekleriBul(organizationId: string, userId: string): Promise<EkipHesabiSecenekleri | null> {
    try {
      const s = await this.ekipHesaplari.secenekler(organizationId, userId);
      return s.sahipMi || s.departmanlar.length > 0 ? s : null;
    } catch (err) {
      if (err instanceof ForbiddenException) return null;
      throw err;
    }
  }

  // ------------------------------------------------------------- Şirketin ekibi

  /**
   * Şirketin onaylı kadrosu, kişi başına tek satır.
   *
   * Kim görebilir: şirket sahibi ve departmanlardan birinde onaylı yönetici ya
   * da çalışan olan. TAŞERON göremez — departman Ekip sekmesindeki kuralla
   * aynı (bkz. decideDepartmentAccess): dış kaynak şirketin kadrosunu bilmemeli.
   */
  async ekip(organizationId: string, userId: string): Promise<SirketEkibi> {
    const { data: org, error: orgError } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgError) throw orgError;
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");

    const { data: depts, error: deptError } = await this.supabase.client
      .from("departments")
      .select("id, name, sort_order")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (deptError) throw deptError;
    const departmanAdi = new Map<string, string>((depts ?? []).map((d: any) => [d.id, d.name]));

    let kadro: any[] = [];
    if (departmanAdi.size) {
      const { data, error } = await this.supabase.client
        .from("department_members")
        .select("user_id, department_id, role, title, users!department_members_user_id_fkey(full_name, username, avatar_url)")
        .in("department_id", [...departmanAdi.keys()])
        .in("status", ["approved", "leave_pending"])
        .not("user_id", "is", null)
        .limit(LISTE_TAVANI);
      if (error) throw error;
      kadro = data ?? [];
    }

    const sahipMi = org.owner_id === userId;
    const gorebilir =
      sahipMi || kadro.some((k) => k.user_id === userId && (k.role === "manager" || k.role === "employee"));
    if (!gorebilir) throw new ForbiddenException("Şirketin ekibini görme yetkin yok.");

    const byUser = new Map<string, SirketEkibiUyesi>();
    for (const k of kadro) {
      const uye =
        byUser.get(k.user_id) ??
        ({
          userId: k.user_id,
          fullName: k.users?.full_name ?? "",
          username: k.users?.username ?? undefined,
          avatarUrl: k.users?.avatar_url ?? undefined,
          departmanlar: [],
        } as SirketEkibiUyesi);
      if (!uye.title && k.title) uye.title = k.title;
      uye.departmanlar.push({ id: k.department_id, name: departmanAdi.get(k.department_id) ?? "", role: k.role });
      byUser.set(k.user_id, uye);
    }
    // Kurucu, departman kadrosunda olmasa da ekibin parçası. Önceden yalnızca
    // department_members'tan okunduğu için şirketi kuran kişi kendi şirketinin
    // Ekip listesinde görünmüyordu.
    if (org.owner_id) {
      const kurucu = byUser.get(org.owner_id);
      if (kurucu) kurucu.kurucu = true;
      else {
        const sahip = await this.usersService.findById(org.owner_id);
        if (sahip && !sahip.deletedAt) {
          byUser.set(org.owner_id, {
            userId: sahip.id,
            fullName: sahip.fullName ?? "",
            username: sahip.username ?? undefined,
            avatarUrl: sahip.avatarUrl ?? undefined,
            kurucu: true,
            departmanlar: [],
          });
        }
      }
    }
    // Kurucu başta, kalanlar ada göre.
    const uyeler = [...byUser.values()].sort(
      (a, b) => Number(!!b.kurucu) - Number(!!a.kurucu) || a.fullName.localeCompare(b.fullName, "tr")
    );

    const secenekler = await this.secenekleriBul(organizationId, userId);
    let bekleyenDavetler: IseAlimDaveti[] = [];
    if (secenekler) {
      let sorgu = this.supabase.client
        .from("ise_alim_davetleri")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(LISTE_TAVANI);
      // Departman yöneticisi yalnızca kendi gönderdiklerini görür (Ekip
      // Hesapları listesiyle aynı kural): şirketin tüm alım hattı sahibin bilgisi.
      if (!secenekler.sahipMi) sorgu = sorgu.eq("invited_by", userId);
      const { data, error } = await sorgu;
      // Migration 143 uygulanmadan yayına çıkılırsa tablo yok: şirket
      // anasayfasının Ekip bölümü bu yüzden düşmesin, kadro yine görünsün.
      if (error && (error as any).code !== "42P01" && (error as any).code !== "PGRST205") throw error;
      bekleyenDavetler = await this.coz((data ?? []) as DavetSatiri[]);
    }

    return { uyeler, bekleyenDavetler, iseAlabilir: !!secenekler };
  }

  // ------------------------------------------------------------- Davet

  async davetEt(organizationId: string, girdi: IseAlimGirdisi, userId: string): Promise<IseAlimDaveti> {
    const secenekler = await this.ekipHesaplari.secenekler(organizationId, userId);
    const hata = davetGirdisiniDogrula(girdi, secenekler);
    if (hata) throw new BadRequestException(hata);

    if (girdi.userId === userId) throw new BadRequestException("Kendini işe alamazsın.");
    const kisi = await this.usersService.findById(girdi.userId);
    if (!kisi || kisi.deletedAt) throw new NotFoundException("Kullanıcı bulunamadı");

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("name, owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    if (org.owner_id === girdi.userId) throw new BadRequestException("Bu kişi zaten şirketin sahibi.");

    // Seçilen her şeye zaten sahipse gönderilecek bir davet yok: kişinin önüne
    // kabul edince hiçbir şey değiştirmeyen bir düğme koymak kafa karıştırır.
    const { kadro, moduller } = await this.mevcutUyelik(organizationId, girdi.userId, girdi.departmanlar.map((d) => d.departmentId));
    const plan = kabulPlani(girdi, kadro, moduller);
    if (!plan.kadroEkle.length && !plan.kadroGuncelle.length && !plan.modulEkle.length && !plan.modulGuncelle.length) {
      throw new BadRequestException("Bu kişi seçtiğin departmanların ve modüllerin hepsinde zaten var.");
    }

    const { data: satir, error } = await this.supabase.client
      .from("ise_alim_davetleri")
      .insert({
        organization_id: organizationId,
        user_id: girdi.userId,
        invited_by: userId,
        pozisyon: girdi.pozisyon?.trim() || null,
        is_tanimi: girdi.isTanimi?.trim() || null,
        departmanlar: girdi.departmanlar.map((d) => ({ departmentId: d.departmentId, role: d.role })),
        moduller: girdi.moduller.map((m) => ({ departmentId: m.departmentId, moduleKey: m.moduleKey })),
      })
      .select("*")
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        throw new BadRequestException("Bu kişiye bu şirketten bekleyen bir işe alım daveti zaten var.");
      }
      throw error;
    }

    const davetEden = await this.usersService.findById(userId);
    // team_invite çanda KAPATILAMAYAN bir tip (KILITLI_BILDIRIM_TIPLERI):
    // kabul düğmesinin başka bir yeri yok. E-posta, telefon ve WhatsApp
    // kanallarına da kişinin tercihine göre gider.
    this.notifications.notifyUserSafe(
      girdi.userId,
      "team_invite",
      "İşe alım daveti",
      // Ad bilinmiyorsa AYRI bir metin: yedek değeri parametre olarak geçmek
      // İngilizce cümlenin ortasında Türkçe bir sözcük bırakırdı.
      davetEden?.fullName
        ? { metin: "{kisi}, seni {sirket} ekibine katılmaya davet etti.", params: { kisi: davetEden.fullName, sirket: org.name } }
        : { metin: "{sirket} ekibine katılmaya davet edildin.", params: { sirket: org.name } },
      `/ise-alim/${satir.id}`
    );

    // Aynı şirket sayfasında duran diğer yöneticiler de bekleyen daveti görsün.
    this.odalariTazele(satir as DavetSatiri, userId, `/organizations/${organizationId}/ise-alim`);
    const [davet] = await this.coz([satir as DavetSatiri]);
    return davet;
  }

  async davetlerim(userId: string): Promise<IseAlimDaveti[]> {
    const { data, error } = await this.supabase.client
      .from("ise_alim_davetleri")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return this.coz((data ?? []) as DavetSatiri[]);
  }

  /** Daveti kim görebilir: davet edilen, gönderen ve şirket sahibi. */
  async detay(id: string, userId: string): Promise<IseAlimDaveti> {
    const satir = await this.satir(id);
    if (satir.user_id !== userId && satir.invited_by !== userId && !(await this.sahipMi(satir.organization_id, userId))) {
      throw new NotFoundException("Davet bulunamadı");
    }
    const [davet] = await this.coz([satir]);
    return davet;
  }

  // ------------------------------------------------------------- Yanıt

  /**
   * Davet edilen kişinin kabulü / reddi.
   *
   * Supabase istemcisinde transaction yok; kabul bu yüzden TEKRARLANABİLİR
   * kuruldu: önce kadro ve modül satırları yazılır, davet en son "accepted"
   * olur. Arada bir adım düşerse davet beklemede kalır, kişi yeniden "Kabul
   * et" der ve kabulPlani zaten yazılmış satırları atlar.
   */
  async yanitla(id: string, kabul: boolean, userId: string): Promise<IseAlimDaveti> {
    const satir = await this.satir(id);
    if (satir.user_id !== userId) throw new ForbiddenException("Bu daveti yalnızca davet edilen kişi yanıtlayabilir.");
    if (satir.status !== "pending") throw new BadRequestException("Bu davet artık geçerli değil.");

    if (kabul) await this.uyelikleriYaz(satir);

    const { data: guncel, error } = await this.supabase.client
      .from("ise_alim_davetleri")
      .update({ status: kabul ? "accepted" : "rejected", responded_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!guncel) throw new BadRequestException("Bu davet artık geçerli değil.");

    this.odalariTazele(satir, userId, `/ise-alim/${id}/yanit`);
    const [davet] = await this.coz([guncel as DavetSatiri]);
    if (satir.invited_by) {
      this.notifications.notifyUserSafe(
        satir.invited_by,
        kabul ? "member_joined" : "job_invite_answered",
        kabul ? "İşe alım kabul edildi" : "İşe alım reddedildi",
        {
          metin: kabul
            ? "{kisi}, {sirket} işe alım davetini kabul etti ve ekibe katıldı."
            : "{kisi}, {sirket} işe alım davetini reddetti.",
          params: { kisi: davet.fullName, sirket: davet.organizationName },
        },
        `/organizations/${satir.organization_id}`
      );
    }
    return davet;
  }

  async iptal(id: string, userId: string): Promise<{ success: true }> {
    const satir = await this.satir(id);
    if (satir.invited_by !== userId && !(await this.sahipMi(satir.organization_id, userId))) {
      throw new ForbiddenException("Bu daveti yalnızca gönderen ya da şirket sahibi geri çekebilir.");
    }
    const { data, error } = await this.supabase.client
      .from("ise_alim_davetleri")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestException("Bu davet artık beklemede değil.");
    this.odalariTazele(satir, userId, `/ise-alim/${id}/iptal`);
    return { success: true };
  }

  // ------------------------------------------------------------- Yardımcılar

  private async uyelikleriYaz(satir: DavetSatiri): Promise<void> {
    const [{ data: depts, error: deptError }, { data: acik, error: modulError }] = await Promise.all([
      this.supabase.client.from("departments").select("id").eq("organization_id", satir.organization_id).is("archived_at", null),
      this.supabase.client.from("organization_modules").select("module_key").eq("organization_id", satir.organization_id),
    ]);
    if (deptError) throw deptError;
    if (modulError) throw modulError;

    const secim = gecerliSecim(
      satir,
      new Set((depts ?? []).map((d: any) => d.id)),
      new Set((acik ?? []).map((m: any) => m.module_key))
    );
    if (!secim) {
      throw new BadRequestException("Davetteki departmanlar artık yok. Yöneticinden yeni bir davet iste.");
    }

    const { kadro, moduller } = await this.mevcutUyelik(
      satir.organization_id,
      satir.user_id,
      secim.departmanlar.map((d) => d.departmentId)
    );
    const plan = kabulPlani(secim, kadro, moduller);
    const title = satir.pozisyon?.trim() || null;
    const rolu = new Map(secim.departmanlar.map((d) => [d.departmentId, d.role]));

    if (plan.kadroEkle.length) {
      const { error } = await this.supabase.client.from("department_members").insert(
        plan.kadroEkle.map((k) => ({
          department_id: k.departmentId,
          user_id: satir.user_id,
          role: k.role,
          title,
          status: "approved",
          invited_by: satir.invited_by,
        }))
      );
      if (error) throw error;
    }
    for (const k of plan.kadroGuncelle) {
      const { error } = await this.supabase.client
        .from("department_members")
        .update({ status: "approved", role: k.role, title, invited_by: satir.invited_by })
        .eq("id", k.id);
      if (error) throw error;
    }

    if (plan.modulEkle.length) {
      const { error } = await this.supabase.client.from("module_members").insert(
        plan.modulEkle.map((m) => ({
          organization_id: satir.organization_id,
          department_id: m.departmentId,
          module_key: m.moduleKey,
          user_id: satir.user_id,
          // Taşeron olarak alınan kişi modülde de taşeron: ekibi göremez
          // (bkz. 042, module_members.role).
          role: rolu.get(m.departmentId) === "subcontractor" ? "subcontractor" : "employee",
          status: "approved",
          assigned_by: satir.invited_by,
        }))
      );
      if (error) throw error;
    }
    if (plan.modulGuncelle.length) {
      const { error } = await this.supabase.client
        .from("module_members")
        .update({ status: "approved" })
        .in("id", plan.modulGuncelle);
      if (error) throw error;
    }
  }

  private async mevcutUyelik(organizationId: string, kisiId: string, departmanlar: string[]) {
    const [{ data: kadro, error: kadroError }, { data: moduller, error: modulError }] = await Promise.all([
      this.supabase.client
        .from("department_members")
        .select("id, department_id, status")
        .eq("user_id", kisiId)
        .in("department_id", departmanlar)
        .neq("status", "removed"),
      this.supabase.client
        .from("module_members")
        .select("id, department_id, module_key, status")
        .eq("organization_id", organizationId)
        .eq("user_id", kisiId)
        .is("removed_at", null),
    ]);
    if (kadroError) throw kadroError;
    if (modulError) throw modulError;
    return {
      kadro: (kadro ?? []).map((k: any) => ({ id: k.id, departmentId: k.department_id, status: k.status })),
      moduller: (moduller ?? []).map((m: any) => ({
        id: m.id,
        departmentId: m.department_id,
        moduleKey: m.module_key,
        status: m.status,
      })),
    };
  }

  private async satir(id: string): Promise<DavetSatiri> {
    // Bozuk kimlik Postgres'te uuid dönüşüm hatası (500) olurdu; adres elle yazılabiliyor.
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException("Davet bulunamadı");
    const { data, error } = await this.supabase.client.from("ise_alim_davetleri").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Davet bulunamadı");
    return data as DavetSatiri;
  }

  private async sahipMi(organizationId: string, userId: string): Promise<boolean> {
    const { data } = await this.supabase.client.from("organizations").select("owner_id").eq("id", organizationId).maybeSingle();
    return data?.owner_id === userId;
  }

  /** Satırları ad/isimlerle zenginleştirir — her tablo için tek sorgu. */
  private async coz(satirlar: DavetSatiri[]): Promise<IseAlimDaveti[]> {
    if (!satirlar.length) return [];
    const orgIds = [...new Set(satirlar.map((s) => s.organization_id))];
    const kisiIds = [...new Set(satirlar.flatMap((s) => [s.user_id, s.invited_by].filter(Boolean) as string[]))];
    const deptIds = [...new Set(satirlar.flatMap((s) => s.departmanlar.map((d) => d.departmentId)))];
    const modulKeys = [...new Set(satirlar.flatMap((s) => s.moduller.map((m) => m.moduleKey)))];

    const [{ data: orgs }, { data: kisiler }, { data: depts }, { data: katalog }] = await Promise.all([
      this.supabase.client.from("organizations").select("id, name").in("id", orgIds),
      this.supabase.client.from("users").select("id, full_name, username").in("id", kisiIds),
      deptIds.length
        ? this.supabase.client.from("departments").select("id, name").in("id", deptIds)
        : Promise.resolve({ data: [] as any[] }),
      modulKeys.length
        ? this.supabase.client.from("module_catalog").select("key, name").in("key", modulKeys)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const orgAdi = new Map((orgs ?? []).map((o: any) => [o.id, o.name as string]));
    const kisi = new Map((kisiler ?? []).map((k: any) => [k.id, k]));
    const deptAdi = new Map((depts ?? []).map((d: any) => [d.id, d.name as string]));
    const modulAdi = new Map((katalog ?? []).map((m: any) => [m.key, m.name as string]));

    return satirlar.map((s) => ({
      id: s.id,
      organizationId: s.organization_id,
      organizationName: orgAdi.get(s.organization_id) ?? "",
      userId: s.user_id,
      fullName: kisi.get(s.user_id)?.full_name ?? "",
      username: kisi.get(s.user_id)?.username ?? undefined,
      invitedByName: s.invited_by ? kisi.get(s.invited_by)?.full_name ?? undefined : undefined,
      pozisyon: s.pozisyon ?? undefined,
      isTanimi: s.is_tanimi ?? undefined,
      // Arada silinmiş departman listeden düşer — kabulde de yazılmayacak.
      departmanlar: s.departmanlar
        .filter((d) => deptAdi.has(d.departmentId))
        .map((d) => ({ id: d.departmentId, name: deptAdi.get(d.departmentId)!, role: d.role })),
      moduller: s.moduller.map((m) => ({
        departmentId: m.departmentId,
        key: m.moduleKey,
        name: modulAdi.get(m.moduleKey) ?? m.moduleKey,
      })),
      status: s.status,
      createdAt: s.created_at,
      respondedAt: s.responded_at ?? undefined,
    }));
  }
}
