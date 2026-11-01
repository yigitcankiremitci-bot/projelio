import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  odaDuzeniTemizle,
  odaDuzenleyebilir,
  studyoDuzenKaydi,
  studyoOdaDuzenleyebilir,
  type OdaDuzeni,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

export interface OfisDuzeniYaniti {
  odalar: Record<string, OdaDuzeni>;
  /** İsteyenin düzenleyebildiği odalar; sahip için "hepsi". */
  duzenleyebilir: "hepsi" | string[];
}

@Injectable()
export class OfisDuzeniService {
  constructor(private supabase: SupabaseService) {}

  /** Kullanıcının şirketteki düzenleme yetkisi: sahip mi, hangi departmanları yönetiyor. */
  private async yetki(organizationId: string, userId: string): Promise<{ sahip: boolean; yonettigiDepartmanlar: string[] }> {
    const { data: org } = await this.supabase.client.from("organizations").select("owner_id").eq("id", organizationId).maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    if (org.owner_id === userId) return { sahip: true, yonettigiDepartmanlar: [] };
    const { data: departmanlar } = await this.supabase.client.from("departments").select("id").eq("organization_id", organizationId);
    const ids = (departmanlar ?? []).map((d: { id: string }) => d.id);
    if (!ids.length) return { sahip: false, yonettigiDepartmanlar: [] };
    const { data: yonetim } = await this.supabase.client
      .from("department_members")
      .select("department_id")
      .in("department_id", ids)
      .eq("user_id", userId)
      .eq("role", "manager")
      .eq("status", "approved");
    return { sahip: false, yonettigiDepartmanlar: (yonetim ?? []).map((r: { department_id: string }) => r.department_id) };
  }

  async getir(organizationId: string, userId: string): Promise<OfisDuzeniYaniti> {
    const [{ data, error }, y] = await Promise.all([
      this.supabase.client.from("ofis_oda_duzenleri").select("oda_id, duzen").eq("organization_id", organizationId),
      this.yetki(organizationId, userId),
    ]);
    if (error) throw error;
    const odalar: Record<string, OdaDuzeni> = {};
    for (const r of data ?? []) odalar[r.oda_id] = odaDuzeniTemizle(r.duzen);
    return { odalar, duzenleyebilir: y.sahip ? "hepsi" : y.yonettigiDepartmanlar };
  }

  private async yetkiyiDogrula(organizationId: string, odaId: string, userId: string): Promise<void> {
    if (!odaDuzenleyebilir(odaId, await this.yetki(organizationId, userId))) {
      throw new ForbiddenException("Bu odanın düzenini yalnızca şirket sahibi ya da departman yöneticisi değiştirebilir");
    }
  }

  async kaydet(organizationId: string, odaId: string, ham: unknown, userId: string): Promise<OdaDuzeni> {
    await this.yetkiyiDogrula(organizationId, odaId, userId);
    const duzen = odaDuzeniTemizle(ham);
    const { error } = await this.supabase.client.from("ofis_oda_duzenleri").upsert(
      { organization_id: organizationId, oda_id: odaId, duzen, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "organization_id,oda_id" }
    );
    if (error) throw error;
    return duzen;
  }

  async sifirla(organizationId: string, odaId: string, userId: string): Promise<void> {
    await this.yetkiyiDogrula(organizationId, odaId, userId);
    const { error } = await this.supabase.client.from("ofis_oda_duzenleri").delete().eq("organization_id", organizationId).eq("oda_id", odaId);
    if (error) throw error;
  }

  // ------------------------------------------------------------ Stüdyom (migration 175)

  /**
   * Kullanıcının stüdyosundaki serbest işler: sahibi olduğu ve onaylı ekibinde
   * olduğu, şirkete/holdinge bağlı olmayan, arşivlenmemiş işler (web
   * lib/studyoOfisi.ts serbestIsMi ile aynı kural).
   */
  private async studyoIsleri(userId: string): Promise<{ sahibi: string[]; hepsi: string[] }> {
    const [{ data: sahip, error: e1 }, { data: uyelik, error: e2 }] = await Promise.all([
      this.supabase.client.from("jobs").select("id").eq("owner_id", userId).is("organization_id", null).is("group_id", null).is("archived_at", null),
      this.supabase.client.from("job_members").select("job_id").eq("user_id", userId).eq("status", "approved"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const sahibi = (sahip ?? []).map((r: { id: string }) => r.id);
    const uyeIds = (uyelik ?? []).map((r: { job_id: string }) => r.job_id).filter((id: string) => !sahibi.includes(id));
    let uye: string[] = [];
    if (uyeIds.length) {
      const { data, error } = await this.supabase.client
        .from("jobs")
        .select("id")
        .in("id", uyeIds)
        .is("organization_id", null)
        .is("group_id", null)
        .is("archived_at", null);
      if (error) throw error;
      uye = (data ?? []).map((r: { id: string }) => r.id);
    }
    return { sahibi, hepsi: [...sahibi, ...uye] };
  }

  async studyoGetir(userId: string): Promise<OfisDuzeniYaniti> {
    const isler = await this.studyoIsleri(userId);
    const sorgular = [this.supabase.client.from("studyo_oda_duzenleri").select("oda_id, duzen").eq("user_id", userId)];
    if (isler.hepsi.length) sorgular.push(this.supabase.client.from("studyo_oda_duzenleri").select("oda_id, duzen").in("job_id", isler.hepsi));
    const odalar: Record<string, OdaDuzeni> = {};
    for (const { data, error } of await Promise.all(sorgular)) {
      if (error) throw error;
      for (const r of data ?? []) odalar[r.oda_id] = odaDuzeniTemizle(r.duzen);
    }
    return { odalar, duzenleyebilir: [...isler.sahibi, "ortak", "toplanti"] };
  }

  private async studyoYetkisiniDogrula(odaId: string, userId: string): Promise<void> {
    // Kişisel alanlar için sorgu gerekmez; iş odası için işin sahibi olmalı.
    if (studyoOdaDuzenleyebilir(odaId, [])) return;
    const { sahibi } = await this.studyoIsleri(userId);
    if (!studyoOdaDuzenleyebilir(odaId, sahibi)) {
      throw new ForbiddenException("Bu işin odasını yalnızca işin sahibi düzenleyebilir");
    }
  }

  async studyoKaydet(odaId: string, ham: unknown, userId: string): Promise<OdaDuzeni> {
    await this.studyoYetkisiniDogrula(odaId, userId);
    const duzen = odaDuzeniTemizle(ham);
    const { error } = await this.supabase.client
      .from("studyo_oda_duzenleri")
      .upsert(
        { ...studyoDuzenKaydi(odaId, userId), oda_id: odaId, duzen, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "anahtar" }
      );
    if (error) throw error;
    return duzen;
  }

  async studyoSifirla(odaId: string, userId: string): Promise<void> {
    await this.studyoYetkisiniDogrula(odaId, userId);
    const { error } = await this.supabase.client.from("studyo_oda_duzenleri").delete().eq("anahtar", studyoDuzenKaydi(odaId, userId).anahtar);
    if (error) throw error;
  }
}
