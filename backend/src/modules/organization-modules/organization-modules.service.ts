import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ModulHakkiDurumu, OrganizationModule } from "@projelio/shared";
import { MODUL_HAKKI, modulEklenebilirMi, modulHakkiDurumu } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { abonelikDonemiGecerli, HAK_VEREN_DURUMLAR } from "../billing/abonelik-hakki";
import { requireUuid } from "../../common/validation/input";

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

  /**
   * Şirketin paketi ve modül hakkı (bkz. shared modulHakki.ts). Paket: şirket
   * adına alınmış abonelik ya da sahibin kendi aboneliği — hangisi daha çok
   * hak veriyorsa. Hiçbiri yoksa ücretsiz.
   */
  async modulHakki(organizationId: string): Promise<ModulHakkiDurumu> {
    return (await this.hakVeAcikModuller(organizationId)).durum;
  }

  private async hakVeAcikModuller(organizationId: string): Promise<{ durum: ModulHakkiDurumu; acik: string[] }> {
    // Kimlik aşağıda filtre METNİNE gömülüyor; doğrulanmazsa virgülle yeni
    // koşul eklenebilirdi (bkz. requireUuid).
    requireUuid(organizationId, "Organizasyon kimliği");
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");

    const [{ data: abonelikler, error }, acik] = await Promise.all([
      this.supabase.client
        .from("subscriptions")
        .select("plan_key, status, source, current_period_end")
        .or(`and(scope.eq.organization,organization_id.eq.${organizationId}),and(scope.eq.user,user_id.eq.${org.owner_id})`)
        .in("status", HAK_VEREN_DURUMLAR),
      this.findByOrganization(organizationId),
    ]);
    if (error) throw error;

    // null (sınırsız) her sayıdan büyük.
    const buyukluk = (k: string) => (MODUL_HAKKI[k] === null ? Infinity : MODUL_HAKKI[k] ?? 0);
    let planKey = "free";
    for (const a of abonelikler ?? []) {
      const gecerli = abonelikDonemiGecerli({
        status: a.status,
        source: a.source,
        currentPeriodEnd: a.current_period_end,
      });
      if (gecerli && a.plan_key in MODUL_HAKKI && buyukluk(a.plan_key) > buyukluk(planKey)) planKey = a.plan_key;
    }
    const anahtarlar = acik.map((m) => m.moduleKey);
    return { durum: modulHakkiDurumu(planKey, anahtarlar), acik: anahtarlar };
  }

  /** Modül hakkı yetmiyorsa açılışı reddeder. */
  private async assertModulHakki(organizationId: string, yeniModuller: string[]): Promise<void> {
    const { durum, acik } = await this.hakVeAcikModuller(organizationId);
    const karar = modulEklenebilirMi(durum, acik, yeniModuller);
    if ("sebep" in karar) throw new BadRequestException(karar.sebep);
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
    await this.assertModulHakki(organizationId, [moduleKey]);
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
    // Hepsi ya da hiçbiri: yarısını açıp yarısını reddetmek, kullanıcının
    // hangisinin açıldığını anlamasını zorlaştırırdı.
    await this.assertModulHakki(organizationId, moduleKeys);
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
