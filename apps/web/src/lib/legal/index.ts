import { distanceDoc } from "./distanceSales";
import { kvkkDoc } from "./kvkkNotice";
import type { LegalDoc } from "./legalDoc";
import { privacyDoc } from "./privacyPolicy";
import { refundDoc } from "./refundPolicy";
import { termsDoc } from "./termsOfService";

export type LegalDocKind = "privacy" | "terms" | "kvkk" | "distance" | "refund";

/**
 * Yayımlanan yasal metinlerin kaydı. Sayfa bileşeni (LegalDocPage) yalnızca
 * buraya bakar; yeni bir metin eklemek için buraya bir satır yazmak ve
 * App.tsx'e rotayı tanıtmak yeterli.
 */
export const legalDocs: Record<LegalDocKind, LegalDoc> = {
  privacy: privacyDoc,
  terms: termsDoc,
  // KVKK aydınlatma metni: Kanun m.10 "ayrı ve önceden" aydınlatma arıyor,
  // bu yüzden politikanın içine gömülü değil kendi adresinde duruyor.
  kvkk: kvkkDoc,
  // Satın alma paneldeyken yapılıyor: mesafeli satış sözleşmesi ve iade
  // koşulları da burada erişilebilir olmalı, yalnızca tanıtım sitesinde değil.
  distance: distanceDoc,
  refund: refundDoc,
};

export * from "./legalDoc";
