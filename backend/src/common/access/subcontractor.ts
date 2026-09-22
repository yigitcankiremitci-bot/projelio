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
  /** İşin bağlı olduğu şirketin/holdingin sahibi ya da departman yöneticisi mi. */
  isOrgManager: boolean;
  /** Hesap tipi taşeron mu. */
  isSubcontractor: boolean;
}

/**
 * Bir kullanıcı, işin ALTINDAKİ TÜM projeleri (ve rutinleri) görebilir mi?
 *
 * Cevap yalnızca YÖNETEN için evet: işin sahibi ya da işin bağlı olduğu
 * şirketin/holdingin sahibi/departman yöneticisi. Onların dışında herkes —
 * taşeron olsun olmasın — yalnızca sahibi olduğu ya da atandığı projeleri
 * görür.
 *
 * ÖNCEDEN iş kadrosunda (job_members, approved) olmak tek başına işin BÜTÜN
 * projelerini açıyordu; kısıt yalnızca taşeron hesaplara uygulanıyordu. Bir
 * projeye almak için işe kadro olarak da alınan sıradan ekip üyeleri böylece
 * işin İşler sekmesinde dahil olmadıkları her projeyi ve rutini
 * listeleyebiliyordu. Kadro üyeliği işi GÖRMEYE yeter (bkz.
 * AccessService.canViewJob), işin tamamını görmeye değil.
 *
 * DOSYA görünürlüğü bu kuralın dışında: orada kapsam FilesService.resolveAccess
 * ile ayrı çözülüyor ve kadro üyesinin işin geneline (Genel klasörü) erişimi
 * bilerek duruyor.
 */
export function seesAllProjectsOfJob(facts: ProjectScopeFacts): boolean {
  if (facts.isSubcontractor) return false;
  return facts.isJobOwner || facts.isOrgManager;
}

/**
 * Taşerona kapalı yüzeyler. Uç noktalar bu listeyi tek tek kontrol etmek yerine
 * AccessService.assertNotSubcontractor(userId, surface) çağırır; böylece
 * "hangi yüzeyler kapalı" sorusunun tek bir cevabı olur.
 */
export type RestrictedSurface = "budget" | "team" | "members" | "settings" | "partners" | "products";

export const SURFACE_MESSAGE: Record<RestrictedSurface, string> = {
  budget: "Taşeron hesapları bütçe bilgilerini görüntüleyemez", // dil:anahtar
  team: "Taşeron hesapları ekip listesini görüntüleyemez", // dil:anahtar
  members: "Taşeron hesapları kadro listesini görüntüleyemez", // dil:anahtar
  settings: "Taşeron hesapları bu ayarları değiştiremez", // dil:anahtar
  partners: "Taşeron hesapları iş ortağı bilgilerini görüntüleyemez", // dil:anahtar
  products: "Taşeron hesapları ürün/hizmet kayıtlarını görüntüleyemez", // dil:anahtar
};

/** Görünürlük hesabı için gereken en az bilgi — satırın kendisi değil. */
export interface TaskAssignmentRow {
  id: string;
  /** Eski tek-atama sütunu (tasks.assigned_to). Birincil atanan. */
  assignedTo?: string | null;
  /** Çoklu atama tablosundaki (task_assignees) tüm kullanıcı kimlikleri. */
  assigneeIds?: string[];
  parentTaskId?: string | null;
}

/**
 * Bir taşeronun projede GÖREBİLECEĞİ görev kimlikleri.
 *
 * NEDEN İKİ KAYNAK: atama iki yere birden yazılıyor — `task_assignees` tablosuna
 * TÜM atananlar, `tasks.assigned_to` sütununa ise YALNIZCA BİRİNCİ atanan
 * (bkz. TasksService.syncAssignees). Bu hesap eskiden sadece `assigned_to`
 * sütununa bakıyordu; sonuç olarak ikinci, üçüncü... atanan bir taşeron KENDİNE
 * ATANMIŞ görevi bile göremiyordu. Artık ikisi birden okunuyor: çoklu tablo
 * güncel kaynak, eski sütun ise tablo eklenmeden önceki kayıtlar için yedek.
 *
 * Üst görev de görünür: alt görevi atanan kişi, bağlamını göremezse görev
 * listesinde kopuk bir satır görür.
 */
export function visibleTaskIdsForSubcontractor(rows: TaskAssignmentRow[], userId: string): Set<string> {
  const atanan = new Set(
    rows
      .filter((r) => r.assignedTo === userId || (r.assigneeIds ?? []).includes(userId))
      .map((r) => r.id)
  );

  const ustGorevler = rows
    .filter((r) => atanan.has(r.id) && r.parentTaskId)
    .map((r) => r.parentTaskId as string);

  return new Set([...atanan, ...ustGorevler]);
}
