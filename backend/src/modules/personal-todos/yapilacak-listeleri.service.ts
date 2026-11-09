import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PersonalBoardSource, YapilacakListesi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

/** Kişi başına liste tavanı: sekme şeridi okunur kalsın. */
const LISTE_TAVANI = 30;

/**
 * Yapılacaklar listeleri (migration 185). Kişisel görevlerle aynı izolasyon
 * kuralı (bkz. PersonalTodosService başlığı): her sorgu oturumdaki kişinin
 * kimliğiyle; liste kimliği gövdeden gelse bile önce kişiye ait mi bakılır.
 *
 * Migration uygulanmamışsa okuma boş liste döner, pano çalışmaya devam eder.
 */
@Injectable()
export class YapilacakListeleriService {
  constructor(private supabase: SupabaseService) {}

  async listele(userId: string): Promise<YapilacakListesi[]> {
    const { data, error } = await this.supabase.client
      .from("yapilacak_listeleri")
      .select("id, ad, sira, created_at")
      .eq("user_id", userId)
      .order("sira", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map((r: any) => ({ id: r.id, ad: r.ad, sira: r.sira, createdAt: r.created_at }));
  }

  /** Panodaki kartların hangi listelerde olduğu: `${kaynak}:${ogeId}` → liste kimlikleri. */
  async uyelikler(userId: string): Promise<Map<string, string[]>> {
    const harita = new Map<string, string[]>();
    const { data, error } = await this.supabase.client
      .from("yapilacak_liste_uyeleri")
      .select("liste_id, kaynak, oge_id, yapilacak_listeleri!inner(user_id)")
      .eq("yapilacak_listeleri.user_id", userId);
    if (error) return harita;
    for (const r of data ?? []) {
      const anahtar = `${r.kaynak}:${r.oge_id}`;
      harita.set(anahtar, [...(harita.get(anahtar) ?? []), r.liste_id]);
    }
    return harita;
  }

  async olustur(userId: string, ad: unknown): Promise<YapilacakListesi> {
    const temiz = this.adDogrula(ad);
    const mevcut = await this.listele(userId);
    if (mevcut.length >= LISTE_TAVANI) throw new BadRequestException("En fazla 30 liste açılabilir");
    const { data, error } = await this.supabase.client
      .from("yapilacak_listeleri")
      .insert({ user_id: userId, ad: temiz, sira: mevcut.length })
      .select("id, ad, sira, created_at")
      .single();
    if (error) throw error;
    return { id: data.id, ad: data.ad, sira: data.sira, createdAt: data.created_at };
  }

  async adlandir(userId: string, listeId: string, ad: unknown): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("yapilacak_listeleri")
      .update({ ad: this.adDogrula(ad) })
      .eq("id", listeId)
      .eq("user_id", userId)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new NotFoundException("Liste bulunamadı");
  }

  /** Listeyi siler; içindeki kartlar silinmez, yalnızca listeden çıkar. */
  async sil(userId: string, listeId: string): Promise<void> {
    const { error } = await this.supabase.client.from("yapilacak_listeleri").delete().eq("id", listeId).eq("user_id", userId);
    if (error) throw error;
  }

  async ekle(userId: string, listeId: string, ogeler: { source?: string; itemId?: string }[]): Promise<{ eklenen: number }> {
    await this.kendiListesi(userId, listeId);
    const gecerli = await this.panodakiler(userId, ogeler);
    if (!gecerli.length) return { eklenen: 0 };
    const { error } = await this.supabase.client
      .from("yapilacak_liste_uyeleri")
      .upsert(gecerli.map((o) => ({ liste_id: listeId, kaynak: o.kaynak, oge_id: o.ogeId })), { onConflict: "liste_id,kaynak,oge_id", ignoreDuplicates: true });
    if (error) throw error;
    return { eklenen: gecerli.length };
  }

  async cikar(userId: string, listeId: string, ogeler: { source?: string; itemId?: string }[]): Promise<void> {
    await this.kendiListesi(userId, listeId);
    for (const o of ogeler) {
      if (!this.kaynakMi(o.source) || typeof o.itemId !== "string") continue;
      const { error } = await this.supabase.client.from("yapilacak_liste_uyeleri").delete().eq("liste_id", listeId).eq("kaynak", o.source).eq("oge_id", o.itemId);
      if (error) throw error;
    }
  }

  private adDogrula(ad: unknown): string {
    const temiz = typeof ad === "string" ? ad.trim() : "";
    if (!temiz) throw new BadRequestException("Liste adı boş olamaz");
    if (temiz.length > 60) throw new BadRequestException("Liste adı en fazla 60 karakter olabilir");
    return temiz;
  }

  private kaynakMi(deger: unknown): deger is PersonalBoardSource {
    return deger === "personal" || deger === "assigned";
  }

  private async kendiListesi(userId: string, listeId: string) {
    const { data, error } = await this.supabase.client.from("yapilacak_listeleri").select("id").eq("id", listeId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Liste bulunamadı");
  }

  /**
   * Yalnızca kişinin KENDİ panosundaki kartlar listeye girer: başkasının
   * kişisel görevinin kimliğini bilen biri onu kendi listesine ekleyip
   * başlığını okuyamasın (pano yalnızca kendi kartlarını döner ama tablo
   * kimliği saklar).
   */
  private async panodakiler(userId: string, ogeler: { source?: string; itemId?: string }[]) {
    const istenen = ogeler.filter((o) => this.kaynakMi(o.source) && typeof o.itemId === "string").slice(0, 200);
    if (!istenen.length) return [];
    const { data, error } = await this.supabase.client
      .from("v_personal_board")
      .select("source, item_id")
      .eq("board_user_id", userId)
      .in("item_id", istenen.map((o) => o.itemId!));
    if (error) throw error;
    const var_ = new Set((data ?? []).map((r: any) => `${r.source}:${r.item_id}`));
    return istenen.filter((o) => var_.has(`${o.source}:${o.itemId}`)).map((o) => ({ kaynak: o.source as PersonalBoardSource, ogeId: o.itemId! }));
  }
}
