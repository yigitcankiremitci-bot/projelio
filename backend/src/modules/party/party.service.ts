import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  BAGLANTI_MODUL_KEY,
  BAGLANTI_ONEMLERI,
  KARTVIZIT_SOSYAL,
  kartvizitSosyalNormallestir,
  MUSTERI_MODUL_KEY,
  PARTY_MODUL_KEYS,
  isPartyRole,
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
  type PartyGorevi,
  type PartyModulKey,
  type PartyRole,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ModuleMembersService } from "../module-members/module-members.service";
import { AccessService } from "../../common/access/access.service";
import { FilesService, type ProjectFile } from "../files/files.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { musteriYetkisi } from "./siparis-erisim";
import { addRole, findDuplicates } from "./party-dedup";
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
    private files: FilesService
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
    return {
      yonetici,
      kartYazar: a.canWrite,
      musteriler: yonetici ? hepsi : hepsi.filter((p) => musteriYetkisi(a, p.ownerUserId, userId).okur),
    };
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
    await this.dosyaOzetleriniEkle(baglantilar);
    return { yonetici: a.canManageTeam, kartYazar: a.canWrite, baglantilar };
  }

  /**
   * Listedeki kartlara dosya sayısı ve en son dosyanın kimliği (kartvizit
   * simgesi). Kart kimlikleri 150'lik parçalarla sorgulanıyor: yüzlerce
   * kimlik tek `in` filtresinde istek adresini taşırırdı.
   */
  private async dosyaOzetleriniEkle(kartlar: Party[]): Promise<void> {
    const kimlik = new Map(kartlar.map((p) => [p.id, p]));
    const ids = [...kimlik.keys()];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await this.supabase.client
        .from("file_links")
        .select("target_id, file_id")
        .eq("target_kind", "party")
        .in("target_id", ids.slice(i, i + 150))
        .not("file_id", "is", null)
        .order("created_at", { ascending: false });
      // Simge bir kolaylık: okunamazsa liste yine açılsın.
      if (error) return;
      for (const r of (data ?? []) as any[]) {
        const p = kimlik.get(r.target_id);
        if (!p) continue;
        p.dosyaSayisi = (p.dosyaSayisi ?? 0) + 1;
        p.sonDosyaId ??= r.file_id;
      }
    }
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
    } = {}
  ): Promise<MusteriIceAktarmaSonucu> {
    const modul = opts.modul ?? MODULE_KEY;
    await this.assertCanWrite(scope, userId, modul);
    const plan = planMusteriImport(sheet, { ...opts, tur: modul === BAGLANTI_MODUL_KEY ? "baglanti" : "musteri" });
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
    return { ...sonuc, acilan: olusan.length, hatalar };
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
  async archive(id: string, userId?: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.assertKayitYazilir(existing, userId);
    const { error } = await this.supabase.client
      .from("party")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
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
  async deftereEkle(id: string, hedef: PartyModulKey, userId: string): Promise<Party> {
    const existing = await this.findOne(id, { baglanti: true });
    if (existing.archivedAt) throw new BadRequestException("Arşivdeki kart başka bir deftere eklenemez");
    if (existing.modules.includes(hedef)) {
      return this.gorunur(existing, await this.erisimler(existing, userId));
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
    if (hedef === MUSTERI_MODUL_KEY) patch.roles = addRole(existing.roles, "customer");
    const { error } = await this.supabase.client.from("party").update(patch).eq("id", id);
    if (error) throw error;
    if (hedef === BAGLANTI_MODUL_KEY) await this.baglantiYaz(id, {});

    await this.logActivity(
      id,
      "sistem",
      hedef === MUSTERI_MODUL_KEY ? "Müşteriler'e eklendi" : "Bağlantı ve İlişkiler'e eklendi",
      userId
    );
    const guncel = await this.findOne(id, { baglanti: true });
    return this.gorunur(guncel, { ...e, [hedef]: hedefErisim });
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
    const modul = party.modules.includes(BAGLANTI_MODUL_KEY) ? BAGLANTI_MODUL_KEY : MUSTERI_MODUL_KEY;
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
    throw new BadRequestException("Dosya eklemek için kartı modülün açık olduğu bir departmandan aç");
  }

  /** Dosya adında yol ayırıcısı ve Drive'ın sevmediği karakterler olmasın. */
  private dosyaAdi(party: Party, ozgunAd: string): string {
    const uzanti = /\.[A-Za-z0-9]{1,5}$/.exec(ozgunAd)?.[0] ?? "";
    const ad = party.displayName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Kartvizit";
    return `${ad} - kartvizit${uzanti.toLowerCase()}`;
  }

  /**
   * Karta dosya (kartvizit fotoğrafı ya da PDF) ekler: dosya "Kartvizitler"
   * klasörüne iner, karta file_links ile bağlanır. Kartı değiştirebilen ekler.
   */
  async dosyaEkle(
    partyId: string,
    file: Express.Multer.File,
    userId: string,
    opts: { departmentId?: string; sizeLimit?: number } = {}
  ): Promise<ProjectFile> {
    if (!file) throw new BadRequestException("Dosya gönderilmedi");
    // Kartvizit: fotoğraf ya da PDF. Kartın altına herhangi bir dosya
    // iliştirmek Dosyalar ekranının işi (orada önizleme, sürüm, paylaşım var).
    if (!/^image\//.test(file.mimetype ?? "") && file.mimetype !== "application/pdf") {
      throw new BadRequestException("Kartvizit fotoğraf ya da PDF olmalı");
    }
    const party = await this.findOne(partyId);
    await this.assertKayitYazilir(party, userId);
    const adli = { ...file, originalname: this.dosyaAdi(party, file.originalname) } as Express.Multer.File;
    const yol = `Kartvizitler/${adli.originalname}`;
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
      .insert({ file_id: dosya.id, target_kind: "party", target_id: partyId, created_by: userId });
    if (error && (error as any).code !== "23505") throw error;
    await this.logActivity(partyId, "sistem", "Kartvizit eklendi", userId);
    return dosya;
  }

  /**
   * Karta bağlı dosyalar. Her dosya kullanıcının dosya yetkisinden ayrıca
   * geçer (FilesService.findById): kartı görmek, dosyanın durduğu departman
   * klasörünü görmek demek değil. Erişilemeyen dosya sessizce elenir.
   */
  async dosyalar(partyId: string, userId: string): Promise<ProjectFile[]> {
    await this.assertKayitOkunur(await this.findOne(partyId), userId);
    const { data, error } = await this.supabase.client
      .from("file_links")
      .select("file_id")
      .eq("target_kind", "party")
      .eq("target_id", partyId)
      .not("file_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    const dosyalar = await Promise.all(
      ((data ?? []) as any[]).map((r) => this.files.findById(r.file_id, userId).then((x) => x.file).catch(() => null))
    );
    return dosyalar.filter((d): d is ProjectFile => d !== null);
  }

  /**
   * Zaten yüklenmiş bir dosyayı karta bağlar. Lio'nun okuduğu tek fotoğrafta
   * birden fazla kartvizit olabiliyor: dosya bir kez yüklenir, her kişiye
   * bağlanır. Dosyayı GÖREBİLMEK şart — başkasının dosya kimliğiyle bağ kurulmasın.
   */
  async dosyaBagla(partyId: string, fileId: string, userId: string): Promise<void> {
    await this.assertKayitYazilir(await this.findOne(partyId), userId);
    await this.files.findById(fileId, userId);
    const { error } = await this.supabase.client
      .from("file_links")
      .insert({ file_id: fileId, target_kind: "party", target_id: partyId, created_by: userId });
    if (error && (error as any).code !== "23505") throw error;
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

  async addActivity(partyId: string, payload: Partial<PartyActivity>, userId?: string): Promise<PartyActivity> {
    if (!payload.summary?.trim()) throw new BadRequestException("Açıklama gerekli");
    const party = await this.findOne(partyId);
    await this.assertKayitYazilir(party, userId);
    return this.logActivity(
      partyId,
      (payload.type as PartyActivityType) ?? "not",
      payload.summary.trim(),
      userId,
      payload.occurredAt
    );
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
