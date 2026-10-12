import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { BAGLANTI_MODUL_KEY, type BaglantiListeKaydi, type BaglantiListesi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { PartyService, type PartyScope } from "./party.service";

/**
 * Bağlantı listeleri (migration 163) — Bağlantı ve İlişkiler'deki kartların
 * oynatma listesi gibi gruplanması: "İTS 2026 Fuarı", "Firdevs'in listesi".
 *
 * Liste bir ETİKET: kartı taşımaz, kopyalamaz; bir kart birden çok listede
 * olabilir, liste silinince kartlar yerinde kalır. Yetki Bağlantılar
 * modülünün yetkisi: okuyan listeleri görür, yazan liste açar ve kart ekler.
 * Bir listeye yalnızca aynı kapsamdaki ve Bağlantılar defterindeki kartlar
 * girebilir — başka şirketin kartının kimliği verilse bile.
 */
@Injectable()
export class BaglantiListeleriService {
  constructor(
    private supabase: SupabaseService,
    private party: PartyService
  ) {}

  private kapsamSutunu(scope: PartyScope): ["organization_id" | "job_id", string] {
    return scope.jobId ? ["job_id", scope.jobId] : ["organization_id", scope.organizationId!];
  }

  private async yetki(scope: PartyScope, userId: string, yaz: boolean): Promise<void> {
    const a = await this.party.access(scope, userId, BAGLANTI_MODUL_KEY);
    if (!(yaz ? a.canWrite : a.canRead)) {
      throw new ForbiddenException(yaz ? "Bağlantı listelerini değiştirme yetkin yok" : "Bağlantı ve İlişkiler'i görme yetkin yok");
    }
  }

  /** Listenin kendisi + kapsamı; yoksa 404. */
  private async listeyiAl(listeId: string): Promise<{ id: string; ad: string; scope: PartyScope }> {
    const { data, error } = await this.supabase.client
      .from("baglanti_listeleri")
      .select("id, ad, organization_id, job_id")
      .eq("id", listeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Liste bulunamadı");
    return {
      id: data.id,
      ad: data.ad,
      scope: data.job_id ? { jobId: data.job_id } : { organizationId: data.organization_id },
    };
  }

  private adDogrula(ad: unknown): string {
    const temiz = typeof ad === "string" ? ad.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    if (!temiz) throw new BadRequestException("Liste adı gerekli");
    return temiz;
  }

  private cakisma(error: any): never {
    if (error?.code === "23505") throw new BadRequestException("Bu adla bir liste zaten var");
    throw error;
  }

  /** Kapsamdaki listeler, kart sayılarıyla. Sayım arşivdeki kartları saymaz. */
  async listele(scope: PartyScope, userId: string): Promise<BaglantiListeKaydi[]> {
    await this.yetki(scope, userId, false);
    return this.listelerVeSayilar(scope);
  }

  private async listelerVeSayilar(scope: PartyScope): Promise<BaglantiListeKaydi[]> {
    const [sutun, deger] = this.kapsamSutunu(scope);
    const { data, error } = await this.supabase.client
      .from("baglanti_listeleri")
      .select("id, ad, created_at, olusturan:users!baglanti_listeleri_olusturan_fkey(full_name), baglanti_liste_uyeleri(party(archived_at))")
      .eq(sutun, deger)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as any[]).map((l) => ({
      id: l.id,
      ad: l.ad,
      sayi: ((l.baglanti_liste_uyeleri ?? []) as any[]).filter((u) => !u.party?.archived_at).length,
      olusturanAd: l.olusturan?.full_name ?? undefined,
      createdAt: l.created_at,
    }));
  }

  /**
   * Bağlantılar ekranının yanıtına listeleri ve her kartın liste üyeliklerini
   * ekler. Listeler tablosu okunamazsa (ör. migration uygulanmadan) ekran
   * yine açılır — listeler bir kolaylık.
   */
  async yanitaEkle(yanit: BaglantiListesi, scope: PartyScope): Promise<BaglantiListesi> {
    try {
      const listeler = await this.listelerVeSayilar(scope);
      if (!listeler.length) return { ...yanit, listeler };
      const { data, error } = await this.supabase.client
        .from("baglanti_liste_uyeleri")
        .select("liste_id, party_id")
        .in(
          "liste_id",
          listeler.map((l) => l.id)
        );
      if (error) throw error;
      const uyelik = new Map<string, string[]>();
      for (const u of (data ?? []) as any[]) uyelik.set(u.party_id, [...(uyelik.get(u.party_id) ?? []), u.liste_id]);
      for (const p of yanit.baglantilar) p.listeIdleri = uyelik.get(p.id) ?? [];
      return { ...yanit, listeler };
    } catch {
      return yanit;
    }
  }

  async olustur(scope: PartyScope, ad: unknown, userId: string, partyIdler: unknown = []): Promise<BaglantiListeKaydi> {
    await this.yetki(scope, userId, true);
    const temiz = this.adDogrula(ad);
    const [sutun, deger] = this.kapsamSutunu(scope);
    const { data, error } = await this.supabase.client
      .from("baglanti_listeleri")
      .insert({ [sutun]: deger, ad: temiz, olusturan: userId })
      .select("id, ad, created_at")
      .single();
    if (error) this.cakisma(error);
    const eklenen = await this.uyeEkleKapsamda(data.id, scope, partyIdler, userId);
    return { id: data.id, ad: data.ad, sayi: eklenen, createdAt: data.created_at };
  }

  /**
   * Excel içe aktarma için: verilen adda liste varsa onu, yoksa yenisini
   * döndürür (iki kez yüklenen dosya ikinci bir "Firdevs" listesi açmasın).
   */
  async adlaBulVeyaAc(scope: PartyScope, ad: unknown, userId: string): Promise<{ id: string; ad: string }> {
    await this.yetki(scope, userId, true);
    const temiz = this.adDogrula(ad);
    const [sutun, deger] = this.kapsamSutunu(scope);
    const { data } = await this.supabase.client
      .from("baglanti_listeleri")
      .select("id, ad")
      .eq(sutun, deger)
      .ilike("ad", temiz.replace(/[%_\\]/g, (k) => `\\${k}`));
    const mevcut = ((data ?? []) as any[]).find((l) => l.ad.trim().toLocaleLowerCase("tr") === temiz.toLocaleLowerCase("tr"));
    if (mevcut) return { id: mevcut.id, ad: mevcut.ad };
    const yeni = await this.olustur(scope, temiz, userId);
    return { id: yeni.id, ad: yeni.ad };
  }

  /** İçe aktarmada hedef liste kimlikle verildiyse kapsamı ve yetkiyi doğrular. */
  async kapsamdakiListe(scope: PartyScope, listeId: string, userId: string): Promise<{ id: string; ad: string }> {
    const l = await this.listeyiAl(listeId);
    const [sutun, deger] = this.kapsamSutunu(scope);
    const [lSutun, lDeger] = this.kapsamSutunu(l.scope);
    if (sutun !== lSutun || deger !== lDeger) throw new NotFoundException("Liste bulunamadı");
    await this.yetki(scope, userId, true);
    return { id: l.id, ad: l.ad };
  }

  async yenidenAdlandir(listeId: string, ad: unknown, userId: string): Promise<void> {
    const l = await this.listeyiAl(listeId);
    await this.yetki(l.scope, userId, true);
    const { error } = await this.supabase.client
      .from("baglanti_listeleri")
      .update({ ad: this.adDogrula(ad), updated_at: new Date().toISOString() })
      .eq("id", listeId);
    if (error) this.cakisma(error);
  }

  /** Listeyi siler; kartlar Bağlantılar'da kalır (yalnızca üyelikler gider). */
  async sil(listeId: string, userId: string): Promise<void> {
    const l = await this.listeyiAl(listeId);
    await this.yetki(l.scope, userId, true);
    const { error } = await this.supabase.client.from("baglanti_listeleri").delete().eq("id", listeId);
    if (error) throw error;
  }

  async uyeEkle(listeId: string, partyIdler: unknown, userId: string): Promise<{ eklenen: number }> {
    const l = await this.listeyiAl(listeId);
    await this.yetki(l.scope, userId, true);
    return { eklenen: await this.uyeEkleKapsamda(listeId, l.scope, partyIdler, userId) };
  }

  /**
   * Kartları listeye ekler; zaten listede olanlar sessizce atlanır. Yetki
   * ÇAĞIRANDA bakıldı — burada yalnızca kartların kapsamda ve Bağlantılar
   * defterinde olduğu süzülür. İçe aktarma da (sistem yolu) buradan geçer.
   */
  async uyeEkleKapsamda(listeId: string, scope: PartyScope, partyIdler: unknown, userId?: string): Promise<number> {
    const idler = this.idleriDogrula(partyIdler);
    if (!idler.length) return 0;
    const [sutun, deger] = this.kapsamSutunu(scope);
    let eklenen = 0;
    for (let i = 0; i < idler.length; i += 150) {
      const parca = idler.slice(i, i + 150);
      const { data: kartlar, error } = await this.supabase.client
        .from("party")
        .select("id")
        .in("id", parca)
        .eq(sutun, deger)
        .contains("modules", [BAGLANTI_MODUL_KEY]);
      if (error) throw error;
      const satirlar = ((kartlar ?? []) as any[]).map((k) => ({ liste_id: listeId, party_id: k.id, ekleyen: userId ?? null }));
      if (!satirlar.length) continue;
      const { data: yazilan, error: yErr } = await this.supabase.client
        .from("baglanti_liste_uyeleri")
        .upsert(satirlar, { onConflict: "liste_id,party_id", ignoreDuplicates: true })
        .select("party_id");
      if (yErr) throw yErr;
      eklenen += (yazilan ?? []).length;
    }
    return eklenen;
  }

  async uyeCikar(listeId: string, partyIdler: unknown, userId: string): Promise<void> {
    const l = await this.listeyiAl(listeId);
    await this.yetki(l.scope, userId, true);
    const idler = this.idleriDogrula(partyIdler);
    if (!idler.length) return;
    const { error } = await this.supabase.client
      .from("baglanti_liste_uyeleri")
      .delete()
      .eq("liste_id", listeId)
      .in("party_id", idler);
    if (error) throw error;
  }

  private idleriDogrula(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idler = [...new Set(v.filter((x): x is string => typeof x === "string" && uuid.test(x)))];
    if (idler.length > 2000) throw new BadRequestException("Bir seferde en çok 2000 kart eklenebilir");
    return idler;
  }
}
