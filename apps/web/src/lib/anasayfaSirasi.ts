// Şirket anasayfasındaki bölümlerin (Ürün/Hizmet, Departmanlar, Ekip, Modüller)
// sırası. Her kullanıcı kendi çalışma düzenine göre dizer: modüllerle yaşayan
// biri onları en üste, satışçı ürünleri öne alır.
//
// Cihazda (localStorage) tutuluyor — hesap sırası ile aynı mantık (bkz.
// socialAccountOrder.ts): kişisel bir görünüm tercihi, ekibin ortak verisi
// değil; sunucu alanı olsaydı bir kişinin düzeni herkesinkini değiştirirdi.
// Sıra ŞİRKET BAŞINA saklanıyor: iki şirkette farklı işler öne çıkıyor.

import { moveItem, sortByOrder } from "./socialAccountOrder";

export const ANASAYFA_BOLUMLERI = ["products", "departments", "team", "modules"] as const;
export type AnasayfaBolumu = (typeof ANASAYFA_BOLUMLERI)[number];

const PREFIX = "projelio_sirket_anasayfa_sirasi_";

/**
 * Kayıtlı sırayı geçerli bölümlere uygular. Bilinmeyen anahtarlar atlanır,
 * sonradan eklenen bir bölüm SONA gelir — eski bir kayıt yeni bölümü
 * kaybettirmesin.
 */
export function anasayfaSirasiniCoz(kayitli: string[]): AnasayfaBolumu[] {
  return sortByOrder(
    ANASAYFA_BOLUMLERI.map((id) => ({ id })),
    kayitli
  ).map((x) => x.id);
}

/** Bölümü bir yukarı (-1) ya da aşağı (+1) taşır; uçta ise sıra değişmez. */
export function bolumuTasi(sira: AnasayfaBolumu[], bolum: AnasayfaBolumu, yon: -1 | 1): AnasayfaBolumu[] {
  const i = sira.indexOf(bolum);
  return moveItem(sira, i, i + yon);
}

export function getAnasayfaSirasi(organizationId: string): AnasayfaBolumu[] {
  try {
    const raw = localStorage.getItem(`${PREFIX}${organizationId}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return anasayfaSirasiniCoz(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    // Bozuk değer ya da kapalı depolama: varsayılan sıra.
    return [...ANASAYFA_BOLUMLERI];
  }
}

export function setAnasayfaSirasi(organizationId: string, sira: AnasayfaBolumu[]) {
  try {
    localStorage.setItem(`${PREFIX}${organizationId}`, JSON.stringify(sira));
  } catch {
    // Yazılamazsa sıra yalnızca bu oturumda geçerli olur.
  }
}
