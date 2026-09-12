import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { BudgetTransaction, GorevButceTalebi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { requireAmount } from "../../common/validation/input";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { ButceErisimService } from "./butce-erisim.service";
import { mapTalep } from "./butce-hiyerarsi.service";
import { mapTransaction, SECIM } from "./butce-eslestirme";

/**
 * Görev bütçesi onay akışı.
 *
 * AKIŞ: bir görev için para gerekiyor → talep açılır → görevin bağlı olduğu
 * kademenin YÖNETİCİSİNE bildirim gider → onaylanırsa "planlandı" olur →
 * ödeme yapılınca "ödendi" olur ve deftere GERÇEK bir gider satırı düşer.
 *
 * "planlandı" ile "ödendi" AYRI olmak zorunda: onay bir taahhüttür, bütçeyi
 * bağlar ama kasadan para çıkarmaz. İkisi tek durum olsaydı onaylanan her
 * talep aynı anda harcanmış sayılır ve nakit akışı grafiği gerçekte olmayan
 * çıkışlar gösterirdi.
 *
 * NE DEĞİŞTİ: eskiden tasks.budget_status vardı ama ONAY DEĞİL ETİKETTİ —
 * `PATCH /tasks/:id/budget-status` görevi GÖREBİLEN herkese açıktı, yani
 * bütçesini kendi giren kişi kendi talebini onaylayabiliyordu. Karar artık
 * yalnızca yöneticiden geçiyor ve kim/ne zaman/neden izi tutuluyor.
 */
@Injectable()
export class GorevButceService {
  constructor(
    private supabase: SupabaseService,
    private erisim: ButceErisimService,
    private notifications: NotificationsService
  ) {}

  private static readonly SECIM_TALEP =
    "id, title, project_id, department_id, operation_id, budget, budget_currency, budget_status, budget_requested_by, budget_requested_at, budget_decided_by, budget_decided_at, budget_note, deadline, projects(title), departments(name), talep:users!tasks_budget_requested_by_fkey(full_name), karar:users!tasks_budget_decided_by_fkey(full_name)";

  /**
   * Görev için bütçe talep eder (ya da mevcut talebin tutarını düzeltir).
   *
   * Tutar DEĞİŞİRSE onay sıfırlanır: 500 TL'lik bir talebi onaylayan yönetici
   * 50.000 TL'ye onay vermiş sayılamaz. Bu yüzden onaylanmış bir görevin
   * tutarına dokunmak talebi yeniden "bekliyor"a düşürür.
   */
  async talepEt(
    taskId: string,
    data: { amount: number; currency?: string; note?: string },
    userId?: string
  ): Promise<GorevButceTalebi> {
    const gorev = await this.gorev(taskId);
    // Talebi görevi görebilen herkes açabilir: "para gerekiyor" diyen kişi
    // işi yapan kişidir, yöneticisi değil.
    await this.assertGorevErisimi(gorev, userId);

    const tutar = requireAmount(data.amount);
    if (tutar <= 0) throw new BadRequestException("Bütçe talebi sıfırdan büyük olmalı");

    const odendi = gorev.budget_status === "paid";
    if (odendi) throw new BadRequestException("Ödenmiş bir görevin bütçesi değiştirilemez");

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({
        budget: tutar,
        budget_currency: (data.currency || "TRY").toUpperCase(),
        budget_status: "pending",
        budget_requested_by: userId ?? null,
        budget_requested_at: new Date().toISOString(),
        // Yeni talep, eski kararın izini temizler: reddedilme gerekçesi
        // düzeltilmiş bir talebin üzerinde durmamalı.
        budget_decided_by: null,
        budget_decided_at: null,
        budget_note: data.note?.trim() || null,
      })
      .eq("id", taskId)
      .select(GorevButceService.SECIM_TALEP)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");

    await this.yoneticileriUyar(gorev, `${tutar} ${(data.currency || "TRY").toUpperCase()}`, (row as any).title);
    return mapTalep(row);
  }

  /**
   * Yöneticinin kararı: onay ya da ret.
   *
   * Reddedilen talep SİLİNMEZ, `rejected` olarak durur — talep eden kişi
   * gerekçeyi görmeli, yoksa "onaylandı mı, unutuldu mu" belirsizliği kalır.
   */
  async karar(taskId: string, onay: boolean, note: string | undefined, userId?: string): Promise<GorevButceTalebi> {
    const gorev = await this.gorev(taskId);
    await this.assertOnayYetkisi(gorev, userId);

    if (gorev.budget_status === "paid") throw new BadRequestException("Ödenmiş bir görevin kararı değiştirilemez");
    if (!gorev.budget || Number(gorev.budget) <= 0) throw new BadRequestException("Bu görevde onaylanacak bir bütçe yok");

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({
        budget_status: onay ? "planned" : "rejected",
        budget_decided_by: userId ?? null,
        budget_decided_at: new Date().toISOString(),
        budget_note: note?.trim() || null,
      })
      .eq("id", taskId)
      .select(GorevButceService.SECIM_TALEP)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");

    // Talebi açan kişi kararı öğrenmeli; bildirim gitmezse ekranı yenileyene
    // kadar beklediğini sanır.
    if (gorev.budget_requested_by && gorev.budget_requested_by !== userId) {
      this.notifications.notifyUserSafe(
        gorev.budget_requested_by,
        "budget_changed",
        onay ? "Bütçe onaylandı" : "Bütçe reddedildi",
        onay
          ? { metin: "{gorev} için istediğin bütçe onaylandı.", params: { gorev: (row as any).title } }
          : { metin: "{gorev} için istediğin bütçe reddedildi.", params: { gorev: (row as any).title } },
        this.gorevLinki(gorev)
      );
    }
    return mapTalep(row);
  }

  /**
   * Onaylanmış bütçeyi ÖDENDİ yapar ve deftere gerçek gider satırını düşer.
   *
   * Hareketin kademesi görevin kademesidir: projedeki görev proje bütçesine,
   * departmandaki görev departman defterine yazılır. Üst kademeler bu satırı
   * TOPLAYARAK görür — ayrıca kopyalanmaz (bkz. ButceHiyerarsiService).
   *
   * Tekil indeks (budget_transactions_task_uniq) aynı görevin iki kez
   * düşmesini veritabanı düzeyinde engelliyor; buradaki durum kontrolü yalnızca
   * kullanıcıya anlaşılır bir hata vermek için.
   */
  async odendiIsaretle(taskId: string, userId?: string): Promise<{ talep: GorevButceTalebi; hareket: BudgetTransaction }> {
    const gorev = await this.gorev(taskId);
    await this.assertOnayYetkisi(gorev, userId);

    if (gorev.budget_status !== "planned") {
      throw new BadRequestException("Yalnızca onaylanmış (planlanan) bir bütçe ödenmiş sayılabilir");
    }

    const hareket = await this.deftereIsle(gorev, userId);

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({ budget_status: "paid", budget_decided_by: userId ?? null, budget_decided_at: new Date().toISOString() })
      .eq("id", taskId)
      .select(GorevButceService.SECIM_TALEP)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    return { talep: mapTalep(row), hareket };
  }

  /**
   * Ödemeyi geri alır: defterdeki satır silinir, görev "planlandı"ya döner.
   *
   * Yanlışlıkla "ödendi" demek yaygın ve düzeltmenin tek yolu kaydı elle
   * bulup silmek olsaydı, defterde kaynağı görünmeyen artık satırlar kalırdı.
   */
  async odemeyiGeriAl(taskId: string, userId?: string): Promise<GorevButceTalebi> {
    const gorev = await this.gorev(taskId);
    await this.assertOnayYetkisi(gorev, userId);
    if (gorev.budget_status !== "paid") throw new BadRequestException("Bu görev ödenmiş görünmüyor");

    const { error: silmeHatasi } = await this.supabase.client.from("budget_transactions").delete().eq("task_id", taskId);
    if (silmeHatasi) throw silmeHatasi;

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({ budget_status: "planned", budget_decided_by: userId ?? null, budget_decided_at: new Date().toISOString() })
      .eq("id", taskId)
      .select(GorevButceService.SECIM_TALEP)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    return mapTalep(row);
  }

  /**
   * Görev bütçesi değiştiğinde yöneticilere haber verir.
   *
   * `PATCH /tasks/:id` ile bütçe girildiğinde çağrılıyor: talebi asıl açan yol
   * o ve bildirim gitmezse yöneticinin bekleyen onaydan haberi olmaz. Talebin
   * KAYDI orada yazılıyor (bkz. TasksService.update), burada yalnızca duyuru —
   * aynı satırı iki kez yazmamak için.
   */
  async talebiDuyur(taskId: string): Promise<void> {
    const gorev = await this.gorev(taskId).catch(() => null);
    if (!gorev || !gorev.budget || Number(gorev.budget) <= 0) return;
    if (gorev.budget_status !== "pending") return;
    await this.yoneticileriUyar(
      gorev,
      `${Number(gorev.budget)} ${gorev.budget_currency || "TRY"}`,
      gorev.title
    );
  }

  /** Bir projenin/departmanın görev bütçesi talepleri (tüm durumlar). */
  async talepler(scopeType: "project" | "department", scopeId: string): Promise<GorevButceTalebi[]> {
    const sutun = scopeType === "project" ? "project_id" : "department_id";
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select(GorevButceService.SECIM_TALEP)
      .eq(sutun, scopeId)
      .gt("budget", 0)
      .limit(LISTE_TAVANI);
    if (error) throw error;
    // Bekleyenler en üstte: bu ekranda yapılacak iş onlar.
    const sira = { pending: 0, planned: 1, rejected: 2, paid: 3 } as Record<string, number>;
    return (data ?? [])
      .map(mapTalep)
      .sort((a, b) => (sira[a.status] ?? 9) - (sira[b.status] ?? 9) || String(b.requestedAt ?? "").localeCompare(String(a.requestedAt ?? "")));
  }

  // --------------------------------------------------------------- Yardımcılar

  private async gorev(taskId: string): Promise<any> {
    const { data } = await this.supabase.client
      .from("tasks")
      .select("id, title, project_id, department_id, operation_id, budget, budget_currency, budget_status, budget_requested_by")
      .eq("id", taskId)
      .maybeSingle();
    if (!data) throw new NotFoundException("Görev bulunamadı");
    return data;
  }

  /**
   * Talebi açabilmek için görevin bulunduğu yeri görebilmek yeter.
   *
   * Projede ekip üyesi olmak, departmanda kadroda olmak yeterli — "bu iş için
   * para gerekiyor" diyen kişi işi yapan kişidir. Onay ayrı bir kapıdan geçer
   * (assertOnayYetkisi).
   */
  private async assertGorevErisimi(gorev: any, userId?: string): Promise<void> {
    if (!userId) return;
    if (gorev.department_id) {
      const yetki = await this.erisim.yetki("department", gorev.department_id, userId);
      // Departman görevinde bütçe görebilmek şart değil; kadroda olmak yeter.
      if (yetki.canView) return;
      const { data: kadro } = await this.supabase.client
        .from("department_members")
        .select("id")
        .eq("department_id", gorev.department_id)
        .eq("user_id", userId)
        .eq("status", "approved")
        .maybeSingle();
      if (kadro) return;
      throw new ForbiddenException("Bu görev için bütçe talep etme yetkiniz yok");
    }

    if (gorev.project_id) {
      const { data: proje } = await this.supabase.client
        .from("projects")
        .select("owner_id")
        .eq("id", gorev.project_id)
        .maybeSingle();
      if (proje?.owner_id === userId) return;
      const { data: uyelik } = await this.supabase.client
        .from("project_members")
        .select("id")
        .eq("project_id", gorev.project_id)
        .eq("user_id", userId)
        .eq("status", "approved")
        .maybeSingle();
      if (uyelik) return;
      throw new ForbiddenException("Bu görev için bütçe talep etme yetkiniz yok");
    }

    // Rutin görevi: işin sahibi ya da onaylı ekip üyesi.
    await this.assertRutinErisimi(gorev.operation_id, userId, false);
  }

  /**
   * ONAY YETKİSİ — talep etmekten ayrı ve dar.
   *
   * Projede proje/iş sahibi, departmanda organizasyon sahibi veya departman
   * yöneticisi. "Bu parayı harcamaya izin veriyorum" demek bir yönetim
   * kararıdır; görevi görebilen herkese açık olamaz.
   */
  private async assertOnayYetkisi(gorev: any, userId?: string): Promise<void> {
    if (!userId) return;

    if (gorev.department_id) {
      const yetki = await this.erisim.yetki("department", gorev.department_id, userId);
      if (yetki.canApprove) return;
      throw new ForbiddenException("Görev bütçesini yalnızca departman yöneticisi ya da organizasyon sahibi onaylayabilir");
    }

    if (gorev.project_id) {
      const { data: proje } = await this.supabase.client
        .from("projects")
        .select("owner_id, job_id")
        .eq("id", gorev.project_id)
        .maybeSingle();
      if (!proje) throw new NotFoundException("Proje bulunamadı");
      if (proje.owner_id === userId) return;
      if (proje.job_id) {
        const yetki = await this.erisim.yetki("job", proje.job_id, userId);
        if (yetki.canApprove) return;
      }
      throw new ForbiddenException("Görev bütçesini yalnızca proje yöneticisi ya da iş sahibi onaylayabilir");
    }

    await this.assertRutinErisimi(gorev.operation_id, userId, true);
  }

  private async assertRutinErisimi(operationId: string | null, userId: string, onayIcin: boolean): Promise<void> {
    if (!operationId) throw new NotFoundException("Görevin bağlı olduğu kademe bulunamadı");
    const { data: rutin } = await this.supabase.client.from("operations").select("owner_id, job_id").eq("id", operationId).maybeSingle();
    if (!rutin) throw new NotFoundException("Rutin bulunamadı");
    if (rutin.owner_id === userId) return;
    if (rutin.job_id) {
      const yetki = await this.erisim.yetki("job", rutin.job_id, userId);
      if (onayIcin ? yetki.canApprove : yetki.canView) return;
    }
    throw new ForbiddenException(
      onayIcin ? "Görev bütçesini yalnızca iş sahibi onaylayabilir" : "Bu görev için bütçe talep etme yetkiniz yok"
    );
  }

  /** Onaylanmış görevi görevin KENDİ kademesinin defterine gider olarak yazar. */
  private async deftereIsle(gorev: any, userId?: string): Promise<BudgetTransaction> {
    const kademe = gorev.project_id
      ? { sutun: "project_id", id: gorev.project_id }
      : gorev.department_id
        ? { sutun: "department_id", id: gorev.department_id }
        : { sutun: "operation_id", id: gorev.operation_id };

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        [kademe.sutun]: kademe.id,
        task_id: gorev.id,
        owner_id: await this.defterSahibi(gorev),
        created_by: userId ?? null,
        // Görev bütçesi ekip ödemesidir: "payout" türü tam olarak bunun için
        // var (bkz. butceToplama > giderMi — gider gibi toplanır ama muhasebe
        // kırılımında malzeme giderinden ayrı durur).
        type: "payout",
        amount: Number(gorev.budget),
        currency: gorev.budget_currency || "TRY",
        category: "Görev bütçesi",
        description: gorev.title,
        occurred_at: new Date().toISOString().slice(0, 10),
      })
      .select(SECIM)
      .single();
    if (error) throw error;
    return mapTransaction(row);
  }

  private async defterSahibi(gorev: any): Promise<string | null> {
    if (gorev.project_id) {
      const { data } = await this.supabase.client.from("projects").select("owner_id").eq("id", gorev.project_id).maybeSingle();
      return data?.owner_id ?? null;
    }
    if (gorev.department_id) {
      const { data: dept } = await this.supabase.client
        .from("departments")
        .select("organization_id")
        .eq("id", gorev.department_id)
        .maybeSingle();
      if (!dept?.organization_id) return null;
      const { data: org } = await this.supabase.client
        .from("organizations")
        .select("owner_id")
        .eq("id", dept.organization_id)
        .maybeSingle();
      return org?.owner_id ?? null;
    }
    const { data } = await this.supabase.client.from("operations").select("owner_id").eq("id", gorev.operation_id).maybeSingle();
    return data?.owner_id ?? null;
  }

  /**
   * Talebi karar verecek kişilere duyurur.
   *
   * notifyUserSafe kullanılıyor: notifyUser veritabanı hatasında throw ediyor
   * ve beklenmeden bırakılırsa Node 22'de süreci öldürüyor (bkz. CLAUDE.md).
   */
  private async yoneticileriUyar(gorev: any, tutarMetni: string, baslik: string): Promise<void> {
    const alicilar = await this.onaylayicilar(gorev);
    for (const alici of alicilar) {
      if (alici === gorev.budget_requested_by) continue;
      this.notifications.notifyUserSafe(
        alici,
        "budget_changed",
        "Bütçe onayı bekliyor",
        { metin: "{gorev} için {tutar} bütçe onayı isteniyor.", params: { gorev: baslik, tutar: tutarMetni } },
        this.gorevLinki(gorev)
      );
    }
  }

  private async onaylayicilar(gorev: any): Promise<string[]> {
    if (gorev.project_id) {
      const { data: proje } = await this.supabase.client
        .from("projects")
        .select("owner_id, job_id")
        .eq("id", gorev.project_id)
        .maybeSingle();
      const alicilar = new Set<string>();
      if (proje?.owner_id) alicilar.add(proje.owner_id);
      if (proje?.job_id) {
        const { data: is } = await this.supabase.client.from("jobs").select("owner_id").eq("id", proje.job_id).maybeSingle();
        if (is?.owner_id) alicilar.add(is.owner_id);
      }
      return Array.from(alicilar);
    }

    if (gorev.department_id) {
      const alicilar = new Set<string>();
      const { data: dept } = await this.supabase.client
        .from("departments")
        .select("organization_id")
        .eq("id", gorev.department_id)
        .maybeSingle();
      if (dept?.organization_id) {
        const { data: org } = await this.supabase.client
          .from("organizations")
          .select("owner_id")
          .eq("id", dept.organization_id)
          .maybeSingle();
        if (org?.owner_id) alicilar.add(org.owner_id);
      }
      const { data: yoneticiler } = await this.supabase.client
        .from("department_members")
        .select("user_id")
        .eq("department_id", gorev.department_id)
        .eq("role", "manager")
        .eq("status", "approved");
      for (const y of yoneticiler ?? []) if (y.user_id) alicilar.add(y.user_id);
      return Array.from(alicilar);
    }

    const { data: rutin } = await this.supabase.client.from("operations").select("owner_id").eq("id", gorev.operation_id).maybeSingle();
    return rutin?.owner_id ? [rutin.owner_id] : [];
  }

  /** Bildirimden görevin bulunduğu bütçe ekranına götüren bağlantı. */
  private gorevLinki(gorev: any): string | undefined {
    if (gorev.project_id) return `/projects/${gorev.project_id}?tab=budget`;
    if (gorev.department_id) return `/departments/${gorev.department_id}?tab=budget`;
    return undefined;
  }
}
