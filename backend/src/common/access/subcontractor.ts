import type { AccountType } from "@projelio/shared";

/**
 * Taşeron kısıtının saf (yan etkisiz) hali.
 *
 * Taşeron, organizasyonun içinden biri değildir: belirli bir işe/projeye dışarıdan
 * alınmış bir taraftır. Bu yüzden kısıt HESAP TİPİNE bağlanır — bir yerde taşeron
 * olan kullanıcı, başka bir yerde tesadüfen "iş ekibi üyesi" göründüğü için
 * finansal veya kurumsal veriye erişememelidir.
 *
 * Kural üç cümlede:
 *   1. Taşeron hiçbir bağlamda bütçe/finans göremez.
 *   2. Taşeron ekip/kadro listelerini göremez (isim, e-posta, ücret).
 *   3. Taşeron bir işin TÜM projelerini değil, yalnızca açıkça atandığı
 *      projeleri görür.
 *
 * Bu dosya karar verir, sorgulamaz; veritabanına AccessService bakar.
 */
export function isSubcontractorAccount(accountType?: AccountType | null): boolean {
  return accountType === "subcontractor";
}

export interface ProjectScopeFacts {
  /** İşin sahibi mi. */
  isJobOwner: boolean;
  /** İş ekibine alınmış ve daveti kabul etmiş mi (job_members.status = approved). */
  isApprovedJobMember: boolean;
  /** Hesap tipi taşeron mu. */
  isSubcontractor: boolean;
}

/**
 * Bir kullanıcı, işin ALTINDAKİ TÜM projeleri görebilir mi?
 *
 * Taşeron için cevap her zaman hayır: işe alınmış olsa bile yalnızca
 * project_members ile atandığı projeleri görür. Bu, "sadece ekli olduğu projeyi
 * ve işi görmeli" kuralının tam karşılığı — işi görür (orada çalışıyor), işin
 * geri kalan projelerini görmez.
 */
export function seesAllProjectsOfJob(facts: ProjectScopeFacts): boolean {
  if (facts.isSubcontractor) return false;
  return facts.isJobOwner || facts.isApprovedJobMember;
}

/**
 * Taşerona kapalı yüzeyler. Uç noktalar bu listeyi tek tek kontrol etmek yerine
 * AccessService.assertNotSubcontractor(userId, surface) çağırır; böylece
 * "hangi yüzeyler kapalı" sorusunun tek bir cevabı olur.
 */
export type RestrictedSurface = "budget" | "team" | "members" | "settings" | "partners" | "products";

export const SURFACE_MESSAGE: Record<RestrictedSurface, string> = {
  budget: "Taşeron hesapları bütçe bilgilerini görüntüleyemez",
  team: "Taşeron hesapları ekip listesini görüntüleyemez",
  members: "Taşeron hesapları kadro listesini görüntüleyemez",
  settings: "Taşeron hesapları bu ayarları değiştiremez",
  partners: "Taşeron hesapları iş ortağı bilgilerini görüntüleyemez",
  products: "Taşeron hesapları ürün/hizmet kayıtlarını görüntüleyemez",
};
