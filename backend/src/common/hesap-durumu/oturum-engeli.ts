/**
 * Bir oturum jetonu, hesabın ŞU ANKİ durumuna göre hâlâ geçerli mi?
 *
 * Jeton imzası geçerli olsa bile iki durumda reddedilir:
 *   1. Hesap askıya alınmış (banned_at dolu).
 *   2. Oturumlar iptal edilmiş ve bu jeton iptal anından ÖNCE başlamış
 *      (loginAt < sessions_revoked_at).
 *
 * Veritabanına bakmıyor, yalnızca karar veriyor; veriyi HesapDurumuService
 * önbellekten sağlıyor. Dekoratörlü dosyalardan ayrı, çünkü test koşucusu
 * (node --test, tip silme) dekoratör içeren dosyaları yükleyemiyor.
 */

export type HesapEngelKaydi = {
  bannedAt: number | null;
  /** Milisaniye. */
  sessionsRevokedAt: number | null;
};

export type OturumKarari = "gecerli" | "askida" | "oturum_iptal";

/**
 * @param loginAt Jetondaki ilk giriş anı (SANİYE). Yoksa 0 sayılır: alan
 *                eklenmeden önce üretilmiş jetonların ne zaman başladığı
 *                bilinmiyor, iptal varsa onlar da gitmeli — aksi hâlde
 *                "tüm cihazlardan çıkış" eski bir jetonu ayakta bırakırdı.
 */
export function oturumKarari(kayit: HesapEngelKaydi | undefined, loginAt: number | undefined): OturumKarari {
  if (!kayit) return "gecerli";
  if (kayit.bannedAt !== null) return "askida";
  if (kayit.sessionsRevokedAt !== null) {
    const baslangicMs = (loginAt ?? 0) * 1000;
    // Eşitlik iptal SAYILIR: jeton saniye hassasiyetinde, iptal milisaniye.
    // İptalle aynı saniyede başlamış oturum, iptalden önce mi sonra mı
    // başladı bilinemez; güvenli taraf reddetmek. Kişi tekrar giriş yapar.
    if (baslangicMs <= kayit.sessionsRevokedAt) return "oturum_iptal";
  }
  return "gecerli";
}

/**
 * Sütunlar `TIMESTAMP` (saat dilimsiz) ve PostgREST onları "Z" olmadan döndürüyor;
 * `Date.parse` böyle bir metni YEREL saat sayar. Süreç Europe/Istanbul'da
 * çalışırsa oturum iptal sınırı 3 saat kayardı. Yazarken toISOString() (UTC)
 * kullanıldığı için okurken de UTC sayılmalı.
 */
export function utcMs(deger: string | null | undefined): number | null {
  if (!deger) return null;
  const saatDilimli = /(Z|[+-]\d{2}:?\d{2})$/.test(deger);
  const ms = Date.parse(saatDilimli ? deger : `${deger}Z`);
  return Number.isNaN(ms) ? null : ms;
}

export const OTURUM_KARARI_MESAJI: Record<Exclude<OturumKarari, "gecerli">, string> = {
  askida: "Hesabın askıya alındı. Destek için bizimle iletişime geç.",
  oturum_iptal: "Oturumun sonlandırıldı, lütfen yeniden giriş yap.",
};
