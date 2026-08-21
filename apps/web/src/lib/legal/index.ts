import type { LegalDoc } from "./legalDoc";
import { privacyDoc } from "./privacyPolicy";
import { termsDoc } from "./termsOfService";

export type LegalDocKind = "privacy" | "terms";

/**
 * Yayımlanan yasal metinlerin kaydı. Sayfa bileşeni (LegalDocPage) yalnızca
 * buraya bakar; yeni bir metin eklemek için buraya bir satır yazmak ve
 * App.tsx'e rotayı tanıtmak yeterli.
 */
export const legalDocs: Record<LegalDocKind, LegalDoc> = {
  privacy: privacyDoc,
  terms: termsDoc,
};

export * from "./legalDoc";
