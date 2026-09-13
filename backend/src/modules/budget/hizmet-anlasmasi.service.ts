import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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
  isManager: boolean;
}

/**
 * Ortak projede hizmet alan (sahip) ile hizmet veren (üye) arasındaki para.
 * Kuralların gerekçesi: `hizmet-anlasmasi.ts`.
 *
 * Proje bütçesinin geri kalanından AYRI yetkiyle çalışır: üye, sahibin tüm
 * defterini görmeden (can_view_budget kapalıyken bile) KENDİ anlaşmasını ve
 * kendisine yapılan ödemeleri görür ve girer. Tersi de doğru: bütçeyi
 * görebilen bir üye başka üyelerin ücretini buradan göremez.
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
      .select("id, title, owner_id, job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    let isManager = project.owner_id === userId;
    if (!isManager && project.job_id) {
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", project.job_id).maybeSingle();
      isManager = job?.owner_id === userId;
    }
    return { id: project.id, title: project.title, ownerId: project.owner_id, isManager };
  }

  /** Onaylı üyelik — anlaşma yalnızca projede gerçekten çalışan biriyle olur. */
  private async uyelik(projectId: string, memberUserId: string): Promise<{ id: string; custom_agreed_rate: any } | null> {
    const { data } = await this.supabase.client
      .from("project_members")
      .select("id, custom_agreed_rate")
      .eq("project_id", projectId)
      .eq("user_id", memberUserId)
      .eq("status", "approved")
      .maybeSingle();
    return data ?? null;
  }

  private async yazmaYetkisi(projectId: string, memberUserId: string, userId: string) {
    const b = await this.baglam(projectId, userId);
    if (memberUserId === b.ownerId) {
      throw new ForbiddenException("Proje sahibi kendi projesinde hizmet veren olamaz");
    }
    const uye = await this.uyelik(projectId, memberUserId);
    if (!uye) throw new NotFoundException("Bu kişi projenin onaylı üyesi değil");
    if (!hizmetYetkisi({ isManager: b.isManager, isSelf: memberUserId === userId }).canEdit) {
      throw new ForbiddenException("Bu anlaşmayı yalnızca proje sahibi ya da hizmet veren kişi değiştirebilir");
    }
    return { b, uye };
  }

  /**
   * Projedeki anlaşmalar: sahip tümünü, üye yalnızca kendisininkini görür.
   * Anlaşması henüz olmayan onaylı üyeler de döner (tutar 0): anlaşmanın
   * girileceği yer burası, listede olmayan birine tutar yazılamazdı.
   */
  async liste(projectId: string, userId: string): Promise<HizmetAnlasmasi[]> {
    const b = await this.baglam(projectId, userId);

    let sorgu = this.supabase.client
      .from("project_members")
      .select("id, user_id, custom_agreed_rate, users(full_name)")
      .eq("project_id", projectId)
      .eq("status", "approved")
      .neq("user_id", b.ownerId);
    if (!b.isManager) sorgu = sorgu.eq("user_id", userId);
    const { data: uyeler, error } = await sorgu;
    if (error) throw error;
    if (!uyeler || uyeler.length === 0) return [];

    const { data: odemeSatirlari, error: odemeHatasi } = await this.supabase.client
      .from("budget_transactions")
      .select(SECIM)
      .eq("project_id", projectId)
      .eq("type", "payout")
      .in("user_id", uyeler.map((u: any) => u.user_id))
      .order("occurred_at", { ascending: false });
    if (odemeHatasi) throw odemeHatasi;
    const odemeler = (odemeSatirlari ?? []).map(mapTransaction);

    const { data: sahip } = await this.supabase.client.from("users").select("full_name").eq("id", b.ownerId).maybeSingle();

    return uyeler.map((u: any) => {
      const kendi = odemeler.filter((o) => o.userId === u.user_id);
      return {
        projectId,
        memberId: u.id,
        userId: u.user_id,
        fullName: u.users?.full_name ?? undefined,
        ownerId: b.ownerId,
        ownerName: sahip?.full_name ?? undefined,
        ...hizmetOzeti(u.custom_agreed_rate, kendi),
        payments: kendi,
        canEdit: hizmetYetkisi({ isManager: b.isManager, isSelf: u.user_id === userId }).canEdit,
      };
    });
  }

  async anlasmaBelirle(projectId: string, memberUserId: string, tutar: unknown, userId: string): Promise<{ agreedFee: number }> {
    const { b, uye } = await this.yazmaYetkisi(projectId, memberUserId, userId);
    // 0 "anlaşmayı kaldır" demek; requireAmount sıfırı reddettiği için ayrı.
    const agreedFee = Number(tutar) === 0 ? 0 : requireAmount(tutar as number);

    const { error } = await this.supabase.client
      .from("project_members")
      .update({ custom_agreed_rate: agreedFee || null })
      .eq("id", uye.id);
    if (error) throw error;

    const alici = this.karsiTaraf(b, memberUserId, userId);
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
    memberUserId: string,
    data: { amount?: number; occurredAt?: string; description?: string },
    userId: string
  ): Promise<BudgetTransaction> {
    const { b } = await this.yazmaYetkisi(projectId, memberUserId, userId);

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        project_id: projectId,
        // Defter HİZMET ALANIN: para onun kasasından çıktı. Üyeye yansıması
        // Kasa'da okunurken üretilir (bkz. BudgetService.findAllForUser).
        owner_id: b.ownerId,
        created_by: userId,
        user_id: memberUserId,
        type: "payout",
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

    const alici = this.karsiTaraf(b, memberUserId, userId);
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

  /**
   * Kaydı giren değil, KARŞI taraf haberdar edilir: üye girdiyse sahip,
   * sahip girdiyse üye. Onay adımı yok; itiraz eden taraf bu bildirimden
   * kaydı görür (sahip her satırı, üye kendi girdiğini düzeltebilir).
   */
  private karsiTaraf(b: ProjeBaglami, memberUserId: string, userId: string): string | null {
    const alici = userId === memberUserId ? b.ownerId : memberUserId;
    return alici && alici !== userId ? alici : null;
  }
}
