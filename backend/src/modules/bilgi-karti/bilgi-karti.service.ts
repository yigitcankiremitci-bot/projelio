import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BilgiKarti,
  BilgiKartiAlani,
  BilgiKartiBelgesi,
  BilgiKartiBelgeTuru,
  BilgiKartiKapsami,
  BilgiKartiSayfasi,
  BilgiKartiYetkisi,
} from "@projelio/shared";
import { BILGI_KARTI_BELGE_TURLERI, bilgiKartiKapsamiMi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccessService } from "../../common/access/access.service";
import { bilgiKartiYetkisiKarari } from "./bilgi-karti-erisim";
import { BilgiKartiOzetService } from "./bilgi-karti-ozet.service";

/**
 * Künyenin arayüz adı ↔ veritabanı sütunu eşlemesi.
 *
 * TEK YERDE: okuma (mapKart) ve yazma (guncelle) aynı listeden geçiyor. İki
 * ayrı yerde yazılsaydı, eklenen her yeni alan ikisinden birinde unutulur ve
 * "kaydettim ama geri gelmiyor" hatası çıkardı — kullanıcı için en can sıkıcı
 * hata türü, çünkü verinin gittiğini sanıyor.
 */
const KUNYE_ALANLARI: Record<string, string> = {
  legalName: "legal_name",
  brandName: "brand_name",
  sector: "sector",
  foundedOn: "founded_on",
  employeeCount: "employee_count",
  about: "about",
  taxOffice: "tax_office",
  taxNumber: "tax_number",
  tradeRegistryNo: "trade_registry_no",
  mersisNo: "mersis_no",
  naceCode: "nace_code",
  sgkNo: "sgk_no",
  kepAddress: "kep_address",
  phone: "phone",
  email: "email",
  website: "website",
  address: "address",
  district: "district",
  city: "city",
  country: "country",
  postalCode: "postal_code",
  bankName: "bank_name",
  iban: "iban",
  notes: "notes",
};

/** Sayı olarak saklanan tek künye alanı; gerisi metin (bkz. migration 107). */
const SAYISAL_ALANLAR = new Set(["employeeCount"]);
/** Tarih alanları: boş metin `null` olmalı, yoksa Postgres 22007 ile reddediyor. */
const TARIH_ALANLARI = new Set(["foundedOn"]);

/**
 * Belge dosyası için gömülü alan — FK ADI AÇIKÇA yazılıyor.
 *
 * `files` tablosuna tek FK var ama açık yazmak, ileride ikinci bir FK
 * eklendiğinde PostgREST'in PGRST201 ile 500 dönmesini engelliyor
 * (bkz. budget/butce-erisim.service.ts'teki aynı tuzak, orada yaşandı).
 */
const BELGE_DOSYA = "files!info_card_documents_file_id_fkey(name, mime_type, web_view_link)";

@Injectable()
export class BilgiKartiService {
  constructor(
    private supabase: SupabaseService,
    private access: AccessService,
    private ozet: BilgiKartiOzetService
  ) {}

  kapsamDogrula(scopeType: string): BilgiKartiKapsami {
    if (!bilgiKartiKapsamiMi(scopeType)) throw new NotFoundException("Tanınmayan bilgi kartı kapsamı");
    return scopeType;
  }

  // ---------------------------------------------------------------- Yetki

  /**
   * İsteyenin karttaki yetkisi. Gerçekler burada toplanır, KARAR saf
   * fonksiyonda verilir (bkz. bilgi-karti-erisim.ts).
   *
   * userId boşsa (sunucu içi çağrı) tam yetki döner — aynı desen bütçede de var.
   */
  async yetki(scopeType: BilgiKartiKapsami, scopeId: string, userId?: string): Promise<BilgiKartiYetkisi> {
    if (!userId) return { canView: true, canEdit: true };

    const [sahiplik, canViewScope, isSubcontractor] = await Promise.all([
      this.sahiplikGercekleri(scopeType, scopeId, userId),
      scopeType === "organization"
        ? this.access.canViewOrganization(scopeId, userId)
        : this.access.canViewJob(scopeId, userId),
      this.access.isSubcontractor(userId),
    ]);

    return bilgiKartiYetkisiKarari({
      scopeType,
      isOwner: sahiplik.isOwner,
      isYonetimManager: sahiplik.isYonetimManager,
      canViewScope,
      isSubcontractor,
    });
  }

  /**
   * Kim sahip, kim Yönetim yöneticisi.
   *
   * ÜST KADEME AŞAĞIYI YÖNETİR (bkz. ButceErisimService'teki aynı zincir):
   * holding sahibi şirketin, şirket sahibi altındaki işin künyesini
   * düzenleyebilir. Serbest çalışanın işi hiçbir şirkete bağlı değilse zincir
   * kendisinde bitiyor.
   */
  private async sahiplikGercekleri(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    userId: string
  ): Promise<{ isOwner: boolean; isYonetimManager: boolean }> {
    if (scopeType === "organization") {
      const { data: org } = await this.supabase.client
        .from("organizations")
        .select("owner_id, group_id")
        .eq("id", scopeId)
        .maybeSingle();
      if (!org) throw new NotFoundException("Organizasyon bulunamadı");
      if (org.owner_id === userId) return { isOwner: true, isYonetimManager: false };
      if (await this.grupSahibiMi(org.group_id, userId)) return { isOwner: true, isYonetimManager: false };
      return { isOwner: false, isYonetimManager: await this.yonetimYoneticisiMi(scopeId, userId) };
    }

    const { data: job } = await this.supabase.client
      .from("jobs")
      .select("owner_id, organization_id, group_id")
      .eq("id", scopeId)
      .maybeSingle();
    if (!job) throw new NotFoundException("İş bulunamadı");
    if (job.owner_id === userId) return { isOwner: true, isYonetimManager: false };
    if (await this.organizasyonSahibiMi(job.organization_id, userId)) return { isOwner: true, isYonetimManager: false };
    if (await this.grupSahibiMi(job.group_id, userId)) return { isOwner: true, isYonetimManager: false };
    // İş bir şirkete bağlıysa o şirketin Yönetim'i işin künyesini de düzenler.
    const isYonetimManager = job.organization_id
      ? await this.yonetimYoneticisiMi(job.organization_id, userId)
      : false;
    return { isOwner: false, isYonetimManager };
  }

  /**
   * Şirketin YÖNETİM departmanının onaylı yöneticisi mi.
   *
   * Departman `catalog_key` ile bulunuyor, adıyla değil: kullanıcı departmanın
   * adını "Genel Müdürlük" diye değiştirebiliyor ve isimle arayan bir kural o
   * gün sessizce kapanırdı (bkz. migration 024, departments.catalog_key).
   */
  private async yonetimYoneticisiMi(organizationId: string, userId: string): Promise<boolean> {
    const { data: depts } = await this.supabase.client
      .from("departments")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("catalog_key", "yonetim")
      .is("archived_at", null);
    const ids = (depts ?? []).map((d: any) => d.id);
    if (ids.length === 0) return false;

    const { data: rows } = await this.supabase.client
      .from("department_members")
      .select("id")
      .in("department_id", ids)
      .eq("user_id", userId)
      .eq("role", "manager")
      .eq("status", "approved")
      .limit(1);
    return (rows ?? []).length > 0;
  }

  private async organizasyonSahibiMi(organizationId: string | null | undefined, userId: string): Promise<boolean> {
    if (!organizationId) return false;
    const { data } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    return data?.owner_id === userId;
  }

  private async grupSahibiMi(groupId: string | null | undefined, userId: string): Promise<boolean> {
    if (!groupId) return false;
    const { data } = await this.supabase.client.from("groups").select("owner_id").eq("id", groupId).maybeSingle();
    return data?.owner_id === userId;
  }

  private async assertCanView(scopeType: BilgiKartiKapsami, scopeId: string, userId?: string): Promise<BilgiKartiYetkisi> {
    const yetki = await this.yetki(scopeType, scopeId, userId);
    if (!yetki.canView) throw new ForbiddenException("Bu bilgi kartını görüntüleme yetkiniz yok");
    return yetki;
  }

  private async assertCanEdit(scopeType: BilgiKartiKapsami, scopeId: string, userId?: string): Promise<void> {
    const yetki = await this.yetki(scopeType, scopeId, userId);
    if (!yetki.canEdit) {
      throw new ForbiddenException("Bilgi kartını yalnızca sahibi ve Yönetim departmanının yöneticisi düzenleyebilir");
    }
  }

  // ----------------------------------------------------------- Sayfa (okuma)

  /**
   * Kartın tüm verisi tek istekte: künye, ek alanlar, belgeler, özet ve yetki.
   *
   * Kart HENÜZ YOKSA satır OLUŞTURULMAZ; boş kart dönülür. Yalnızca açıp
   * kapatan bir kullanıcı yüzünden her şirkete boş satır yazmak, "kartı olan
   * şirketler" sorusunu cevapsız bırakırdı.
   */
  async sayfa(scopeType: BilgiKartiKapsami, scopeId: string, userId?: string): Promise<BilgiKartiSayfasi> {
    const yetki = await this.assertCanView(scopeType, scopeId, userId);
    const kapsam = await this.kapsamBilgisi(scopeType, scopeId);
    const kartRow = await this.kartRow(scopeType, scopeId);

    const [alanlar, belgeler, ozet] = await Promise.all([
      kartRow ? this.alanlar(kartRow.id) : Promise.resolve([]),
      kartRow ? this.belgeler(kartRow.id) : Promise.resolve([]),
      this.ozet.ozet(scopeType, scopeId, userId),
    ]);

    return {
      scopeType,
      scopeId,
      scopeName: kapsam.name,
      coverImageUrl: kapsam.coverImageUrl,
      kart: kartRow ? mapKart(kartRow, scopeType, scopeId) : null,
      alanlar,
      belgeler,
      ozet,
      yetki,
    };
  }

  private async kapsamBilgisi(
    scopeType: BilgiKartiKapsami,
    scopeId: string
  ): Promise<{ name: string; coverImageUrl?: string }> {
    if (scopeType === "organization") {
      const { data } = await this.supabase.client
        .from("organizations")
        .select("name, cover_image_url")
        .eq("id", scopeId)
        .maybeSingle();
      if (!data) throw new NotFoundException("Organizasyon bulunamadı");
      return { name: data.name, coverImageUrl: data.cover_image_url ?? undefined };
    }
    const { data } = await this.supabase.client
      .from("jobs")
      .select("title, cover_image_url")
      .eq("id", scopeId)
      .maybeSingle();
    if (!data) throw new NotFoundException("İş bulunamadı");
    return { name: data.title, coverImageUrl: data.cover_image_url ?? undefined };
  }

  private async kartRow(scopeType: BilgiKartiKapsami, scopeId: string) {
    const kolon = scopeType === "organization" ? "organization_id" : "job_id";
    const { data, error } = await this.supabase.client
      .from("info_cards")
      .select("*, users(full_name)")
      .eq(kolon, scopeId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Kart satırını bulur, yoksa boş olarak açar. Yalnızca YAZMA yolunda çağrılır. */
  private async kartRowOlustur(scopeType: BilgiKartiKapsami, scopeId: string, userId?: string) {
    const mevcut = await this.kartRow(scopeType, scopeId);
    if (mevcut) return mevcut;

    const kolon = scopeType === "organization" ? "organization_id" : "job_id";
    const { data, error } = await this.supabase.client
      .from("info_cards")
      .insert({ [kolon]: scopeId, updated_by: userId ?? null })
      .select("*, users(full_name)")
      .single();
    if (error) throw error;
    return data;
  }

  private async alanlar(cardId: string): Promise<BilgiKartiAlani[]> {
    const { data, error } = await this.supabase.client
      .from("info_card_fields")
      .select("*")
      .eq("card_id", cardId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapAlan);
  }

  private async belgeler(cardId: string): Promise<BilgiKartiBelgesi[]> {
    const { data, error } = await this.supabase.client
      .from("info_card_documents")
      .select(`*, ${BELGE_DOSYA}, users(full_name)`)
      .eq("card_id", cardId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapBelge);
  }

  // ----------------------------------------------------------- Künye (yazma)

  async guncelle(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    body: Record<string, unknown>,
    userId?: string
  ): Promise<BilgiKarti> {
    await this.assertCanEdit(scopeType, scopeId, userId);
    const kart = await this.kartRowOlustur(scopeType, scopeId, userId);

    const guncelleme: Record<string, unknown> = { updated_by: userId ?? null, updated_at: new Date().toISOString() };
    for (const [alan, kolon] of Object.entries(KUNYE_ALANLARI)) {
      if (!(alan in body)) continue;
      guncelleme[kolon] = temizle(alan, body[alan]);
    }

    const { data, error } = await this.supabase.client
      .from("info_cards")
      .update(guncelleme)
      .eq("id", kart.id)
      .select("*, users(full_name)")
      .single();
    if (error) throw error;
    return mapKart(data, scopeType, scopeId);
  }

  // ------------------------------------------------------------- Ek alanlar

  async alanEkle(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    body: { label?: string; value?: string },
    userId?: string
  ): Promise<BilgiKartiAlani> {
    await this.assertCanEdit(scopeType, scopeId, userId);
    const label = (body.label ?? "").trim();
    if (!label) throw new BadRequestException("Alan adı boş olamaz");

    const kart = await this.kartRowOlustur(scopeType, scopeId, userId);
    // Yeni alan listenin SONUNA: kullanıcı eklediğini en altta arıyor.
    const { data: sonuncu } = await this.supabase.client
      .from("info_card_fields")
      .select("sort_order")
      .eq("card_id", kart.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await this.supabase.client
      .from("info_card_fields")
      .insert({
        card_id: kart.id,
        label,
        value: (body.value ?? "").trim() || null,
        sort_order: ((sonuncu?.sort_order as number | undefined) ?? 0) + 10,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAlan(data);
  }

  async alanGuncelle(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    alanId: string,
    body: { label?: string; value?: string },
    userId?: string
  ): Promise<BilgiKartiAlani> {
    await this.assertCanEdit(scopeType, scopeId, userId);
    const kart = await this.kartSahipligiDogrula(scopeType, scopeId, "info_card_fields", alanId);

    const guncelleme: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.label !== undefined) {
      const label = body.label.trim();
      if (!label) throw new BadRequestException("Alan adı boş olamaz");
      guncelleme.label = label;
    }
    if (body.value !== undefined) guncelleme.value = body.value.trim() || null;

    const { data, error } = await this.supabase.client
      .from("info_card_fields")
      .update(guncelleme)
      .eq("id", alanId)
      .eq("card_id", kart.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapAlan(data);
  }

  async alanSil(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    alanId: string,
    userId?: string
  ): Promise<{ success: true }> {
    await this.assertCanEdit(scopeType, scopeId, userId);
    const kart = await this.kartSahipligiDogrula(scopeType, scopeId, "info_card_fields", alanId);
    const { error } = await this.supabase.client
      .from("info_card_fields")
      .delete()
      .eq("id", alanId)
      .eq("card_id", kart.id);
    if (error) throw error;
    return { success: true };
  }

  // --------------------------------------------------------------- Belgeler

  /**
   * Belge ekler: ya Projelio'daki bir dosya (fileId) ya da dış bağlantı (url).
   *
   * DOSYANIN KAPSAMI DOĞRULANIYOR: istemciden gelen `fileId` bir kimliktir,
   * yetki değil. Doğrulanmasaydı, kartı düzenleyebilen biri başka bir şirketin
   * dosya kimliğini yazarak o dosyanın adını ve bulut adresini kendi kartında
   * görebilirdi.
   */
  async belgeEkle(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    body: Record<string, any>,
    userId?: string
  ): Promise<BilgiKartiBelgesi> {
    await this.assertCanEdit(scopeType, scopeId, userId);

    const fileId = (body.fileId as string | undefined) || undefined;
    const externalUrl = ((body.externalUrl as string | undefined) ?? "").trim() || undefined;
    if (!fileId && !externalUrl) throw new BadRequestException("Belge için dosya ya da bağlantı gerekiyor");
    if (fileId && externalUrl) throw new BadRequestException("Belgenin kaynağı ya dosya ya bağlantı olabilir, ikisi birden değil");

    let fileRow: any = null;
    if (fileId) {
      fileRow = await this.dosyayiDogrula(fileId, userId);
    }

    const kart = await this.kartRowOlustur(scopeType, scopeId, userId);
    const docType = belgeTuru(body.docType);
    const title = ((body.title as string | undefined) ?? "").trim() || fileRow?.name || "Belge";

    const { data, error } = await this.supabase.client
      .from("info_card_documents")
      .insert({
        card_id: kart.id,
        doc_type: docType,
        title,
        file_id: fileId ?? null,
        external_url: externalUrl ?? null,
        issued_on: tarihDegeri(body.issuedOn),
        valid_until: tarihDegeri(body.validUntil),
        note: ((body.note as string | undefined) ?? "").trim() || null,
        created_by: userId ?? null,
      })
      .select(`*, ${BELGE_DOSYA}, users(full_name)`)
      .single();
    if (error) throw error;
    return mapBelge(data);
  }

  async belgeGuncelle(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    belgeId: string,
    body: Record<string, any>,
    userId?: string
  ): Promise<BilgiKartiBelgesi> {
    await this.assertCanEdit(scopeType, scopeId, userId);
    const kart = await this.kartSahipligiDogrula(scopeType, scopeId, "info_card_documents", belgeId);

    const guncelleme: Record<string, unknown> = {};
    if (body.docType !== undefined) guncelleme.doc_type = belgeTuru(body.docType);
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) throw new BadRequestException("Belge adı boş olamaz");
      guncelleme.title = title;
    }
    if (body.issuedOn !== undefined) guncelleme.issued_on = tarihDegeri(body.issuedOn);
    if (body.validUntil !== undefined) guncelleme.valid_until = tarihDegeri(body.validUntil);
    if (body.note !== undefined) guncelleme.note = String(body.note).trim() || null;

    const { data, error } = await this.supabase.client
      .from("info_card_documents")
      .update(guncelleme)
      .eq("id", belgeId)
      .eq("card_id", kart.id)
      .select(`*, ${BELGE_DOSYA}, users(full_name)`)
      .single();
    if (error) throw error;
    return mapBelge(data);
  }

  /**
   * Belgeyi karttan çıkarır. DOSYAYI SİLMEZ: dosya kendi klasöründe kalır
   * (bkz. migration 107). "Karttan kaldır" ile "dosyayı sil" aynı düğme
   * olsaydı, kullanıcı vergi levhasını kartta görmek istemediği için Drive'dan
   * da silmiş olurdu.
   */
  async belgeSil(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    belgeId: string,
    userId?: string
  ): Promise<{ success: true }> {
    await this.assertCanEdit(scopeType, scopeId, userId);
    const kart = await this.kartSahipligiDogrula(scopeType, scopeId, "info_card_documents", belgeId);
    const { error } = await this.supabase.client
      .from("info_card_documents")
      .delete()
      .eq("id", belgeId)
      .eq("card_id", kart.id);
    if (error) throw error;
    return { success: true };
  }

  /** Dosya gerçekten var mı ve isteyen onu görebiliyor mu. */
  private async dosyayiDogrula(fileId: string, userId?: string) {
    const { data: file } = await this.supabase.client
      .from("files")
      .select("id, name, job_id, department_id, organization_id")
      .eq("id", fileId)
      .maybeSingle();
    if (!file) throw new NotFoundException("Dosya bulunamadı");
    if (!userId) return file;

    if (file.job_id) await this.access.assertCanViewJob(file.job_id, userId);
    else if (file.organization_id) await this.access.assertCanViewOrganization(file.organization_id, userId);
    else if (file.department_id) await this.access.assertCanViewDepartment(file.department_id, userId);
    return file;
  }

  /**
   * Alt kaydın gerçekten BU kartın altında olduğunu doğrular.
   *
   * Yetki kapsam üzerinden veriliyor; kayıt kimliği istemciden geliyor. İkisi
   * bağlanmazsa, bir şirkette düzenleme yetkisi olan kişi başka bir şirketin
   * alan/belge kimliğini göndererek onu silebilirdi.
   */
  private async kartSahipligiDogrula(
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    tablo: "info_card_fields" | "info_card_documents",
    kayitId: string
  ) {
    const kart = await this.kartRow(scopeType, scopeId);
    if (!kart) throw new NotFoundException("Bilgi kartı bulunamadı");
    const { data } = await this.supabase.client.from(tablo).select("id").eq("id", kayitId).eq("card_id", kart.id).maybeSingle();
    if (!data) throw new NotFoundException("Kayıt bu bilgi kartında bulunamadı");
    return kart;
  }
}

// ------------------------------------------------------------------ Eşleme

function mapKart(row: any, scopeType: BilgiKartiKapsami, scopeId: string): BilgiKarti {
  const kart: Record<string, unknown> = { id: row.id, scopeType, scopeId };
  for (const [alan, kolon] of Object.entries(KUNYE_ALANLARI)) {
    kart[alan] = row[kolon] ?? undefined;
  }
  kart.employeeCount = row.employee_count ?? undefined;
  kart.updatedAt = row.updated_at ?? undefined;
  kart.updatedByName = row.users?.full_name ?? undefined;
  return kart as unknown as BilgiKarti;
}

function mapAlan(row: any): BilgiKartiAlani {
  return {
    id: row.id,
    label: row.label,
    value: row.value ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapBelge(row: any): BilgiKartiBelgesi {
  return {
    id: row.id,
    docType: row.doc_type,
    title: row.title,
    fileId: row.file_id ?? undefined,
    fileName: row.files?.name ?? undefined,
    fileMimeType: row.files?.mime_type ?? undefined,
    webViewLink: row.files?.web_view_link ?? undefined,
    externalUrl: row.external_url ?? undefined,
    issuedOn: row.issued_on ?? undefined,
    validUntil: row.valid_until ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    createdByName: row.users?.full_name ?? undefined,
  };
}

/** Tanınmayan tür sessizce "diğer"e düşer — istek reddedilmez. */
function belgeTuru(deger: unknown): BilgiKartiBelgeTuru {
  return BILGI_KARTI_BELGE_TURLERI.includes(deger as BilgiKartiBelgeTuru) ? (deger as BilgiKartiBelgeTuru) : "diger";
}

/** Boş tarih `null`; boş metin gönderildiğinde Postgres 22007 ile reddediyor. */
function tarihDegeri(deger: unknown): string | null {
  if (typeof deger !== "string") return null;
  const kirpilmis = deger.trim();
  return kirpilmis || null;
}

/**
 * Künye değerinin veritabanına yazılabilir hâli.
 *
 * Boş metin `null` olarak yazılıyor: kullanıcı alanı temizlediğinde orada boş
 * bir dize kalsaydı, "dolu mu?" kontrolü yapan her yer (kartın doluluk oranı,
 * ileride fatura alanları) onu dolu sayardı.
 */
function temizle(alan: string, deger: unknown): unknown {
  if (deger === null || deger === undefined) return null;
  if (TARIH_ALANLARI.has(alan)) return tarihDegeri(deger);
  if (SAYISAL_ALANLAR.has(alan)) {
    const sayi = typeof deger === "number" ? deger : Number(String(deger).trim());
    return Number.isFinite(sayi) && sayi >= 0 ? Math.round(sayi) : null;
  }
  const metin = String(deger).trim();
  return metin || null;
}
