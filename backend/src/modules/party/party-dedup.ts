import type { Party, PartyDuplicate, PartyRole } from "@projelio/shared";

/**
 * Tekilleştirme ve rol kurallarının saf (yan etkisiz) hali.
 *
 * Ortak varlığın en büyük riski aynı firmanın üç kez girilmesidir: "ABC Ltd",
 * "ABC Ltd." ve "abc ltd" üç ayrı kayıt olursa müşteri verisi yine bölünür ve
 * party'nin varlık sebebi ortadan kalkar.
 *
 * Veritabanı sorguları PartyService'te kalır; burada yalnızca "bu adaylar
 * verildiğinde hangisi kopya?" sorusu yanıtlanır — böylece Supabase taklit
 * etmeden test edilebiliyor.
 *
 * Bkz. docs/moduller/03-ortak-varlik-party.md §4
 */

// Ticaret unvanlarındaki tüzel kişilik ekleri. "ABC A.Ş." ile "ABC" aynı
// firmadır; bu ekler karşılaştırma öncesi atılır.
const LEGAL_SUFFIXES = [
  "anonim sirketi",
  "limited sirketi",
  "kollektif sirketi",
  "komandit sirketi",
  "sti",
  "ltd",
  "as",
  "aş",
  "san",
  "tic",
  "sanayi",
  "ticaret",
  "ve",
  "inc",
  "llc",
  "gmbh",
  "co",
  "corp",
];

/**
 * Türkçe'ye duyarlı normalleştirme.
 *
 * `toLowerCase()` tek başına yetmez: "İ" İngilizce kurallarla "i̇" (araya
 * birleşen nokta) üretir, "I" ise "i" olur — ikisi de Türkçe'de yanlış.
 * Önce Türkçe'ye özgü harfleri sabitleyip sonra küçültüyoruz.
 */
export function normalizeName(raw: string): string {
  return raw
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr")
    // Aksanlı harfler ASCII karşılığına indirgenir: "Şirket" ~ "sirket".
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/ı/g, "i")
    // Nokta kısaltma içinde harfleri AYIRMAZ, birleştirir: "A.Ş." tek bir
    // kelimedir ("as"), iki ayrı harf değil. Bu yüzden nokta boşluğa değil
    // hiçliğe döner; diğer noktalama işaretleri kelime ayırıcıdır.
    .replace(/\./g, "")
    .replace(/[,''"`\-_/\\()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0 && !LEGAL_SUFFIXES.includes(word))
    .join(" ");
}

/** Vergi/TC numarasını karşılaştırılabilir hale getirir (boşluk ve tire atılır). */
export function normalizeTaxNumber(raw: string): string {
  return raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLocaleLowerCase("en");
}

export interface DuplicateCandidateInput {
  displayName?: string;
  taxNumber?: string;
  email?: string;
  /** Güncellemede kaydın kendisi kopya sayılmasın diye. */
  excludeId?: string;
}

/**
 * Adaylar arasından kopyaları bulur.
 *
 * Sıra önem taşır: vergi numarası eşleşmesi kesin kabul edilip kaydı engeller,
 * diğerleri yalnızca uyarır. Ad benzerliği tek başına engelleyici olamaz —
 * gerçekten aynı adı taşıyan iki ayrı şube olabilir.
 */
export function findDuplicates(input: DuplicateCandidateInput, candidates: Party[]): PartyDuplicate[] {
  const found: PartyDuplicate[] = [];
  const seen = new Set<string>();

  const push = (party: Party, severity: PartyDuplicate["severity"], reason: PartyDuplicate["reason"]) => {
    if (seen.has(party.id)) return;
    seen.add(party.id);
    found.push({ party, severity, reason });
  };

  const usable = candidates.filter(
    (c) => c.id !== input.excludeId && !c.mergedIntoId && !c.archivedAt
  );

  if (input.taxNumber?.trim()) {
    const target = normalizeTaxNumber(input.taxNumber);
    if (target) {
      for (const c of usable) {
        if (c.taxNumber && normalizeTaxNumber(c.taxNumber) === target) push(c, "block", "tax_number");
      }
    }
  }

  if (input.email?.trim()) {
    const target = normalizeEmail(input.email);
    for (const c of usable) {
      if (c.email && normalizeEmail(c.email) === target) push(c, "warn", "email");
    }
  }

  if (input.displayName?.trim()) {
    const target = normalizeName(input.displayName);
    // Normalleştirme sonrası boşalan ad (ör. yalnızca "Ltd. Şti.") kimseyle
    // eşleşmemeli; aksi halde tüm eksik adlar birbirinin kopyası sayılırdı.
    if (target) {
      for (const c of usable) {
        if (normalizeName(c.displayName) === target) push(c, "warn", "name");
      }
    }
  }

  return found;
}

/**
 * Rol ekleme kuralı: roller eklenir, silinmez.
 *
 * İlk fatura kesildiğinde `lead` → `customer` geçişi bir DEĞİŞTİRME değil
 * EKLEMEdir; kaydın potansiyel olarak başladığı bilgisi kaybolmamalı.
 */
export function addRole(current: PartyRole[], role: PartyRole): PartyRole[] {
  return current.includes(role) ? current : [...current, role];
}

/** Rolü elle kaldırma (yalnızca kullanıcı isteğiyle). Son rol silinemez. */
export function removeRole(current: PartyRole[], role: PartyRole): PartyRole[] {
  const next = current.filter((r) => r !== role);
  return next.length > 0 ? next : current;
}
