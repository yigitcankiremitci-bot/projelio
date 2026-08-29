import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { AiCreditsService } from "./ai-credits.service";
import { CREDIT_PACKAGES, findCreditPackage } from "./ai-credits.config";
import { demoHesabindaYasak } from "../../common/demo-hesap";
import type { CreditPackage } from "./ai-credits.config";

export type CreditOrderStatus = "pending_payment" | "paid" | "cancelled" | "failed";

export interface CreditOrder {
  id: string;
  userId: string;
  packageKey: string;
  credits: number;
  priceAmount: number;
  currency: string;
  status: CreditOrderStatus;
  paidAt?: string;
  /** Dolu ise kredi gerçekten bakiyeye geçmiştir — "ödendi" tek başına yetmez. */
  creditedAt?: string;
  note?: string;
  createdAt: string;
  // Yönetici listesinde kimin siparişi olduğu görünsün diye (kendi listesinde boş).
  userFullName?: string;
  userEmail?: string;
}

/**
 * Aynı kullanıcının açık bırakabileceği en fazla sipariş sayısı.
 * Ödeme entegrasyonu olmadığı için sipariş açmak bedava; sınırsız bırakmak
 * yönetici ekranını çöple doldurmanın kolay bir yolu olurdu.
 */
const MAX_OPEN_ORDERS = 5;

function mapOrder(row: any): CreditOrder {
  return {
    id: row.id,
    userId: row.user_id,
    packageKey: row.package_key,
    credits: Number(row.credits),
    priceAmount: Number(row.price_amount),
    currency: row.currency,
    status: row.status,
    paidAt: row.paid_at ?? undefined,
    creditedAt: row.credited_at ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    userFullName: row.users?.full_name ?? undefined,
    userEmail: row.users?.email ?? undefined,
  };
}

/**
 * Self-servis kredi yükleme siparişleri.
 *
 * AKIŞ: kullanıcı paket seçer -> sipariş 'pending_payment' doğar -> ödeme
 * doğrulanır -> kredi bakiyeye geçer.
 *
 * ÖDEME ADIMI HENÜZ OTOMATİK DEĞİL. Sağlayıcı entegrasyonu bağlanana kadar ödemeyi
 * bir yönetici doğruluyor (markPaid). Entegrasyon geldiğinde değişmesi gereken tek
 * yer sağlayıcının callback'inin markPaid'i çağırmasıdır; kredi yükleme mantığı
 * (creditOrder) aynen kalır.
 *
 * DEĞİŞMEZ KURAL: sipariş oluşturmak krediyi YÜKLEMEZ. Bu sınıfta bakiyeye dokunan
 * tek yol creditOrder'dır ve o da yalnızca ödemesi doğrulanmış siparişte çalışır.
 */
@Injectable()
export class AiCreditOrdersService {
  private readonly logger = new Logger(AiCreditOrdersService.name);

  constructor(
    private supabase: SupabaseService,
    private credits: AiCreditsService
  ) {}

  listPackages(): CreditPackage[] {
    return CREDIT_PACKAGES;
  }

  /**
   * Sipariş açar. Fiyat ve kredi miktarı İSTEMCİDEN ALINMAZ — yalnızca paket
   * anahtarı alınır ve değerler sunucudaki katalogdan yazılır. Aksi halde istemci
   * "500.000 kredi, 1 ₺" diye bir sipariş uydurabilirdi.
   */
  async create(userId: string, packageKey: string): Promise<CreditOrder> {
    // Demo hesabında kredi satın alınmaz: Lio zaten ücretsiz ve saatlik tavanla
    // sınırlı (bkz. demo-ai-kotasi.ts). Ziyaretçinin açtığı sipariş kayıtları
    // demo sıfırlamasının kapsamı dışında kalır, yani kalıcı çöp bırakırdı.
    demoHesabindaYasak(userId, "kredi satın alma");

    const pkg = findCreditPackage(packageKey);
    if (!pkg) throw new BadRequestException("Geçersiz kredi paketi.");

    const { count, error: countError } = await this.supabase.client
      .from("ai_credit_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending_payment");
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_OPEN_ORDERS) {
      throw new ConflictException(
        "Ödeme bekleyen çok fazla siparişin var. Yenisini oluşturmadan önce mevcutlardan birini tamamla ya da iptal et."
      );
    }

    const { data, error } = await this.supabase.client
      .from("ai_credit_orders")
      .insert({
        user_id: userId,
        package_key: pkg.key,
        credits: pkg.credits,
        price_amount: pkg.priceTry,
        currency: "TRY",
        status: "pending_payment",
      })
      .select()
      .single();
    if (error) throw error;
    return mapOrder(data);
  }

  async listMine(userId: string, limit = 20): Promise<CreditOrder[]> {
    const { data, error } = await this.supabase.client
      .from("ai_credit_orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapOrder);
  }

  /** Yönetici ekranı: ödeme bekleyenler önce. */
  async listAll(status?: CreditOrderStatus, limit = 100): Promise<CreditOrder[]> {
    let query = this.supabase.client
      .from("ai_credit_orders")
      .select("*, users!ai_credit_orders_user_id_fkey(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapOrder);
  }

  /** Kullanıcı kendi bekleyen siparişinden vazgeçer. */
  async cancel(userId: string, orderId: string): Promise<CreditOrder> {
    const order = await this.findById(orderId);
    if (order.userId !== userId) throw new ForbiddenException("Bu sipariş sana ait değil.");
    if (order.status !== "pending_payment") {
      throw new ConflictException("Yalnızca ödeme bekleyen siparişler iptal edilebilir.");
    }
    // Koşullu güncelleme: aradaki saniyede yönetici ödemeyi onaylamışsa iptal
    // ETMEMELİ, yoksa ödenmiş bir sipariş iptal edilmiş görünürdü.
    const { data, error } = await this.supabase.client
      .from("ai_credit_orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending_payment")
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ConflictException("Sipariş bu sırada güncellendi, sayfayı yenile.");
    return mapOrder(data);
  }

  /**
   * Ödemeyi doğrulanmış sayar ve krediyi yükler.
   *
   * Bugün yalnızca yönetici çağırıyor (elden/havale ödeme). Ödeme sağlayıcısı
   * bağlandığında callback'i de buraya bağlanmalı — `provider`/`reference` alanları
   * bunun için var.
   */
  async markPaid(
    orderId: string,
    approvedBy: string,
    opts: { provider?: string; reference?: string; note?: string } = {}
  ): Promise<CreditOrder> {
    // Durum geçişi KOŞULLU yapılır (compare-and-set): iki yönetici aynı anda
    // onaylarsa yalnızca biri satırı alır, diğeri boş döner ve kredi tek kez yüklenir.
    const { data, error } = await this.supabase.client
      .from("ai_credit_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        approved_by: approvedBy,
        payment_provider: opts.provider ?? "manual",
        payment_reference: opts.reference ?? null,
        note: opts.note ?? null,
      })
      .eq("id", orderId)
      .eq("status", "pending_payment")
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const current = await this.findById(orderId);
      throw new ConflictException(
        current.status === "paid"
          ? "Bu siparişin ödemesi zaten onaylanmış."
          : "Yalnızca ödeme bekleyen siparişler onaylanabilir."
      );
    }

    return this.creditOrder(mapOrder(data), approvedBy);
  }

  /**
   * Ödemesi onaylanmış ama kredisi yüklenmemiş siparişi yeniden dener.
   *
   * Neden ayrı bir uç: markPaid iki adımdan oluşuyor (durumu 'paid' yap, sonra
   * krediyi yükle) ve ikisi tek bir veritabanı işlemi değil. Arada bir hata olursa
   * sipariş "ödendi ama kredi yok" halinde kalır; yöneticinin bunu elle düzeltmek
   * için siparişi silip yeniden oluşturması gerekmesin.
   */
  async retryCredit(orderId: string, approvedBy: string): Promise<CreditOrder> {
    const order = await this.findById(orderId);
    if (order.status !== "paid") throw new ConflictException("Yalnızca ödemesi onaylanmış siparişin kredisi yüklenebilir.");
    if (order.creditedAt) throw new ConflictException("Bu siparişin kredisi zaten yüklenmiş.");
    return this.creditOrder(order, approvedBy);
  }

  /**
   * Krediyi bakiyeye geçirir. ÇİFT YÜKLEMEYE KARŞI İKİ KATMAN:
   *   1. Defterde bu siparişe ait bir hareket var mı diye bakılır.
   *   2. Yarışı asıl kıran, defterdeki tekil indeks (uniq_ai_credit_tx_order):
   *      ikinci ekleme veritabanında reddedilir ve eklenen bakiye geri alınır
   *      (bkz. AiCreditsService.grant).
   * Yalnızca (1) yeterli değildi: iki eşzamanlı çağrı da "hareket yok" görüp
   * krediyi iki kez yükleyebilirdi.
   */
  private async creditOrder(order: CreditOrder, approvedBy: string): Promise<CreditOrder> {
    const { data: existing, error: existingError } = await this.supabase.client
      .from("ai_credit_transactions")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (!existing) {
      await this.credits.grant(
        order.userId,
        order.credits,
        "topup",
        `Kredi paketi: ${order.packageKey}`,
        approvedBy,
        order.id
      );
    } else {
      this.logger.warn(`Sipariş ${order.id} için defterde hareket zaten var; kredi tekrar yüklenmedi.`);
    }

    const { data, error } = await this.supabase.client
      .from("ai_credit_orders")
      .update({ credited_at: new Date().toISOString() })
      .eq("id", order.id)
      .select()
      .single();
    if (error) throw error;
    return mapOrder(data);
  }

  private async findById(orderId: string): Promise<CreditOrder> {
    const { data, error } = await this.supabase.client
      .from("ai_credit_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Sipariş bulunamadı.");
    return mapOrder(data);
  }
}
