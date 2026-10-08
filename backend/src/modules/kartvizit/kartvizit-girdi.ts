import {
  KARTVIZIT_SINIRLAR,
  KARTVIZIT_SOSYAL,
  kartvizitAdresHatasi,
  kartvizitSosyalNormallestir,
  safeExternalUrl,
  type KartvizitAdresHatasi,
  type KartvizitSosyal,
} from "@projelio/shared";

/** Veritabanına yazılacak hali (snake_case, boş alanlar null). */
export interface KartvizitSatiri {
  adres: string;
  full_name: string;
  title: string | null;
  title_en: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  tagline: string | null;
  tagline_en: string | null;
  sosyal: KartvizitSosyal;
  show_photo: boolean;
  active: boolean;
}

export const ADRES_HATA_METNI: Record<KartvizitAdresHatasi, string> = {
  kisa: "Adres en az 3 karakter olmalı.",
  uzun: "Adres en fazla 30 karakter olabilir.",
  karakter: "Adreste yalnızca küçük harf, rakam ve tire kullanılabilir.",
  tire: "Adres tireyle başlayıp bitemez, iki tire yan yana gelemez.",
  ayrilmis: "Bu adres Projelio'ya ayrılmış, başka bir adres seç.",
};

const ETIKET: Record<keyof typeof KARTVIZIT_SINIRLAR, string> = {
  fullName: "Ad soyad",
  title: "Unvan",
  phone: "Telefon",
  email: "E-posta",
  website: "Web sitesi",
  location: "Konum",
  tagline: "Kısa söz",
};

/**
 * Formdan gelen gövdeyi doğrulayıp yazılacak satıra çevirir. Saf: veritabanına
 * bakmaz (adresin boşta olup olmadığına servis bakar). Hata varsa ilk hatanın
 * Türkçe metnini döndürür.
 */
export function kartvizitGirdisiniDogrula(govde: unknown): { veri: KartvizitSatiri } | { hata: string } {
  if (!govde || typeof govde !== "object") return { hata: "Geçersiz istek." };
  const b = govde as Record<string, unknown>;

  const metin = (alan: string, sinir: number, etiket: string, zorunlu = false): string | null | { hata: string } => {
    const v = b[alan];
    if (v === undefined || v === null) return zorunlu ? { hata: `${etiket} gerekli.` } : null;
    if (typeof v !== "string") return { hata: `${etiket} metin olmalı.` };
    const s = v.replace(/\s+/g, " ").trim();
    if (!s) return zorunlu ? { hata: `${etiket} gerekli.` } : null;
    if (s.length > sinir) return { hata: `${etiket} en fazla ${sinir} karakter olabilir.` };
    return s;
  };
  const hataMi = (x: unknown): x is { hata: string } => !!x && typeof x === "object" && "hata" in x;

  const adresHam = typeof b.adres === "string" ? b.adres.trim().toLowerCase() : "";
  const adresHatasi = kartvizitAdresHatasi(adresHam);
  if (adresHatasi) return { hata: ADRES_HATA_METNI[adresHatasi] };

  const S = KARTVIZIT_SINIRLAR;
  const fullName = metin("fullName", S.fullName, ETIKET.fullName, true);
  const title = metin("title", S.title, ETIKET.title);
  const titleEn = metin("titleEn", S.title, "İngilizce unvan");
  const phone = metin("phone", S.phone, ETIKET.phone);
  const email = metin("email", S.email, ETIKET.email);
  const websiteHam = metin("website", S.website, ETIKET.website);
  const location = metin("location", S.location, ETIKET.location);
  const tagline = metin("tagline", S.tagline, ETIKET.tagline);
  const taglineEn = metin("taglineEn", S.tagline, "İngilizce kısa söz");
  for (const x of [fullName, title, titleEn, phone, email, websiteHam, location, tagline, taglineEn]) if (hataMi(x)) return x;

  if (typeof phone === "string") {
    if (!/^\+?[\d\s()\-.]+$/.test(phone)) return { hata: "Telefon numarasında yalnızca rakam, boşluk, +, - ve parantez olabilir." };
    const rakam = phone.replace(/\D/g, "").length;
    if (rakam < 7 || rakam > 15) return { hata: "Telefon numarası 7 ile 15 rakam arasında olmalı." };
  }
  if (typeof email === "string" && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(email)) return { hata: "E-posta adresi geçerli görünmüyor." };

  let website: string | null = null;
  if (typeof websiteHam === "string") {
    const guvenli = safeExternalUrl(websiteHam);
    if (!guvenli || !/^https?:\/\//i.test(guvenli)) return { hata: "Web sitesi adresi geçerli görünmüyor." };
    website = guvenli;
  }

  const sosyal: KartvizitSosyal = {};
  if (b.sosyal !== undefined && b.sosyal !== null) {
    if (typeof b.sosyal !== "object" || Array.isArray(b.sosyal)) return { hata: "Sosyal hesaplar geçersiz." };
    const ham = b.sosyal as Record<string, unknown>;
    for (const tanim of KARTVIZIT_SOSYAL) {
      const v = ham[tanim.anahtar];
      if (v === undefined || v === null || v === "") continue;
      if (typeof v !== "string") return { hata: `${tanim.ad} metin olmalı.` };
      const n = kartvizitSosyalNormallestir(tanim.anahtar, v);
      if (n === null) return { hata: `${tanim.ad} hesabı tanınmadı. Kullanıcı adını ya da profil adresini yaz.` };
      if (n) sosyal[tanim.anahtar] = n;
    }
  }

  return {
    veri: {
      adres: adresHam,
      full_name: fullName as string,
      title: title as string | null,
      title_en: titleEn as string | null,
      phone: phone as string | null,
      email: typeof email === "string" ? email.toLowerCase() : null,
      website,
      location: location as string | null,
      tagline: tagline as string | null,
      tagline_en: taglineEn as string | null,
      sosyal,
      show_photo: b.showPhoto !== false,
      active: b.active !== false,
    },
  };
}

/**
 * Caddy'nin sertifika sormadan önce gönderdiği alan adından kartvizit adresi.
 * Yalnızca TEK seviyeli alt alan adı kabul edilir (a.b.projelio.app hayır).
 */
export function alanAdindanAdres(alan: string | undefined, kok = "projelio.app"): string | null {
  if (!alan) return null;
  const a = alan.trim().toLowerCase().replace(/\.$/, "");
  const sonek = `.${kok}`;
  if (!a.endsWith(sonek)) return null;
  const etiket = a.slice(0, -sonek.length);
  if (!etiket || etiket.includes(".")) return null;
  return kartvizitAdresHatasi(etiket) ? null : etiket;
}
