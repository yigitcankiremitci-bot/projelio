/**
 * Lio'nun sosyal medya araçlarının saf kuralları: zaman çözme, içerik türü
 * seçimi, planlama öncesi kontroller. Servisten ayrı (bkz. publish-format.ts).
 */

import { yereldenUtc } from "@projelio/shared";

const VARSAYILAN_DILIM = process.env.TZ?.trim() || "Europe/Istanbul";

/** Yayın vakti geçmişe ya da "şimdi"ye bu kadar yakın olamaz: kuyruk dakikada bir bakıyor. */
export const EN_YAKIN_PLAN_MS = 2 * 60 * 1000;

/**
 * Modelin verdiği zamanı UTC anına çevirir.
 *
 * İki biçim kabul edilir: ofsetli/Z'li ISO ("2026-10-01T19:00:00+03:00") olduğu
 * gibi alınır; ofsetsiz duvar saati ("2026-10-01T19:00") kullanıcının saat
 * dilimine göre yorumlanır. Model ofseti yanlış hesaplayabildiği için ikinci
 * biçim tercih ediliyor (araç açıklaması da öyle söylüyor).
 */
export function zamaniCoz(girdi: string | undefined | null, saatDilimi = VARSAYILAN_DILIM): Date | null {
  const s = girdi?.trim();
  if (!s) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (!m) return null;
  const d = yereldenUtc(m[1], m[2], saatDilimi);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Kullanıcıya gösterilecek yerel zaman: "1 Ekim 2026 Perşembe 19:00". */
export function zamaniGoster(an: Date, saatDilimi = VARSAYILAN_DILIM): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: saatDilimi,
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(an);
}

export type IcerikTuru = "image" | "video" | "carousel" | "reel" | "story";

/**
 * Medyadan içerik türü. Tek video Instagram'da varsayılan olarak reels'tir
 * (kullanıcı "reels" dedi ya da demedi — video paylaşımı Instagram'da reels
 * olarak çıkıyor); birden çok medya karuseldir.
 */
export function icerikTuruSec(mimeTypes: string[], istenen?: string | null): IcerikTuru {
  if (istenen && ["image", "video", "carousel", "reel", "story"].includes(istenen)) return istenen as IcerikTuru;
  if (mimeTypes.length > 1) return "carousel";
  return mimeTypes[0]?.startsWith("video/") ? "reel" : "image";
}

/** Karusel sınırı Instagram'da 10. */
export const KARUSEL_TAVANI = 10;

/**
 * Planlamadan önce taslakta olması gerekenler. Boş dönerse planlanabilir;
 * doluysa her madde kullanıcıya söylenecek bir eksik.
 */
export function planlamaEksikleri(p: {
  medyaSayisi: number;
  hedefSayisi: number;
  caption?: string | null;
  vakit: Date | null;
  simdi: Date;
}): string[] {
  const e: string[] = [];
  if (p.medyaSayisi === 0) e.push("Gönderide görsel/video yok.");
  if (p.hedefSayisi === 0) e.push("Gönderinin yayımlanacağı hesap yok.");
  if (!p.caption?.trim()) e.push("Açıklama boş.");
  if (!p.vakit) e.push("Yayın zamanı belirtilmemiş.");
  else if (p.vakit.getTime() < p.simdi.getTime() + EN_YAKIN_PLAN_MS) {
    e.push("Yayın zamanı geçmişte ya da çok yakın; en az birkaç dakika sonrası olmalı.");
  }
  return e;
}

/**
 * WhatsApp'ın kendi sıkıştırdığı video/fotoğraf dosya adı taşımaz; köprü ona bu
 * önekle ad verir (bkz. whatsapp-lio.service dosyaAdi). Belge olarak gönderilen
 * orijinal dosya kendi adıyla gelir. Kalite bilgisi dosya kaydında ayrıca
 * tutulmadığı için ayrım bu addan yapılır.
 */
export const WHATSAPP_ADSIZ_DOSYA_ONEKI = "whatsapp-dosyasi";

/**
 * Taslağa bağlı medyanın tek satırlık tanımı: ad · tür · boyut · kalite.
 *
 * NEDEN: 2026-09-30'da aynı içerik için üç taslak vardı; ikisinde orijinal
 * (211 MB), birinde WhatsApp'ın sıkıştırdığı (22 MB) video. Notta video
 * yazmadığı için kullanıcı sıkıştırılmış olanı tutup orijinalleri iptal
 * ettirdi ve yanlış video planlandı.
 */
export function medyaEtiketi(f: { name?: string | null; mime_type?: string | null; size_bytes?: number | string | null }): string {
  const ad = f.name || "medya";
  const tur = (f.mime_type ?? "").startsWith("video/") ? "video" : "görsel";
  const bayt = Number(f.size_bytes ?? 0);
  const boyut = bayt > 0 ? ` · ${(bayt / 1048576).toFixed(0)} MB` : "";
  const kalite = ad.startsWith(WHATSAPP_ADSIZ_DOSYA_ONEKI) ? "WhatsApp'ın sıkıştırdığı kopya" : "orijinal dosya";
  return `${ad} · ${tur}${boyut} · ${kalite}`;
}

/**
 * Veritabanından gelen saat dilimsiz zaman damgası ("2026-10-01T16:00:00") UTC'dir
 * (bkz. migration 127). `new Date()` ofsetsiz metni SÜRECİN saat dilimiyle okur;
 * backend bugün UTC'de çalıştığı için doğru çıkıyor, ama konteynere bir gün
 * TZ=Europe/Istanbul verilirse planlanan saat 3 saat kayardı.
 */
export function utcAn(damga: string): Date {
  return new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(damga) ? damga : `${damga}Z`);
}
