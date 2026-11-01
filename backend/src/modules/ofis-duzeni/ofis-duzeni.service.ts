import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { odaDuzeniTemizle, odaDuzenleyebilir, type OdaDuzeni } from "@projelio/shared";
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
}
