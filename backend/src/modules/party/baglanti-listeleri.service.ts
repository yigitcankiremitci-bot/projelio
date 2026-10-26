import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  BAGLANTI_MODUL_KEY,
  MUSTERI_MODUL_KEY,
  type BaglantiListeKaydi,
  type BaglantiListesi,
  type Party,
  type PartyListeModulu,
  type PartyOzelSiralar,
} from "@projelio/shared";
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
 *
 * Migration 170'ten beri Müşteriler'in de listeleri var: aynı tablo, `modul`
 * sütunu defteri ayırır; yetki o defterin modül yetkisi, karta girme şartı o
 * defterde durması. Özel sıralar (sürükle-bırak) da burada.
 */

/** Tanınmayan defter Bağlantılar sayılır: eski istemciler `modul` göndermez. */
export function listeModulu(v: unknown): PartyListeModulu {
  return v === MUSTERI_MODUL_KEY ? MUSTERI_MODUL_KEY : BAGLANTI_MODUL_KEY;
}

/** "<sekme>:<uuid | tumu>" — bkz. shared ozelSiraAnahtari. */
const SIRA_ANAHTARI = /^[a-z]{1,20}:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|tumu)$/i;
const SIRA_TAVANI = 5000;
@Injectable()
export class BaglantiListeleriService {
  constructor(
    private supabase: SupabaseService,
    private party: PartyService
  ) {}

  private kapsamSutunu(scope: PartyScope): ["organization_id" | "job_id", string] {
    return scope.jobId ? ["job_id", scope.jobId] : ["organization_id", scope.organizationId!];
  }

  private async yetki(scope: PartyScope, userId: string, yaz: boolean, modul: PartyListeModulu = BAGLANTI_MODUL_KEY): Promise<void> {
    const a = await this.party.access(scope, userId, modul);
    if (yaz ? a.canWrite : a.canRead) return;
    if (modul === MUSTERI_MODUL_KEY) {
      throw new ForbiddenException(yaz ? "Müşteri listelerini değiştirme yetkin yok" : "Müşterileri görme yetkin yok");
    }
    throw new ForbiddenException(yaz ? "Bağlantı listelerini değiştirme yetkin yok" : "Bağlantı ve İlişkiler'i görme yetkin yok");
  }

  /** Listenin kendisi + kapsamı; yoksa 404. */
  private async listeyiAl(listeId: string): Promise<{ id: string; ad: string; scope: PartyScope; modul: PartyListeModulu }> {
    const { data, error } = await this.supabase.client
      .from("baglanti_listeleri")
      // "*": migration 170 uygulanmadan `modul` sütunu yok; o zaman liste Bağlantılar'ındır.
      .select("*")
      .eq("id", listeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Liste bulunamadı");
    return {
      id: data.id,
      ad: data.ad,
      scope: data.job_id ? { jobId: data.job_id } : { organizationId: data.organization_id },
      modul: listeModulu(data.modul),
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
  async listele(scope: PartyScope, userId: string, modul: PartyListeModulu = BAGLANTI_MODUL_KEY): Promise<BaglantiListeKaydi[]> {
    await this.yetki(scope, userId, false, modul);
    return this.listelerVeSayilar(scope, modul);
  }

  private async listelerVeSayilar(scope: PartyScope, modul: PartyListeModulu): Promise<BaglantiListeKaydi[]> {
    const [sutun, deger] = this.kapsamSutunu(scope);
    const { data, error } = await this.supabase.client
      .from("baglanti_listeleri")
      .select("*, olusturan:users!baglanti_listeleri_olusturan_fkey(full_name), baglanti_liste_uyeleri(party(archived_at))")
      .eq(sutun, deger)
      .order("created_at", { ascending: true });
    if (error) throw error;
    // Defter süzmesi burada, sorguda değil: migration 170 uygulanmadan
    // `modul` sütunu yok ve sorguda süzmek Bağlantılar'ın listelerini de düşürürdü.
    return ((data ?? []) as any[]).filter((l) => listeModulu(l.modul) === modul).map((l) => ({
      id: l.id,
      ad: l.ad,
      sayi: ((l.baglanti_liste_uyeleri ?? []) as any[]).filter((u) => !u.party?.archived_at).length,
      olusturanAd: l.olusturan?.full_name ?? undefined,
      createdAt: l.created_at,
    }));
  }

  /**
   * Bağlantılar ekranının yanıtına listeleri, her kartın liste üyeliklerini
   * ve özel sıraları ekler. Listeler tablosu okunamazsa (ör. migration
   * uygulanmadan) ekran yine açılır — listeler bir kolaylık.
   */
  async yanitaEkle(yanit: BaglantiListesi, scope: PartyScope): Promise<BaglantiListesi> {
    return { ...yanit, ...(await this.kartlaraEkle(yanit.baglantilar, scope, BAGLANTI_MODUL_KEY)) };
  }

  /**
   * Kartlara `listeIdleri` yazar; listeleri ve özel sıraları döner. Hata
   * yutulur: listeler ve sıra bir kolaylık, ekranı düşürmesin.
   */
  async kartlaraEkle(
    kartlar: Party[],
    scope: PartyScope,
    modul: PartyListeModulu
  ): Promise<{ listeler?: BaglantiListeKaydi[]; ozelSiralar?: PartyOzelSiralar }> {
    const kapsam = { organizationId: scope.organizationId, jobId: scope.jobId };
    const [listeler, ozelSiralar] = await Promise.all([
      this.listelerVeSayilar(kapsam, modul).catch(() => undefined),
      this.siralariOku(kapsam, modul).catch(() => undefined),
    ]);
    if (listeler?.length) {
      try {
        const uyelik = new Map<string, string[]>();
        const idler = listeler.map((l) => l.id);
        const { data, error } = await this.supabase.client
          .from("baglanti_liste_uyeleri")
          .select("liste_id, party_id")
          .in("liste_id", idler);
        if (error) throw error;
        for (const u of (data ?? []) as any[]) uyelik.set(u.party_id, [...(uyelik.get(u.party_id) ?? []), u.liste_id]);
        for (const p of kartlar) p.listeIdleri = uyelik.get(p.id) ?? [];
      } catch {
        return { ozelSiralar };
      }
    }
    return { listeler, ozelSiralar };
  }

  async olustur(
    scope: PartyScope,
    ad: unknown,
    userId: string,
    partyIdler: unknown = [],
    modul: PartyListeModulu = BAGLANTI_MODUL_KEY
  ): Promise<BaglantiListeKaydi> {
    await this.yetki(scope, userId, true, modul);
    const temiz = this.adDogrula(ad);
    const [sutun, deger] = this.kapsamSutunu(scope);
    // Bağlantılar'da `modul` yazılmaz: migration 170 uygulanmadan da liste açılabilsin (varsayılanı 'baglantilar').
    const satir: Record<string, unknown> = { [sutun]: deger, ad: temiz, olusturan: userId };
    if (modul !== BAGLANTI_MODUL_KEY) satir.modul = modul;
    const { data, error } = await this.supabase.client
      .from("baglanti_listeleri")
      .insert(satir)
      .select("id, ad, created_at")
      .single();
    if (error) this.cakisma(error);
    const eklenen = await this.uyeEkleKapsamda(data.id, scope, partyIdler, userId, modul);
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
      .select("*")
      .eq(sutun, deger)
      .ilike("ad", temiz.replace(/[%_\\]/g, (k) => `\\${k}`));
    const mevcut = ((data ?? []) as any[]).find((l) => listeModulu(l.modul) === BAGLANTI_MODUL_KEY && l.ad.trim().toLocaleLowerCase("tr") === temiz.toLocaleLowerCase("tr"));
    if (mevcut) return { id: mevcut.id, ad: mevcut.ad };
    const yeni = await this.olustur(scope, temiz, userId);
    return { id: yeni.id, ad: yeni.ad };
  }

  /** İçe aktarmada hedef liste kimlikle verildiyse kapsamı ve yetkiyi doğrular. */
  async kapsamdakiListe(scope: PartyScope, listeId: string, userId: string): Promise<{ id: string; ad: string }> {
    const l = await this.listeyiAl(listeId);
    const [sutun, deger] = this.kapsamSutunu(scope);
    const [lSutun, lDeger] = this.kapsamSutunu(l.scope);
    if (sutun !== lSutun || deger !== lDeger || l.modul !== BAGLANTI_MODUL_KEY) throw new NotFoundException("Liste bulunamadı");
    await this.yetki(scope, userId, true);
    return { id: l.id, ad: l.ad };
  }

  async yenidenAdlandir(listeId: string, ad: unknown, userId: string): Promise<void> {
    const l = await this.listeyiAl(listeId);
    await this.yetki(l.scope, userId, true, l.modul);
    const { error } = await this.supabase.client
      .from("baglanti_listeleri")
      .update({ ad: this.adDogrula(ad), updated_at: new Date().toISOString() })
      .eq("id", listeId);
    if (error) this.cakisma(error);
  }

  /** Listeyi siler; kartlar Bağlantılar'da kalır (yalnızca üyelikler gider). */
  async sil(listeId: string, userId: string): Promise<void> {
    const l = await this.listeyiAl(listeId);
    await this.yetki(l.scope, userId, true, l.modul);
    const { error } = await this.supabase.client.from("baglanti_listeleri").delete().eq("id", listeId);
    if (error) throw error;
  }

  async uyeEkle(listeId: string, partyIdler: unknown, userId: string): Promise<{ eklenen: number }> {
    const l = await this.listeyiAl(listeId);
    await this.yetki(l.scope, userId, true, l.modul);
    return { eklenen: await this.uyeEkleKapsamda(listeId, l.scope, partyIdler, userId, l.modul) };
  }

  /**
   * Kartları listeye ekler; zaten listede olanlar sessizce atlanır. Yetki
   * ÇAĞIRANDA bakıldı — burada yalnızca kartların kapsamda ve listenin
   * defterinde olduğu süzülür. İçe aktarma da (sistem yolu) buradan geçer.
   */
  async uyeEkleKapsamda(
    listeId: string,
    scope: PartyScope,
    partyIdler: unknown,
    userId?: string,
    modul: PartyListeModulu = BAGLANTI_MODUL_KEY
  ): Promise<number> {
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
        .contains("modules", [modul]);
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
    await this.yetki(l.scope, userId, true, l.modul);
    const idler = this.idleriDogrula(partyIdler);
    if (!idler.length) return;
    const { error } = await this.supabase.client
      .from("baglanti_liste_uyeleri")
      .delete()
      .eq("liste_id", listeId)
      .in("party_id", idler);
    if (error) throw error;
  }

  // ============================================================ Özel sıra (migration 170)

  private async siralariOku(scope: PartyScope, modul: PartyListeModulu): Promise<PartyOzelSiralar> {
    const [sutun, deger] = this.kapsamSutunu(scope);
    const { data, error } = await this.supabase.client
      .from("party_ozel_siralar")
      .select("anahtar, sira")
      .eq(sutun, deger)
      .eq("modul", modul);
    if (error) throw error;
    const sonuc: PartyOzelSiralar = {};
    for (const r of (data ?? []) as any[]) sonuc[r.anahtar] = r.sira ?? [];
    return sonuc;
  }

  /**
   * Sürüklenerek verilen sırayı kaydeder. Sıra ekibin ortak görünümü
   * olduğu için yazma yetkisi ister (salt okur kendi ekranında da dizemez).
   * Kimlikler kapsamda doğrulanmaz: sıra yalnızca görünürdeki kartları
   * dizmek için okunur, yabancı bir kimlik hiçbir şey göstermez.
   */
  async siraKaydet(scope: PartyScope, modul: PartyListeModulu, anahtar: unknown, sira: unknown, userId: string): Promise<void> {
    const kapsam = { organizationId: scope.organizationId, jobId: scope.jobId };
    await this.yetki(kapsam, userId, true, modul);
    if (typeof anahtar !== "string" || !SIRA_ANAHTARI.test(anahtar)) throw new BadRequestException("Geçersiz sıra anahtarı");
    const idler = this.idleriDogrula(sira, SIRA_TAVANI);
    const [sutun, deger] = this.kapsamSutunu(kapsam);
    const satir = { modul, anahtar, sira: idler, guncelleyen: userId, updated_at: new Date().toISOString() };
    // Tekil indeks bir ifade (coalesce) üzerinde: upsert onConflict onu
    // hedefleyemez, önce güncellenir, satır yoksa eklenir.
    const { data, error } = await this.supabase.client
      .from("party_ozel_siralar")
      .update(satir)
      .eq(sutun, deger)
      .eq("modul", modul)
      .eq("anahtar", anahtar)
      .select("id");
    if (error) throw error;
    if (data?.length) return;
    const { error: eErr } = await this.supabase.client.from("party_ozel_siralar").insert({ ...satir, [sutun]: deger });
    // Aynı anda iki kayıt: ikincisi tekil indekse takılır, öteki zaten yazıldı.
    if (eErr && (eErr as any).code !== "23505") throw eErr;
  }

  private idleriDogrula(v: unknown, tavan = 2000): string[] {
    if (!Array.isArray(v)) return [];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idler = [...new Set(v.filter((x): x is string => typeof x === "string" && uuid.test(x)))];
    if (idler.length > tavan) throw new BadRequestException("Bir seferde çok fazla kart gönderildi");
    return idler;
  }
}
