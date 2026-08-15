/**
 * İşe davet kurallarının saf (yan etkisiz) hali.
 *
 * Servis Supabase'e bağlı olduğu için doğrudan test edilemiyor; karar veren
 * mantık burada toplanıyor ki job-invite.test.ts onu çalıştırabilsin
 * (module-members/module-access.ts ile aynı desen).
 */

export type JobInviteStatus = "pending" | "approved" | "rejected";

/**
 * Kişi fiilen iş ekibinden sayılır mı?
 *
 * Yalnızca daveti kabul etmiş olanlar sayılır: bekleyen davet sahibinin işi
 * anasayfasında görmemesi, projelerine/dosyalarına erişememesi bu kurala bağlı.
 * status yoksa (051 migrasyonundan önce yazılmış kayıt) eski davranış korunur
 * ve üye sayılır — göç anında ekipler kopmasın diye.
 */
export function countsAsTeamMember(status: JobInviteStatus | string | null | undefined): boolean {
  return (status ?? "approved") === "approved";
}

/**
 * Daveti yalnızca davet edilen kişi yanıtlayabilir.
 *
 * İş sahibi başkasının yerine kabul edemez — edebilseydi onay mekanizmasının
 * bir anlamı kalmazdı. Sahibi vazgeçtiyse daveti silerek geri çeker.
 * requestingUserId verilmezse (dahili çağrı) kontrol atlanır.
 */
export function canRespondToInvite(invite: { userId: string }, requestingUserId?: string): boolean {
  if (!requestingUserId) return true;
  return invite.userId === requestingUserId;
}

/**
 * Aynı kişi tekrar davet edildiğinde ne yapılacağı.
 *
 * UNIQUE (job_id, user_id) kısıtı yüzünden reddedilmiş kayıt dururken ikinci
 * satır açılamaz; var olan kayıt yeniden "pending"e çevrilir ("revive").
 * Zaten ekipteyse hiçbir şey yapılmaz — yoksa onaylı bir üye, farkında olmadan
 * yeniden onay bekler duruma düşerdi.
 */
export function reinviteDecision(existing: { status?: string | null } | null | undefined): "create" | "revive" | "already-member" {
  if (!existing) return "create";
  return countsAsTeamMember(existing.status) ? "already-member" : "revive";
}

/** Davet bildirimi: kimin hangi işe eklediği metinde geçmeli. */
export function inviteNotificationBody(inviterName: string | null | undefined, jobTitle: string | null | undefined): string {
  return `${inviterName || "Bir kullanıcı"} seni "${jobTitle || "bir iş"}" işine ekledi. Kabul ediyor musun?`;
}

/** İş sahibine giden yanıt bildirimi. */
export function inviteAnswerNotificationBody(
  responderName: string | null | undefined,
  jobTitle: string | null | undefined,
  approve: boolean
): string {
  return `${responderName || "Davet ettiğin kişi"}, "${jobTitle || "bir iş"}" işine katılma davetini ${
    approve ? "kabul etti" : "reddetti"
  }.`;
}
