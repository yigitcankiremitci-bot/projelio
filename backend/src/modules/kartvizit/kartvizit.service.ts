import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import {
  kartvizitAdresHatasi,
  kartvizitAdresOnerileri,
  kartvizitAdresi,
  kartvizitQrSvg,
  kartvizitVcard,
  type Kartvizit,
  type KartvizitSosyal,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { kartvizitGirdisiniDogrula, type KartvizitSatiri } from "./kartvizit-girdi";

const TABLO = "kartvizitler";
const AVATAR_KOVASI = "avatars";
/** Rehber kaydına gömülecek fotoğrafın üst sınırı. Profil fotoğrafı kırpılıp küçültülerek yükleniyor; bu yalnızca emniyet. */
const FOTO_EN_COK_BAYT = 400 * 1024;

interface KartvizitDbSatiri extends KartvizitSatiri {
  user_id: string;
  updated_at: string;
}

/** Herkese açık sayfanın ihtiyaç duyduğu alanlar. Fotoğraf göstermek kapalıysa avatarUrl null. */
export interface KartvizitSayfaVerisi {
  adres: string;
  fullName: string;
  title: string | null;
  titleEn: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  tagline: string | null;
  taglineEn: string | null;
  sosyal: KartvizitSosyal;
  avatarUrl: string | null;
}

/** Formun açılışında: kayıtlı kart (varsa) + yeni kart için profilden ön doldurma. */
export interface KartvizitDurumu {
  kart: Kartvizit | null;
  profil: { fullName: string; title: string | null; phone: string | null; email: string | null; avatarUrl: string | null };
  /** Boşta olan adres önerileri (ad soyad + unvandan). */
  oneriler: string[];
}

function kartaCevir(r: KartvizitDbSatiri, avatarUrl: string | null): Kartvizit {
  return {
    adres: r.adres,
    fullName: r.full_name,
    title: r.title ?? undefined,
    titleEn: r.title_en ?? undefined,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    website: r.website ?? undefined,
    location: r.location ?? undefined,
    tagline: r.tagline ?? undefined,
    taglineEn: r.tagline_en ?? undefined,
    sosyal: r.sosyal ?? {},
    showPhoto: r.show_photo,
    active: r.active,
    avatarUrl,
    updatedAt: r.updated_at,
  };
}

@Injectable()
export class KartvizitService {
  private readonly logger = new Logger(KartvizitService.name);

  constructor(private supabase: SupabaseService) {}

  private async kullanici(userId: string) {
    const { data, error } = await this.supabase.client
      .from("users")
      .select("full_name, title, phone, email, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as { full_name: string; title: string | null; phone: string | null; email: string | null; avatar_url: string | null } | null;
  }

  async durum(userId: string): Promise<KartvizitDurumu> {
    const [k, { data: satir, error }] = await Promise.all([
      this.kullanici(userId),
      this.supabase.client.from(TABLO).select("*").eq("user_id", userId).maybeSingle(),
    ]);
    if (error) throw error;
    const avatarUrl = k?.avatar_url ?? null;
    const profil = {
      fullName: k?.full_name ?? "",
      title: k?.title ?? null,
      phone: k?.phone ?? null,
      email: k?.email ?? null,
      avatarUrl,
    };
    const adaylar = kartvizitAdresOnerileri(profil.fullName, profil.title, 10);
    const bos = await this.adresDurumu(userId, adaylar);
    return {
      kart: satir ? kartaCevir(satir as KartvizitDbSatiri, avatarUrl) : null,
      profil,
      oneriler: adaylar.filter((a) => bos[a]).slice(0, 6),
    };
  }

  /** Her adres için: bu kullanıcı alabilir mi (geçerli + başkasında değil). Kendi adresi "alabilir" sayılır. */
  async adresDurumu(userId: string, adresler: string[]): Promise<Record<string, boolean>> {
    const temiz = [...new Set(adresler.map((a) => a.trim().toLowerCase()))].slice(0, 12);
    const sonuc: Record<string, boolean> = {};
    const gecerli = temiz.filter((a) => {
      const ok = !kartvizitAdresHatasi(a);
      sonuc[a] = ok;
      return ok;
    });
    if (!gecerli.length) return sonuc;
    const { data, error } = await this.supabase.client.from(TABLO).select("adres, user_id").in("adres", gecerli);
    if (error) throw error;
    for (const r of (data ?? []) as { adres: string; user_id: string }[]) if (r.user_id !== userId) sonuc[r.adres] = false;
    return sonuc;
  }

  async kaydet(userId: string, govde: unknown): Promise<Kartvizit> {
    const dogrulama = kartvizitGirdisiniDogrula(govde);
    if ("hata" in dogrulama) throw new BadRequestException(dogrulama.hata);
    const veri = dogrulama.veri;

    const { data: sahibi, error: e1 } = await this.supabase.client.from(TABLO).select("user_id").eq("adres", veri.adres).maybeSingle();
    if (e1) throw e1;
    if (sahibi && (sahibi as { user_id: string }).user_id !== userId) throw new ConflictException("Bu adres alınmış, başka bir adres seç.");

    const { data, error } = await this.supabase.client
      .from(TABLO)
      .upsert({ user_id: userId, ...veri, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) {
      // Aynı adresi iki kişi aynı anda kaydederse kontrolden ikisi de geçer; tekil indeks yakalar.
      if ((error as { code?: string }).code === "23505") throw new ConflictException("Bu adres alınmış, başka bir adres seç.");
      throw error;
    }
    const k = await this.kullanici(userId);
    return kartaCevir(data as KartvizitDbSatiri, k?.avatar_url ?? null);
  }

  async sil(userId: string): Promise<{ ok: true }> {
    const { error } = await this.supabase.client.from(TABLO).delete().eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  }

  // ------------------------------------------------------------ herkese açık

  async herkeseAcik(adres: string): Promise<KartvizitSayfaVerisi | null> {
    const a = adres.trim().toLowerCase();
    if (kartvizitAdresHatasi(a)) return null;
    const { data, error } = await this.supabase.client.from(TABLO).select("*").eq("adres", a).eq("active", true).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const r = data as KartvizitDbSatiri;
    const k = r.show_photo ? await this.kullanici(r.user_id) : null;
    return {
      adres: r.adres,
      fullName: r.full_name,
      title: r.title,
      titleEn: r.title_en,
      phone: r.phone,
      email: r.email,
      website: r.website,
      location: r.location,
      tagline: r.tagline,
      taglineEn: r.tagline_en,
      sosyal: r.sosyal ?? {},
      avatarUrl: k?.avatar_url ?? null,
    };
  }

  /** Caddy on_demand_tls: bu adres için sertifika alınsın mı. */
  async aktifMi(adres: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.from(TABLO).select("adres").eq("adres", adres).eq("active", true).maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async vcard(k: KartvizitSayfaVerisi, dil: "tr" | "en"): Promise<string> {
    const foto = k.avatarUrl ? await this.fotograf(k.avatarUrl) : null;
    return kartvizitVcard(
      {
        adres: k.adres,
        fullName: k.fullName,
        title: dil === "en" ? k.titleEn || k.title : k.title,
        phone: k.phone,
        email: k.email,
        website: k.website,
        location: k.location,
        sosyal: k.sosyal,
      },
      foto ?? undefined
    );
  }

  qrSvg(k: KartvizitSayfaVerisi): string {
    return kartvizitQrSvg(kartvizitAdresi(k.adres));
  }

  /**
   * Profil fotoğrafını rehber kaydına gömmek için okur. Yalnızca kendi avatar
   * kovamızdaki dosyalar: adres dışarıdan bir yere işaret ediyorsa (eski
   * kayıt, Google profil fotoğrafı) gömülmez — sunucunun keyfi bir adrese
   * istek atması istenmez.
   */
  private async fotograf(avatarUrl: string): Promise<{ base64: string; tur: "JPEG" | "PNG" } | null> {
    const isaret = `/object/public/${AVATAR_KOVASI}/`;
    const i = avatarUrl.indexOf(isaret);
    if (i < 0) return null;
    const yol = decodeURIComponent(avatarUrl.slice(i + isaret.length).split("?")[0]);
    try {
      const { data, error } = await this.supabase.client.storage.from(AVATAR_KOVASI).download(yol);
      if (error || !data) return null;
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.length > FOTO_EN_COK_BAYT) return null;
      const tur = buf[0] === 0x89 && buf[1] === 0x50 ? "PNG" : buf[0] === 0xff && buf[1] === 0xd8 ? "JPEG" : null;
      if (!tur) return null; // WebP vb.: iOS rehberi tanımıyor, fotoğrafsız kayıt daha iyi
      return { base64: buf.toString("base64"), tur };
    } catch (e) {
      this.logger.warn(`Kartvizit fotoğrafı okunamadı: ${(e as Error).message}`);
      return null;
    }
  }
}
