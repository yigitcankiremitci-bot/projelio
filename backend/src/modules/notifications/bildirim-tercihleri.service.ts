import { Injectable, Logger } from "@nestjs/common";
import { bildirimTercihleriniTemizle, VARSAYILAN_BILDIRIM_TERCIHLERI, type BildirimTercihleri } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

/** notifyUser her bildirimde soruyor; bir dakikalık önbellek tabloyu korur. */
const ONBELLEK_MS = 60_000;

/**
 * Bildirim tipi × kanal tercihleri (bkz. migration 135, shared/bildirimTercihleri.ts).
 *
 * OKUMA HATASI GÖNDERİMİ DURDURMAZ: tablo okunamazsa (migration uygulanmadan,
 * veritabanı bir an takılınca) "her şey açık" döner. Tersi — okunamadı diye
 * bildirimi yutmak — kullanıcının kurduğu hatırlatmanın sessizce kaybolması
 * demekti; bu özelliğin çıkış sebebi tam olarak o şikâyet.
 */
@Injectable()
export class BildirimTercihleriService {
  private readonly logger = new Logger(BildirimTercihleriService.name);
  private readonly onbellek = new Map<string, { deger: BildirimTercihleri; son: number }>();

  constructor(private supabase: SupabaseService) {}

  async getir(userId: string): Promise<BildirimTercihleri> {
    const kayit = this.onbellek.get(userId);
    if (kayit && kayit.son > Date.now()) return kayit.deger;

    const { data, error } = await this.supabase.client
      .from("notification_type_prefs")
      .select("tipler, ses")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`Bildirim tercihi okunamadı (${userId}), hepsi açık sayıldı: ${error.message}`);
      return VARSAYILAN_BILDIRIM_TERCIHLERI;
    }
    const deger = data ? bildirimTercihleriniTemizle(data) : VARSAYILAN_BILDIRIM_TERCIHLERI;
    this.onbellek.set(userId, { deger, son: Date.now() + ONBELLEK_MS });
    return deger;
  }

  /** Birden çok kullanıcı — e-posta işleyicisi turda tek sorguyla okur. */
  async getirToplu(userIds: string[]): Promise<Map<string, BildirimTercihleri>> {
    const sonuc = new Map<string, BildirimTercihleri>();
    if (!userIds.length) return sonuc;
    const { data, error } = await this.supabase.client
      .from("notification_type_prefs")
      .select("user_id, tipler, ses")
      .in("user_id", userIds);
    if (error) {
      this.logger.warn(`Bildirim tercihleri okunamadı, hepsi açık sayıldı: ${error.message}`);
      return sonuc;
    }
    for (const row of data ?? []) sonuc.set((row as any).user_id, bildirimTercihleriniTemizle(row));
    return sonuc;
  }

  /** Tam tercih yazılır (arayüz her kayıtta hepsini gönderiyor); gövde temizlenir. */
  async kaydet(userId: string, govde: unknown): Promise<BildirimTercihleri> {
    const temiz = bildirimTercihleriniTemizle(govde);
    const { error } = await this.supabase.client
      .from("notification_type_prefs")
      .upsert({ user_id: userId, tipler: temiz.tipler, ses: temiz.ses }, { onConflict: "user_id" });
    if (error) throw error;
    this.onbellek.set(userId, { deger: temiz, son: Date.now() + ONBELLEK_MS });
    return temiz;
  }
}
