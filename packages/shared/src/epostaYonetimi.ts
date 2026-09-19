import { adminMesajLinkiGecerliMi } from "./adminKullanici";

/**
 * Admin > E-posta: ipuçları, toplu/tekil gönderim ve Lio maliyeti (bkz.
 * migration 119, backend/src/modules/eposta-yonetimi/).
 *
 * Doğrulama burada, çünkü iki yerde çalışıyor: arayüz "Gönder"i daha
 * basılmadan kapatıyor, sunucu aynı kuralla reddediyor. İki kopya olsaydı
 * biri gevşediğinde arayüz kabul edip sunucu reddederdi.
 */

/**
 * Kime gidecek.
 *   herkes — doğrulanmış adresi olan tüm kullanıcılar
 *   yeni   — son `gun` günde kayıt olanlar
 *   pasif  — son `gun` gündür uygulamaya girmeyenler (hiç girmeyenler dahil)
 *   secili — elle seçilen kişiler; TEK kişi seçiliyse gönderim "tekil"dir
 *
 * Toplu gönderim, ipucu/duyuru e-postalarını kapatmış kişiye GİTMEZ. Tekil
 * gönderim yöneticinin o kişiye yazdığı bir mesajdır, tercihe bakmaz.
 */
export type EpostaHedefi =
  | { tur: "herkes" }
  | { tur: "yeni"; gun: number }
  | { tur: "pasif"; gun: number }
  | { tur: "secili"; kullaniciIds: string[] };

export interface EpostaKampanyaGirdisi {
  konu: string;
  baslik: string;
  govde: string;
  /** Düğmenin gideceği yer: uygulama içi yol ("/tasks") ya da https adresi. */
  link?: string;
  dugme?: string;
  /** Lio her alıcıya metni yeniden yazsın. */
  lioIle: boolean;
  hedef: EpostaHedefi;
  /**
   * Gönderimin başlayacağı an (ISO, UTC). Yoksa hemen. Alıcı listesi
   * planlandığı an belirlenir (bkz. migration 123).
   */
  planlananAt?: string;
}

export const EPOSTA_KAMPANYA_SINIRI = {
  konu: 140,
  baslik: 120,
  govde: 5000,
  dugme: 40,
  link: 300,
  /** Elle seçilebilecek en fazla kişi. Daha genişi için kitle seçenekleri var. */
  secili: 500,
  gun: 365,
  /** Taslak isteği. */
  istek: 2000,
  /** En fazla bu kadar gün ilerisine planlanabilir. */
  planGun: 60,
} as const;

/**
 * Planlanan anın geçerliliği. Birkaç dakikalık geçmiş kabul ediliyor: form
 * doldurulurken seçilen "şimdiden 5 dk sonra" gönderilene kadar geçmiş
 * olabilir; o durumda hemen gitmesi doğru davranış.
 */
export function planlananAniDogrula(
  deger: unknown,
  simdi: Date = new Date()
): { hata: string } | { temiz: string | undefined } {
  if (deger === undefined || deger === null || deger === "") return { temiz: undefined };
  const an = typeof deger === "string" ? new Date(deger) : null;
  if (!an || Number.isNaN(an.getTime())) return { hata: "Geçersiz gönderim zamanı." }; // dil:anahtar
  if (an.getTime() < simdi.getTime() - 10 * 60_000) return { hata: "Gönderim zamanı geçmişte olamaz." }; // dil:anahtar
  if (an.getTime() > simdi.getTime() + EPOSTA_KAMPANYA_SINIRI.planGun * 86_400_000) {
    return { hata: "En fazla 60 gün ilerisine planlanabilir." }; // dil:anahtar
  }
  return { temiz: an.toISOString() };
}

export function kampanyaGirdisiniDogrula(
  g: Partial<EpostaKampanyaGirdisi>
): { hata: string } | { temiz: EpostaKampanyaGirdisi } {
  const konu = (g.konu ?? "").trim();
  const baslik = (g.baslik ?? "").trim();
  const govde = (g.govde ?? "").trim();
  const link = (g.link ?? "").trim();
  const dugme = (g.dugme ?? "").trim();
  if (!konu) return { hata: "Konu boş olamaz." }; // dil:anahtar
  if (konu.length > EPOSTA_KAMPANYA_SINIRI.konu) return { hata: "Konu çok uzun." }; // dil:anahtar
  if (!baslik) return { hata: "Başlık boş olamaz." }; // dil:anahtar
  if (baslik.length > EPOSTA_KAMPANYA_SINIRI.baslik) return { hata: "Başlık çok uzun." }; // dil:anahtar
  if (!govde) return { hata: "Mesaj boş olamaz." }; // dil:anahtar
  if (govde.length > EPOSTA_KAMPANYA_SINIRI.govde) return { hata: "Mesaj çok uzun." }; // dil:anahtar
  if (link && (link.length > EPOSTA_KAMPANYA_SINIRI.link || !adminMesajLinkiGecerliMi(link))) {
    return { hata: "Bağlantı / ile başlayan bir uygulama yolu ya da https:// adresi olmalı." }; // dil:anahtar
  }
  if (link && !dugme) return { hata: "Bağlantı verdiysen düğme metnini de yaz." }; // dil:anahtar
  if (dugme.length > EPOSTA_KAMPANYA_SINIRI.dugme) return { hata: "Düğme metni çok uzun." }; // dil:anahtar

  const h = g.hedef as EpostaHedefi | undefined;
  let hedef: EpostaHedefi;
  if (!h || typeof h !== "object") return { hata: "Kime gideceğini seç." }; // dil:anahtar
  if (h.tur === "herkes") hedef = { tur: "herkes" };
  else if (h.tur === "yeni" || h.tur === "pasif") {
    const gun = Number(h.gun);
    if (!Number.isInteger(gun) || gun < 1 || gun > EPOSTA_KAMPANYA_SINIRI.gun) {
      return { hata: "Gün sayısı 1 ile 365 arasında olmalı." }; // dil:anahtar
    }
    hedef = { tur: h.tur, gun };
  } else if (h.tur === "secili") {
    const ids = Array.isArray(h.kullaniciIds)
      ? [...new Set(h.kullaniciIds.filter((x): x is string => typeof x === "string" && UUID.test(x)))]
      : [];
    if (ids.length === 0) return { hata: "En az bir alıcı seç." }; // dil:anahtar
    if (ids.length > EPOSTA_KAMPANYA_SINIRI.secili) {
      return { hata: "Elle en fazla 500 kişi seçilebilir; daha geniş kitle için kitle seçeneklerini kullan." }; // dil:anahtar
    }
    hedef = { tur: "secili", kullaniciIds: ids };
  } else return { hata: "Kime gideceğini seç." }; // dil:anahtar

  const plan = planlananAniDogrula(g.planlananAt);
  if ("hata" in plan) return plan;

  return {
    temiz: {
      konu,
      baslik,
      govde,
      link: link || undefined,
      dugme: dugme || undefined,
      lioIle: g.lioIle === true,
      hedef,
      planlananAt: plan.temiz,
    },
  };
}

/** Tek kişiye seçili gönderim "tekil"dir: tercihe bakmaz, yanıtlanabilir adresten gider. */
export function kampanyaTekilMi(hedef: EpostaHedefi): boolean {
  return hedef.tur === "secili" && hedef.kullaniciIds.length === 1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EpostaKampanyaDurumu = "bekliyor" | "gonderiliyor" | "bitti" | "iptal";

export interface EpostaKampanyasi {
  id: string;
  tur: "toplu" | "tekil";
  konu: string;
  baslik: string;
  lioIle: boolean;
  hedef: EpostaHedefi;
  durum: EpostaKampanyaDurumu;
  aliciSayisi: number;
  gonderilen: number;
  basarisiz: number;
  atlanan: number;
  createdAt: string;
  bittiAt?: string;
  /** Planlı gönderimde başlama anı. */
  planlananAt?: string;
  /** Tekil gönderimde alıcının adı (listede kime gittiği görünsün). */
  aliciAdi?: string;
  /** Bu kampanyada Lio'nun harcadığı birim (maliyet defterinden). */
  birim?: number;
}

/** Admin listesindeki ipucu (kod + yönetici ayarı birleşik). */
export interface EpostaIpucuSatiri {
  anahtar: string;
  kaynak: "kod" | "ozel";
  baslik: string;
  govde: string;
  link: string;
  dugme: string;
  sira: number;
  aktif: boolean;
  lioIle: boolean;
  duzenlendi: boolean;
}

export interface EpostaAyarlariDto {
  ipuclariAcik: boolean;
  lioGunlukTavanBirim: number | null;
  /** Sunucuda Lio'nun yazabileceği bir sağlayıcı var mı. */
  lioKullanilabilir: boolean;
}

export type EpostaLioIslemi = "ipucu" | "kampanya" | "taslak" | "onizleme";

export interface EpostaMaliyetKalemi {
  adet: number;
  inputTokens: number;
  outputTokens: number;
  maliyetUsd: number;
  birim: number;
}

export interface EpostaMaliyetOzeti {
  gun: number;
  toplam: EpostaMaliyetKalemi;
  islemeGore: Record<EpostaLioIslemi, EpostaMaliyetKalemi>;
  kampanyalar: (EpostaMaliyetKalemi & { kampanyaId: string; konu: string; tur: "toplu" | "tekil"; birimBasina: number })[];
  ipuclari: (EpostaMaliyetKalemi & { anahtar: string; baslik: string; birimBasina: number })[];
  son: {
    id: string;
    createdAt: string;
    islem: EpostaLioIslemi;
    model: string;
    inputTokens: number;
    outputTokens: number;
    maliyetUsd: number;
    birim: number;
    basarili: boolean;
    aliciAdi?: string;
    konu?: string;
  }[];
}

/** Kalemleri toplar — sunucu özeti ve testler aynı fonksiyondan geçer. */
export function maliyetTopla(
  satirlar: { inputTokens: number; outputTokens: number; maliyetUsd: number; birim: number }[]
): EpostaMaliyetKalemi {
  const k: EpostaMaliyetKalemi = { adet: 0, inputTokens: 0, outputTokens: 0, maliyetUsd: 0, birim: 0 };
  for (const s of satirlar) {
    k.adet += 1;
    k.inputTokens += s.inputTokens;
    k.outputTokens += s.outputTokens;
    k.maliyetUsd += s.maliyetUsd;
    k.birim += s.birim;
  }
  k.maliyetUsd = Number(k.maliyetUsd.toFixed(6));
  k.birim = Number(k.birim.toFixed(2));
  return k;
}
