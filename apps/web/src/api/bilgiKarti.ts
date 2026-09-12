import type {
  BilgiKarti,
  BilgiKartiAlani,
  BilgiKartiBelgesi,
  BilgiKartiBelgeTuru,
  BilgiKartiKapsami,
  BilgiKartiSayfasi,
} from "@projelio/shared";
import { api } from "./client";

/**
 * Bilgi kartının uçları.
 *
 * Kapsam (şirket ya da iş) yolun BAŞINDA: yetki hep oradan çözülüyor
 * (bkz. BilgiKartiController). Kayıt başına uçlarda kapsam tekrar ediliyor
 * çünkü alan/belge kimliği tek başına hangi karta ait olduğunu söylemiyor —
 * sunucu ikisini birlikte doğruluyor.
 */

export interface BilgiKartiGirdisi {
  legalName?: string;
  brandName?: string;
  sector?: string;
  foundedOn?: string;
  employeeCount?: string;
  about?: string;
  taxOffice?: string;
  taxNumber?: string;
  tradeRegistryNo?: string;
  mersisNo?: string;
  naceCode?: string;
  sgkNo?: string;
  kepAddress?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  district?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  bankName?: string;
  iban?: string;
  notes?: string;
}

export interface BelgeGirdisi {
  docType?: BilgiKartiBelgeTuru;
  title?: string;
  /** Projelio'daki dosya kimliği. externalUrl ile birlikte gönderilemez. */
  fileId?: string;
  externalUrl?: string;
  issuedOn?: string;
  validUntil?: string;
  note?: string;
}

function taban(scopeType: BilgiKartiKapsami, scopeId: string): string {
  return `/bilgi-karti/${scopeType}/${scopeId}`;
}

export const bilgiKartiApi = {
  sayfa: (scopeType: BilgiKartiKapsami, scopeId: string) =>
    api.get<BilgiKartiSayfasi>(taban(scopeType, scopeId)),

  guncelle: (scopeType: BilgiKartiKapsami, scopeId: string, govde: BilgiKartiGirdisi) =>
    api.patch<BilgiKarti>(taban(scopeType, scopeId), govde),

  alanEkle: (scopeType: BilgiKartiKapsami, scopeId: string, label: string, value: string) =>
    api.post<BilgiKartiAlani>(`${taban(scopeType, scopeId)}/fields`, { label, value }),

  alanGuncelle: (
    scopeType: BilgiKartiKapsami,
    scopeId: string,
    fieldId: string,
    govde: { label?: string; value?: string }
  ) => api.patch<BilgiKartiAlani>(`${taban(scopeType, scopeId)}/fields/${fieldId}`, govde),

  alanSil: (scopeType: BilgiKartiKapsami, scopeId: string, fieldId: string) =>
    api.delete<{ success: true }>(`${taban(scopeType, scopeId)}/fields/${fieldId}`),

  belgeEkle: (scopeType: BilgiKartiKapsami, scopeId: string, govde: BelgeGirdisi) =>
    api.post<BilgiKartiBelgesi>(`${taban(scopeType, scopeId)}/documents`, govde),

  belgeGuncelle: (scopeType: BilgiKartiKapsami, scopeId: string, documentId: string, govde: BelgeGirdisi) =>
    api.patch<BilgiKartiBelgesi>(`${taban(scopeType, scopeId)}/documents/${documentId}`, govde),

  /** Belgeyi karttan kaldırır; dosyanın kendisi klasöründe kalır. */
  belgeSil: (scopeType: BilgiKartiKapsami, scopeId: string, documentId: string) =>
    api.delete<{ success: true }>(`${taban(scopeType, scopeId)}/documents/${documentId}`),
};
