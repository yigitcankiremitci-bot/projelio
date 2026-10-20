import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { acilisSekmesiCoz, isPartyModulKey, modulSekmeleri } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { PartyService, type PartyScope } from "./party.service";

/**
 * Modülün kişisel açılış sekmesi (migration 169).
 *
 * Görünüm tercihidir, yetki değil: modülü okuyabilen herkes KENDİ tercihini
 * kaydeder. Tercih yoksa ya da kaldırılmış bir sekmeyi gösteriyorsa modülün
 * ilk sekmesi döner (shared modulSekmeleri.ts) — istemci aynı kuralı uygular.
 */
@Injectable()
export class ModulAcilisService {
  constructor(
    private supabase: SupabaseService,
    private partyService: PartyService
  ) {}

  async oku(scope: PartyScope, modul: string, userId: string): Promise<{ sekme?: string; kayitli: boolean }> {
    await this.okumaIste(scope, modul, userId);
    const { data, error } = await this.supabase.client
      .from("modul_acilis_sekmesi")
      .select("sekme")
      .eq("user_id", userId)
      .eq("kapsam_id", kapsamId(scope))
      .eq("modul_key", modul)
      .maybeSingle();
    // Tablo okunamazsa (ör. migration uygulanmadan) modül varsayılanla açılır.
    if (error) return { sekme: acilisSekmesiCoz(modul, undefined), kayitli: false };
    const sekme = acilisSekmesiCoz(modul, data?.sekme);
    return { sekme, kayitli: !!data && data.sekme === sekme };
  }

  async kaydet(scope: PartyScope, modul: string, sekme: unknown, userId: string): Promise<{ sekme: string; kayitli: true }> {
    await this.okumaIste(scope, modul, userId);
    if (typeof sekme !== "string" || !modulSekmeleri(modul).includes(sekme)) {
      throw new BadRequestException("Bu modülde böyle bir sekme yok");
    }
    const { error } = await this.supabase.client.from("modul_acilis_sekmesi").upsert(
      { user_id: userId, kapsam_id: kapsamId(scope), modul_key: modul, sekme, updated_at: new Date().toISOString() },
      { onConflict: "user_id,kapsam_id,modul_key" }
    );
    if (error) throw error;
    return { sekme, kayitli: true };
  }

  private async okumaIste(scope: PartyScope, modul: string, userId: string): Promise<void> {
    if (!isPartyModulKey(modul) || modulSekmeleri(modul).length === 0) {
      throw new BadRequestException("Bu modülün sekmesi yok");
    }
    const a = await this.partyService.access(scope, userId, modul);
    if (!a.canRead) throw new ForbiddenException("Bu kaydı görme yetkin yok");
  }
}

function kapsamId(scope: PartyScope): string {
  return scope.jobId ?? scope.organizationId!;
}
