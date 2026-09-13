import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { BudgetTransaction, HizmetAnlasmasi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireAmount } from "../../common/validation/input";
import { NotificationsService } from "../notifications/notifications.service";
import { mapTransaction, SECIM } from "./butce-eslestirme";
import { hizmetOzeti, hizmetYetkisi } from "./hizmet-anlasmasi";

interface ProjeBaglami {
  id: string;
  title: string;
  ownerId: string;
  totalBudget: number;
  jobOwnerId?: string;
  /** Proje, iş sahibine hizmet veren biçimde mi (migration 111) — ve anlamlı mı. */
  hizmetProjesi: boolean;
  isProjectOwner: boolean;
  isJobOwner: boolean;
  /**
   * Projenin kendi defterini yöneten: proje sahibi; hizmet projesi DEĞİLSE iş
   * sahibi de. Hizmet projesinde iş sahibi müşteridir, hizmet verenin
   * defterinin yöneticisi değil.
   */
  isManager: boolean;
}

/**
 * Ortak projede hizmet alan ile hizmet veren arasındaki para. Kuralların
 * gerekçesi ve iki biçim (`uye` / `proje`): `hizmet-anlasmasi.ts`.
 *
 * Proje bütçesinin geri kalanından AYRI yetkiyle çalışır: taraf olan kişi,
 * karşı tarafın tüm defterini görmeden KENDİ anlaşmasını ve ödemelerini görür
 * ve girer. Tersi de doğru: bütçeyi görebilen biri başkalarının ücretini
 * buradan göremez.
 */
@Injectable()
export class HizmetAnlasmasiService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  private async baglam(projectId: string, userId: string): Promise<ProjeBaglami> {
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("id, title, owner_id, total_budget, hizmet_projesi, jobs(owner_id)")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    const jobOwnerId: string | undefined = (project as any).jobs?.owner_id ?? undefined;
    // İş sahibi proje sahibinin kendisiyse bayrak anlamsız: kişi kendine hizmet vermez.
    const hizmetProjesi = !!project.hizmet_projesi && !!jobOwnerId && jobOwnerId !== project.owner_id;
    const isProjectOwner = project.owner_id === userId;
    const isJobOwner = !!jobOwnerId && jobOwnerId === userId;
    return {
      id: project.id,
      title: project.title,
      ownerId: project.owner_id,
      totalBudget: Number(project.total_budget ?? 0),
      jobOwnerId,
      hizmetProjesi,
      isProjectOwner,
      isJobOwner,
      isManager: isProjectOwner || (isJobOwner && !hizmetProjesi),
    };
  }

  /** Onaylı üyelik — `uye` anlaşması yalnızca projede gerçekten çalışan biriyle olur. */
  private async uyelik(projectId: string, memberUserId: string): Promise<{ id: string } | null> {
    const { data } = await this.supabase.client
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", memberUserId)
      .eq("status", "approved")
      .maybeSingle();
    return data ?? null;
  }

  /**
   * Yazma yetkisi ve anlaşmanın biçimi. `providerUserId` hizmet VEREN: `proje`
   * biçiminde projenin sahibi, `uye` biçiminde üye.
   */
  private async yazmaYetkisi(projectId: string, providerUserId: string, userId: string) {
    const b = await this.baglam(projectId, userId);

    if (providerUserId === b.ownerId) {
      if (!b.hizmetProjesi) {
        throw new BadRequestException("Bu proje iş sahibine hizmet projesi olarak işaretli değil");
      }
      if (!b.isProjectOwner && !b.isJobOwner) {
        throw new ForbiddenException("Bu anlaşmayı yalnızca iş sahibi ya da hizmet veren kişi değiştirebilir");
      }
      return { b, kind: "proje" as const, memberRowId: undefined };
    }

    const uye = await this.uyelik(projectId, providerUserId);
    if (!uye) throw new NotFoundException("Bu kişi projenin onaylı üyesi değil");
    if (!hizmetYetkisi({ isManager: b.isManager, isSelf: providerUserId === userId }).canEdit) {
      throw new ForbiddenException("Bu anlaşmayı yalnızca proje sahibi ya da hizmet veren kişi değiştirebilir");
    }
    return { b, kind: "uye" as const, memberRowId: uye.id };
  }

  /**
   * Projedeki anlaşmalar.
   *
   * `proje` biçimi (hizmet projesi): iş sahibi ve proje sahibi görür.
   * `uye` biçimi: projenin yöneticisi tüm onaylı üyeleri, üye yalnızca
   * kendisini görür. Anlaşması henüz olmayan üyeler de döner (tutar 0):
   * anlaşmanın girileceği yer burası, listede olmayan birine tutar yazılamazdı.
   */
  async liste(projectId: string, userId: string): Promise<HizmetAnlasmasi[]> {
    const b = await this.baglam(projectId, userId);
    const sonuc: HizmetAnlasmasi[] = [];

    if (b.hizmetProjesi && (b.isProjectOwner || b.isJobOwner)) {
      // Hizmet projesinde gelir satırlarının hepsi iş sahibinin ödemesidir:
      // projenin müşterisi tanım gereği o.
      const { data, error } = await this.supabase.client
        .from("budget_transactions")
        .select(SECIM)
        .eq("project_id", projectId)
        .eq("type", "income")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      const odemeler = (data ?? []).map(mapTransaction);
      const adlar = await this.adlar([b.ownerId, b.jobOwnerId]);
      sonuc.push({
        kind: "proje",
        projectId,
        memberId: `proje-${projectId}`,
        userId: b.ownerId,
        fullName: adlar.get(b.ownerId),
        ownerId: b.jobOwnerId as string,
        ownerName: adlar.get(b.jobOwnerId as string),
        ledgerOwnerId: b.ownerId,
        ...hizmetOzeti(b.totalBudget, odemeler),
        payments: odemeler,
        canEdit: true,
      });
    }

    // Hizmet projesinde iş sahibi (müşteri), hizmet verenin kendi ekibine
    // ödediği ücretleri görmez.
    if (!b.isManager && b.isJobOwner) return sonuc;

    let sorgu = this.supabase.client
      .from("project_members")
      .select("id, user_id, custom_agreed_rate, users(full_name)")
      .eq("project_id", projectId)
      .eq("status", "approved")
      .neq("user_id", b.ownerId);
    if (!b.isManager) sorgu = sorgu.eq("user_id", userId);
    const { data: uyeler, error } = await sorgu;
    if (error) throw error;
    if (!uyeler || uyeler.length === 0) return sonuc;

    const { data: odemeSatirlari, error: odemeHatasi } = await this.supabase.client
      .from("budget_transactions")
      .select(SECIM)
      .eq("project_id", projectId)
      .eq("type", "payout")
      .in("user_id", uyeler.map((u: any) => u.user_id))
      .order("occurred_at", { ascending: false });
    if (odemeHatasi) throw odemeHatasi;
    const odemeler = (odemeSatirlari ?? []).map(mapTransaction);
    const adlar = await this.adlar([b.ownerId]);

    for (const u of uyeler as any[]) {
      const kendi = odemeler.filter((o) => o.userId === u.user_id);
      sonuc.push({
        kind: "uye",
        projectId,
        memberId: u.id,
        userId: u.user_id,
        fullName: u.users?.full_name ?? undefined,
        ownerId: b.ownerId,
        ownerName: adlar.get(b.ownerId),
        ledgerOwnerId: b.ownerId,
        ...hizmetOzeti(u.custom_agreed_rate, kendi),
        payments: kendi,
        canEdit: hizmetYetkisi({ isManager: b.isManager, isSelf: u.user_id === userId }).canEdit,
      });
    }
    return sonuc;
  }

  async anlasmaBelirle(projectId: string, providerUserId: string, tutar: unknown, userId: string): Promise<{ agreedFee: number }> {
    const { b, kind, memberRowId } = await this.yazmaYetkisi(projectId, providerUserId, userId);
    // 0 "anlaşmayı kaldır" demek; requireAmount sıfırı reddettiği için ayrı.
    const agreedFee = Number(tutar) === 0 ? 0 : requireAmount(tutar as number);

    const { error } =
      kind === "proje"
        ? // Hizmet projesinde anlaşma projenin "Anlaşılan ücret"idir; ikinci bir
          // alan açmak iki rakamın bir gün ayrışması demekti.
          await this.supabase.client.from("projects").update({ total_budget: agreedFee }).eq("id", projectId)
        : await this.supabase.client
            .from("project_members")
            .update({ custom_agreed_rate: agreedFee || null })
            .eq("id", memberRowId as string);
    if (error) throw error;

    const alici = this.karsiTaraf(b, kind, providerUserId, userId);
    if (alici) {
      this.notificationsService.notifyUserSafe(
        alici,
        "budget_changed",
        "Anlaşma Güncellendi",
        {
          metin: "{proje} için hizmet anlaşması {tutar} ₺ olarak kaydedildi.",
          params: { proje: b.title, tutar: agreedFee },
        },
        `/projects/${b.id}`
      );
    }
    return { agreedFee };
  }

  async odemeEkle(
    projectId: string,
    providerUserId: string,
    data: { amount?: number; occurredAt?: string; description?: string },
    userId: string
  ): Promise<BudgetTransaction> {
    const { b, kind } = await this.yazmaYetkisi(projectId, providerUserId, userId);

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        project_id: projectId,
        // Defter projenin sahibinin. `uye`de para onun kasasından ÇIKTI
        // (payout, user_id = alan üye); `proje`de onun kasasına GİRDİ (income).
        // Karşı tarafa yansıması okunurken üretilir, kopya yazılmaz.
        owner_id: b.ownerId,
        created_by: userId,
        user_id: kind === "uye" ? providerUserId : null,
        type: kind === "uye" ? "payout" : "income",
        amount: requireAmount(data.amount ?? 0),
        // Anlaşma ₺ tutuluyor; döviz ödeme ondan düşülemeyeceği için bu yol ₺.
        currency: "TRY",
        category: "Hizmet bedeli",
        description: data.description?.trim() || null,
        occurred_at: (data.occurredAt || new Date().toISOString()).slice(0, 10),
      })
      .select(SECIM)
      .single();
    if (error) throw error;
    const tx = mapTransaction(row);

    const alici = this.karsiTaraf(b, kind, providerUserId, userId);
    if (alici) {
      this.notificationsService.notifyUserSafe(
        alici,
        "budget_changed",
        "Ödeme Kaydedildi",
        {
          metin: "{proje} için {tutar} ₺ hizmet ödemesi kaydedildi.",
          params: { proje: b.title, tutar: tx.amount },
        },
        `/projects/${b.id}`
      );
    }
    return tx;
  }

  private async adlar(idler: (string | undefined)[]): Promise<Map<string, string>> {
    const tekil = Array.from(new Set(idler.filter((v): v is string => !!v)));
    if (tekil.length === 0) return new Map();
    const { data } = await this.supabase.client.from("users").select("id, full_name").in("id", tekil);
    return new Map<string, string>((data ?? []).map((u: any) => [u.id, u.full_name]));
  }

  /**
   * Kaydı giren değil, KARŞI taraf haberdar edilir. Onay adımı yok; itiraz
   * eden taraf bu bildirimden kaydı görür ve kendi girdiğini düzeltebilir.
   */
  private karsiTaraf(b: ProjeBaglami, kind: "uye" | "proje", providerUserId: string, userId: string): string | null {
    const musteri = kind === "proje" ? b.jobOwnerId : b.ownerId;
    const alici = userId === providerUserId ? musteri : providerUserId;
    return alici && alici !== userId ? alici : null;
  }
}
