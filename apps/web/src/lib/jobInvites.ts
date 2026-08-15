/**
 * Bekleyen iş davetleri — okuma, yanıtlama ve "değişti" haberi.
 *
 * Davet üç ayrı yerde görünür: bildirim çanındaki "Bekleyen davetler" bölümü,
 * iş detay sayfasının üstündeki şerit ve (kabul edilince) anasayfadaki
 * "Katıldıklarım" ızgarası. Biri yanıtlanınca diğerlerinin sayfa yenilemeden
 * kendini tazelemesi gerekiyor; bunu cloudStorageEvents ile aynı desende basit
 * bir window olayıyla yapıyoruz.
 */
import type { JobMember } from "@projelio/shared";
import { api } from "../api/client";

const EVENT_NAME = "projelio:job-invites-changed";

export function notifyJobInvitesChanged(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onJobInvitesChanged(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

/** Giriş yapmış kullanıcının yanıt bekleyen tüm iş davetleri. */
export function fetchPendingJobInvites(): Promise<JobMember[]> {
  return api.get<JobMember[]>("/me/job-invites").catch(() => []);
}

/**
 * Daveti kabul eder ya da reddeder. Kabul edildiği anda iş, kullanıcının
 * anasayfasındaki "Katıldıklarım" listesine düşer — olay yayını da bunun
 * için: açık olan anasayfa listesini tazeler.
 */
export async function respondToJobInvite(memberId: string, approve: boolean): Promise<void> {
  await api.patch(`/job-members/${memberId}/respond`, { approve });
  notifyJobInvitesChanged();
}
