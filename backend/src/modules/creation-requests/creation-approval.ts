import type { CreationRequestKind, CreationRequestStatus } from "@projelio/shared";

/**
 * "Bu kişi bu kaydı doğrudan açabilir mi, yoksa onay mı istemeli?" ve
 * "Talebi kim onaylar?" sorularının saf (yan etkisiz) cevabı.
 *
 * Veritabanı sorguları CreationRequestsService'te kalır; burada yalnızca
 * karar verilir — böylece akışın en kritik kuralı Supabase'i taklit etmeden
 * test edilebiliyor (bkz. departments/department-access.ts, aynı desen).
 */

export interface CreationScopeFacts {
  /** Talebi açan kişi taşeron hesabı mı. */
  isSubcontractor: boolean;
  /**
   * İş talebi: bağlanacağı organizasyon var mı. Yoksa bu kişisel/serbest bir
   * iştir — taşeronun kendi defteri, kimseyi ilgilendirmez.
   */
  hasOrganization?: boolean;
  /** Proje talebi: projenin açılacağı işin sahibi mi. */
  isJobOwner?: boolean;
  /** İş talebi: bağlanacağı organizasyonun sahibi mi. */
  isOrganizationOwner?: boolean;
}

/**
 * Onay gerekiyor mu?
 *
 *   Taşeron değilse                         → hayır (mevcut davranış korunur)
 *   Kendi sahibi olduğu kapsam              → hayır (kendi işine proje açar)
 *   Organizasyona bağlanmayan kişisel iş    → hayır
 *   Diğer her durumda taşeron için          → EVET
 *
 * Sahiplik istisnası bilinçli: taşeron kendi kurduğu işin altına proje açarken
 * kimseden izin istemez, o iş zaten onun.
 */
export function needsApproval(kind: CreationRequestKind, facts: CreationScopeFacts): boolean {
  if (!facts.isSubcontractor) return false;

  if (kind === "project") {
    return !facts.isJobOwner;
  }

  // kind === "job"
  if (!facts.hasOrganization) return false;
  return !facts.isOrganizationOwner;
}

export interface ApproverFacts {
  /** Proje talebinde işin sahibi. */
  jobOwnerId?: string | null;
  /** İş talebinde organizasyonun sahibi. */
  organizationOwnerId?: string | null;
  /**
   * Talebi açan kişinin ONAYLI kadrosunda olduğu departmanların yöneticileri.
   * Yalnızca iş talebinde kullanılır: taşeronu tanıyan yönetici de karar
   * verebilmeli, akış tek kişiye (şirket sahibine) bağlı kalmasın.
   */
  departmentManagerIds?: string[];
}

/**
 * Talebi kimlerin onaylayabileceği. Hepsine bildirim gider, ilk yanıtlayan
 * kararı verir. Talebi açanın kendisi listeden düşülür — kimse kendi talebini
 * onaylayamaz.
 */
export function resolveApprovers(
  kind: CreationRequestKind,
  requesterId: string,
  facts: ApproverFacts
): string[] {
  const ids = new Set<string>();

  if (kind === "project") {
    if (facts.jobOwnerId) ids.add(facts.jobOwnerId);
  } else {
    if (facts.organizationOwnerId) ids.add(facts.organizationOwnerId);
    for (const managerId of facts.departmentManagerIds ?? []) ids.add(managerId);
  }

  ids.delete(requesterId);
  return [...ids];
}

/**
 * Bir talebe yanıt verilebilir mi? Yalnızca bekleyen talepler yanıtlanır;
 * aynı talebe iki kez karar verilmesi (iki yöneticinin aynı anda tıklaması)
 * burada durur.
 */
export function canRespond(status: CreationRequestStatus): boolean {
  return status === "pending";
}
