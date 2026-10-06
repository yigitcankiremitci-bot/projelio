/**
 * Rakip ve hashtag takibinin saf kuralları: Meta'dan ne istenir, yanıt nasıl
 * okunur, çağrı kullanımı ve haftalık hashtag hakkı nasıl hesaplanır.
 *
 * Servisten AYRI, çünkü veritabanı ve Meta taklidi olmadan test edilebilmeli
 * (icerik-analizi.ts ile aynı gerekçe).
 */
import type { SocialCompetitorPost, SocialMetaUsage } from "@projelio/shared";
import { metaZamani } from "./icerik-analizi";

/** Facebook Login yolunun Graph tabanı (Instagram Login'inki graph.instagram.com). */
export const FB_GRAPH_HOST = "https://graph.facebook.com";
export const FB_API_VERSION = "v21.0";

/**
 * Facebook Login'de istenen izinler. `config_id` (Facebook Login for Business
 * yapılandırması) verilmişse izinler oradan gelir ve bu liste kullanılmaz.
 *
 *   instagram_basic          Sayfaya bağlı Instagram hesabını okumak
 *   instagram_manage_insights Business Discovery (başka hesapların herkese açık verisi)
 *   pages_show_list          Kullanıcının Sayfalarını listelemek
 *   pages_read_engagement    Sayfa jetonu almak
 *
 * Hashtag araması ayrıca uygulamada "Instagram Public Content Access"
 * özelliğinin açık olmasını istiyor (izin değil, özellik).
 */
export const FB_SCOPES = ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement"];

/** Meta kuralı: bir Instagram hesabı 7 günde en fazla 30 farklı hashtag sorgulayabilir. */
export const HASHTAG_HAFTALIK_SINIR = 30;
const HASHTAG_PENCERE_MS = 7 * 86_400_000;

/** Business Discovery'de rakip başına okunan son gönderi sayısı. */
export const RAKIP_MEDYA_SAYISI = 30;

const MEDYA_ALANLARI = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";

export class HashtagGecersiz extends Error {}

/** "#Müzik Prodüksiyon" → "müzikprodüksiyon". Instagram etiketi harf/rakam/alt çizgi. */
export function hashtagiTemizle(ham: unknown): string {
  const temiz = (typeof ham === "string" ? ham : "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .toLocaleLowerCase("tr")
    .slice(0, 100);
  if (!temiz || /^\d+$/.test(temiz)) throw new HashtagGecersiz("Geçerli bir hashtag yaz (harf, rakam ya da alt çizgi)."); // dil:anahtar
  return temiz;
}

/** Business Discovery alan ifadesi: tek istekte profil + son gönderiler. */
export function discoveryAlani(kullaniciAdi: string): string {
  // Kullanıcı adı alan ifadesinin içine giriyor: yalnızca Instagram'ın izin
  // verdiği karakterler — parantez ya da virgül sorguyu bozardı.
  const ad = kullaniciAdi.replace(/[^a-z0-9._]/gi, "").slice(0, 30);
  return `business_discovery.username(${ad}){username,name,biography,followers_count,media_count,profile_picture_url,media.limit(${RAKIP_MEDYA_SAYISI}){${MEDYA_ALANLARI}}}`;
}

export function hashtagMedyaAlanlari(): string {
  return MEDYA_ALANLARI.replace(",media_product_type", "");
}

export interface OkunanRakip {
  profil: { ad?: string; biyografi?: string; takipci?: number; gonderi?: number; resim?: string };
  gonderiler: SocialCompetitorPost[];
}

export function discoveryOku(json: unknown): OkunanRakip {
  const bd = (json as any)?.business_discovery ?? {};
  const sayi = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const metin = (v: unknown, tavan: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, tavan) : undefined);
  return {
    profil: {
      ad: metin(bd.name, 200),
      biyografi: metin(bd.biography, 600),
      takipci: sayi(bd.followers_count),
      gonderi: sayi(bd.media_count),
      resim: metin(bd.profile_picture_url, 2000),
    },
    gonderiler: medyaListesiOku(bd.media?.data),
  };
}

export function medyaListesiOku(liste: unknown): SocialCompetitorPost[] {
  return (Array.isArray(liste) ? liste : [])
    .filter((m: any) => m && typeof m.id === "string")
    .map((m: any) => ({
      externalMediaId: m.id,
      caption: typeof m.caption === "string" ? m.caption.slice(0, 2200) : undefined,
      mediaType: typeof m.media_type === "string" ? m.media_type : undefined,
      mediaProductType: typeof m.media_product_type === "string" ? m.media_product_type : undefined,
      permalink: typeof m.permalink === "string" ? m.permalink : undefined,
      postedAt: metaZamani(m.timestamp) ?? undefined,
      // Hesap beğeni sayısını gizlediyse alan hiç gelmiyor: 0 değil, bilinmiyor.
      likeCount: typeof m.like_count === "number" ? m.like_count : undefined,
      commentsCount: typeof m.comments_count === "number" ? m.comments_count : undefined,
    }));
}

/**
 * Meta'nın kullanım başlıklarını okur.
 *
 * `x-app-usage`: {"call_count":5,"total_time":2,"total_cputime":1} — yüzde.
 * `x-business-use-case-usage`: {"<id>":[{"type":"instagram",...,"call_count":4,
 * "estimated_time_to_regain_access":0}]} — Instagram uçlarının asıl sınırı bu;
 * en yüksek yüzde alınır. 100'e yaklaşan değer "yakında kısıtlanacak" demek.
 */
export function kullanimOku(basliklar: { get(ad: string): string | null }): SocialMetaUsage | null {
  const sonuc: SocialMetaUsage = {};
  let bulundu = false;
  try {
    const app = JSON.parse(basliklar.get("x-app-usage") ?? "null");
    if (app && typeof app === "object") {
      bulundu = true;
      if (typeof app.call_count === "number") sonuc.callCount = app.call_count;
      if (typeof app.total_time === "number") sonuc.totalTime = app.total_time;
      if (typeof app.total_cputime === "number") sonuc.totalCputime = app.total_cputime;
    }
  } catch {
    // bozuk başlık: yok sayılır
  }
  try {
    const buc = JSON.parse(basliklar.get("x-business-use-case-usage") ?? "null");
    if (buc && typeof buc === "object") {
      for (const liste of Object.values(buc)) {
        for (const k of Array.isArray(liste) ? (liste as any[]) : []) {
          bulundu = true;
          const en = Math.max(k?.call_count ?? 0, k?.total_time ?? 0, k?.total_cputime ?? 0);
          sonuc.isletme = Math.max(sonuc.isletme ?? 0, en);
          if (typeof k?.estimated_time_to_regain_access === "number" && k.estimated_time_to_regain_access > 0) {
            sonuc.beklemeDk = Math.max(sonuc.beklemeDk ?? 0, k.estimated_time_to_regain_access);
          }
        }
      }
    }
  } catch {
    // bozuk başlık: yok sayılır
  }
  return bulundu ? sonuc : null;
}

/**
 * Haftalık hashtag hakkı: son 7 günde sorgulanan FARKLI etiket sayısı.
 *
 * Aynı etiketi tekrar sorgulamak yeni hak harcamaz; ama etkin bir etiket her
 * gün sorgulandığı için hakkını sürekli dolu tutar. `yenilenme`: en eski
 * sorgunun pencereden çıkacağı an (bir hak o zaman boşalır).
 */
export function hashtagButcesi(
  takipler: { hashtag: string; son_sorgu: string | null }[],
  simdi: Date
): { kullanilan: number; sinir: number; yenilenme?: string } {
  const sinir = simdi.getTime() - HASHTAG_PENCERE_MS;
  const zamanlar = takipler
    .map((t) => ({ h: t.hashtag, z: t.son_sorgu ? Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(t.son_sorgu) ? t.son_sorgu : `${t.son_sorgu}Z`) : NaN }))
    .filter((t) => Number.isFinite(t.z) && t.z >= sinir);
  const farkli = new Set(zamanlar.map((t) => t.h));
  const enEski = zamanlar.length ? Math.min(...zamanlar.map((t) => t.z)) : null;
  return {
    kullanilan: farkli.size,
    sinir: HASHTAG_HAFTALIK_SINIR,
    yenilenme: enEski !== null ? new Date(enEski + HASHTAG_PENCERE_MS).toISOString() : undefined,
  };
}

/**
 * Business Discovery hata kodundan kullanıcıya gösterilecek cümle.
 * #110 / "Cannot find User": kişisel hesap ya da yanlış ad — en sık durum.
 */
export function discoveryHatasi(govde: string): string {
  try {
    const e = (JSON.parse(govde) as { error?: { code?: number; error_subcode?: number; message?: string } }).error;
    if (e?.code === 110 || /cannot find user|invalid user id/i.test(e?.message ?? "")) {
      return "Hesap bulunamadı ya da işletme/içerik üreticisi hesabı değil (kişisel hesapların verisi alınamaz)."; // dil:anahtar
    }
    if (e?.code === 4 || e?.code === 17 || e?.code === 32 || e?.code === 613) {
      return "Meta çağrı sınırına ulaşıldı; bir süre sonra tekrar denenecek."; // dil:anahtar
    }
    if (e?.code === 190) return "Facebook bağlantısının süresi dolmuş; yeniden bağlayın."; // dil:anahtar
    if (e?.code === 10 || e?.code === 200) return "Facebook bağlantısında gerekli izin yok; yeniden bağlayın."; // dil:anahtar
    return e?.message?.slice(0, 300) || "Meta isteği reddetti."; // dil:anahtar
  } catch {
    return "Meta isteği reddetti."; // dil:anahtar
  }
}
