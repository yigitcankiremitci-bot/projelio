import { modulErisilebilirMi } from "@projelio/shared";
import type { SupabaseService } from "../database/supabase.service";

/**
 * Pasif modül kapısı (bkz. shared aktifModuller.ts): pasif modül yalnızca
 * platform yöneticisine açık.
 *
 * Rol çoğu uçta JWT'den gelir; yetki çözümleyicisine ise yalnızca kullanıcı
 * kimliği ulaşıyor. Rolü her kayıt isteğinde veritabanından okumamak için
 * kısa bir önbellek var — yöneticilik nadiren değişir, değiştiğinde de en
 * geç bir dakikada yansır.
 */
const ROL_ONBELLEGI = new Map<string, { rol: string | null; bitis: number }>();
const ONBELLEK_MS = 60_000;

export async function kullaniciRolu(supabase: SupabaseService, userId: string): Promise<string | null> {
  const simdi = Date.now();
  const kayit = ROL_ONBELLEGI.get(userId);
  if (kayit && kayit.bitis > simdi) return kayit.rol;
  const { data } = await supabase.client.from("users").select("role").eq("id", userId).maybeSingle();
  const rol = (data as any)?.role ?? null;
  ROL_ONBELLEGI.set(userId, { rol, bitis: simdi + ONBELLEK_MS });
  return rol;
}

export async function moduleErisebilir(
  supabase: SupabaseService,
  moduleKey: string,
  userId: string | undefined
): Promise<boolean> {
  if (modulErisilebilirMi(moduleKey, null)) return true;
  if (!userId) return false;
  return modulErisilebilirMi(moduleKey, await kullaniciRolu(supabase, userId));
}
