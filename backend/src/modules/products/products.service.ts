import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { ModuleRecord, Product, ProductImage, ProductKind, ProductOverview, ProductSpec, ProductStatus, ProductUnit } from "@projelio/shared";
import { PRODUCT_UNITS, URUN_BAGLANTI_ALANLARI, URUN_STRATEJI_MODUL_KEY, urunIliskiliKayitlar } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ModuleRecordsService } from "../module-records/module-records.service";
import { ModuleMembersService } from "../module-members/module-members.service";
import { detectImageUpload, UPLOAD_CACHE_CONTROL } from "../../common/upload-image.util";
import { safeExternalUrl } from "../../common/safe-url";

const COVER_BUCKET = "product-covers";

// Bir ürünün taşıyabileceği fotoğraf sayısı. Sınır teknik değil, ürün kararı:
// galeri kart üzerinde ve modalda yatay şeritte gösteriliyor, onlarca görsel
// ne gezilebilir ne de yüklenmesi ucuz. 8 MB × 12 = tek üründe en fazla ~96 MB.
const MAX_IMAGES_PER_PRODUCT = 12;

const PRODUCT_STATUSES: ProductStatus[] = ["active", "inactive"];
const PRODUCT_KINDS: ProductKind[] = ["product", "service"];

// Ürün kartı listeleri. Sınırlar kartın okunabilirliğinden geliyor: otuz
// maddelik bir "öne çıkan özellikler" listesi artık öne çıkan bir şey söylemez.
const MAX_FEATURES = 30;
const MAX_SPECS = 60;
const MAX_LIST_TEXT = 300;

// Kartın "Modüllerde" bölümünde gösterilen en fazla kayıt. Popüler bir ürünün
// adı yüzlerce sevkiyatta geçebilir; kart bir özet, defterin kendisi değil.
const MAX_RELATED = 60;

/** jsonb dizisini güvenle okur: bozuk/eski satırda kart `.map`'te kırılmasın. */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapProductImage(row: any): ProductImage {
  return {
    id: row.id,
    productId: row.product_id,
    url: row.url,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

function mapProduct(row: any, images: ProductImage[] = []): Product {
  return {
    id: row.id,
    organizationId: row.organization_id,
    departmentId: row.department_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    images,
    sku: row.sku ?? undefined,
    barcode: row.barcode ?? undefined,
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    unit: (row.unit ?? undefined) as ProductUnit | undefined,
    stockQuantity: row.stock_quantity !== null && row.stock_quantity !== undefined ? Number(row.stock_quantity) : undefined,
    price: row.price !== null && row.price !== undefined ? Number(row.price) : undefined,
    currency: row.currency ?? undefined,
    costPrice: row.cost_price !== null && row.cost_price !== undefined ? Number(row.cost_price) : undefined,
    taxRate: row.tax_rate !== null && row.tax_rate !== undefined ? Number(row.tax_rate) : undefined,
    status: (row.status ?? "active") as ProductStatus,
    kind: (row.kind ?? "product") as ProductKind,
    features: asArray(row.features).filter((f): f is string => typeof f === "string"),
    specs: asArray(row.specs)
      .filter((s: any) => s && typeof s.label === "string" && typeof s.value === "string")
      .map((s: any) => ({ label: s.label, value: s.value })),
    warranty: row.warranty ?? undefined,
    leadTime: row.lead_time ?? undefined,
    minStock: row.min_stock !== null && row.min_stock !== undefined ? Number(row.min_stock) : undefined,
    supplierPartyId: row.supplier_party_id ?? undefined,
    productUrl: row.product_url ?? undefined,
    notes: row.notes ?? undefined,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

/**
 * Sayı alanlarının ortak doğrulaması.
 *
 * `undefined` = "bu alana dokunma", `null` = "temizle". İkisini ayırmak şart:
 * kullanıcı fiyatı boşalttığında alan null'a düşmeli, ama modalda hiç
 * görünmeyen bir alan da yanlışlıkla silinmemeli.
 */
function parseOptionalNumber(value: unknown, label: string, { min = 0, max }: { min?: number; max?: number } = {}): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) throw new BadRequestException(`${label} sayı olmalı`);
  if (parsed < min) throw new BadRequestException(`${label} ${min} değerinden küçük olamaz`);
  if (max !== undefined && parsed > max) throw new BadRequestException(`${label} en fazla ${max} olabilir`);
  return parsed;
}

function parseOptionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export interface ProductWriteInput {
  departmentId?: string;
  name?: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  unit?: string | null;
  stockQuantity?: number | string | null;
  price?: number | string | null;
  currency?: string;
  costPrice?: number | string | null;
  taxRate?: number | string | null;
  status?: string;
  productUrl?: string | null;
  notes?: string | null;
  kind?: string;
  features?: unknown;
  specs?: unknown;
  warranty?: string | null;
  leadTime?: string | null;
  minStock?: number | string | null;
  supplierPartyId?: string | null;
}

/** Özellik listesini doğrular: boş maddeler atılır, tekrarlar teke düşer. */
function parseFeatures(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) throw new BadRequestException("Özellikler bir liste olmalı");
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of value) {
    const text = String(item ?? "").trim();
    if (!text || seen.has(text)) continue;
    if (text.length > MAX_LIST_TEXT) throw new BadRequestException(`Bir özellik en fazla ${MAX_LIST_TEXT} karakter olabilir`);
    seen.add(text);
    list.push(text);
  }
  if (list.length > MAX_FEATURES) throw new BadRequestException(`En fazla ${MAX_FEATURES} özellik eklenebilir`);
  return list;
}

/**
 * Teknik özellikleri doğrular. Değeri boş satır atılır (başlığı yazılıp
 * doldurulmamış bir satır kartta "Ağırlık: —" diye boş boş durmasın); başlığı
 * boş ama değeri dolu satır ise reddedilir — neyin değeri olduğu bilinmez.
 */
function parseSpecs(value: unknown): ProductSpec[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) throw new BadRequestException("Teknik özellikler bir liste olmalı");
  const list: ProductSpec[] = [];
  for (const item of value) {
    const label = String((item as any)?.label ?? "").trim();
    const specValue = String((item as any)?.value ?? "").trim();
    if (!specValue) continue;
    if (!label) throw new BadRequestException("Teknik özelliğin adı boş bırakılamaz");
    if (label.length > MAX_LIST_TEXT || specValue.length > MAX_LIST_TEXT) {
      throw new BadRequestException(`Teknik özellik en fazla ${MAX_LIST_TEXT} karakter olabilir`);
    }
    list.push({ label, value: specValue });
  }
  if (list.length > MAX_SPECS) throw new BadRequestException(`En fazla ${MAX_SPECS} teknik özellik eklenebilir`);
  return list;
}

// Ürün Yönetimi departmanından eklenen ürün/hizmet. Şirket anasayfasında iş
// kartlarıyla aynı görünümde listelenir (bkz. ProductsPanel / ProductCard).
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private supabase: SupabaseService,
    private moduleRecords: ModuleRecordsService,
    private moduleMembers: ModuleMembersService
  ) {}

  // Organizasyon sahibi ya da (ürün bir departmana bağlıysa) o departmanın
  // onaylı yöneticisi ürün ekleyip düzenleyebilir.
  private async assertCanManage(organizationId: string, departmentId?: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    if (org.owner_id === userId) return;

    if (departmentId) {
      const { data: managerRow } = await this.supabase.client
        .from("department_members")
        .select("id")
        .eq("department_id", departmentId)
        .eq("user_id", userId)
        .eq("role", "manager")
        .eq("status", "approved")
        .maybeSingle();
      if (managerRow) return;
    }
    throw new ForbiddenException("Bu ürünü yalnızca organizasyon sahibi veya departman yöneticisi düzenleyebilir");
  }

  /** Verilen ürünlerin fotoğraflarını TEK sorguda çeker (liste ucunda N+1 olmasın). */
  private async loadImagesFor(productIds: string[]): Promise<Map<string, ProductImage[]>> {
    const byProduct = new Map<string, ProductImage[]>();
    if (productIds.length === 0) return byProduct;

    const { data, error } = await this.supabase.client
      .from("product_images")
      .select("*")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;

    for (const row of data ?? []) {
      const image = mapProductImage(row);
      const list = byProduct.get(image.productId);
      if (list) list.push(image);
      else byProduct.set(image.productId, [image]);
    }
    return byProduct;
  }

  /**
   * `products.cover_image_url`'i galerinin ilk fotoğrafıyla eşitler.
   *
   * Kapak denormalize bir kopya (bkz. migration 074): kart bileşenleri galeriyi
   * yüklemeden tek bir URL okuyabilsin diye var. Galeri her değiştiğinde burası
   * çağrılmazsa kart silinmiş bir görseli göstermeye devam eder.
   */
  private async syncCoverFromImages(productId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("product_images")
      .select("url")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;

    const coverUrl = data?.[0]?.url ?? null;

    // Galeri boşaldığında hazır kapak seçimi KORUNUR. cover_image_url her zaman
    // bir adres değil: hazır kapak seçildiğinde 'preset:<anahtar>' yazılıyor
    // (bkz. apps/web/src/lib/covers.ts). Koşulsuz null'a çekmek, tek fotoğrafını
    // silen kullanıcının daha önce seçtiği kapağı da sessizce silerdi.
    if (coverUrl === null) {
      const { data: mevcut } = await this.supabase.client
        .from("products")
        .select("cover_image_url")
        .eq("id", productId)
        .maybeSingle();
      if (typeof mevcut?.cover_image_url === "string" && mevcut.cover_image_url.startsWith("preset:")) return;
    }

    const { error: updateError } = await this.supabase.client
      .from("products")
      .update({ cover_image_url: coverUrl })
      .eq("id", productId);
    if (updateError) throw updateError;
  }

  async findByOrganization(organizationId: string): Promise<Product[]> {
    const { data, error } = await this.supabase.client
      .from("products")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = data ?? [];
    const images = await this.loadImagesFor(rows.map((row: any) => row.id));
    return rows.map((row: any) => mapProduct(row, images.get(row.id) ?? []));
  }

  async findOne(id: string): Promise<Product> {
    const { data, error } = await this.supabase.client.from("products").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Ürün bulunamadı");
    const images = await this.loadImagesFor([id]);
    return mapProduct(data, images.get(id) ?? []);
  }

  /**
   * Yazma alanlarını doğrulayıp veritabanı sütunlarına çevirir.
   *
   * `undefined` kalan alan yamaya HİÇ girmez — PATCH'in gönderilmeyen alanı
   * silmemesi buna bağlı.
   */
  private buildPatch(data: ProductWriteInput): Record<string, unknown> {
    const patch: Record<string, unknown> = {};

    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new BadRequestException("Ürün adı gerekli");
      patch.name = name;
    }

    const textFields: Array<[keyof ProductWriteInput, string]> = [
      ["description", "description"],
      ["sku", "sku"],
      ["barcode", "barcode"],
      ["brand", "brand"],
      ["category", "category"],
      ["notes", "notes"],
      ["warranty", "warranty"],
      ["leadTime", "lead_time"],
    ];
    for (const [field, column] of textFields) {
      const value = parseOptionalText(data[field]);
      if (value !== undefined) patch[column] = value;
    }
    // Sütun varchar(120): sınır burada söylenmezse Postgres'in "value too long"
    // hatası kullanıcıya ham haliyle gidiyordu.
    for (const [field, label] of [["warranty", "Garanti"], ["leadTime", "Teslim süresi"]] as const) {
      const value = patch[field === "leadTime" ? "lead_time" : field];
      if (typeof value === "string" && value.length > 120) throw new BadRequestException(`${label} en fazla 120 karakter olabilir`);
    }

    if (data.unit !== undefined) {
      const unit = parseOptionalText(data.unit);
      if (unit !== null && unit !== undefined && !PRODUCT_UNITS.includes(unit as ProductUnit)) {
        throw new BadRequestException("Geçersiz birim");
      }
      patch.unit = unit;
    }

    if (data.status !== undefined) {
      if (!PRODUCT_STATUSES.includes(data.status as ProductStatus)) {
        throw new BadRequestException("Geçersiz ürün durumu");
      }
      patch.status = data.status;
    }

    if (data.kind !== undefined) {
      if (!PRODUCT_KINDS.includes(data.kind as ProductKind)) throw new BadRequestException("Geçersiz ürün türü");
      patch.kind = data.kind;
    }

    const features = parseFeatures(data.features);
    if (features !== undefined) patch.features = features;
    const specs = parseSpecs(data.specs);
    if (specs !== undefined) patch.specs = specs;

    if (data.currency !== undefined) patch.currency = String(data.currency).trim() || "TRY";

    const price = parseOptionalNumber(data.price, "Fiyat");
    if (price !== undefined) patch.price = price;
    const costPrice = parseOptionalNumber(data.costPrice, "Maliyet");
    if (costPrice !== undefined) patch.cost_price = costPrice;
    // Stok negatif olabilmeli: sayım açığı ya da ön siparişle eksiye düşen
    // gerçek bir durum, kaydı reddetmek kullanıcıyı yanlış sayı yazmaya iter.
    const stock = parseOptionalNumber(data.stockQuantity, "Stok", { min: Number.NEGATIVE_INFINITY });
    if (stock !== undefined) patch.stock_quantity = stock;
    const taxRate = parseOptionalNumber(data.taxRate, "KDV oranı", { min: 0, max: 100 });
    if (taxRate !== undefined) patch.tax_rate = taxRate;
    const minStock = parseOptionalNumber(data.minStock, "Kritik stok");
    if (minStock !== undefined) patch.min_stock = minStock;

    if (data.productUrl !== undefined) {
      const raw = parseOptionalText(data.productUrl);
      if (raw === null) {
        patch.product_url = null;
      } else if (raw !== undefined) {
        // Adres kullanıcıdan geliyor ve arayüzde <a href> olarak çiziliyor:
        // `javascript:` gibi bir şema kaydedilirse tıklayan kişide kod çalışır
        // (bkz. common/safe-url.ts).
        const safe = safeExternalUrl(raw);
        if (!safe) throw new BadRequestException("Ürün adresi geçerli bir web adresi değil");
        patch.product_url = safe;
      }
    }

    return patch;
  }

  async create(organizationId: string, data: ProductWriteInput, requestingUserId?: string): Promise<Product> {
    await this.assertCanManage(organizationId, data.departmentId, requestingUserId);
    if (!data.name?.trim()) throw new BadRequestException("Ürün adı gerekli");

    const patch = this.buildPatch(data);
    const supplier = await this.resolveSupplier(organizationId, data.supplierPartyId);
    if (supplier !== undefined) patch.supplier_party_id = supplier;
    const { data: row, error } = await this.supabase.client
      .from("products")
      .insert({
        organization_id: organizationId,
        department_id: data.departmentId ?? null,
        currency: data.currency ?? "TRY",
        created_by: requestingUserId ?? null,
        ...patch,
      })
      .select("*")
      .single();
    if (error) throw this.translateWriteError(error);
    return mapProduct(row, []);
  }

  async update(id: string, data: ProductWriteInput, requestingUserId?: string): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);

    const patch = this.buildPatch(data);
    const supplier = await this.resolveSupplier(existing.organizationId, data.supplierPartyId);
    if (supplier !== undefined) patch.supplier_party_id = supplier;
    if (Object.keys(patch).length === 0) return existing;

    const { data: row, error } = await this.supabase.client
      .from("products")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw this.translateWriteError(error);
    if (!row) throw new NotFoundException("Ürün bulunamadı");
    return mapProduct(row, existing.images ?? []);
  }

  /**
   * Tedarikçi kimliğini doğrular: kayıt AYNI şirketin party satırı olmalı.
   *
   * Kimlik istemciden geliyor. Doğrulanmazsa başka bir şirketin tedarikçisi
   * buraya bağlanabilir, ürün kartı da o firmanın telefonunu ve e-postasını
   * (bkz. overview) bu şirketin kullanıcılarına gösterirdi.
   */
  private async resolveSupplier(organizationId: string, value: unknown): Promise<string | null | undefined> {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const { data, error } = await this.supabase.client
      .from("party")
      .select("id")
      .eq("id", String(value))
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error || !data) throw new BadRequestException("Tedarikçi bu şirkette bulunamadı");
    return data.id;
  }

  /**
   * Ürün kartının tek istekte ihtiyaç duyduğu her şey: ürün, tedarikçi,
   * strateji kaydı ve ürünün adının geçtiği modül kayıtları.
   *
   * YETKİ. Çağıran (controller) ürünü görebildiğini zaten doğruladı. Modül
   * kayıtları ise ModuleRecordsService.findByOrganization'dan geçiyor — o
   * metot kullanıcının OKUYAMADIĞI modüllerin kayıtlarını eler. Ürün kartı
   * modül yetkisini delen bir arka kapı olmamalı: depo modülüne erişimi
   * olmayan satışçı, kartta da depo kaydı görmez.
   */
  async overview(id: string, userId: string): Promise<ProductOverview> {
    const product = await this.findOne(id);
    const organizationId = product.organizationId;

    const [canManage, records, strategyAccess, strategyModule, supplier] = await Promise.all([
      this.assertCanManage(organizationId, product.departmentId, userId).then(
        () => true,
        () => false
      ),
      this.moduleRecords.findByOrganization(organizationId, undefined, userId).catch((error) => {
        // Kart modül kayıtları olmadan da işe yarar; bir modülün okunamaması
        // ürünün kendisini göstermeyi engellemesin.
        this.logger.warn(`Ürün kartı modül kayıtları okunamadı (${id}): ${(error as Error).message}`);
        return [] as ModuleRecord[];
      }),
      this.moduleMembers.resolveOrganizationAccess(organizationId, URUN_STRATEJI_MODUL_KEY, userId).catch(() => null),
      this.supabase.client
        .from("organization_modules")
        .select("department_id")
        .eq("organization_id", organizationId)
        .eq("module_key", URUN_STRATEJI_MODUL_KEY)
        .limit(1)
        .maybeSingle(),
      product.supplierPartyId
        ? this.supabase.client
            .from("party")
            .select("id, display_name, email, phone, website")
            .eq("id", product.supplierPartyId)
            .eq("organization_id", organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const strategyRecord = records.find(
      (r) => r.moduleKey === URUN_STRATEJI_MODUL_KEY && r.scopeRef === id
    );

    const ilgiliModuller = new Set(Object.keys(URUN_BAGLANTI_ALANLARI));
    const matches = urunIliskiliKayitlar(
      product,
      records.filter((r) => ilgiliModuller.has(r.moduleKey))
    );
    const shown = matches.slice(0, MAX_RELATED);
    const names = await this.moduleNames([...new Set(shown.map((m) => m.record.moduleKey))]);

    const supplierRow = (supplier as { data: any }).data;
    return {
      product,
      canManage,
      supplier: supplierRow
        ? {
            id: supplierRow.id,
            displayName: supplierRow.display_name,
            email: supplierRow.email ?? undefined,
            phone: supplierRow.phone ?? undefined,
            website: supplierRow.website ?? undefined,
          }
        : undefined,
      strategy: {
        enabled: !!strategyModule.data,
        departmentId: strategyModule.data?.department_id ?? undefined,
        access: {
          canRead: strategyAccess?.canRead ?? false,
          canWrite: strategyAccess?.canWrite ?? false,
          canManageTeam: strategyAccess?.canManageTeam ?? false,
        },
        record: strategyRecord,
      },
      related: shown.map(({ record, matchedBy }) => ({
        moduleKey: record.moduleKey,
        moduleName: names.get(record.moduleKey) ?? record.moduleKey,
        matchedBy,
        record,
        departmentId: record.departmentId,
      })),
      relatedTruncated: matches.length > shown.length,
    };
  }

  private async moduleNames(keys: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (keys.length === 0) return map;
    const { data } = await this.supabase.client.from("module_catalog").select("key, name").in("key", keys);
    for (const row of data ?? []) map.set(row.key, row.name);
    return map;
  }

  /**
   * Veritabanı kısıtlarını kullanıcının anlayacağı mesaja çevirir.
   * Ham Postgres hatası ("duplicate key value violates unique constraint
   * products_org_sku_uniq") arayüzde olduğu gibi görünüyordu.
   */
  private translateWriteError(error: any): Error {
    if (error?.code === "23505" && String(error?.message ?? "").includes("products_org_sku_uniq")) {
      return new BadRequestException("Bu stok kodu şirkette başka bir üründe kullanılıyor");
    }
    if (error?.code === "23514" && String(error?.message ?? "").includes("products_status_check")) {
      return new BadRequestException("Geçersiz ürün durumu");
    }
    // Kod yayına migration 110'dan ÖNCE çıkarsa PostgREST yeni sütunları
    // tanımaz (PGRST204) ve her kayıt ham bir şema hatasıyla düşer. Sebep
    // kullanıcının değil sunucunun; log'a açıkça yazılsın ki aranmasın.
    if (error?.code === "PGRST204" || error?.code === "42703") {
      this.logger.error(`Ürün yazılamadı — migration 110 uygulanmış mı? ${error?.message ?? ""}`);
      return new ServiceUnavailableException("Ürün kaydedilemedi: sunucu güncellemesi tamamlanmamış. Biraz sonra tekrar dene.");
    }
    return error;
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);

    // Satırlar product_images'a cascade ile gidiyor ama KOVADAKİ nesneler
    // gitmiyor: ürün silinmeden önce klasörü boşaltılmazsa fotoğraflar
    // erişilemez halde sonsuza kadar kalır.
    await this.removeAllObjects(id);

    const { error } = await this.supabase.client.from("products").delete().eq("id", id);
    if (error) throw error;
  }

  /** Ürünün kovadaki klasörünü tamamen boşaltır. Hata yutulur — asıl iş silme. */
  private async removeAllObjects(productId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client.storage.from(COVER_BUCKET).list(productId, { limit: 1000 });
      if (error || !data?.length) return;
      await this.supabase.client.storage.from(COVER_BUCKET).remove(data.map((entry) => `${productId}/${entry.name}`));
    } catch (error) {
      this.logger.warn(`Ürün görselleri silinemedi (${productId}): ${(error as Error).message}`);
    }
  }

  async archive(id: string, requestingUserId?: string): Promise<Product> {
    return this.setArchivedAt(id, new Date().toISOString(), requestingUserId);
  }

  async restore(id: string, requestingUserId?: string): Promise<Product> {
    return this.setArchivedAt(id, null, requestingUserId);
  }

  private async setArchivedAt(id: string, value: string | null, requestingUserId?: string): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("products")
      .update({ archived_at: value })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Ürün bulunamadı");
    return mapProduct(row, existing.images ?? []);
  }

  // -------------------------------------------------------------------------
  // Fotoğraflar
  // -------------------------------------------------------------------------

  /**
   * Galeriye bir fotoğraf ekler ve güncel ürünü döner.
   *
   * DİKKAT — burada `removeStaleUploadsInFolder` ÇAĞRILMAZ. O yardımcı, klasörde
   * son yazılan dosya dışındaki her şeyi siliyor; tek kapaklı dünyada doğruydu
   * ama galeride ikinci fotoğrafı yüklemek birincisini silerdi. Artık her
   * fotoğrafın bir satırı var, temizlik de satır silinirken tek tek yapılıyor
   * (bkz. removeImage).
   */
  async addImage(id: string, file: Express.Multer.File, requestingUserId?: string): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);

    const current = existing.images ?? [];
    if (current.length >= MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(`Bir ürüne en fazla ${MAX_IMAGES_PER_PRODUCT} fotoğraf eklenebilir`);
    }

    // Tür ve uzantı istemcinin sözüne değil, dosyanın ilk baytlarındaki
    // imzaya göre belirlenir (bkz. common/upload-image.util.ts).
    const { contentType, ext } = detectImageUpload(file);
    const path = `${id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(COVER_BUCKET)
      .upload(path, file.buffer, { contentType, upsert: true, cacheControl: UPLOAD_CACHE_CONTROL });
    if (uploadError) throw uploadError;

    const publicUrl = this.supabase.publicStorageUrl(COVER_BUCKET, path);
    const nextOrder = current.length ? Math.max(...current.map((image) => image.sortOrder)) + 1 : 0;

    const { error: insertError } = await this.supabase.client.from("product_images").insert({
      product_id: id,
      url: publicUrl,
      storage_path: path,
      sort_order: nextOrder,
      created_by: requestingUserId ?? null,
    });
    if (insertError) {
      // Satır yazılamadıysa nesne yetim kalır: hiçbir yerden erişilemez ama
      // kovada yer kaplar. Hemen geri al.
      await this.supabase.client.storage.from(COVER_BUCKET).remove([path]);
      throw insertError;
    }

    await this.syncCoverFromImages(id);
    return this.findOne(id);
  }

  async removeImage(id: string, imageId: string, requestingUserId?: string): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("product_images")
      .select("*")
      .eq("id", imageId)
      .eq("product_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Fotoğraf bulunamadı");

    const { error: deleteError } = await this.supabase.client.from("product_images").delete().eq("id", imageId);
    if (deleteError) throw deleteError;

    // Kayıt gittikten SONRA nesneyi sil: ters sırada, silme başarısız olursa
    // kayıt var olmayan bir dosyayı gösterirdi. storage_path 025'ten devralınan
    // kapaklarda boş olabilir — o durumda nesne kovada bırakılır (bkz. 074).
    if (row.storage_path) {
      const { error: storageError } = await this.supabase.client.storage.from(COVER_BUCKET).remove([row.storage_path]);
      if (storageError) this.logger.warn(`Görsel dosyası silinemedi (${row.storage_path}): ${storageError.message}`);
    }

    await this.syncCoverFromImages(id);
    return this.findOne(id);
  }

  /**
   * Fotoğrafları verilen sıraya dizer. Listenin başındaki vitrin görseli olur.
   *
   * Gelen liste ürünün fotoğraflarıyla BİREBİR eşleşmek zorunda: eksik bir id
   * gönderilirse o fotoğraf sırasız kalır ve arayüzde rastgele bir yere düşer,
   * fazladan id ise başka ürünün fotoğrafını buraya taşımaya çalışmak olur.
   */
  async reorderImages(id: string, imageIds: string[], requestingUserId?: string): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);

    const current = existing.images ?? [];
    const currentIds = new Set(current.map((image) => image.id));
    const incoming = new Set(imageIds);
    if (imageIds.length !== current.length || imageIds.some((imageId) => !currentIds.has(imageId)) || incoming.size !== imageIds.length) {
      throw new BadRequestException("Fotoğraf sırası ürünün fotoğraflarıyla eşleşmiyor");
    }

    for (let index = 0; index < imageIds.length; index++) {
      const { error } = await this.supabase.client
        .from("product_images")
        .update({ sort_order: index })
        .eq("id", imageIds[index])
        .eq("product_id", id);
      if (error) throw error;
    }

    await this.syncCoverFromImages(id);
    return this.findOne(id);
  }
}
