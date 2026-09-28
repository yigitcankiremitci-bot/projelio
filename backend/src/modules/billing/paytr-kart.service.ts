import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { PayTRClient, type SakliKart } from "./paytr.client";

/**
 * Kullanıcının PayTR'deki kart grubu (utoken) ve saklı kartları.
 *
 * KART VERİSİ BİZDE YOK: kart numarası PayTR'de; biz kullanıcı başına utoken'ı
 * (paytr_kart_sahipleri, migration 137) ve aboneliğin kullandığı kartın
 * ctoken'ını (subscriptions.paytr_ctoken, migration 138) tutuyoruz. Kart listesi
 * her seferinde PayTR'ye soruluyor.
 *
 * 2026-09-28 gerçek kartla doğrulananlar: utoken bildirimde `utoken` alanıyla
 * geliyor; 3D ile saklanan kartta require_cvv = 0 (gözetimsiz yenileme mümkün);
 * saklı karttan Non3D çekim için mağazada ayrıca "recurring" yetkisi gerekiyor.
 */
@Injectable()
export class PayTRKartService {
  private readonly logger = new Logger(PayTRKartService.name);

  constructor(
    private supabase: SupabaseService,
    private paytr: PayTRClient
  ) {}

  async utoken(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from("paytr_kart_sahipleri")
      .select("utoken")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data?.utoken ?? null;
  }

  /** PayTR'deki saklı kartlar; utoken yoksa boş liste. */
  async kartlar(userId: string): Promise<SakliKart[]> {
    const utoken = await this.utoken(userId);
    return utoken ? this.paytr.kartListesi(utoken) : [];
  }

  /**
   * Bildirimde gelen utoken'ı kaydeder.
   *
   * KULLANICI BAŞINA TEK utoken: mevcut utoken her kart saklama isteğinde
   * gönderiliyor (bkz. PayTRClient.direktForm). Yine de farklısı dönerse
   * kartlar iki gruba bölünmüş demektir; ESKİSİ korunur, çünkü aboneliğin
   * kullandığı kart onun altında.
   */
  async utokenKaydet(userId: string, gelen: string): Promise<void> {
    const mevcut = await this.utoken(userId);
    if (mevcut === gelen) return;
    if (mevcut) {
      this.logger.error(`PayTR farklı bir utoken döndü (kullanıcı ${userId}); mevcut korunuyor.`);
      return;
    }
    const { error } = await this.supabase.client
      .from("paytr_kart_sahipleri")
      .upsert({ user_id: userId, utoken: gelen, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
  }
}
