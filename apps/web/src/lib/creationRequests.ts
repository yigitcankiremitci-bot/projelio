/**
 * Açma talepleri — okuma, yanıtlama ve "değişti" haberi.
 *
 * Taşeron bir iş/proje açmak istediğinde kayıt doğrudan oluşmaz: talep açılır,
 * yetkiliye bildirim gider, onaylanınca kayıt doğar (bkz. backend
 * creation-requests). Talep üç yerde görünür — bildirim çanındaki "Onay
 * bekleyenler" bölümü, taşeronun kendi bekleyen talep listesi ve onaylanınca
 * anasayfadaki iş/proje ızgarası. Biri değişince diğerleri sayfa yenilemeden
 * tazelensin diye lib/jobInvites.ts ile aynı desende basit bir window olayı.
 */
import type { CreationRequest } from "@projelio/shared";
import { api } from "../api/client";

const EVENT_NAME = "projelio:creation-requests-changed";

export function notifyCreationRequestsChanged(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onCreationRequestsChanged(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

/** Giriş yapmış kullanıcının KARAR VERMESİ beklenen talepler. */
export function fetchPendingApprovals(): Promise<CreationRequest[]> {
  return api.get<CreationRequest[]>("/me/pending-approvals").catch(() => []);
}

/** Kullanıcının kendi açtığı talepler (bekleyen + geçmiş). */
export function fetchMyCreationRequests(): Promise<CreationRequest[]> {
  return api.get<CreationRequest[]>("/me/creation-requests").catch(() => []);
}

/**
 * Talebi onaylar ya da reddeder. Onaylandığında iş/proje o anda doğar; olay
 * yayını açık olan anasayfa/iş listelerini tazeler.
 */
export async function respondToCreationRequest(
  id: string,
  approve: boolean,
  note?: string
): Promise<void> {
  await api.patch(`/creation-requests/${id}/respond`, { approve, note });
  notifyCreationRequestsChanged();
}

/** Talep sahibi bekleyen talebini geri çeker. */
export async function cancelCreationRequest(id: string): Promise<void> {
  await api.delete(`/creation-requests/${id}`);
  notifyCreationRequestsChanged();
}

/**
 * POST /jobs ve POST /projects artık iki biçimden birini döner: kayıt açıldı
 * ya da onaya düştü. Modallar bu yardımcıyla ayırır — her çağrı yerinde
 * `outcome` kontrolü tekrar etmesin.
 */
export interface CreateOutcome<T> {
  created?: T;
  pending?: CreationRequest;
}

export function readCreateOutcome<T>(response: unknown): CreateOutcome<T> {
  const r = response as { outcome?: string; entity?: T; request?: CreationRequest } | null;
  if (r?.outcome === "pending" && r.request) return { pending: r.request };
  if (r?.outcome === "created") return { created: r.entity };
  // Eski biçim (doğrudan kayıt) — geriye dönük uyum.
  return { created: response as T };
}
