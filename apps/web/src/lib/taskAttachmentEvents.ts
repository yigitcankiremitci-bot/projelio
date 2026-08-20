import { useEffect, useState } from "react";
import type { TaskAttachment } from "@projelio/shared";

export interface AttachedFile {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface TaskAttachmentSnapshot {
  attachments?: TaskAttachment[];
  files?: AttachedFile[];
}

/**
 * Görev eklerinin "az önce değişti" defteri.
 *
 * NEDEN VAR: karttaki ek rozeti pano listesinden besleniyor, ekleri değiştiren
 * panel ise görev düzenleme modalının içinde. İkisini bağlamanın yolu modalı
 * açan SAYFAYA bir geri çağrı vermekti (bkz. TaskEditModal.onTaskPatched) —
 * ama o modal beş ayrı yerden açılıyor ve her yeni çağrı yerinin bunu ayrıca
 * bağlaması gerekiyor. Bir tanesi unutulduğunda hata sessiz: link ekleniyor,
 * kart değişmiyor, kullanıcı sayfayı yeniliyor.
 *
 * Bu defter o bağımlılığı kaldırıyor: değişikliği panel yayımlıyor, rozet
 * doğrudan dinliyor. Arada sayfa yok, dolayısıyla unutulacak bir bağlantı da
 * yok. Aynı desen uygulamada zaten var (bkz. lib/homeTarget.ts,
 * lib/cloudStorageEvents.ts).
 *
 * Defter yalnızca EKRANDA GÖRÜNENİ tazelemek için; kalıcı doğru kaynak yine
 * sunucu. Sayfa yenilendiğinde boşalır, bir şey kaybolmaz.
 */
const snapshots = new Map<string, TaskAttachmentSnapshot>();
const listeners = new Set<(taskId: string) => void>();

/** Sekmede uzun süre gezinen kullanıcıda sınırsız büyümesin. */
const MAX_ENTRIES = 200;

export function publishTaskAttachments(taskId: string, part: TaskAttachmentSnapshot): void {
  const next = { ...snapshots.get(taskId), ...part };
  snapshots.delete(taskId);
  snapshots.set(taskId, next);
  if (snapshots.size > MAX_ENTRIES) {
    const oldest = snapshots.keys().next().value;
    if (oldest !== undefined) snapshots.delete(oldest);
  }
  listeners.forEach((fn) => fn(taskId));
}

/** Yalnızca test/temizlik için. */
export function clearTaskAttachmentSnapshots(): void {
  snapshots.clear();
}

export function getTaskAttachmentSnapshot(taskId: string): TaskAttachmentSnapshot | undefined {
  return snapshots.get(taskId);
}

export function useTaskAttachmentSnapshot(taskId: string): TaskAttachmentSnapshot | undefined {
  const [snapshot, setSnapshot] = useState(() => snapshots.get(taskId));

  useEffect(() => {
    // Abone olurken mevcut değeri de al: kart, değişiklikten SONRA monte
    // edilmiş olabilir (kolon değişimi, listenin yeniden sıralanması).
    setSnapshot(snapshots.get(taskId));
    const onChange = (changedId: string) => {
      if (changedId === taskId) setSnapshot(snapshots.get(taskId));
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, [taskId]);

  return snapshot;
}
