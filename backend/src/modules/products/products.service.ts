import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Product } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { removeStaleUploadsInFolder } from "../../common/storage/public-upload.util";
import { detectImageUpload } from "../../common/upload-image.util";

const COVER_BUCKET = "product-covers";

function mapProduct(row: any): Product {
  return {
    id: row.id,
    organizationId: row.organization_id,
    departmentId: row.department_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    price: row.price !== null && row.price !== undefined ? Number(row.price) : undefined,
    currency: row.currency ?? undefined,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

// Ürün Yönetimi departmanından eklenen ürün/hizmet. Şirket anasayfasında iş
// kartlarıyla aynı görünümde listelenir (bkz. ProductsPanel / ProductCard).
@Injectable()
export class ProductsService {
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

  async findByOrganization(organizationId: string): Promise<Product[]> {
    const { data, error } = await this.supabase.client
      .from("products")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapProduct);
  }

  async findOne(id: string): Promise<Product> {
    const { data, error } = await this.supabase.client.from("products").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Ürün bulunamadı");
    return mapProduct(data);
  }

  async create(
    organizationId: string,
    data: { departmentId?: string; name?: string; description?: string; price?: number; currency?: string },
    requestingUserId?: string
  ): Promise<Product> {
    await this.assertCanManage(organizationId, data.departmentId, requestingUserId);
    if (!data.name?.trim()) throw new BadRequestException("Ürün adı gerekli");

    const { data: row, error } = await this.supabase.client
      .from("products")
      .insert({
        organization_id: organizationId,
        department_id: data.departmentId ?? null,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price ?? null,
        currency: data.currency ?? "TRY",
        created_by: requestingUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapProduct(row);
  }

  async update(
    id: string,
    data: { name?: string; description?: string; price?: number; currency?: string; coverImageUrl?: string },
    requestingUserId?: string
  ): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description.trim() || null;
    if (data.price !== undefined) patch.price = data.price;
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;

    const { data: row, error } = await this.supabase.client
      .from("products")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Ürün bulunamadı");
    return mapProduct(row);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);
    const { error } = await this.supabase.client.from("products").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string, requestingUserId?: string): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("products")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Ürün bulunamadı");
    return mapProduct(row);
  }

  async restore(id: string, requestingUserId?: string): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("products")
      .update({ archived_at: null })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Ürün bulunamadı");
    return mapProduct(row);
  }

  async uploadCover(id: string, file: Express.Multer.File, requestingUserId?: string): Promise<Product> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);
    // Tur ve uzanti istemcinin sozune degil, dosyanin ilk baytlarindaki
    // imzaya gore belirlenir (bkz. common/upload-image.util.ts).
    const { contentType, ext } = detectImageUpload(file);
    const path = `${id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(COVER_BUCKET)
      .upload(path, file.buffer, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = this.supabase.client.storage.from(COVER_BUCKET).getPublicUrl(path);
    const updated = await this.update(id, { coverImageUrl: publicUrlData.publicUrl }, requestingUserId);

    // Kayıt güncellendikten SONRA temizle: güncelleme başarısız olursa eski görsel
    // yerinde kalsın, kayıt silinmiş bir dosyaya işaret etmesin.
    await removeStaleUploadsInFolder(this.supabase.client, COVER_BUCKET, path);

    return updated;
  }
}
