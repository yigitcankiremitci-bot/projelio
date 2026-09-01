import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Product, ProductImage, ProductStatus, ProductUnit } from "@projelio/shared";
import { PRODUCT_UNITS } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { detectImageUpload, UPLOAD_CACHE_CONTROL } from "../../common/upload-image.util";
import { safeExternalUrl } from "../../common/safe-url";

const COVER_BUCKET = "product-covers";

// Bir ürünün taşıyabileceği fotoğraf sayısı. Sınır teknik değil, ürün kararı:
// galeri kart üzerinde ve modalda yatay şeritte gösteriliyor, onlarca görsel
// ne gezilebilir ne de yüklenmesi ucuz. 8 MB × 12 = tek üründe en fazla ~96 MB.
const MAX_IMAGES_PER_PRODUCT = 12;

const PRODUCT_STATUSES: ProductStatus[] = ["active", "inactive"];

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
}

// Ürün Yönetimi departmanından eklenen ürün/hizmet. Şirket anasayfasında iş
// kartlarıyla aynı görünümde listelenir (bkz. ProductsPanel / ProductCard).
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private supabase: SupabaseService) {}

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
    ];
    for (const [field, column] of textFields) {
      const value = parseOptionalText(data[field]);
      if (value !== undefined) patch[column] = value;
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
