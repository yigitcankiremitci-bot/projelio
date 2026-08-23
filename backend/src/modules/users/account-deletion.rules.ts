/**
 * Hesap silinirken kullanıcının SAHİP OLDUĞU kaynaklara ne olacağı — saf karar.
 *
 * Tasarımın tamamı: docs/hesap-silme.md
 *
 * Buradaki kural kullanıcının 2026-08-23'te verdiği karar: "içinde başka üye
 * yoksa sil, varsa devret". Gerekçesi, tek kişilik bir işin gerçekten silinmesi
 * (gizlilik politikasındaki "kalıcı olarak silinir" ifadesi karşılansın) ama
 * içinde başkalarının emeği olan bir işin korunması — bir ekip aracında
 * "hesabımı sildim, ekibimin işi gitti" sürprizi kabul edilemez.
 *
 * Veritabanına bakmıyor, yalnızca karar veriyor; sorguları AccountDeletionService
 * yapıyor. Böylece kural test edilebilir kalıyor — yanlış bir "sil" kararı geri
 * alınamaz.
 */

export type OwnershipDecision = "sil" | "anonim-birak";

export interface OwnedJobFacts {
  jobId: string;
  /**
   * İşin ekibinde, SİLİNEN KULLANICI DIŞINDA, daveti kabul etmiş kaç kişi var.
   *
   * "Kabul etmiş" şart: davet aşamasında kalmış (invited/pending) kayıtlar
   * "başka üye var" saymaz — kimse kabul etmediyse iş fiilen tek kişiliktir ve
   * bekleyen bir davet yüzünden silinmemesi kullanıcıyı şaşırtır.
   */
  otherApprovedMemberCount: number;
}

export function decideJobOwnership(facts: OwnedJobFacts): OwnershipDecision {
  return facts.otherApprovedMemberCount > 0 ? "anonim-birak" : "sil";
}

export type OrgOwnershipDecision = "sil" | "engelle";

export interface OwnedOrgFacts {
  /**
   * Bu organizasyonda/grupta, SİLİNEN KULLANICI DIŞINDA kaç gerçek kişi var.
   *
   * "Gerçek kişi" iki yerden geliyor: departman kadrosu (`department_members`)
   * ve ortaklar (`partners`). İkisinde de yalnızca ONAYLANMIŞ kayıtlar sayılır —
   * davet aşamasında kalmış biri yüzünden kullanıcının hesabını silememesi
   * kabul edilemez.
   */
  otherApprovedPeopleCount: number;
}

/**
 * Organizasyon/grup sahipliğinde karar.
 *
 * NEDEN ÖNCE HER DURUMDA ENGELLİYORDUK, NEDEN DEĞİŞTİ: ilk sürüm sahip olunan
 * her organizasyonda silmeyi durduruyordu. Ama tek kişilik bir şirkette
 * devredilecek KİMSE YOK — kullanıcı hesabını hiçbir zaman silemiyordu. Bu hem
 * çıkmaz sokak hem de silme hakkının fiilen engellenmesi.
 *
 * Kural artık işlerdekiyle aynı: içinde başka insan yoksa organizasyon da
 * kullanıcının kişisel verisidir ve hesapla birlikte silinir. Başka insanlar
 * varsa engel devam eder — onların verisini kimseye sormadan silmek ya da
 * sahipliği habersiz birine yüklemek doğru olmaz.
 */
export function decideOrgOwnership(facts: OwnedOrgFacts): OrgOwnershipDecision {
  return facts.otherApprovedPeopleCount > 0 ? "engelle" : "sil";
}

export interface BlockingOwnership {
  tur: "organizasyon" | "grup";
  ad: string;
}

/**
 * Silmeyi ENGELLEYEN sahiplikler.
 *
 * Buraya YALNIZCA içinde başka insan olanlar geliyor (bkz. decideOrgOwnership).
 * Tek kişilik organizasyon/grup kullanıcının kişisel verisi sayılıp hesapla
 * birlikte siliniyor; onlar bu listede yer almıyor.
 *
 * NEDEN ENGELLEME, OTOMATİK DEVİR DEĞİL: içinde başka insanlar varken sahipliği
 * "bir sonraki kişiye" atmak, o kişiye haberi olmadan bir şirketin tüm verisinin
 * sorumluluğunu yüklemek olurdu; silmek ise başkalarının verisini yok etmek.
 * İkisi de kullanıcının vereceği karar (bkz. docs/hesap-silme.md).
 */
export function describeBlockers(blockers: BlockingOwnership[]): string | null {
  if (blockers.length === 0) return null;

  const liste = blockers.map((b) => `${b.ad} (${b.tur})`).join(", ");
  return (
    `Şunlarda senden başka kişiler de var: ${liste}. Hesabını silmeden önce bunların ` +
    "sahipliğini o kişilerden birine devretmen gerekiyor — içlerindeki veri artık " +
    "yalnızca sana ait değil. Sadece sana ait olan organizasyon ve gruplar hesapla " +
    "birlikte silinir, onlar için bir şey yapmana gerek yok."
  );
}
