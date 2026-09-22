// dil:anahtar-dosya — etiketler; çeviri render anında (t(...)) yapılıyor.
import type { Party, PartyRole } from "@projelio/shared";
import { cevirmenSuAn } from "./i18n/anlik";

/**
 * Departman profilleri: aynı veri, farklı bakış.
 *
 * crm_musteri tek modüldür ve tek `party` tablosuna yazar, ama Satış ile
 * Müşteri İlişkileri aynı kayda aynı gözle bakmaz:
 *   - Satış sorar:            "Kim potansiyel? Kime dönmeliyim?"
 *   - Müşteri İlişkileri sorar: "Kimin sorunu var? Ne zaman temas ettik?"
 *
 * Profil yalnızca SUNUMU değiştirir. Hangi kayıtların görülebileceğini profil
 * değil izin belirler; `defaultFilter` bir varsayılandır, kullanıcı temizleyip
 * tüm kayıtları görebilir.
 *
 * Bkz. docs/moduller/04-departman-bazli-gorunum.md
 */

export interface PartyProfile {
  key: string;
  label: string;
  /** Liste ilk açıldığında uygulanan rol filtresi. */
  defaultRole?: PartyRole;
  /** Satır altında öne çıkarılacak bilgi. */
  detail: (p: Party) => string | undefined;
  /** Kayıt üzerindeki birincil hızlı eylem etiketi. */
  primaryActionLabel: string;
}

// dil:anahtar-baslangic — hepsi sözlükte olmak zorunda: detail() bu etiketleri
// birleşik metne gömüyor, eksik anahtar sessizce Türkçe kalır.
export const ROLE_LABELS: Record<PartyRole, string> = {
  lead: "Potansiyel",
  customer: "Müşteri",
  supplier: "Tedarikçi",
  distributor: "Bayi",
  candidate: "Aday",
  other: "Diğer",
};

export const ROLE_COLORS: Record<PartyRole, string> = {
  lead: "#b45309",
  customer: "#15803d",
  supplier: "#1d4ed8",
  distributor: "#7e22ce",
  candidate: "#475569",
  other: "#475569",
};

export const STATUS_LABELS: Record<Party["status"], string> = {
  active: "Aktif",
  passive: "Pasif",
  blocked: "Engelli",
};
// dil:anahtar-bitis

function joinDetail(...parts: (string | undefined | false)[]): string | undefined {
  const s = parts.filter(Boolean).join(" · ");
  return s || undefined;
}

// NEDEN cevirmenSuAn: `detail` birleşik bir metin üretiyor ("Müşteri · Aktif ·
// e-posta"), yani parçaları çağıran yerde t()'den geçirilemiyor. Burası da düz
// bir modül, kanca çağıramaz. Çevirmen çizim anında alınıyor: panel dil
// değişince yeniden çizildiği için metin de tazeleniyor.
const BASE_PROFILE: PartyProfile = {
  key: "base",
  label: "Tümü", // dil:anahtar
  detail: (p) => {
    const t = cevirmenSuAn();
    return joinDetail(
      p.roles.map((r) => t(ROLE_LABELS[r])).join(", "),
      t(STATUS_LABELS[p.status]),
      p.phone ?? p.email
    );
  },
  primaryActionLabel: "Aktivite ekle", // dil:anahtar
};

const PROFILES: Record<string, PartyProfile> = {
  satis_is_gelistirme: {
    key: "satis_is_gelistirme",
    label: "Satış görünümü", // dil:anahtar
    defaultRole: "lead",
    detail: (p) => {
      const t = cevirmenSuAn();
      return joinDetail(
        p.roles.map((r) => t(ROLE_LABELS[r])).join(", "),
        p.ownerName && t("Sorumlu: {ad}", { ad: p.ownerName }),
        p.source,
        p.phone ?? p.email
      );
    },
    primaryActionLabel: "Görüşme ekle", // dil:anahtar
  },
  musteri_iliskileri: {
    key: "musteri_iliskileri",
    label: "Müşteri ilişkileri görünümü", // dil:anahtar
    defaultRole: "customer",
    detail: (p) => {
      const t = cevirmenSuAn();
      return joinDetail(
        t(STATUS_LABELS[p.status]),
        p.email ?? p.phone,
        p.ownerName && t("Sorumlu: {ad}", { ad: p.ownerName })
      );
    },
    primaryActionLabel: "Temas ekle", // dil:anahtar
  },
};

/**
 * Departmanın profili. Tanımlı profili yoksa temel görünüme düşer —
 * profil zorunlu değil, bir iyileştirmedir.
 */
export function profileFor(departmentKey?: string): PartyProfile {
  return (departmentKey && PROFILES[departmentKey]) || BASE_PROFILE;
}

export const ALL_ROLES: PartyRole[] = ["lead", "customer", "supplier", "distributor", "candidate", "other"];
