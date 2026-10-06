import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { BultenAbonesi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { bultenGirdisiniCoz, type BultenGirdisi } from "./bulten";

const ALANLAR = "id, eposta, dil, kaynak, izin_at, iptal_at, created_at";

function satiriCevir(r: any): BultenAbonesi {
  return {
    id: r.id,
    eposta: r.eposta,
    dil: r.dil,
    kaynak: r.kaynak ?? null,
    izinAt: r.izin_at,
    iptalAt: r.iptal_at ?? null,
    createdAt: r.created_at,
  };
}

/** Tanıtım sitesinin bülten formu + Admin > Bülten (bkz. migration 149). */
@Injectable()
export class BultenService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Yanıt adresin zaten kayıtlı olup olmadığını SÖYLEMEZ: söyleseydi form,
   * bir adresin listede olup olmadığını sorgulamanın yolu olurdu.
   */
  async aboneOl(girdi: BultenGirdisi): Promise<{ ok: true }> {
    const k = bultenGirdisiniCoz(girdi ?? {});
    if (k.tur === "bot") return { ok: true };
    if (k.tur === "hata") throw new BadRequestException(k.mesaj);

    // Var olan satırda yalnızca rıza yenilenir ve iptal kalkar; ilk kayıt
    // tarihi (created_at) korunur.
    const { error } = await this.supabase.client.from("bulten_aboneleri").upsert(
      { eposta: k.eposta, dil: k.dil, kaynak: k.kaynak, izin_at: new Date().toISOString(), iptal_at: null },
      { onConflict: "eposta" }
    );
    if (error) throw new BadRequestException("Kayıt şu an alınamadı, biraz sonra tekrar deneyin.");
    return { ok: true };
  }

  async listele(): Promise<BultenAbonesi[]> {
    const { data, error } = await this.supabase.client
      .from("bulten_aboneleri")
      .select(ALANLAR)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw new BadRequestException("Bülten listesi okunamadı.");
    return (data ?? []).map(satiriCevir);
  }

  /**
   * Silmek yerine iptal: "beni listeden çıkarın" diyen birinin rızasını
   * geri aldığı da bir kayıttır. Gerçekten silmek isteyen (KVKK silme talebi)
   * `sil` ucunu kullanır.
   */
  async iptalEt(id: string): Promise<BultenAbonesi> {
    const { data, error } = await this.supabase.client
      .from("bulten_aboneleri")
      .update({ iptal_at: new Date().toISOString() })
      .eq("id", id)
      .select(ALANLAR)
      .maybeSingle();
    if (error) throw new BadRequestException("Abonelik iptal edilemedi.");
    if (!data) throw new NotFoundException("Abone bulunamadı.");
    return satiriCevir(data);
  }

  async sil(id: string): Promise<{ ok: true }> {
    const { error } = await this.supabase.client.from("bulten_aboneleri").delete().eq("id", id);
    if (error) throw new BadRequestException("Abone silinemedi.");
    return { ok: true };
  }
}
