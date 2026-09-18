import type { SupabaseService } from "../database/supabase.service";

/**
 * USD/TRY kurunun TEK okuma noktası — abonelikler de Lio Bakiyesi paketleri de
 * bu kurla fiyatlanır.
 *
 * NEDEN common'da: kur billing_config tablosunda (Admin > Paketler ve ödeme)
 * ama Lio paketleri ai-assistant modülünde; BillingModule zaten
 * AiAssistantModule'ü içe aktarıyor, tersini yapmak modül döngüsü olurdu.
 *
 * ÖNCELİK: veritabanı > BILLING_USD_TRY ortam değişkeni > yok (null).
 * Eski AI_USD_TRY_RATE BİLEREK okunmuyor: iki kur iki fiyat demekti.
 */
export const USD_TRY_AYAR_ANAHTARI = "usd_try_rate";

export function kurDegeri(ham: unknown): number | null {
  const sayi = Number(ham);
  return ham !== null && ham !== undefined && ham !== "" && Number.isFinite(sayi) && sayi > 0 ? sayi : null;
}

export async function usdTryKuruOku(supabase: SupabaseService): Promise<number | null> {
  try {
    const { data, error } = await supabase.client
      .from("billing_config")
      .select("value")
      .eq("key", USD_TRY_AYAR_ANAHTARI)
      .maybeSingle();
    if (error) throw error;
    const kur = kurDegeri(data?.value);
    if (kur !== null) return kur;
  } catch {
    /* tablo okunamadı: ortam değişkenine düş */
  }
  return kurDegeri(process.env.BILLING_USD_TRY);
}
