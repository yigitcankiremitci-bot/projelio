import type { SupabaseService } from "../../database/supabase.service";
import { gelenMedya, MEDYA_OMRU_MS, type GelenMedya } from "./gelen-medya";

/**
 * Gelen medyanın KALICI yedeği.
 *
 * NEDEN: depo bellekte duruyor ve her dağıtım sunucuyu yeniden başlatıyor.
 * Kullanıcı videoyu atıp "yarın 19'a planla" dedikten sonra bir push
 * yapıldığında medya kayboluyor, Lio "medya süresi dolmuş" diyordu
 * (2026-09-30). Yedek, yayın hazırlığının zaten kullandığı kovaya
 * (social-publish, 300 MB sınırı, kalıcı volume) `gelen/<kullanıcı>/` altına
 * yazılır; bellek önde durur, kayıpta buradan geri yüklenir.
 *
 * Yol rastgele UUID içerir (kova herkese açık-ama-gizli-adres; bkz.
 * InstagramPublishService.stageMedia). Yaşam süresi deponunkiyle aynı.
 */

const KOVA = "social-publish";
const KLASOR = "gelen";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

/** `gelen/<kullanıcı>/<id>.<o|s>.<ad>.<mime>` — meta veri adın içinde, ayrı tablo yok. */
export function yedekYolu(userId: string, m: Pick<GelenMedya, "id" | "ad" | "mimeType" | "orijinal">): string {
  return `${KLASOR}/${userId}/${m.id}.${m.orijinal ? "o" : "s"}.${b64(m.ad)}.${b64(m.mimeType)}`;
}

export function yedekAdiniCoz(
  dosyaAdi: string
): { id: string; orijinal: boolean; ad: string; mimeType: string } | null {
  const p = dosyaAdi.split(".");
  if (p.length !== 4 || !p[0] || (p[1] !== "o" && p[1] !== "s")) return null;
  try {
    return { id: p[0], orijinal: p[1] === "o", ad: unb64(p[2]), mimeType: unb64(p[3]) };
  } catch {
    return null;
  }
}

/** Belleğe yeni giren medyayı yedekler; hata yayını/akışı bozmaz. */
export async function yedekle(supabase: SupabaseService, userId: string, m: GelenMedya): Promise<void> {
  const { error } = await supabase.client.storage
    .from(KOVA)
    .upload(yedekYolu(userId, m), m.buffer, { contentType: m.mimeType, upsert: true });
  if (error) throw new Error(`Medya yedeği yazılamadı: ${error.message}`);
}

export async function yedekSil(supabase: SupabaseService, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { data } = await supabase.client.storage.from(KOVA).list(`${KLASOR}/${userId}`, { limit: 100 });
  const yollar = (data ?? [])
    .filter((f) => ids.includes(f.name.split(".")[0]))
    .map((f) => `${KLASOR}/${userId}/${f.name}`);
  if (yollar.length) await supabase.client.storage.from(KOVA).remove(yollar);
}

/**
 * Bellekte olmayan yedekleri geri yükler, süresi geçenleri siler.
 * Her sosyal medya aracı çağrısının başında çalışır; yedek yoksa tek bir liste isteği.
 */
export async function yedektenYukle(supabase: SupabaseService, userId: string): Promise<void> {
  const { data, error } = await supabase.client.storage.from(KOVA).list(`${KLASOR}/${userId}`, { limit: 100 });
  if (error || !data?.length) return;

  const bellekte = new Set(gelenMedya.liste(userId).map((m) => m.id));
  const sinir = Date.now() - MEDYA_OMRU_MS;
  const eski: string[] = [];

  for (const f of data) {
    const yol = `${KLASOR}/${userId}/${f.name}`;
    const gelis = new Date(f.created_at ?? f.updated_at ?? Date.now()).getTime();
    const meta = yedekAdiniCoz(f.name);
    if (!meta || gelis < sinir) {
      eski.push(yol);
      continue;
    }
    if (bellekte.has(meta.id)) continue;
    const { data: blob, error: e } = await supabase.client.storage.from(KOVA).download(yol);
    if (e || !blob) continue;
    gelenMedya.geriYukle(userId, { ...meta, boyut: 0, buffer: Buffer.from(await blob.arrayBuffer()), gelis });
  }
  if (eski.length) await supabase.client.storage.from(KOVA).remove(eski);
}
