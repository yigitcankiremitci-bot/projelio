import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { OrganizationModule } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapOrganizationModule(row: any): OrganizationModule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    moduleKey: row.module_key,
    createdAt: row.created_at,
  };
}

// Kurulum sihirbazında (ve sonrasında organizasyon ayarlarından) organizasyonun
// hangi modülleri etkinleştirdiğini tutar (module_catalog referansıyla).
@Injectable()
export class OrganizationModulesService {
  constructor(private supabase: SupabaseService) {}

  private async assertOwner(organizationId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!data) throw new NotFoundException("Organizasyon bulunamadı");
    if (data.owner_id !== userId) throw new ForbiddenException("Bu organizasyonu yalnızca sahibi düzenleyebilir");
  }

  async findByOrganization(organizationId: string): Promise<OrganizationModule[]> {
    const { data, error } = await this.supabase.client
      .from("organization_modules")
      .select("*")
      .eq("organization_id", organizationId);
    if (error) throw error;
    return (data ?? []).map(mapOrganizationModule);
  }

  async enable(organizationId: string, moduleKey: string, requestingUserId?: string): Promise<OrganizationModule> {
    await this.assertOwner(organizationId, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("organization_modules")
      .upsert(
        { organization_id: organizationId, module_key: moduleKey, enabled_by: requestingUserId ?? null },
        { onConflict: "organization_id,module_key", ignoreDuplicates: true }
      )
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (row) return mapOrganizationModule(row);
    // ignoreDuplicates true olduğunda çakışma durumunda satır dönmez — mevcut kaydı getir.
    const { data: existing, error: existingError } = await this.supabase.client
      .from("organization_modules")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("module_key", moduleKey)
      .single();
    if (existingError) throw existingError;
    return mapOrganizationModule(existing);
  }

  // Sihirbazda tek seferde birden çok modül seçilir; hepsini idempotent şekilde ekler.
  async enableMany(organizationId: string, moduleKeys: string[], requestingUserId?: string): Promise<OrganizationModule[]> {
    await this.assertOwner(organizationId, requestingUserId);
    if (!moduleKeys?.length) return [];
    const { data, error } = await this.supabase.client
      .from("organization_modules")
      .upsert(
        moduleKeys.map((moduleKey) => ({ organization_id: organizationId, module_key: moduleKey, enabled_by: requestingUserId ?? null })),
        { onConflict: "organization_id,module_key", ignoreDuplicates: true }
      )
      .select("*");
    if (error) throw error;
    return this.findByOrganization(organizationId);
  }

  async disable(organizationId: string, moduleKey: string, requestingUserId?: string): Promise<void> {
    await this.assertOwner(organizationId, requestingUserId);
    const { error } = await this.supabase.client
      .from("organization_modules")
      .delete()
      .eq("organization_id", organizationId)
      .eq("module_key", moduleKey);
    if (error) throw error;
  }
}
