import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { FilesService, type ProjectFile } from "../files/files.service";
import { TasksService } from "../tasks/tasks.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";

/**
 * Seçiciye dönen aday sayısı.
 *
 * Liste bir ARAMA kutusunun altında duruyor: kullanıcı yazdıkça daralıyor, yani
 * tamamını göndermek gereksiz. Tavan olmadan binlerce kayıtlı bir şirkette
 * pencere açılırken donuyordu.
 */
const ADAY_TAVANI = 50;

/** Bir dosyanın iliştirilebileceği yerler (bkz. migration 095). */
export type LinkTargetKind = "task" | "user" | "module_record";

export interface FileLink {
  id: string;
  fileId: string;
  targetKind: LinkTargetKind;
  targetId: string;
  createdBy: string;
  createdAt: string;
}

function mapLink(row: any): FileLink {
  return {
    id: row.id,
    fileId: row.file_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * Dosya bağlantıları.
 *
 * NEDEN AYRI MODÜL: FilesService zaten 3000 satırın üstünde ve bu iş onun
 * bilmediği şeyleri (görev yetkisi, modül kaydı) bilmek zorunda. Ayrı modül
 * TasksModule'ü içeri alabiliyor; FilesModule'ün almasi Jobs > Files > Tasks
 * yönünde yeni bir bağımlılık açardı ve o graf zaten bir kez döngüye girmişti
 * (bkz. files.module.ts'teki GoogleCoreModule notu).
 *
 * BAĞLANTI ERİŞİM VERMEZ. Listeleme her dosyayı FilesService.findById'den
 * geçiriyor: erişimi olmayan kullanıcı bağlantıyı görse bile dosyayı göremez,
 * dolayısıyla listeye hiç girmez. Bunu bir paylaşım kapısı yapmak, Projelio
 * izinleriyle bulut izinlerini ayrıştırırdı — kullanıcı burada görüp Drive'da
 * açamazdı.
 */
@Injectable()
export class FileLinksService {
  constructor(
    private supabase: SupabaseService,
    private filesService: FilesService,
    private tasksService: TasksService,
    private notifications: NotificationsService
  ) {}

  /**
   * Dosyanın kapsamı: iş, departman ya da şirket.
   *
   * Hedefin AYNI kapsamda olması şart. Kullanıcı iki şirkete birden üye
   * olabiliyor; kapsam kontrolü olmasa A şirketinin dosyası B şirketinin
   * gorevine asılabilir ve orada gören herkes onu açamadığı hâlde görürdü.
   */
  private async fileScope(fileId: string, userId: string): Promise<{
    row: any;
    jobId?: string;
    departmentId?: string;
    organizationId?: string;
  }> {
    const { row } = await this.filesService.findById(fileId, userId);
    return {
      row,
      jobId: row.job_id ?? undefined,
      departmentId: row.department_id ?? undefined,
      organizationId: row.organization_id ?? undefined,
    };
  }

  /** Departmanın bağlı olduğu şirket. */
  private async organizationOfDepartment(departmentId?: string): Promise<string | undefined> {
    if (!departmentId) return undefined;
    const { data } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    return data?.organization_id ?? undefined;
  }

  /** İşin bağlı olduğu şirket (varsa). */
  private async organizationOfJob(jobId?: string): Promise<string | undefined> {
    if (!jobId) return undefined;
    const { data } = await this.supabase.client
      .from("jobs")
      .select("organization_id")
      .eq("id", jobId)
      .maybeSingle();
    return data?.organization_id ?? undefined;
  }

  /** Projenin bağlı olduğu iş. */
  private async jobOfProject(projectId?: string): Promise<string | undefined> {
    if (!projectId) return undefined;
    const { data } = await this.supabase.client
      .from("projects")
      .select("job_id")
      .eq("id", projectId)
      .maybeSingle();
    return data?.job_id ?? undefined;
  }

  /**
   * Dosya ile hedefin aynı kapsamda olup olmadığı.
   *
   * Şirket, kapsamların en genişi: bir şirketin dosyası o şirketin
   * departmanındaki bir goreve de bağlanabilir, tersi de geçerli. Karşılaştırma
   * bu yüzden "şirkete kadar yükseltilmiş" kimlikler üzerinden yapılıyor.
   */
  private async ayniKapsam(
    dosya: { jobId?: string; departmentId?: string; organizationId?: string },
    hedef: { jobId?: string; departmentId?: string; organizationId?: string }
  ): Promise<boolean> {
    if (dosya.jobId && hedef.jobId && dosya.jobId === hedef.jobId) return true;
    if (dosya.departmentId && hedef.departmentId && dosya.departmentId === hedef.departmentId) return true;

    const dosyaOrg =
      dosya.organizationId ??
      (await this.organizationOfDepartment(dosya.departmentId)) ??
      (await this.organizationOfJob(dosya.jobId));
    const hedefOrg =
      hedef.organizationId ??
      (await this.organizationOfDepartment(hedef.departmentId)) ??
      (await this.organizationOfJob(hedef.jobId));

    return Boolean(dosyaOrg && hedefOrg && dosyaOrg === hedefOrg);
  }

  /** Hedefin kapsamı ve okunabilir adı; erişim de burada doğrulanıyor. */
  private async hedefKapsami(
    kind: LinkTargetKind,
    targetId: string,
    userId: string
  ): Promise<{ scope: { jobId?: string; departmentId?: string; organizationId?: string }; name: string }> {
    if (kind === "task") {
      // Görev yetkisi TasksService'te; taşeron görünürlüğü dahil tek yerden
      // çözülüyor ve burada ikinci bir kopyası olmamalı.
      const task = await this.tasksService.findById(targetId, userId);
      const jobId = await this.jobOfProject(task.projectId ?? undefined);
      return {
        scope: { jobId, departmentId: task.departmentId ?? undefined },
        name: task.title,
      };
    }

    if (kind === "module_record") {
      const { data: rec } = await this.supabase.client
        .from("module_records")
        .select("id, organization_id, department_id, job_id, module_key, data")
        .eq("id", targetId)
        .maybeSingle();
      if (!rec) throw new NotFoundException("Kayıt bulunamadı");
      return {
        scope: {
          organizationId: rec.organization_id ?? undefined,
          departmentId: rec.department_id ?? undefined,
          jobId: rec.job_id ?? undefined,
        },
        name: kayitAdi(rec),
      };
    }

    const { data: user } = await this.supabase.client
      .from("users")
      .select("id, full_name")
      .eq("id", targetId)
      .maybeSingle();
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı");
    // Kişinin kapsamı yok: kontrolü kapsam değil ÜYELİK yapıyor (bkz. link()).
    return { scope: {}, name: user.full_name ?? "Kullanıcı" };
  }

  /** Kişi dosyanın kapsamının ekibinde mi. */
  private async kapsamUyesiMi(
    dosya: { jobId?: string; departmentId?: string; organizationId?: string },
    userId: string
  ): Promise<boolean> {
    const kontrol = async (table: string, column: string, id?: string): Promise<boolean> => {
      if (!id) return false;
      const { data } = await this.supabase.client
        .from(table)
        .select("id")
        .eq(column, id)
        .eq("user_id", userId)
        .eq("status", "approved")
        .maybeSingle();
      return Boolean(data);
    };

    const organizationId =
      dosya.organizationId ??
      (await this.organizationOfDepartment(dosya.departmentId)) ??
      (await this.organizationOfJob(dosya.jobId));

    if (organizationId) {
      const { data: org } = await this.supabase.client
        .from("organizations")
        .select("owner_id")
        .eq("id", organizationId)
        .maybeSingle();
      if (org?.owner_id === userId) return true;
      if (await kontrol("organization_members", "organization_id", organizationId)) return true;
    }
    if (await kontrol("department_members", "department_id", dosya.departmentId)) return true;
    if (await kontrol("job_members", "job_id", dosya.jobId)) return true;

    if (dosya.jobId) {
      const { data: job } = await this.supabase.client
        .from("jobs")
        .select("owner_id")
        .eq("id", dosya.jobId)
        .maybeSingle();
      if (job?.owner_id === userId) return true;
    }
    return false;
  }

  async link(fileId: string, userId: string, kind: LinkTargetKind, targetId: string): Promise<FileLink> {
    if (!targetId) throw new BadRequestException("Bağlanacak öğe seçilmedi");

    const dosya = await this.fileScope(fileId, userId);
    const hedef = await this.hedefKapsami(kind, targetId, userId);

    if (kind === "user") {
      if (!(await this.kapsamUyesiMi(dosya, targetId))) {
        throw new ForbiddenException("Bu kişi dosyanın ekibinde değil; bağlasanız da dosyayı açamaz.");
      }
    } else if (!(await this.ayniKapsam(dosya, hedef.scope))) {
      throw new ForbiddenException("Bu öğe dosyanın kapsamında değil.");
    }

    const { data: row, error } = await this.supabase.client
      .from("file_links")
      .insert({ file_id: fileId, target_kind: kind, target_id: targetId, created_by: userId })
      .select()
      .single();

    if (error) {
      // Zaten bağlı (migration 095'teki tekil indeks): var olanı döndürmek,
      // iki kez tıklamayı bir hata olmaktan çıkarıyor.
      if ((error as any).code === "23505") {
        const { data: mevcut } = await this.supabase.client
          .from("file_links")
          .select()
          .eq("file_id", fileId)
          .eq("target_kind", kind)
          .eq("target_id", targetId)
          .maybeSingle();
        if (mevcut) return mapLink(mevcut);
      }
      throw error;
    }

    // Kişiye bağlamak ancak haber verilirse bir işe yarıyor: kimse kendi
    // adına bağlanmış dosyaları aramaya gitmez.
    if (kind === "user" && targetId !== userId) {
      this.notifications.notifyUserSafe(
        targetId,
        "file_linked",
        "Sana bir dosya bağlandı",
        dosya.row.name,
        dosya.row.web_view_link ?? undefined
      );
    }

    return mapLink(row);
  }

  async unlink(fileId: string, userId: string, kind: LinkTargetKind, targetId: string): Promise<void> {
    // Erişim kontrolü: dosyayı göremeyen bağlantısını da koparamaz.
    await this.filesService.findById(fileId, userId);
    const { error } = await this.supabase.client
      .from("file_links")
      .delete()
      .eq("file_id", fileId)
      .eq("target_kind", kind)
      .eq("target_id", targetId);
    if (error) throw error;
  }

  /**
   * Bir hedefe bağlı dosyalar.
   *
   * Her satır FilesService.findById'den geçiyor: erişimi olmayan dosya sessizce
   * elenir. Hata döndürmek, tek bir erişilemeyen dosya yüzünden bütün listeyi
   * boş bırakırdı (bkz. FilesController.accessTokens'taki aynı desen).
   */
  async listForTarget(kind: LinkTargetKind, targetId: string, userId: string): Promise<ProjectFile[]> {
    if (!targetId) return [];

    const { data, error } = await this.supabase.client
      .from("file_links")
      .select("file_id")
      .eq("target_kind", kind)
      .eq("target_id", targetId)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;

    const sonuc = await Promise.all(
      (data ?? []).map(async (satir: any) => {
        try {
          const { file } = await this.filesService.findById(satir.file_id, userId);
          return file;
        } catch {
          return null;
        }
      })
    );
    return sonuc.filter(Boolean) as ProjectFile[];
  }

  /**
   * Bir dosyanın bağlanabileceği öğeler.
   *
   * NEDEN SUNUCUDA: aday listesi dosyanın kapsamından çıkıyor ve o kapsam
   * kuralları bağlama yetkisiyle AYNI kurallar (bkz. ayniKapsam, kapsamUyesiMi).
   * İstemcide ikinci bir kopyasını tutmak, seçilebilen ama bağlanamayan öğeler
   * gösterilmesi demekti — kullanıcı seçer, sunucu reddeder.
   */
  async linkTargets(
    fileId: string,
    userId: string,
    q?: string
  ): Promise<{
    tasks: { id: string; title: string; context?: string; isSubtask: boolean }[];
    users: { id: string; fullName: string }[];
    records: { id: string; name: string; moduleKey?: string }[];
  }> {
    const dosya = await this.fileScope(fileId, userId);
    const arama = (q ?? "").trim().toLowerCase();
    const eslesir = (metin?: string) => !arama || (metin ?? "").toLowerCase().includes(arama);

    const organizationId =
      dosya.organizationId ??
      (await this.organizationOfDepartment(dosya.departmentId)) ??
      (await this.organizationOfJob(dosya.jobId));

    // ── Görevler
    let tasks: any[] = [];
    try {
      if (dosya.departmentId) {
        tasks = await this.tasksService.findByDepartment(dosya.departmentId, userId);
      } else if (dosya.organizationId && organizationId) {
        tasks = await this.tasksService.findByOrganization(organizationId, userId);
      } else if (dosya.jobId) {
        const { data: projeler } = await this.supabase.client
          .from("projects")
          .select("id, title")
          .eq("job_id", dosya.jobId);
        for (const proje of projeler ?? []) {
          // Bir projenin gorevleri okunamazsa (taşeron görünürlüğü) tüm liste
          // düşmesin; o proje atlanır.
          try {
            const liste = await this.tasksService.findByProject(proje.id, userId);
            tasks.push(...liste.map((gorev: any) => ({ ...gorev, projectTitle: proje.title })));
          } catch {
            continue;
          }
        }
      }
    } catch {
      tasks = [];
    }

    // ── Kişiler: dosyanın kapsamının ekibi
    const users = await this.kapsamEkibi(dosya, organizationId);

    // ── Modül kayıtları
    let records: any[] = [];
    if (organizationId) {
      const { data } = await this.supabase.client
        .from("module_records")
        .select("id, module_key, data, department_id, job_id")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(LISTE_TAVANI);
      records = data ?? [];
    } else if (dosya.jobId) {
      const { data } = await this.supabase.client
        .from("module_records")
        .select("id, module_key, data, department_id, job_id")
        .eq("job_id", dosya.jobId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(LISTE_TAVANI);
      records = data ?? [];
    }

    return {
      tasks: tasks
        .filter((gorev) => eslesir(gorev.title))
        .slice(0, ADAY_TAVANI)
        .map((gorev) => ({
          id: gorev.id,
          title: gorev.title,
          context: gorev.projectTitle ?? gorev.departmentName ?? undefined,
          isSubtask: Boolean(gorev.parentTaskId),
        })),
      users: users.filter((k) => eslesir(k.fullName)).slice(0, ADAY_TAVANI),
      records: records
        .map((kayitSatiri) => ({
          id: kayitSatiri.id,
          name: kayitAdi(kayitSatiri),
          moduleKey: kayitSatiri.module_key ?? undefined,
        }))
        .filter((kayitSatiri) => eslesir(kayitSatiri.name))
        .slice(0, ADAY_TAVANI),
    };
  }

  /** Dosyanın kapsamındaki onaylı kişiler — "kime bağlanabilir" listesi. */
  private async kapsamEkibi(
    dosya: { jobId?: string; departmentId?: string },
    organizationId?: string
  ): Promise<{ id: string; fullName: string }[]> {
    const ids = new Set<string>();

    const topla = async (table: string, column: string, id?: string) => {
      if (!id) return;
      const { data } = await this.supabase.client
        .from(table)
        .select("user_id")
        .eq(column, id)
        .eq("status", "approved");
      for (const satir of data ?? []) if (satir.user_id) ids.add(satir.user_id);
    };

    if (organizationId) {
      const { data: org } = await this.supabase.client
        .from("organizations")
        .select("owner_id")
        .eq("id", organizationId)
        .maybeSingle();
      if (org?.owner_id) ids.add(org.owner_id);
      await topla("organization_members", "organization_id", organizationId);
    }
    await topla("department_members", "department_id", dosya.departmentId);
    await topla("job_members", "job_id", dosya.jobId);
    if (dosya.jobId) {
      const { data: job } = await this.supabase.client
        .from("jobs")
        .select("owner_id")
        .eq("id", dosya.jobId)
        .maybeSingle();
      if (job?.owner_id) ids.add(job.owner_id);
    }

    if (!ids.size) return [];
    const { data } = await this.supabase.client
      .from("users")
      .select("id, full_name")
      .in("id", [...ids])
      .limit(LISTE_TAVANI);
    return (data ?? []).map((u: any) => ({ id: u.id, fullName: u.full_name ?? "Kullanıcı" }));
  }

  /** Bir dosyanın bağlı olduğu hedefler — dosya ekranındaki rozet için. */
  async listForFile(fileId: string, userId: string): Promise<FileLink[]> {
    await this.filesService.findById(fileId, userId);
    const { data, error } = await this.supabase.client
      .from("file_links")
      .select()
      .eq("file_id", fileId)
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map(mapLink);
  }
}

/** Modül kaydının okunabilir adı; bildirimde ve listede gösteriliyor. */
function kayitAdi(rec: any): string {
  const veri = (rec.data ?? {}) as Record<string, unknown>;
  // Kayıtların şeması modüle göre değişiyor; ad taşıyan yaygın alanlar
  // sırayla deneniyor, hiçbiri yoksa modül anahtarına düşülüyor.
  for (const alan of ["ad", "adi", "baslik", "isim", "name", "title", "unvan"]) {
    const deger = veri[alan];
    if (typeof deger === "string" && deger.trim()) return deger.trim();
  }
  return rec.module_key ?? "Kayıt";
}
