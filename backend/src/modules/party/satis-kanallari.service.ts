import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ODEME_YONTEMLERI, type OdemeYontemi, type SatisKanali, type SatisKanaliTuru } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireOneOf } from "../../common/validation/input";
import { PartyService, type PartyScope } from "./party.service";

/**
 * Satış kanalları (migration 168): siparişin geldiği yer.
 *
 * Kanal müşteri defterinin bir ayarıdır: listeyi defteri okuyabilen herkes
 * görür (sipariş formundaki seçici), eklemek / değiştirmek yöneticinin işi
 * (canManageTeam) — kanalın sorumlusunu değiştirmek, o kanalın açık
 * alacağını başka bir çalışanın raporuna taşımaktır.
 *
 * SİLME YOK, pasife alma var: müşterisiz sipariş kanalına bağlı yaşar
 * (musteri_siparis_sahip_chk); kanal silinseydi siparişi sahipsiz kalırdı.
 */

export const SATIS_KANALI_TURLERI: SatisKanaliTuru[] = ["pazaryeri", "web", "eczane", "doktor", "bayi", "diger"];

export interface SatisKanaliGirdisi {
  ad?: string;
  tur?: SatisKanaliTuru;
  varsayilanVadeGun?: number | string;
  varsayilanOdemeYontemi?: OdemeYontemi;
  sorumluUserId?: string | null;
  aktif?: boolean;
  sira?: number;
}

function mapKanal(row: any, adlar: Map<string, string>): SatisKanali {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    ad: row.ad,
    tur: row.tur,
    varsayilanVadeGun: row.varsayilan_vade_gun,
    varsayilanOdemeYontemi: row.varsayilan_odeme_yontemi,
    sorumluUserId: row.sorumlu_user_id ?? undefined,
    sorumluAdi: row.sorumlu_user_id ? adlar.get(row.sorumlu_user_id) : undefined,
    aktif: row.aktif,
    sira: row.sira,
  };
}

@Injectable()
export class SatisKanallariService {
  constructor(
    private supabase: SupabaseService,
    private partyService: PartyService
  ) {}

  async liste(scope: PartyScope, userId: string): Promise<SatisKanali[]> {
    const a = await this.partyService.access(scope, userId);
    if (!a.canRead) throw new ForbiddenException("Bu kaydı görme yetkin yok");
    return this.kapsamdakiler(scope);
  }

  /** Yetki sormadan — çağıran (içe aktarma, sipariş servisi) yetkiyi zaten doğruladı. */
  async kapsamdakiler(scope: PartyScope): Promise<SatisKanali[]> {
    let q = this.supabase.client.from("satis_kanallari").select("*");
    q = scope.jobId ? q.eq("job_id", scope.jobId) : q.eq("organization_id", scope.organizationId!);
    const { data, error } = await q.order("sira", { ascending: true }).order("ad", { ascending: true });
    if (error) throw error;
    return this.eslestir(data ?? []);
  }

  async bul(id: string): Promise<SatisKanali> {
    const { data, error } = await this.supabase.client.from("satis_kanallari").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Satış kanalı bulunamadı");
    return (await this.eslestir([data]))[0];
  }

  scopeOf(k: SatisKanali): PartyScope {
    return { organizationId: k.organizationId, jobId: k.jobId };
  }

  async olustur(scope: PartyScope, g: SatisKanaliGirdisi, userId: string): Promise<SatisKanali> {
    await this.yoneticiIste(scope, userId);
    const alanlar = await this.alanlar(scope, g, true);
    const { data, error } = await this.supabase.client
      .from("satis_kanallari")
      .insert({
        ...alanlar,
        organization_id: scope.jobId ? null : scope.organizationId,
        job_id: scope.jobId ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu adda bir satış kanalı zaten var");
      throw error;
    }
    return (await this.eslestir([data]))[0];
  }

  async guncelle(id: string, g: SatisKanaliGirdisi, userId: string): Promise<SatisKanali> {
    const mevcut = await this.bul(id);
    const scope = this.scopeOf(mevcut);
    await this.yoneticiIste(scope, userId);
    const alanlar = await this.alanlar(scope, g, false);
    const { data, error } = await this.supabase.client
      .from("satis_kanallari")
      .update({ ...alanlar, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu adda bir satış kanalı zaten var");
      throw error;
    }
    return (await this.eslestir([data]))[0];
  }

  private async yoneticiIste(scope: PartyScope, userId: string): Promise<void> {
    const a = await this.partyService.access(scope, userId);
    if (!a.canManageTeam) throw new ForbiddenException("Satış kanallarını yalnızca yönetici düzenleyebilir");
  }

  private async alanlar(scope: PartyScope, g: SatisKanaliGirdisi, tam: boolean): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    if (tam || g.ad !== undefined) {
      const ad = typeof g.ad === "string" ? g.ad.trim() : "";
      if (!ad) throw new BadRequestException("Kanal adı gerekli");
      if (ad.length > 80) throw new BadRequestException("Kanal adı en çok 80 karakter olabilir");
      out.ad = ad;
    }
    if (tam || g.tur !== undefined) out.tur = g.tur ? requireOneOf(g.tur, SATIS_KANALI_TURLERI, "Kanal türü") : "diger";
    if (tam || g.varsayilanVadeGun !== undefined) {
      const gun = g.varsayilanVadeGun === undefined || g.varsayilanVadeGun === "" ? 0 : Number(g.varsayilanVadeGun);
      if (!Number.isInteger(gun) || gun < 0 || gun > 3650) {
        throw new BadRequestException("Vade 0 ile 3650 gün arasında bir tam sayı olmalı");
      }
      out.varsayilan_vade_gun = gun;
    }
    if (tam || g.varsayilanOdemeYontemi !== undefined) {
      out.varsayilan_odeme_yontemi = g.varsayilanOdemeYontemi
        ? requireOneOf(g.varsayilanOdemeYontemi, ODEME_YONTEMLERI, "Ödeme yöntemi")
        : "havale";
    }
    if (g.sorumluUserId !== undefined) {
      // Sorumlu müşteri defterini okuyabilen biri olmalı: yetkisiz birine
      // atanan kanalın siparişleri raporda görünür ama o kişi açamazdı.
      if (g.sorumluUserId) {
        const a = await this.partyService.access(scope, g.sorumluUserId);
        if (!a.canRead) throw new BadRequestException("Sorumlu, Müşteriler modülüne erişimi olan biri olmalı");
      }
      out.sorumlu_user_id = g.sorumluUserId || null;
    }
    if (g.aktif !== undefined) out.aktif = !!g.aktif;
    if (g.sira !== undefined && Number.isInteger(Number(g.sira))) out.sira = Number(g.sira);
    return out;
  }

  private async eslestir(satirlar: any[]): Promise<SatisKanali[]> {
    const ids = Array.from(new Set(satirlar.map((r) => r.sorumlu_user_id).filter(Boolean)));
    const adlar = new Map<string, string>();
    if (ids.length > 0) {
      const { data } = await this.supabase.client.from("users").select("id, full_name, email").in("id", ids);
      for (const u of data ?? []) adlar.set(u.id, u.full_name || u.email);
    }
    return satirlar.map((r) => mapKanal(r, adlar));
  }
}
