import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  BAGLANTI_MODUL_KEY,
  BAGLANTI_ONEMLERI,
  GORUSME_TURLERI,
  temasOzeti,
  KARTVIZIT_SOSYAL,
  kartvizitSosyalNormallestir,
  MUSTERI_MODUL_KEY,
  PARTY_MODUL_KEYS,
  TEDARIK_MODUL_KEY,
  isPartyRole,
  isPartyType,
  type BaglantiListesi,
  type KartvizitSosyal,
  type KartvizitSosyalAnahtar,
  type ModuleAccess,
  type MusteriIceAktarmaSonucu,
  type MusteriListesi,
  type Party,
  type PartyActivity,
  type PartyActivityType,
  type PartyBaglanti,
  type PartyContact,
  type PartyDuplicate,
  type PartyAktarimSecenegi,
  musteriyeDonusenRoller,
  potansiyelRolleri,
  potansiyelMusteriMi,
  type PartyDosyaRolu,
  type PartyGorevi,
  type PartyModulKey,
  type PartyRole,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ModuleMembersService } from "../module-members/module-members.service";
import { AccessService } from "../../common/access/access.service";
import { FilesService, type ProjectFile } from "../files/files.service";
import { ModuleRecordsService } from "../module-records/module-records.service";
import { AKTARIM_TANIMLARI, aktarimKaydiVerisi, aktarimTanimi, defterAktarimiYapildi, notaEkle } from "./aktarim";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { musteriYetkisi } from "./siparis-erisim";
import { addRole, findDuplicates } from "./party-dedup";
import type { MevcutKart } from "./kartvizit-plani";
import {
  baglantiAlaniOkunur,
  baglantiAlaniYazilir,
  deftereEklemeHatasi,
  kartDuzenlemeKarari,
  kayitOkunur,
  kayitYazilir,
  kayitYonetilir,
  type Erisimler,
} from "./baglanti-erisim";
import { hataMetni } from "../../common/i18n/index";
import { MAX_IMPORT_ROWS, type SheetData } from "../ai-assistant/ai-sheet-import";
import { mevcutlariAyikla, planMusteriImport, type MusteriAlani } from "./musteri-sablonu";

// Kapsam düzeyindeki yetkinin varsayılan modülü. Kayda bağlı yetki ise
// kaydın durduğu defterlerden okunur (bkz. baglanti-erisim.ts).
const MODULE_KEY = MUSTERI_MODUL_KEY;

/**
 * party_baglanti gömmesi. PK aynı zamanda FK olduğu için PostgREST bire-bir
 * sayıp nesne döndürüyor; sürüme göre dizi de gelebilir, ikisi de okunuyor.
 */
function mapBaglanti(embed: any): PartyBaglanti | undefined {
  const r = Array.isArray(embed) ? embed[0] : embed;
  if (!r) return undefined;
  return {
    onem: r.onem,
    tanismaYeri: r.tanisma_yeri ?? undefined,
    tanismaTarihi: r.tanisma_tarihi ?? undefined,
    sonrakiTemas: r.sonraki_temas ?? undefined,
    iliskiNotu: r.iliski_notu ?? undefined,
  };
}

function mapParty(row: any): Party {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    partyType: row.party_type,
    displayName: row.display_name,
    legalName: row.legal_name ?? undefined,
    kurum: row.kurum ?? undefined,
    unvan: row.unvan ?? undefined,
    taxNumber: row.tax_number ?? undefined,
    taxOffice: row.tax_office ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    address: row.address ?? undefined,
    sosyal: row.sosyal ?? {},
    roles: row.roles ?? [],
    status: row.status,
    source: row.source ?? undefined,
    // Migration 153 öncesi satırlarda sütun yok: o kayıtlar müşteri defterinde.
    modules: row.modules ?? [MUSTERI_MODUL_KEY],
    ownerUserId: row.owner_user_id ?? undefined,
    parentPartyId: row.parent_party_id ?? undefined,
    linkedUserId: row.linked_user_id ?? undefined,
    mergedIntoId: row.merged_into_id ?? undefined,
    data: row.data ?? {},
    notes: row.notes ?? undefined,
    sonrakiArama: row.sonraki_arama ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
    ownerName: row.owner?.full_name ?? undefined,
    baglanti: row.party_baglanti === undefined ? undefined : mapBaglanti(row.party_baglanti),
  };
}

function mapContact(row: any): PartyContact {
  return {
    id: row.id,
    partyId: row.party_id,
    name: row.name,
    title: row.title ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    isPrimary: row.is_primary,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

function mapActivity(row: any): PartyActivity {
  return {
    id: row.id,
    partyId: row.party_id,
    type: row.type,
    occurredAt: row.occurred_at,
    summary: row.summary,
    userId: row.user_id ?? undefined,
    relatedType: row.related_type ?? undefined,
    relatedId: row.related_id ?? undefined,
    createdAt: row.created_at,
    userName: row.users?.full_name ?? undefined,
  };
}

export interface PartyScope {
  organizationId?: string;
  jobId?: string;
  departmentId?: string;
}

/**
 * Ortak varlık: dış dünyadaki kişi ve kurumlar.
 *
 * Satış ve Müşteri İlişkileri departmanları AYNI kayıtlara bakar — daha önce
 * iki ayrı modül anahtarıyla iki ayrı kayıt tutuluyordu ve aynı müşteri
 * bölünüyordu. Bkz. 046_party_and_customer_merge.sql
 */
@Injectable()
export class PartyService {
  constructor(
    private supabase: SupabaseService,
    private moduleMembers: ModuleMembersService,
    private accessService: AccessService,
    private files: FilesService,
    private moduleRecords: ModuleRecordsService
  ) {}

  private readonly OWNER_JOIN = "*, owner:users!party_owner_user_id_fkey(full_name)";
  // Bağlantı alanları yalnızca yetkisi olana dönülür; gömme her zaman
  // okunur, karar dönüşte verilir (bkz. gorunur).
  private readonly BAGLANTI_JOIN = `${this.OWNER_JOIN}, party_baglanti(*)`;

  // ============================================================ Yetki

  /**
   * Bir modüldeki kapsam yetkisi. Varsayılan crm_musteri: sipariş servisi ve
   * eski çağıranlar aynı kapıdan geçer.
   */
  async access(scope: PartyScope, userId?: string, modul: PartyModulKey = MODULE_KEY): Promise<ModuleAccess> {
    return scope.jobId
      ? this.moduleMembers.resolveJobAccess(scope.jobId, modul, userId)
      : this.moduleMembers.resolveOrganizationAccess(
          scope.organizationId!,
          modul,
          userId,
          scope.departmentId
        );
  }

  /** Kaydın durduğu defterlerin her birindeki yetki. */
  private async erisimler(party: Party, userId: string): Promise<Erisimler> {
    const e: Erisimler = {};
    await Promise.all(
      party.modules
        .filter((m): m is PartyModulKey => (PARTY_MODUL_KEYS as readonly string[]).includes(m))
        .map(async (m) => {
          e[m] = await this.access(this.scopeOf(party), userId, m);
        })
    );
    return e;
  }

  /**
   * Kayda bağlı okuma. assertKayitYazilir'in aksine FAIL-CLOSED: userId yoksa
   * reddeder.
   *
   * NEDEN: by-id okuma uçları (findOne/contacts/activities) eskiden HİÇBİR yetki
   * kontrolü yapmıyordu — giriş yapmış herhangi biri, hatta partner verisine
   * erişimi olmaması gereken bir taşeron bile, UUID'yi bilen herkes başka bir
   * organizasyonun müşteri/tedarikçi kaydını (ve kişilerini, PII) okuyabiliyordu.
   * Liste uçları zaten kontrol ediyordu; by-id uçları atlanmıştı (bkz. controller).
   *
   * Kapsamdaki crm_musteri yetkisine bakmak da yetmez:
   * yalnızca Bağlantılar'da duran bir kartı Müşteriler yetkisiyle açmak
   * mümkün olmamalı (bkz. baglanti-erisim.ts).
   */
  private async assertKayitOkunur(party: Party, userId?: string): Promise<Erisimler> {
    if (!userId) throw new ForbiddenException("Bu kaydı görme yetkin yok");
    const e = await this.erisimler(party, userId);
    if (!kayitOkunur(party.modules, e)) throw new ForbiddenException("Bu kaydı görme yetkin yok");
    return e;
  }

  /** Kayda bağlı yazma. assertCanWrite gibi userId yoksa (sistem çağrısı) geçer. */
  private async assertKayitYazilir(party: Party, userId?: string): Promise<void> {
    if (!userId) return;
    const e = await this.erisimler(party, userId);
    if (!kayitYazilir(party.modules, e)) {
      throw new ForbiddenException(
        "Müşteri kaydını yalnızca organizasyon sahibi, departman yöneticisi veya modüle atanmış kişiler değiştirebilir"
      );
    }
  }

  /** Bağlantı alanlarını yetkisi olmayana göstermeden kartı döndürür. */
  private gorunur(party: Party, e: Erisimler): Party {
    if (!party.baglanti || baglantiAlaniOkunur(party.modules, e)) return party;
    const { baglanti: _gizli, ...kalan } = party;
    return kalan;
  }

  /** Bağlantılar'ın alanlarını yazar (yoksa açar). */
  private async baglantiYaz(partyId: string, b: Partial<PartyBaglanti>): Promise<void> {
    if (b.onem !== undefined && !(BAGLANTI_ONEMLERI as readonly string[]).includes(b.onem)) {
      throw new BadRequestException("Geçersiz önem");
    }
    const tarih = (v: string | undefined) => {
      if (v === undefined) return undefined;
      if (!v) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException("Tarih YYYY-AA-GG biçiminde olmalı");
      return v;
    };
    const metin = (v: string | undefined, tavan: number) => (v === undefined ? undefined : v.trim().slice(0, tavan) || null);
    const satir: Record<string, unknown> = { party_id: partyId, updated_at: new Date().toISOString() };
    const ata = (k: string, v: unknown) => {
      if (v !== undefined) satir[k] = v;
    };
    ata("onem", b.onem);
    ata("tanisma_yeri", metin(b.tanismaYeri, 200));
    ata("tanisma_tarihi", tarih(b.tanismaTarihi));
    ata("sonraki_temas", tarih(b.sonrakiTemas));
    ata("iliski_notu", metin(b.iliskiNotu, 5000));
    const { error } = await this.supabase.client.from("party_baglanti").upsert(satir, { onConflict: "party_id" });
    if (error) throw error;
  }

  /**
   * Sosyal hesapları tutamaca çevirir (kartvizitle aynı kural). Tanınmayan
   * hesap türü ya da biçim REDDEDİLİR: "linkedin" alanına bir Instagram adresi
   * yapıştırılırsa sessizce yanlış profile bağlanmasın. Boş değer alanı siler.
   */
  private sosyalDogrula(sosyal: unknown): KartvizitSosyal | undefined {
    if (sosyal === undefined) return undefined;
    if (!sosyal || typeof sosyal !== "object" || Array.isArray(sosyal)) throw new BadRequestException("Geçersiz sosyal hesap");
    const sonuc: KartvizitSosyal = {};
    for (const [anahtar, deger] of Object.entries(sosyal as Record<string, unknown>)) {
      const tanim = KARTVIZIT_SOSYAL.find((s) => s.anahtar === anahtar);
      if (!tanim) throw new BadRequestException("Geçersiz sosyal hesap");
      const tutamac = kartvizitSosyalNormallestir(anahtar as KartvizitSosyalAnahtar, String(deger ?? ""));
      if (tutamac === null) {
        throw new BadRequestException(hataMetni("{hesap} hesabı tanınmadı", { hesap: tanim.ad }));
      }
      if (tutamac) sonuc[anahtar as KartvizitSosyalAnahtar] = tutamac;
    }
    return sonuc;
  }

  private turuDogrula(tur: unknown): void {
    if (tur !== undefined && !isPartyType(tur)) throw new BadRequestException("Geçersiz kart türü");
  }

  /** Bilinmeyen rolü reddeder (eskiden istemciden geldiği gibi yazılıyordu). */
  private rolleriDogrula(roles: unknown): void {
    if (roles === undefined) return;
    if (!Array.isArray(roles) || !roles.every(isPartyRole)) throw new BadRequestException("Geçersiz rol");
  }

  private async assertCanWrite(scope: PartyScope, userId?: string, modul: PartyModulKey = MODULE_KEY): Promise<void> {
    if (!userId) return;
    const a = await this.access(scope, userId, modul);
    if (!a.canWrite) {
      throw new ForbiddenException(
        "Müşteri kaydını yalnızca organizasyon sahibi, departman yöneticisi veya modüle atanmış kişiler değiştirebilir"
      );
    }
  }

  /**
   * Müşteriye atanacak kişi bu kapsamı görebiliyor mu.
   *
   * Görmeyen birine atanan müşteri kimsenin listesinde çıkmaz: çalışan onu
   * göremez, yönetici de "atandı" sanır. Kimliği istemci gönderdiği için
   * herhangi bir kullanıcı kimliği yazılıp başka şirketin çalışanına
   * müşteri atanabilirdi.
   */
  private async assertAtanabilir(scope: PartyScope, sorumluId: string): Promise<void> {
    const gorur = scope.jobId
      ? await this.accessService.canViewJob(scope.jobId, sorumluId)
      : await this.accessService.canViewOrganization(scope.organizationId!, sorumluId);
    if (!gorur) throw new BadRequestException("Seçilen kişi bu şirketin ekibinde değil");
  }

  /** Kaydın sahibinden (organizasyon/iş) kapsamı türetir. */
  scopeOf(party: Party): PartyScope {
    return { organizationId: party.organizationId, jobId: party.jobId };
  }

  // ============================================================ Okuma

  /**
   * Kapsamdaki kartlar — VARSAYILAN olarak yalnızca Müşteriler defteri.
   *
   * Diğer modüllerin müşteri seçicileri (fatura, alacak-borç, ürün
   * tedarikçisi) ve Lio buradan okuyor; süzülmeseydi Bağlantılar'daki rakip
   * fatura seçicisinde çıkardı. `moduller` yalnızca o defterleri isteyen
   * çağıranlar için (Bağlantılar listesi, yinelenen kontrolü).
   */
  async findAll(
    scope: PartyScope,
    opts: { role?: PartyRole; includeArchived?: boolean; moduller?: readonly PartyModulKey[]; baglanti?: boolean } = {}
  ): Promise<Party[]> {
    const moduller = opts.moduller ?? [MUSTERI_MODUL_KEY];
    if (!moduller.length) return [];
    let query = this.supabase.client
      .from("party")
      .select(opts.baglanti ? this.BAGLANTI_JOIN : this.OWNER_JOIN)
      // Birleştirilmiş kayıtlar listede görünmez; hedefleri zaten listede.
      .is("merged_into_id", null)
      .overlaps("modules", moduller as string[])
      .order("display_name", { ascending: true });

    query = scope.jobId ? query.eq("job_id", scope.jobId) : query.eq("organization_id", scope.organizationId);
    if (!opts.includeArchived) query = query.is("archived_at", null);
    if (opts.role) query = query.contains("roles", [opts.role]);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapParty);
  }

  /**
   * Müşteriler ekranının listesi: yönetici hepsini, çalışan KENDİSİNE
   * atananları görür (bkz. siparis-erisim.ts).
   *
   * Genel `findAll` bilerek süzülmüyor: diğer modüllerin müşteri seçicileri
   * (fatura, alacak-borç, satış fırsatı) ve kayıtlardaki kimliklerin ada
   * çevrilmesi o listeye dayanıyor. Orada süzülseydi muhasebe, satışçının
   * müşterisine fatura kesemez; eski kayıtlarda ad yerine kimlik görünürdü.
   */
  async musterilerim(scope: PartyScope, userId: string): Promise<MusteriListesi> {
    const a = await this.access(scope, userId);
    if (!a.canRead) throw new ForbiddenException("Bu kaydı görme yetkin yok");
    const hepsi = await this.findAll(scope);
    const yonetici = a.canManageTeam;
    const musteriler = yonetici ? hepsi : hepsi.filter((p) => musteriYetkisi(a, p.ownerUserId, userId).okur);
    // Dosya simgeleri (kartvizit, ek) Bağlantılar'daki gibi müşteri satırında da.
    await Promise.all([this.kisiSayilariniEkle(musteriler), this.temasOzetleriniEkle(musteriler), this.dosyaOzetleriniEkle(musteriler)]);
    return { yonetici, kartYazar: a.canWrite, musteriler };
  }

  /**
   * Bağlantı ve İlişkiler ekranının listesi. Müşteriler'den farkı: sahiplik
   * süzmesi YOK — bu bir yönetim defteri, modülü okuyabilen herkes hepsini
   * görür. Kartlar bağlantı alanlarıyla gelir (liste zaten bu modülün
   * yetkisiyle açıldı).
   */
  async baglantilarim(scope: PartyScope, userId: string): Promise<BaglantiListesi> {
    const a = await this.access(scope, userId, BAGLANTI_MODUL_KEY);
    if (!a.canRead) throw new ForbiddenException("Bu kaydı görme yetkin yok");
    const baglantilar = await this.findAll(scope, { moduller: [BAGLANTI_MODUL_KEY], baglanti: true });
    await Promise.all([this.dosyaOzetleriniEkle(baglantilar), this.kisiSayilariniEkle(baglantilar)]);
    return { yonetici: a.canManageTeam, kartYazar: a.canWrite, baglantilar };
  }

  /**
   * Listedeki kartlara dosya sayısı ve en son dosyanın kimliği (kartvizit
   * simgesi). Kart kimlikleri 150'lik parçalarla sorgulanıyor: yüzlerce
   * kimlik tek `in` filtresinde istek adresini taşırırdı.
   */
  /**
   * Liste satırı simgelerinin (kartvizit, ek, kişi sayısı) verisi — Bağlantılar
   * listesiyle aynı. Tedarik > Tedarikçiler genel liste ucundan `ozet=1` ile ister.
   */
  async listeOzetleriniEkle(kartlar: Party[]): Promise<void> {
    await Promise.all([this.dosyaOzetleriniEkle(kartlar), this.kisiSayilariniEkle(kartlar)]);
  }

  private async dosyaOzetleriniEkle(kartlar: Party[]): Promise<void> {
    const kimlik = new Map(kartlar.map((p) => [p.id, p]));
    const ids = [...kimlik.keys()];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await this.supabase.client
        .from("file_links")
        .select("target_id, file_id, party_rol")
        .eq("target_kind", "party")
        .in("target_id", ids.slice(i, i + 150))
        .not("file_id", "is", null)
        .order("created_at", { ascending: false });
      // Simge bir kolaylık: okunamazsa liste yine açılsın.
      if (error) return;
      for (const r of (data ?? []) as any[]) {
        const p = kimlik.get(r.target_id);
        if (!p) continue;
        if (r.party_rol === "ek") {
          p.ekSayisi = (p.ekSayisi ?? 0) + 1;
          p.sonEkId ??= r.file_id;
        } else {
          p.kartvizitSayisi = (p.kartvizitSayisi ?? 0) + 1;
          p.sonKartvizitId ??= r.file_id;
        }
      }
    }
  }

  /**
   * Listedeki kartlara görüşme özeti: son temas, üst üste kaç kez ulaşılamadı,
   * not sayısı ("kimi aramalıyım" sorusu listeden cevaplansın). Kart başına
   * en son 20 not yeter — seri ondan uzunsa zaten "çok kez" demektir.
   */
  private async temasOzetleriniEkle(kartlar: Party[]): Promise<void> {
    const kimlik = new Map(kartlar.map((p) => [p.id, p]));
    const ids = [...kimlik.keys()];
    const notlar = new Map<string, { type: PartyActivityType; occurredAt: string }[]>();
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await this.supabase.client
        .from("party_activity")
        .select("party_id, type, occurred_at")
        .in("party_id", ids.slice(i, i + 150))
        .neq("type", "sistem")
        .order("occurred_at", { ascending: false })
        .limit(3000);
      // Özet bir kolaylık: okunamazsa liste yine açılsın.
      if (error) return;
      for (const r of (data ?? []) as any[]) {
        const liste = notlar.get(r.party_id) ?? [];
        if (liste.length < 20) liste.push({ type: r.type, occurredAt: r.occurred_at });
        notlar.set(r.party_id, liste);
      }
    }
    for (const [id, liste] of notlar) {
      const p = kimlik.get(id);
      if (p) p.temas = temasOzeti(liste);
    }
  }

  /**
   * Şirket/kurum kartlarındaki kişi sayısı (listede "3 kişi" simgesi).
   * Kişi kartlarında sayılmıyor: orada kişi zaten kartın kendisi.
   */
  private async kisiSayilariniEkle(kartlar: Party[]): Promise<void> {
    const kurumlar = new Map(kartlar.filter((p) => p.partyType !== "person").map((p) => [p.id, p]));
    const ids = [...kurumlar.keys()];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await this.supabase.client
        .from("party_contact")
        .select("party_id")
        .in("party_id", ids.slice(i, i + 150))
        .is("archived_at", null);
      if (error) return;
      for (const r of (data ?? []) as any[]) {
        const p = kurumlar.get(r.party_id);
        if (p) p.contactCount = (p.contactCount ?? 0) + 1;
      }
    }
  }

  /**
   * Kartvizit planı için karşılaştırma havuzu: kullanıcının OKUYABİLDİĞİ
   * defterlerdeki kartlar (bkz. checkDuplicates — görülemeyen defterin kartı
   * "zaten kayıtlı" diye adıyla sızmasın).
   */
  async kartvizitAdaylari(scope: PartyScope, userId: string): Promise<MevcutKart[]> {
    const moduller = await this.okunanModuller(scope, userId);
    if (!moduller.includes(BAGLANTI_MODUL_KEY)) throw new ForbiddenException("Bağlantı ve İlişkiler'i görme yetkin yok");
    const kartlar = await this.findAll(scope, { moduller });
    return kartlar.map((p) => ({ id: p.id, displayName: p.displayName, partyType: p.partyType, email: p.email, phone: p.phone }));
  }

  /** Bağlantılar'daki en son tanışma yerleri (yer + tarih), Lio'nun önerisi için. */
  async sonTanismaYerleri(scope: PartyScope, userId: string): Promise<{ yer: string; tarih?: string }[]> {
    const { baglantilar } = await this.baglantilarim(scope, userId);
    const gorulen = new Set<string>();
    const sonuc: { yer: string; tarih?: string }[] = [];
    for (const p of [...baglantilar].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const yer = p.baglanti?.tanismaYeri?.trim();
      if (!yer || gorulen.has(yer.toLocaleLowerCase("tr"))) continue;
      gorulen.add(yer.toLocaleLowerCase("tr"));
      sonuc.push({ yer, tarih: p.baglanti?.tanismaTarihi });
      if (sonuc.length >= 3) break;
    }
    return sonuc;
  }

  /** GET /party/:id için: yükler VE okuma yetkisini doğrular. */
  async viewOne(id: string, userId?: string): Promise<Party> {
    const party = await this.findOne(id, { baglanti: true });
    const e = await this.assertKayitOkunur(party, userId);
    return this.gorunur(party, e);
  }

  async findOne(id: string, opts: { baglanti?: boolean } = {}): Promise<Party> {
    const { data, error } = await this.supabase.client
      .from("party")
      .select(opts.baglanti ? this.BAGLANTI_JOIN : this.OWNER_JOIN)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return mapParty(data);
  }

  // ============================================================ Tekilleştirme

  /**
   * Kaydetmeden önce olası kopyaları döndürür. Arayüz bunu "Bu kaydı daha önce
   * girmiş olabilirsiniz" uyarısı için kullanır; vergi numarası eşleşmesi
   * kaydı tamamen engeller.
   */
  /** Kullanıcının bu kapsamda okuyabildiği defterler. */
  private async okunanModuller(scope: PartyScope, userId: string): Promise<PartyModulKey[]> {
    const okunan = await Promise.all(
      PARTY_MODUL_KEYS.map(async (m) => ((await this.access(scope, userId, m)).canRead ? m : null))
    );
    return okunan.filter((m): m is PartyModulKey => m !== null);
  }

  /**
   * Aday havuzu: kullanıcının OKUYABİLDİĞİ defterlerdeki kartlar. Göremediği
   * defteri de taramak "bu adla bir kayıt var" uyarısıyla oradaki kartın
   * varlığını ve adını sızdırırdı (satışçıya yönetimin rakip listesini).
   * userId yoksa (sistem çağrısı: Shopify) bütün defterler.
   *
   * Vergi numarası tekilliği defterden bağımsız (party_org_tax_uniq): göremediği
   * defterdeki kartla çakışan kayıt yine açılmaz, yalnızca adı söylenmez.
   */
  async checkDuplicates(
    scope: PartyScope,
    input: { displayName?: string; taxNumber?: string; email?: string; excludeId?: string },
    userId?: string
  ): Promise<PartyDuplicate[]> {
    const moduller = userId ? await this.okunanModuller(scope, userId) : PARTY_MODUL_KEYS;
    // Benzerlik karşılaştırması normalleştirme gerektirdiği için SQL'de değil
    // bellekte yapılıyor. Organizasyon başına kart sayısı bu ölçekte sorun
    // çıkarmaz; büyürse trigram indeksine geçilir.
    const candidates = await this.findAll(scope, { moduller });
    return findDuplicates(input, candidates);
  }

  // ============================================================ Yazma

  /**
   * Kart açar. `modul` kartın hangi defterde açıldığı: Bağlantılar'da açılan
   * kart Müşteriler'de görünmez (bkz. migration 153).
   */
  async create(
    scope: PartyScope,
    payload: Partial<Party> & { displayName?: string },
    userId?: string,
    modul: PartyModulKey = MODULE_KEY
  ): Promise<Party> {
    if (!payload.displayName?.trim()) throw new BadRequestException("Ad gerekli");
    this.rolleriDogrula(payload.roles);
    this.turuDogrula(payload.partyType);
    const sosyal = this.sosyalDogrula(payload.sosyal);
    await this.assertCanWrite(scope, userId, modul);
    const baglantiDefteri = modul === BAGLANTI_MODUL_KEY;

    // Çalışan açtığı müşteriyi kendisi üstlenir; başkasına atamak yöneticinin
    // kararı (bkz. kartDuzenlemeHatasi). Yönetici birini seçtiyse o kişi
    // şirketin ekibinde olmalı.
    let sorumlu = userId ?? null;
    if (payload.ownerUserId && userId && payload.ownerUserId !== userId) {
      const a = await this.access(scope, userId, modul);
      if (!a.canManageTeam) throw new ForbiddenException("Müşteriyi başka bir çalışana yalnızca yönetici atayabilir");
      await this.assertAtanabilir(scope, payload.ownerUserId);
      sorumlu = payload.ownerUserId;
    } else if (payload.ownerUserId && !userId) {
      sorumlu = payload.ownerUserId;
    }

    const duplicates = await this.checkDuplicates(
      scope,
      { displayName: payload.displayName, taxNumber: payload.taxNumber, email: payload.email },
      userId
    );
    const blocking = duplicates.find((d) => d.severity === "block");
    if (blocking) {
      throw new BadRequestException(
        hataMetni("Bu vergi numarası zaten \"{displayName}\" kaydında kayıtlı", { displayName: blocking.party.displayName })
      );
    }

    const { data: row, error } = await this.supabase.client
      .from("party")
      .insert({
        organization_id: scope.organizationId ?? null,
        job_id: scope.jobId ?? null,
        party_type: payload.partyType ?? "company",
        display_name: payload.displayName.trim(),
        legal_name: payload.legalName ?? null,
        kurum: payload.kurum?.trim().slice(0, 200) || null,
        unvan: payload.unvan?.trim().slice(0, 150) || null,
        tax_number: payload.taxNumber ?? null,
        tax_office: payload.taxOffice ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        website: payload.website?.trim() || null,
        address: payload.address ?? null,
        sosyal: sosyal ?? {},
        // Bağlantılar'da varsayılan "potansiyel müşteri" değil: oradaki
        // kişilerin çoğu müşteri adayı değil, tanışıklık.
        roles: payload.roles?.length ? payload.roles : [baglantiDefteri ? "contact" : "lead"],
        status: payload.status ?? "active",
        source: payload.source ?? null,
        modules: [modul],
        // Sorumlu belirtilmediyse kaydı açan kişi üstlenir; sahipsiz müşteri
        // kimsenin takip etmediği müşteridir.
        owner_user_id: sorumlu,
        parent_party_id: payload.parentPartyId ?? null,
        data: payload.data ?? {},
        notes: payload.notes ?? null,
        created_by: userId ?? null,
      })
      .select(this.OWNER_JOIN)
      .single();

    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu vergi numarası zaten kayıtlı");
      throw error;
    }

    const party = mapParty(row);
    if (baglantiDefteri) {
      // Bağlantı alanları olmadan da kart işe yarar; satırı yine açıyoruz ki
      // önem "orta" olarak sıralamaya girsin.
      await this.baglantiYaz(party.id, payload.baglanti ?? {});
      party.baglanti = (await this.findOne(party.id, { baglanti: true })).baglanti;
    }
    await this.logActivity(party.id, "sistem", "Kayıt oluşturuldu", userId);
    return party;
  }

  /**
   * Excel şablonundan (ya da herhangi bir müşteri listesinden) toplu kart.
   *
   * İki kapının TEK gövdesi: Müşteriler ekranındaki yükleme ucu ve Lio'nun
   * import_customers_from_sheet aracı. Önizleme varsayılan: yanlış sütun
   * eşlemesi ancak kartlar açıldıktan sonra fark edilirdi.
   *
   * Yazma yetkisi ÖNİZLEMEDE de bakılıyor: yazamayacak birine "120 kart
   * açılacak" deyip onayda reddetmek boşa emek.
   *
   * Yinelenen ayıklaması arşivdeki kartları da görür: vergi no tekilliği
   * arşivi kapsıyor, ayrıca arşivlenmiş bir müşteriyi sessizce yeniden açmak
   * kullanıcının vazgeçtiği bir kaydı geri getirmek olurdu.
   */
  async sablondanIceAktar(
    scope: PartyScope,
    sheet: SheetData,
    userId: string,
    opts: {
      onizleme?: boolean;
      esleme?: Partial<Record<MusteriAlani, string>>;
      basliksatiri?: number;
      ilkSatir?: number;
      sonSatir?: number;
      kaynak?: string;
      modul?: PartyModulKey;
      /** Potansiyel sekmesinden yüklendi: her kart potansiyel açılır (bkz. potansiyelRolleri). */
      potansiyel?: boolean;
    } = {}
  ): Promise<MusteriIceAktarmaSonucu> {
    const modul = opts.modul ?? MODULE_KEY;
    await this.assertCanWrite(scope, userId, modul);
    const plan = planMusteriImport(sheet, { ...opts, tur: modul === BAGLANTI_MODUL_KEY ? "baglanti" : "musteri" });
    // Yalnızca Müşteriler defterinde anlamlı; Bağlantılar'da potansiyel sekmesi yok.
    if (opts.potansiyel && modul === MUSTERI_MODUL_KEY) {
      for (const p of plan.planlanan) p.party.roles = potansiyelRolleri(p.party.roles);
    }
    // Yalnızca okuyabildiği defterlerle karşılaştırılır: "zaten kayıtlı: X"
    // satırı göremediği defterdeki kartın adını söylerdi (bkz. checkDuplicates).
    const mevcut = await this.findAll(scope, { includeArchived: true, moduller: await this.okunanModuller(scope, userId) });
    const { yeni, zatenVar } = mevcutlariAyikla(plan.planlanan, mevcut);
    const islenecek = yeni.slice(0, MAX_IMPORT_ROWS);

    const sonuc: MusteriIceAktarmaSonucu = {
      onizleme: opts.onizleme !== false,
      okunanSatir: plan.toplamSatir,
      acilacak: islenecek.length,
      eslesenSutunlar: plan.eslesenSutunlar,
      kullanilmayanSutunlar: plan.kullanilmayanSutunlar,
      zatenKayitli: zatenVar,
      atlanan: plan.atlanan,
      uyarilar: plan.uyarilar,
      hatalar: [],
      ornek: islenecek.slice(0, 5).map((p) => ({
        satir: p.satir,
        ad: p.party.displayName,
        rol: p.party.roles?.join(", "),
        telefon: p.party.phone,
        eposta: p.party.email,
      })),
      kalanIlkSatir: yeni[MAX_IMPORT_ROWS]?.satir,
    };
    if (sonuc.onizleme || !islenecek.length) return sonuc;

    const { olusan, hatalar } = await this.createMany(scope, islenecek, userId, opts.kaynak ?? "excel", modul);
    return { ...sonuc, acilan: olusan.length, hatalar, acilanIdler: olusan.map((o) => o.party.id) };
  }

  /**
   * Toplu kart açma (Excel şablonu, bkz. musteri-sablonu.ts).
   *
   * create()'i satır satır çağırmak her satırda yetkiyi ve kapsamın TÜM
   * kartlarını yeniden okuyordu: 300 satırlık dosya binlerce sorgu ederdi.
   * Burada yetki bir kez bakılıyor, satırlar 100'lük parçalarla yazılıyor.
   * Yinelenen ayıklaması ÇAĞIRANIN işi (mevcutlariAyikla) — bu metot
   * kopya kontrolü yapmaz.
   *
   * Bir parçada vergi no çakışırsa (ayıklamadan sonra başka biri aynı anda
   * eklemiş olabilir) o parça tek tek yeniden denenir: tek satırın çakışması
   * 99 masum satırı düşürmesin. Başarısız satırlar `hatalar`da döner.
   */
  async createMany(
    scope: PartyScope,
    rows: { satir: number; party: Partial<Party> & { displayName: string }; kisi?: Partial<PartyContact> }[],
    userId: string,
    source: string,
    modul: PartyModulKey = MODULE_KEY
  ): Promise<{ olusan: { satir: number; party: Party }[]; hatalar: { satir: number; sebep: string }[] }> {
    await this.assertCanWrite(scope, userId, modul);
    const baglantiDefteri = modul === BAGLANTI_MODUL_KEY;
    for (const r of rows) this.rolleriDogrula(r.party.roles);

    const kayit = (p: Partial<Party> & { displayName: string }) => ({
      organization_id: scope.organizationId ?? null,
      job_id: scope.jobId ?? null,
      party_type: p.partyType ?? "company",
      display_name: p.displayName.trim(),
      legal_name: p.legalName ?? null,
      kurum: p.kurum?.trim().slice(0, 200) || null,
      unvan: p.unvan?.trim().slice(0, 150) || null,
      tax_number: p.taxNumber ?? null,
      tax_office: p.taxOffice ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      website: p.website ?? null,
      address: p.address ?? null,
      // Plan (musteri-sablonu) tutamaçları zaten doğruladı.
      sosyal: p.sosyal ?? {},
      roles: p.roles?.length ? p.roles : [baglantiDefteri ? "contact" : "lead"],
      status: "active",
      source,
      modules: [modul],
      // Bkz. create(): sahipsiz müşteri kimsenin takip etmediği müşteridir.
      owner_user_id: userId,
      data: {},
      notes: p.notes ?? null,
      created_by: userId,
    });

    const olusan: { satir: number; party: Party }[] = [];
    const hatalar: { satir: number; sebep: string }[] = [];

    for (let i = 0; i < rows.length; i += 100) {
      const parca = rows.slice(i, i + 100);
      const { data, error } = await this.supabase.client
        .from("party")
        .insert(parca.map((r) => kayit(r.party)))
        .select(this.OWNER_JOIN);
      if (!error) {
        // PostgREST toplu eklemede satırları gönderilen sırayla döndürür.
        (data ?? []).forEach((row: any, j: number) => olusan.push({ satir: parca[j].satir, party: mapParty(row) }));
        continue;
      }
      if ((error as any).code !== "23505") throw error;
      for (const r of parca) {
        const tek = await this.supabase.client.from("party").insert(kayit(r.party)).select(this.OWNER_JOIN).single();
        if (tek.error) {
          hatalar.push({
            satir: r.satir,
            sebep: (tek.error as any).code === "23505" ? "bu vergi numarası zaten kayıtlı" : "kaydedilemedi",
          });
        } else {
          olusan.push({ satir: r.satir, party: mapParty(tek.data) });
        }
      }
    }

    // Geçmiş ve yetkili kişi de toplu: satır başına iki sorgu daha olmasın.
    if (olusan.length) {
      await this.supabase.client.from("party_activity").insert(
        olusan.map((o) => ({
          party_id: o.party.id,
          type: "sistem",
          summary: "Excel'den içe aktarıldı",
          user_id: userId,
          occurred_at: new Date().toISOString(),
        }))
      );
      if (baglantiDefteri) {
        // Önem/tanışma yeri satırları da toplu; plan bunları zaten doğruladı
        // (onem ONEMLER'den, tarih tarihiCoz'dan geçti).
        const { error } = await this.supabase.client.from("party_baglanti").insert(
          olusan.map((o) => {
            const b = rows.find((r) => r.satir === o.satir)?.party.baglanti;
            return {
              party_id: o.party.id,
              onem: b?.onem ?? "orta",
              tanisma_yeri: b?.tanismaYeri ?? null,
              tanisma_tarihi: b?.tanismaTarihi ?? null,
              sonraki_temas: b?.sonrakiTemas ?? null,
              iliski_notu: b?.iliskiNotu ?? null,
            };
          })
        );
        if (error) hatalar.push({ satir: 0, sebep: "bağlantı bilgileri (önem, tanışma yeri) eklenemedi" });
      }
      const kisiler = olusan
        .map((o) => ({ o, kisi: rows.find((r) => r.satir === o.satir)?.kisi }))
        .filter((x) => x.kisi?.name?.trim())
        .map(({ o, kisi }) => ({
          party_id: o.party.id,
          name: kisi!.name!.trim(),
          email: kisi!.email ?? null,
          phone: kisi!.phone ?? null,
          is_primary: true,
        }));
      if (kisiler.length) {
        const { error } = await this.supabase.client.from("party_contact").insert(kisiler);
        // Kartlar açıldı; kişi eklenemediyse kartları geri almak daha büyük kayıp.
        if (error) hatalar.push({ satir: 0, sebep: "yetkili kişiler eklenemedi" });
      }
    }

    return { olusan, hatalar };
  }

  async update(id: string, payload: Partial<Party>, userId?: string): Promise<Party> {
    const existing = await this.findOne(id, { baglanti: true });
    this.rolleriDogrula(payload.roles);
    this.turuDogrula(payload.partyType);
    const sosyal = this.sosyalDogrula(payload.sosyal);
    let e: Erisimler | null = null;
    if (userId) {
      e = await this.erisimler(existing, userId);
      // Boş dize "sorumluyu kaldır" demek; yalnızca yönetici yapabilir.
      const yeni = payload.ownerUserId === undefined ? undefined : payload.ownerUserId || null;
      const hata = kartDuzenlemeKarari(existing.modules, e, existing.ownerUserId, yeni, userId);
      if (hata) throw new ForbiddenException(hata);
      if (yeni && yeni !== existing.ownerUserId) await this.assertAtanabilir(this.scopeOf(existing), yeni);
      if (payload.baglanti !== undefined && !baglantiAlaniYazilir(existing.modules, e)) {
        throw new ForbiddenException("Bağlantı bilgilerini yalnızca Bağlantı ve İlişkiler modülünde yazar olanlar değiştirebilir");
      }
    } else if (payload.baglanti !== undefined && !existing.modules.includes(BAGLANTI_MODUL_KEY)) {
      throw new BadRequestException("Bu kart Bağlantı ve İlişkiler'de değil");
    }

    if (payload.taxNumber && payload.taxNumber !== existing.taxNumber) {
      const duplicates = await this.checkDuplicates(
        this.scopeOf(existing),
        { taxNumber: payload.taxNumber, excludeId: id },
        userId
      );
      if (duplicates.some((d) => d.severity === "block")) {
        throw new BadRequestException("Bu vergi numarası başka bir kayıtta kullanılıyor");
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const assign = (key: string, value: unknown) => {
      if (value !== undefined) patch[key] = value;
    };
    assign("party_type", payload.partyType);
    assign("display_name", payload.displayName?.trim());
    assign("legal_name", payload.legalName);
    assign("kurum", payload.kurum === undefined ? undefined : payload.kurum.trim().slice(0, 200) || null);
    assign("unvan", payload.unvan === undefined ? undefined : payload.unvan.trim().slice(0, 150) || null);
    assign("tax_number", payload.taxNumber);
    assign("tax_office", payload.taxOffice);
    assign("email", payload.email);
    assign("phone", payload.phone);
    assign("website", payload.website === undefined ? undefined : payload.website.trim() || null);
    assign("sosyal", sosyal);
    assign("address", payload.address);
    assign("roles", payload.roles);
    assign("status", payload.status);
    assign("source", payload.source);
    assign("owner_user_id", payload.ownerUserId === undefined ? undefined : payload.ownerUserId || null);
    assign("parent_party_id", payload.parentPartyId);
    assign("data", payload.data);
    assign("notes", payload.notes);
    assign("sonraki_arama", payload.sonrakiArama === undefined ? undefined : gunDogrula(payload.sonrakiArama));

    const { error } = await this.supabase.client.from("party").update(patch).eq("id", id);
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu vergi numarası başka bir kayıtta kullanılıyor");
      throw error;
    }
    if (payload.baglanti !== undefined) await this.baglantiYaz(id, payload.baglanti);
    const guncel = await this.findOne(id, { baglanti: true });
    return e ? this.gorunur(guncel, e) : guncel;
  }

  /** Arşivleme — silme değil. Geçmiş kayıtlardaki referanslar korunur. */
  /**
   * Listeden "Sil". `modul` verilirse ve kart başka bir defterde de duruyorsa
   * kart yalnızca O defterden çıkarılır — arşivlenmez. Eskiden her silme kartı
   * arşivliyordu: Müşteriler'den silinen tedarikçi Bağlantılar'dan da kayboldu
   * (kullanıcı şikâyeti, 2026-10-12). Kart yalnızca bu defterdeyse arşivlenir
   * (geri alınabilir, veri silinmez). Dönen değer arayüzün geri alma yolunu seçer.
   */
  async archive(id: string, userId?: string, modul?: PartyModulKey): Promise<{ sonuc: "defterdenCikti" | "arsivlendi" }> {
    const existing = await this.findOne(id);
    await this.assertKayitYazilir(existing, userId);
    if (modul && existing.modules.includes(modul) && existing.modules.length > 1) {
      if (userId && !(await this.access(this.scopeOf(existing), userId, modul)).canWrite) {
        throw new ForbiddenException("Bu kaydı değiştirme yetkin yok");
      }
      const { error } = await this.supabase.client
        .from("party")
        .update({ modules: existing.modules.filter((m) => m !== modul), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await this.logActivity(
        id,
        "sistem",
        modul === MUSTERI_MODUL_KEY ? "Müşteriler'den çıkarıldı" : modul === TEDARIK_MODUL_KEY ? "Tedarik'ten çıkarıldı" : "Bağlantı ve İlişkiler'den çıkarıldı",
        userId
      );
      return { sonuc: "defterdenCikti" };
    }
    const { error } = await this.supabase.client
      .from("party")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { sonuc: "arsivlendi" };
  }

  async restore(id: string, userId?: string): Promise<Party> {
    const existing = await this.findOne(id);
    await this.assertKayitYazilir(existing, userId);
    const { data: row, error } = await this.supabase.client
      .from("party")
      .update({ archived_at: null })
      .eq("id", id)
      .select(this.OWNER_JOIN)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapParty(row);
  }

  /**
   * Rol ekleme. Diğer modüller bunu çağırır: ilk fatura kesildiğinde
   * `customer` rolü eklenir, `lead` silinmez.
   */
  async addRoleTo(id: string, role: PartyRole, userId?: string): Promise<Party> {
    if (!isPartyRole(role)) throw new BadRequestException("Geçersiz rol");
    const existing = await this.findOne(id);
    await this.assertKayitYazilir(existing, userId);
    const next = addRole(existing.roles, role);
    if (next.length === existing.roles.length) return existing;

    const { data: row, error } = await this.supabase.client
      .from("party")
      .update({ roles: next, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(this.OWNER_JOIN)
      .maybeSingle();
    if (error) throw error;
    await this.logActivity(id, "sistem", `"${role}" rolü eklendi`, userId);
    return mapParty(row);
  }

  /**
   * Potansiyel müşteriyi müşteriye dönüştürür (anlaşma yapıldı). Yalnızca
   * Müşteriler defterindeki potansiyel kart dönüşür; kart aynı kalır — bilgi,
   * kişiler, geçmiş, dosyalar taşınmaz, yalnızca rol değişir.
   */
  async musteriyeDonustur(id: string, userId?: string): Promise<Party> {
    const existing = await this.findOne(id);
    await this.assertKayitYazilir(existing, userId);
    if (existing.archivedAt) throw new BadRequestException("Arşivdeki kart dönüştürülemez");
    if (!existing.modules.includes(MUSTERI_MODUL_KEY)) throw new BadRequestException("Kart Müşteriler listesinde değil");
    if (!potansiyelMusteriMi(existing)) throw new BadRequestException("Kart zaten müşteri");

    const { data: row, error } = await this.supabase.client
      .from("party")
      .update({ roles: musteriyeDonusenRoller(existing.roles), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(this.OWNER_JOIN)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    await this.logActivity(id, "sistem", "Potansiyel müşteriden müşteriye dönüştürüldü", userId);
    return mapParty(row);
  }

  /**
   * Yinelenen kayıtları birleştirir: alt kayıtlar hedefe taşınır, kaynak
   * silinmez, merged_into_id ile işaretlenir (geri alınabilsin diye).
   */
  async merge(sourceId: string, targetId: string, userId?: string): Promise<Party> {
    if (sourceId === targetId) throw new BadRequestException("Kayıt kendisiyle birleştirilemez");
    const source = await this.findOne(sourceId);
    const target = await this.findOne(targetId);
    if (source.mergedIntoId) throw new BadRequestException("Bu kayıt zaten birleştirilmiş");

    if (!userId) return target;
    // İki kartın da yöneticisi olmak gerekiyor: yalnızca hedefe bakılsaydı,
    // Müşteriler yöneticisi Bağlantılar'daki bir kartı kendi defterine
    // birleştirip ilişki notlarını oraya taşıyabilirdi.
    const [eKaynak, eHedef] = await Promise.all([this.erisimler(source, userId), this.erisimler(target, userId)]);
    if (!kayitYonetilir(source.modules, eKaynak) || !kayitYonetilir(target.modules, eHedef)) {
      throw new ForbiddenException("Birleştirmeyi yalnızca modül yöneticisi yapabilir");
    }
    if (source.organizationId !== target.organizationId || source.jobId !== target.jobId) {
      throw new BadRequestException("Farklı kapsamlardaki kayıtlar birleştirilemez");
    }

    await this.supabase.client.from("party_contact").update({ party_id: targetId }).eq("party_id", sourceId);
    await this.supabase.client.from("party_activity").update({ party_id: targetId }).eq("party_id", sourceId);

    // Kaynağın rolleri hedefe aktarılır: birleşen kayıt "tedarikçi" ise hedef
    // de artık tedarikçidir.
    const mergedRoles = source.roles.reduce((acc, r) => addRole(acc, r), target.roles);
    // Defterler de birleşir: Bağlantılar'daki kart müşteriyle birleşince
    // hedef iki defterde de görünür. Kaynağın bağlantı alanları, hedefte
    // yoksa ona geçer (varsa hedefinki kalır — kullanıcı onu tutmayı seçti).
    const mergedModules = Array.from(new Set([...target.modules, ...source.modules]));
    await this.supabase.client
      .from("party")
      .update({ roles: mergedRoles, modules: mergedModules, updated_at: new Date().toISOString() })
      .eq("id", targetId);
    const { data: hedefBaglanti } = await this.supabase.client
      .from("party_baglanti")
      .select("party_id")
      .eq("party_id", targetId)
      .maybeSingle();
    if (!hedefBaglanti) {
      await this.supabase.client.from("party_baglanti").update({ party_id: targetId }).eq("party_id", sourceId);
    }

    await this.supabase.client
      .from("party")
      .update({ merged_into_id: targetId, archived_at: new Date().toISOString() })
      .eq("id", sourceId);

    await this.logActivity(targetId, "sistem", `"${source.displayName}" kaydı bu kayda birleştirildi`, userId);
    return this.findOne(targetId);
  }

  // ============================================================ Defterler

  /** Modül bu kapsamda (şirketin bir departmanında ya da işte) açık mı. */
  private async modulAcik(scope: PartyScope, modul: PartyModulKey): Promise<boolean> {
    const q = scope.jobId
      ? this.supabase.client.from("job_modules").select("id", { count: "exact", head: true }).eq("job_id", scope.jobId)
      : this.supabase.client
          .from("organization_modules")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", scope.organizationId);
    const { count, error } = await q.eq("module_key", modul);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  /**
   * Kartı bir deftere daha alır: "Müşteri yap" (Bağlantılar → Müşteriler) ya
   * da "Bağlantılara ekle". Kopya açılmaz, taşınmaz — aynı kart iki listede
   * görünür. Kural: iki modülde de yazma yetkisi (bkz. deftereEklemeHatasi).
   *
   * Müşteri defterine giren karta `customer` rolü eklenir (rol eklenir,
   * silinmez: "rakip" rozeti durur). Bağlantılar'a giren kartın bağlantı
   * satırı açılır ki önem sıralamasına girsin. İlişki notu müşteri tarafına
   * HİÇBİR ŞEKİLDE geçmez; ayrı tabloda kalır.
   */
  async deftereEkle(id: string, hedef: PartyModulKey, userId: string, rol: PartyRole = "customer"): Promise<Party> {
    const existing = await this.findOne(id, { baglanti: true });
    if (existing.archivedAt) throw new BadRequestException("Arşivdeki kart başka bir deftere eklenemez");
    // Müşteriler'e geçerken ilişki notu kartın genel notuna eklenir — satış ekibi
    // görsün diye (kullanıcı kararı, 2026-10-10; bkz. aktarim.ts notaEkle).
    // Rol taşıyan defterler (Müşteriler, Tedarik); Bağlantılar'ın rolü kartta zaten.
    const rolluDefter = hedef !== BAGLANTI_MODUL_KEY;
    const yeniNot = rolluDefter ? notaEkle(existing.notes, existing.baglanti?.iliskiNotu) : undefined;
    if (existing.modules.includes(hedef)) {
      // Kart zaten o defterde (ör. müşteri), yeni rol (tedarikçi) eklenir.
      if (rolluDefter && !existing.roles.includes(rol)) await this.addRoleTo(id, rol, userId);
      if (yeniNot) {
        const { error } = await this.supabase.client
          .from("party")
          .update({ notes: yeniNot, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      }
      return this.gorunur(await this.findOne(id, { baglanti: true }), await this.erisimler(existing, userId));
    }
    const scope = this.scopeOf(existing);
    const [e, hedefErisim, acik] = await Promise.all([
      this.erisimler(existing, userId),
      this.access(scope, userId, hedef),
      this.modulAcik(scope, hedef),
    ]);
    const hata = deftereEklemeHatasi(existing.modules, e, hedef, hedefErisim, acik);
    if (hata) throw new ForbiddenException(hata);

    const patch: Record<string, unknown> = {
      modules: [...existing.modules, hedef],
      updated_at: new Date().toISOString(),
    };
    if (rolluDefter) patch.roles = addRole(existing.roles, rol);
    if (yeniNot) patch.notes = yeniNot;
    const { error } = await this.supabase.client.from("party").update(patch).eq("id", id);
    if (error) throw error;
    if (hedef === BAGLANTI_MODUL_KEY) await this.baglantiYaz(id, {});

    await this.logActivity(
      id,
      "sistem",
      hedef === MUSTERI_MODUL_KEY ? "Müşteriler'e eklendi" : hedef === TEDARIK_MODUL_KEY ? "Tedarik'e eklendi" : "Bağlantı ve İlişkiler'e eklendi",
      userId
    );
    const guncel = await this.findOne(id, { baglanti: true });
    return this.gorunur(guncel, { ...e, [hedef]: hedefErisim });
  }

  // ============================================================ Aktarım (rol → modül)

  /** Bir modülün kapsamdaki yetkisi (party defteri olmayan modüller için de). */
  private modulErisimi(scope: PartyScope, modul: string, userId: string): Promise<ModuleAccess> {
    return scope.jobId
      ? this.moduleMembers.resolveJobAccess(scope.jobId, modul, userId)
      : this.moduleMembers.resolveOrganizationAccess(scope.organizationId!, modul, userId);
  }

  /** Modül şirkette/işte açık mı (party defteri olmayan modüller için de). */
  private async modulAcikMi(scope: PartyScope, modul: string): Promise<boolean> {
    return this.modulAcik(scope, modul as PartyModulKey);
  }

  /** Bu karttan o modüle daha önce kayıt aktarılmış mı (kaynakKart). */
  private async kaynakKaydiVar(party: Party, modul: string): Promise<boolean> {
    let q = this.supabase.client
      .from("module_records")
      .select("id", { count: "exact", head: true })
      .eq("module_key", modul)
      .is("archived_at", null)
      .eq("data->>kaynakKart", party.id);
    q = party.jobId ? q.eq("job_id", party.jobId) : q.eq("organization_id", party.organizationId!);
    const { count, error } = await q;
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  /**
   * Kartın aktarım seçenekleri ve her birinin durumu — arayüz "Aktar"
   * menüsünü bundan kurar. Karar yine aktarımda verilir; bu yalnızca gösterim.
   */
  async aktarimSecenekleri(partyId: string, userId: string): Promise<PartyAktarimSecenegi[]> {
    const party = await this.findOne(partyId);
    await this.assertKayitOkunur(party, userId);
    const scope = this.scopeOf(party);
    const kartYazilir = kayitYazilir(party.modules, await this.erisimler(party, userId));
    return Promise.all(
      AKTARIM_TANIMLARI.map(async (t): Promise<PartyAktarimSecenegi> => {
        const yapildi =
          t.tur === "defter" ? defterAktarimiYapildi(party, t) : await this.kaynakKaydiVar(party, t.modul).catch(() => false);
        if (yapildi) return { hedef: t.hedef, durum: "yapildi" };
        if (!(await this.modulAcikMi(scope, t.modul))) return { hedef: t.hedef, durum: "kapali" };
        const erisim = await this.modulErisimi(scope, t.modul, userId).catch(() => null);
        if (!kartYazilir || !erisim?.canWrite) return { hedef: t.hedef, durum: "yetkisiz" };
        return { hedef: t.hedef, durum: "uygun" };
      })
    );
  }

  /** Kayıt aktarımında modülün ineceği departman: modülün açık olduğu ve kullanıcının gördüğü ilki. */
  private async kayitDepartmani(orgId: string, modul: string, userId: string): Promise<string | undefined> {
    const { data } = await this.supabase.client
      .from("organization_modules")
      .select("department_id")
      .eq("organization_id", orgId)
      .eq("module_key", modul)
      .not("department_id", "is", null);
    for (const r of (data ?? []) as any[]) {
      if ((await this.accessService.departmentAccess(r.department_id, userId).catch(() => null))?.canView) {
        return r.department_id;
      }
    }
    return undefined;
  }

  /**
   * Kartı bir role göre ilgili modüle aktarır (bkz. aktarim.ts). Kartı
   * değiştirme yetkisi + hedef modülde yazma yetkisi gerekir; ikincisini
   * modül kaydı servisi de ayrıca denetler. Aynı kart aynı modüle iki kez
   * aktarılmaz.
   */
  async aktar(partyId: string, hedef: string, userId: string): Promise<{ party: Party; kayitId?: string }> {
    const t = aktarimTanimi(hedef);
    if (!t) throw new BadRequestException("Geçersiz aktarım hedefi");
    if (t.tur === "defter") {
      return { party: await this.deftereEkle(partyId, t.modul as PartyModulKey, userId, t.rol) };
    }
    const party = await this.findOne(partyId, { baglanti: true });
    if (party.archivedAt) throw new BadRequestException("Arşivdeki kart aktarılamaz");
    await this.assertKayitYazilir(party, userId);
    if (await this.kaynakKaydiVar(party, t.modul)) throw new BadRequestException("Bu kart o modüle zaten aktarılmış");
    const scope = this.scopeOf(party);
    if (!(await this.modulAcikMi(scope, t.modul))) throw new BadRequestException("Hedef modül burada açık değil");

    const veri = aktarimKaydiVerisi(party, t.hedef);
    const kayit = party.jobId
      ? await this.moduleRecords.createForJob(party.jobId, { moduleKey: t.modul, data: veri }, userId)
      : await this.moduleRecords.create(
          party.organizationId!,
          { departmentId: await this.kayitDepartmani(party.organizationId!, t.modul, userId), moduleKey: t.modul, data: veri },
          userId
        );
    if (!party.roles.includes(t.rol)) await this.addRoleTo(partyId, t.rol, userId);
    await this.logActivity(
      partyId,
      "sistem",
      t.hedef === "rakip" ? "Rakip ve Sektör Analizi'ne aktarıldı" : "Ortaklık ve Dağıtım'a aktarıldı",
      userId,
      undefined,
      { type: "module_record", id: kayit.id }
    );
    return { party: await this.findOne(partyId, { baglanti: true }), kayitId: kayit.id };
  }

  // ============================================================ Dosyalar (kartvizit)

  /**
   * Kartın dosyalarının ineceği yer.
   *
   * İşte (serbest çalışan) işin dosya ağacı. Şirkette DEPARTMANIN klasörü:
   * şirket klasörü bütün kadroya açık, rakiplerin kartvizitleri herkesin
   * Dosyalar ekranına düşerdi. Departman verilmezse kullanıcının üyesi olduğu
   * ve modülün açık olduğu ilk departman seçilir (Lio böyle yükler).
   */
  private async dosyaDepartmani(party: Party, userId: string, departmentId?: string): Promise<string> {
    const orgId = party.organizationId!;
    if (departmentId) {
      const { data } = await this.supabase.client
        .from("departments")
        .select("organization_id")
        .eq("id", departmentId)
        .maybeSingle();
      if (data?.organization_id !== orgId) throw new BadRequestException("Departman bu kartın şirketinde değil");
      return departmentId;
    }
    const modul = party.modules.includes(BAGLANTI_MODUL_KEY)
      ? BAGLANTI_MODUL_KEY
      : party.modules.includes(MUSTERI_MODUL_KEY)
        ? MUSTERI_MODUL_KEY
        : TEDARIK_MODUL_KEY;
    const { data: acik } = await this.supabase.client
      .from("organization_modules")
      .select("department_id")
      .eq("organization_id", orgId)
      .eq("module_key", modul)
      .not("department_id", "is", null);
    for (const r of (acik ?? []) as any[]) {
      if ((await this.accessService.departmentAccess(r.department_id, userId).catch(() => null))?.canView) {
        return r.department_id;
      }
    }
    // Modül şirket geneline açılmış (department_id boş — kurulum sihirbazı ya da
    // eski kayıt): katalogdaki departmanlardan ilki, önce birincil (Satış).
    // Eskiden burada hata veriliyordu ve Lio'nun okuduğu kartvizit karta eklenemiyordu.
    const { data: katalog } = await this.supabase.client
      .from("module_catalog_departments")
      .select("department_key, is_primary, sort_order")
      .eq("module_key", modul)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });
    const anahtarlar = ((katalog ?? []) as any[]).map((k) => k.department_key as string);
    if (anahtarlar.length) {
      const { data: deps } = await this.supabase.client
        .from("departments")
        .select("id, catalog_key")
        .eq("organization_id", orgId)
        .in("catalog_key", anahtarlar)
        .is("archived_at", null);
      const sirali = ((deps ?? []) as any[]).sort((a, b) => anahtarlar.indexOf(a.catalog_key) - anahtarlar.indexOf(b.catalog_key));
      for (const d of sirali) {
        if ((await this.accessService.departmentAccess(d.id, userId).catch(() => null))?.canView) return d.id;
      }
    }
    throw new BadRequestException("Dosya eklemek için kartı modülün açık olduğu bir departmandan aç");
  }

  /** Dosya/klasör adında yol ayırıcısı ve Drive'ın sevmediği karakterler olmasın. */
  private temizAd(ad: string, yedek: string): string {
    return ad.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || yedek;
  }

  /**
   * Dosyanın adı ve klasörü. Kartvizit "Kartvizitler/<Ad> - kartvizit.jpg"
   * (Drive'da kartvizitler tek klasörde, kime ait olduğu adından okunur);
   * ek dosya özgün adıyla "Kişi dosyaları/<Ad>/" altına — teklif ya da
   * katalog adını değiştirmek kullanıcının dosyasını tanınmaz yapardı.
   */
  private dosyaYolu(party: Party, ozgunAd: string, rol: PartyDosyaRolu): { ad: string; yol: string } {
    const kisi = this.temizAd(party.displayName, "Kart");
    if (rol === "ek") {
      const ad = this.temizAd(ozgunAd, "dosya");
      return { ad, yol: `Kişi dosyaları/${kisi}/${ad}` };
    }
    const uzanti = /\.[A-Za-z0-9]{1,5}$/.exec(ozgunAd)?.[0] ?? "";
    const ad = `${kisi} - kartvizit${uzanti.toLowerCase()}`;
    return { ad, yol: `Kartvizitler/${ad}` };
  }

  /**
   * Karta dosya (kartvizit fotoğrafı ya da PDF) ekler: dosya "Kartvizitler"
   * klasörüne iner, karta file_links ile bağlanır. Kartı değiştirebilen ekler.
   */
  async dosyaEkle(
    partyId: string,
    file: Express.Multer.File,
    userId: string,
    opts: { departmentId?: string; sizeLimit?: number; rol?: PartyDosyaRolu } = {}
  ): Promise<ProjectFile> {
    if (!file) throw new BadRequestException("Dosya gönderilmedi");
    const rol = opts.rol ?? "kartvizit";
    // Kartvizit fotoğraf ya da PDF olmalı: listede kart simgesi önizleme açar.
    // Ek dosyada tür serbest (teklif, katalog, sunum).
    if (rol === "kartvizit" && !/^image\//.test(file.mimetype ?? "") && file.mimetype !== "application/pdf") {
      throw new BadRequestException("Kartvizit fotoğraf ya da PDF olmalı");
    }
    const party = await this.findOne(partyId);
    await this.assertKayitYazilir(party, userId);
    const { ad, yol } = this.dosyaYolu(party, file.originalname, rol);
    const adli = { ...file, originalname: ad } as Express.Multer.File;
    const dosya = party.jobId
      ? await this.files.uploadInline(party.jobId, userId, adli, {}, { relativePath: yol }, opts.sizeLimit)
      : await this.files.uploadInlineForFlat(
          { kind: "department", id: await this.dosyaDepartmani(party, userId, opts.departmentId) },
          userId,
          adli,
          { relativePath: yol },
          opts.sizeLimit
        );
    const { error } = await this.supabase.client
      .from("file_links")
      .insert({ file_id: dosya.id, target_kind: "party", target_id: partyId, created_by: userId, party_rol: rol });
    if (error && (error as any).code !== "23505") throw error;
    await this.logActivity(partyId, "sistem", rol === "ek" ? `Dosya eklendi: ${ad}` : "Kartvizit eklendi", userId);
    return dosya;
  }

  /**
   * Karta bağlı dosyalar. Her dosya kullanıcının dosya yetkisinden ayrıca
   * geçer (FilesService.findById): kartı görmek, dosyanın durduğu departman
   * klasörünü görmek demek değil. Erişilemeyen dosya sessizce elenir.
   */
  async dosyalar(partyId: string, userId: string): Promise<{ rol: PartyDosyaRolu; dosya: ProjectFile }[]> {
    await this.assertKayitOkunur(await this.findOne(partyId), userId);
    const { data, error } = await this.supabase.client
      .from("file_links")
      .select("file_id, party_rol")
      .eq("target_kind", "party")
      .eq("target_id", partyId)
      .not("file_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    const dosyalar = await Promise.all(
      ((data ?? []) as any[]).map((r) =>
        this.files
          .findById(r.file_id, userId)
          // Rolü boş eski bağlar (157 öncesi) kartvizitti.
          .then((x) => ({ rol: (r.party_rol === "ek" ? "ek" : "kartvizit") as PartyDosyaRolu, dosya: x.file }))
          .catch(() => null)
      )
    );
    return dosyalar.filter((d): d is { rol: PartyDosyaRolu; dosya: ProjectFile } => d !== null);
  }

  /**
   * Zaten yüklenmiş bir dosyayı karta bağlar. Lio'nun okuduğu tek fotoğrafta
   * birden fazla kartvizit olabiliyor: dosya bir kez yüklenir, her kişiye
   * bağlanır. Dosyayı GÖREBİLMEK şart — başkasının dosya kimliğiyle bağ kurulmasın.
   */
  async dosyaBagla(partyId: string, fileId: string, userId: string, rol: PartyDosyaRolu = "kartvizit"): Promise<void> {
    await this.assertKayitYazilir(await this.findOne(partyId), userId);
    await this.files.findById(fileId, userId);
    const { error } = await this.supabase.client
      .from("file_links")
      .insert({ file_id: fileId, target_kind: "party", target_id: partyId, created_by: userId, party_rol: rol });
    if (error && (error as any).code !== "23505") throw error;
  }

  /**
   * "Projelio'dan seç": karta bağlanacak dosyayı Projelio'daki klasörlerde
   * gezmek (kullanıcı isteği, 2026-10-26). Şirket kartında kök, şirketin
   * dosyaları + kişinin görebildiği departmanlar; iş kartında işin ağacı.
   *
   * Gezilecek kaynak istemciden gelir ama KARTIN şirketine ait olmak zorunda:
   * başka şirketin departman kimliği verilirse reddedilir. Klasörlerin ve
   * dosyaların görünürlüğü FilesService'in kendi kapısından geçer.
   */
  async dosyaGez(
    partyId: string,
    userId: string,
    kaynak?: string,
    folderId?: string
  ): Promise<{
    kaynaklar: { anahtar: string; ad: string }[];
    folders: { id: string; name: string }[];
    files: ProjectFile[];
    breadcrumb: { id: string; name: string }[];
  }> {
    const party = await this.findOne(partyId);
    await this.assertKayitYazilir(party, userId);
    const bos = { kaynaklar: [], folders: [], files: [], breadcrumb: [] };

    let owner: { kind: "job" | "department" | "organization"; id: string } | undefined;
    if (party.jobId) owner = { kind: "job", id: party.jobId };
    else if (kaynak) {
      const [tur, id] = kaynak.split(":");
      if (tur === "organization" && id === party.organizationId) owner = { kind: "organization", id };
      else if (tur === "department" && id) {
        const { data: dept } = await this.supabase.client.from("departments").select("organization_id").eq("id", id).maybeSingle();
        if (dept?.organization_id !== party.organizationId) throw new ForbiddenException("Bu kaynak kartın şirketine ait değil");
        owner = { kind: "department", id };
      } else throw new ForbiddenException("Bu kaynak kartın şirketine ait değil");
    }

    if (!owner) {
      // Kök: şirket + departmanlar. Görülemeyen kaynak listelenmez (her biri
      // dosya ekranının erişim kuralından geçer).
      const orgId = party.organizationId!;
      const [{ data: org }, { data: depts }] = await Promise.all([
        this.supabase.client.from("organizations").select("name").eq("id", orgId).maybeSingle(),
        this.supabase.client.from("departments").select("id, name").eq("organization_id", orgId).order("name").limit(LISTE_TAVANI),
      ]);
      const adaylar = [
        { anahtar: `organization:${orgId}`, ad: org?.name ?? "Şirket", scope: { kind: "organization" as const, id: orgId } },
        ...((depts ?? []) as any[]).map((d) => ({ anahtar: `department:${d.id}`, ad: d.name, scope: { kind: "department" as const, id: d.id } })),
      ];
      const gorulen = await Promise.all(
        adaylar.map((a) =>
          this.files
            .assertFlatAccess(a.scope, userId)
            .then(() => ({ anahtar: a.anahtar, ad: a.ad }))
            .catch(() => null)
        )
      );
      return { ...bos, kaynaklar: gorulen.filter((k): k is { anahtar: string; ad: string } => k !== null) };
    }

    const [folders, files, breadcrumb] = await Promise.all([
      this.files.listFolders(owner, userId, folderId).catch(() => []),
      owner.kind === "job"
        ? this.files.listByJob(owner.id, userId, { scope: "all", folderId, atRoot: !folderId })
        : this.files.listByFlat({ kind: owner.kind, id: owner.id }, userId, folderId),
      folderId ? this.files.folderPath(folderId, userId).catch(() => []) : Promise.resolve([]),
    ]);
    return {
      kaynaklar: [],
      folders: folders.map((f) => ({ id: f.id, name: f.name })),
      files,
      breadcrumb: breadcrumb.map((f) => ({ id: f.id, name: f.name })),
    };
  }

  /** Projelio'dan seçilen dosyaları karta ek dosya olarak bağlar; dosya yerinde kalır. */
  async dosyalariBagla(partyId: string, fileIds: unknown, userId: string): Promise<{ baglanan: number }> {
    const idler = Array.isArray(fileIds) ? [...new Set(fileIds.filter((x): x is string => typeof x === "string"))].slice(0, 50) : [];
    if (!idler.length) throw new BadRequestException("Dosya seçilmedi");
    const adlar: string[] = [];
    for (const id of idler) {
      await this.dosyaBagla(partyId, id, userId, "ek");
      const { file } = await this.files.findById(id, userId);
      adlar.push(file.name);
    }
    await this.logActivity(partyId, "sistem", `Dosya bağlandı: ${adlar.join(", ")}`, userId);
    return { baglanan: idler.length };
  }

  /** Bağı koparır; dosya klasörde kalır (silmek Dosyalar ekranının işi). */
  async dosyaKaldir(partyId: string, fileId: string, userId: string): Promise<void> {
    await this.assertKayitYazilir(await this.findOne(partyId), userId);
    const { error } = await this.supabase.client
      .from("file_links")
      .delete()
      .eq("file_id", fileId)
      .eq("target_kind", "party")
      .eq("target_id", partyId);
    if (error) throw error;
  }

  // ============================================================ Görevler

  /**
   * Karttan açılmış takip görevleri. Görev departmanın listesinde yaşar
   * (TaskFromRecordModal, source_record_id = kart); burada kullanıcının
   * GÖREBİLDİĞİ görevler süzülüp özet döner. Kartı görmek, görevin durduğu
   * departmanı görmek demek değil: Satış'tan açılan görev Yönetim'den bakana
   * ancak Satış'ı görebiliyorsa gösterilir.
   */
  async kartGorevleri(partyId: string, userId: string): Promise<PartyGorevi[]> {
    await this.assertKayitOkunur(await this.findOne(partyId), userId);
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("id, title, status, deadline, department_id, project_id, archived_at, assigned_user:users!tasks_assigned_to_fkey(full_name)")
      .eq("source_record_id", partyId)
      .in("source_module_key", PARTY_MODUL_KEYS as string[])
      .is("archived_at", null)
      .order("deadline", { ascending: true })
      .limit(50);
    if (error) throw error;

    const gorur = new Map<string, boolean>();
    const bak = async (anahtar: string, fn: () => Promise<boolean>) => {
      if (!gorur.has(anahtar)) gorur.set(anahtar, await fn().catch(() => false));
      return gorur.get(anahtar)!;
    };
    const sonuc: PartyGorevi[] = [];
    for (const r of (data ?? []) as any[]) {
      const gorunur = r.department_id
        ? await bak(`d:${r.department_id}`, async () => (await this.accessService.departmentAccess(r.department_id, userId)).canView)
        : r.project_id
          ? await bak(`p:${r.project_id}`, () => this.accessService.canViewProject(r.project_id, userId))
          : false;
      if (!gorunur) continue;
      sonuc.push({
        id: r.id,
        title: r.title,
        status: r.status,
        deadline: r.deadline ?? undefined,
        departmentId: r.department_id ?? undefined,
        projectId: r.project_id ?? undefined,
        assignedToName: r.assigned_user?.full_name ?? undefined,
      });
    }
    return sonuc;
  }

  // ============================================================ Kişiler

  async findContacts(partyId: string, userId?: string): Promise<PartyContact[]> {
    await this.assertKayitOkunur(await this.findOne(partyId), userId);
    const { data, error } = await this.supabase.client
      .from("party_contact")
      .select("*")
      .eq("party_id", partyId)
      .is("archived_at", null)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapContact);
  }

  async addContact(partyId: string, payload: Partial<PartyContact>, userId?: string): Promise<PartyContact> {
    if (!payload.name?.trim()) throw new BadRequestException("Kişi adı gerekli");
    const party = await this.findOne(partyId);
    await this.assertKayitYazilir(party, userId);

    // Birincil muhatap tektir; yenisi işaretlenirse eskisi düşer.
    if (payload.isPrimary) {
      await this.supabase.client
        .from("party_contact")
        .update({ is_primary: false })
        .eq("party_id", partyId)
        .is("archived_at", null);
    }

    const { data: row, error } = await this.supabase.client
      .from("party_contact")
      .insert({
        party_id: partyId,
        name: payload.name.trim(),
        title: payload.title ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        is_primary: payload.isPrimary ?? false,
        notes: payload.notes ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapContact(row);
  }

  /**
   * Kişiyi günceller (unvan, telefon, e-posta). Şirket/kurum kartının altındaki
   * kişiler formdan topluca düzenleniyor; eskiden yalnızca ekle/çıkar vardı
   * ve unvan değişince kişiyi silip yeniden eklemek gerekiyordu.
   */
  async updateContact(contactId: string, payload: Partial<PartyContact>, userId?: string): Promise<PartyContact> {
    const { data: contact } = await this.supabase.client
      .from("party_contact")
      .select("party_id")
      .eq("id", contactId)
      .is("archived_at", null)
      .maybeSingle();
    if (!contact) throw new NotFoundException("Kişi bulunamadı");
    await this.assertKayitYazilir(await this.findOne(contact.party_id), userId);
    if (payload.name !== undefined && !payload.name.trim()) throw new BadRequestException("Kişi adı gerekli");

    if (payload.isPrimary) {
      await this.supabase.client
        .from("party_contact")
        .update({ is_primary: false })
        .eq("party_id", contact.party_id)
        .neq("id", contactId)
        .is("archived_at", null);
    }
    const patch: Record<string, unknown> = {};
    const metin = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    if (payload.name !== undefined) patch.name = payload.name.trim();
    if (payload.title !== undefined) patch.title = metin(payload.title);
    if (payload.email !== undefined) patch.email = metin(payload.email);
    if (payload.phone !== undefined) patch.phone = metin(payload.phone);
    if (payload.notes !== undefined) patch.notes = metin(payload.notes);
    if (payload.isPrimary !== undefined) patch.is_primary = payload.isPrimary;
    const { data: row, error } = await this.supabase.client
      .from("party_contact")
      .update(patch)
      .eq("id", contactId)
      .select("*")
      .single();
    if (error) throw error;
    return mapContact(row);
  }

  async removeContact(contactId: string, userId?: string): Promise<void> {
    const { data: contact } = await this.supabase.client
      .from("party_contact")
      .select("party_id")
      .eq("id", contactId)
      .maybeSingle();
    if (!contact) throw new NotFoundException("Kişi bulunamadı");
    const party = await this.findOne(contact.party_id);
    await this.assertKayitYazilir(party, userId);

    const { error } = await this.supabase.client
      .from("party_contact")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", contactId);
    if (error) throw error;
  }

  // ============================================================ Aktivite

  async findActivities(partyId: string, userId?: string): Promise<PartyActivity[]> {
    await this.assertKayitOkunur(await this.findOne(partyId), userId);
    const { data, error } = await this.supabase.client
      .from("party_activity")
      .select("*, users!party_activity_user_id_fkey(full_name)")
      .eq("party_id", partyId)
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map(mapActivity);
  }

  /**
   * Görüşme notu. Yazan ve tarih SUNUCUDA damgalanır — istemcinin gönderdiği
   * occurredAt yalnızca geçmişe dönük girilen bir görüşme için (gelecek tarih
   * kabul edilmez). `sistem` türü istemciden yazılamaz: "Kayıt oluşturuldu"
   * gibi otomatik satırlarla elle yazılan not karışmasın.
   *
   * `sonrakiArama` verilirse kartın tekrar arama günü de aynı istekte yazılır
   * (null = planı kaldır): arama sonrası not + "3 gün sonra tekrar ara" tek adım.
   */
  async addActivity(
    partyId: string,
    payload: Partial<PartyActivity> & { sonrakiArama?: string | null },
    userId?: string
  ): Promise<PartyActivity> {
    const type = (payload.type ?? "not") as PartyActivityType;
    if (!(GORUSME_TURLERI as readonly string[]).includes(type)) throw new BadRequestException("Geçersiz not türü");
    const summary = (payload.summary ?? "").trim().slice(0, 4000);
    // "Ulaşılamadı" tek tıkla girilebilsin: açıklamasız da anlamlı.
    if (!summary && type !== "ulasilamadi") throw new BadRequestException("Açıklama gerekli");
    let occurredAt: string | undefined;
    if (payload.occurredAt) {
      const t = Date.parse(payload.occurredAt);
      if (Number.isNaN(t)) throw new BadRequestException("Geçersiz tarih");
      occurredAt = new Date(Math.min(t, Date.now())).toISOString();
    }
    const party = await this.findOne(partyId);
    await this.assertKayitYazilir(party, userId);
    const not = await this.logActivity(partyId, type, summary, userId, occurredAt);
    if (payload.sonrakiArama !== undefined) {
      const { error } = await this.supabase.client
        .from("party")
        .update({ sonraki_arama: gunDogrula(payload.sonrakiArama), updated_at: new Date().toISOString() })
        .eq("id", partyId);
      if (error) throw error;
    }
    return not;
  }

  /**
   * Görüşme notunu düzeltme / silme: yalnızca YAZANI yapabilir. Kartı
   * yönetenin bile başkasının notunu değiştirmesi, notun altındaki adı yalan
   * söyletirdi. Sistem satırları ve başka modüllerin yazdığı satırlar
   * (fatura kesildi…) dokunulmaz.
   */
  private async kendiNotu(activityId: string, userId: string): Promise<any> {
    const { data: row, error } = await this.supabase.client
      .from("party_activity")
      .select("*")
      .eq("id", activityId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Not bulunamadı");
    if (row.type === "sistem" || row.related_type) throw new BadRequestException("Bu kayıt otomatik oluşturuldu, değiştirilemez");
    if (row.user_id !== userId) throw new ForbiddenException("Yalnızca kendi notunu değiştirebilirsin");
    await this.assertKayitYazilir(await this.findOne(row.party_id), userId);
    return row;
  }

  async updateActivity(
    activityId: string,
    payload: { summary?: string; type?: PartyActivityType },
    userId: string
  ): Promise<PartyActivity> {
    const row = await this.kendiNotu(activityId, userId);
    const patch: Record<string, unknown> = {};
    if (payload.type !== undefined) {
      if (!(GORUSME_TURLERI as readonly string[]).includes(payload.type)) throw new BadRequestException("Geçersiz not türü");
      patch.type = payload.type;
    }
    if (payload.summary !== undefined) patch.summary = payload.summary.trim().slice(0, 4000);
    const tur = (patch.type ?? row.type) as PartyActivityType;
    const metin = (patch.summary ?? row.summary) as string;
    if (!metin && tur !== "ulasilamadi") throw new BadRequestException("Açıklama gerekli");
    const { data, error } = await this.supabase.client
      .from("party_activity")
      .update(patch)
      .eq("id", activityId)
      .select("*")
      .single();
    if (error) throw error;
    return mapActivity(data);
  }

  async deleteActivity(activityId: string, userId: string): Promise<void> {
    await this.kendiNotu(activityId, userId);
    const { error } = await this.supabase.client.from("party_activity").delete().eq("id", activityId);
    if (error) throw error;
  }

  /**
   * Aktivite kaydı. Diğer servisler de bunu çağırabilir (fatura kesildi,
   * destek talebi açıldı) — "sistem" türü kullanıcı girişi olmadığını belirtir.
   */
  async logActivity(
    partyId: string,
    type: PartyActivityType,
    summary: string,
    userId?: string,
    occurredAt?: string,
    related?: { type: string; id: string }
  ): Promise<PartyActivity> {
    const { data: row, error } = await this.supabase.client
      .from("party_activity")
      .insert({
        party_id: partyId,
        type,
        summary,
        user_id: userId ?? null,
        occurred_at: occurredAt ?? new Date().toISOString(),
        related_type: related?.type ?? null,
        related_id: related?.id ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapActivity(row);
  }
}

/** YYYY-AA-GG günü ya da boş (null = planı kaldır). */
function gunDogrula(v: string | null | undefined): string | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new BadRequestException("Geçersiz tarih");
  }
  return v;
}
