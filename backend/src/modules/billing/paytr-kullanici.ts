import { ForbiddenException } from "@nestjs/common";
import type { Locale } from "@projelio/shared";
import type { SupabaseService } from "../../database/supabase.service";

/**
 * PayTR'nin her ödeme isteğinde istediği müşteri bilgisi. Lio Bakiyesi ödemesi
 * ve kart saklama aynı alanları gönderiyor; ayrı dosyada, çünkü iki servis de
 * kullanıyor ve servisler birbirini içe aktarırsa döngü olur.
 */
export async function paytrKullaniciBilgisi(
  supabase: SupabaseService,
  userId: string
): Promise<{ ad: string; email: string; telefon?: string; dil: Locale }> {
  const { data, error } = await supabase.client
    .from("users")
    .select("full_name, email, phone, locale")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ForbiddenException("Kullanıcı bulunamadı.");
  return {
    // PayTR ad alanını zorunlu tutuyor ve boş bırakılırsa token reddediliyor.
    ad: String(data.full_name ?? "").trim() || "Projelio kullanıcısı",
    email: String(data.email ?? ""),
    telefon: data.phone ?? undefined,
    // Abonelik e-postaları ve PayTR formunun dili; tanımsızsa Türkçe.
    dil: data.locale === "en" ? "en" : "tr",
  };
}
