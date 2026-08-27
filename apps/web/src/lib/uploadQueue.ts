import { useEffect, useState } from "react";
import type { ProjectFile } from "@projelio/shared";
import { uploadFile, type FileContext, type UploadTarget } from "../api/files";
import { uploadScope } from "./uploadScope";

/**
 * Dosya yükleme kuyruğu — bileşenlerin DIŞINDA yaşar.
 *
 * NEDEN BURADA: yükleme durumu FilesPanel'in kendi state'indeydi. Kullanıcı
 * "yükle" deyip başka bir sayfaya geçtiğinde panel sökülüyor, yüklemenin
 * ilerlemesi ekrandan kayboluyor ve biten dosya hiçbir yere düşmüyordu —
 * kullanıcı için bu, yüklemenin iptal olmasından ayırt edilemez. Kuyruk modül
 * düzeyinde durduğu için gezinmeden etkilenmiyor; ekranda bir köşede
 * gösterilmesi de artık tek bir bileşenin işi (bkz. components/UploadTray).
 *
 * Aynı desen uygulamada zaten var: lib/taskAttachmentEvents.ts, lib/homeTarget.ts.
 *
 * Kuyruk TEK SIRALI ilerler. Paralel yüklemek hem kullanıcının bant genişliğini
 * bölerdi hem de sunucudaki yükleme hız sınırına anında toslardı (bkz. 429
 * işlemesi aşağıda).
 */

export type UploadStatus = "uploading" | "done" | "error";

export interface UploadJob {
  id: string;
  name: string;
  sizeBytes: number;
  /** Şimdiye kadar gönderilen bayt — ilerleme oranından türetilir. */
  uploadedBytes: number;
  status: UploadStatus;
  error?: string;
  /**
   * Yüklemenin hangi ekrana ait olduğu. Dosya listesi açıksa satırı kendi
   * içinde de gösteriyor; köşedeki tepsi ise kapsam ayırmadan hepsini gösterir.
   */
  scope: string;
}

interface QueueEntry extends UploadJob {
  file: File;
  target: UploadTarget;
  context: Omit<FileContext, "projectId">;
  controller: AbortController;
}

const queue: QueueEntry[] = [];
const listeners = new Set<() => void>();
const doneListeners = new Set<(scope: string, file: ProjectFile) => void>();
let working = false;

/** Biten yükleme köşede kısa süre "yüklendi" olarak kalır, sonra kendiliğinden düşer. */
const DONE_LINGER_MS = 4000;

function emit(): void {
  listeners.forEach((fn) => fn());
}

/** İstemciye dönen hâli — dosyanın kendisi ve iptal kolu dışarı sızmaz. */
function toJob(entry: QueueEntry): UploadJob {
  const { id, name, sizeBytes, uploadedBytes, status, error, scope } = entry;
  return { id, name, sizeBytes, uploadedBytes, status, error, scope };
}

export function getUploads(scope?: string): UploadJob[] {
  return queue.filter((e) => !scope || e.scope === scope).map(toJob);
}

/**
 * "Failed to fetch" kullanıcıya hiçbir şey anlatmıyor. Büyük dosyalar tarayıcıdan
 * DOĞRUDAN Drive/OneDrive'a yükleniyor (bkz. api/files.ts uploadFile); o istek
 * koptuğunda tarayıcının verdiği ham metin bu oluyor. Ne olduğunu söyleyelim.
 */
function uploadHatasi(e: any): string {
  const mesaj = e?.message ?? "Yüklenemedi";
  if (/failed to fetch|networkerror|load failed/i.test(mesaj)) {
    return "Bağlantı koptu, dosya yüklenemedi. İnternetini kontrol edip tekrar dene.";
  }
  return mesaj;
}

function remove(id: string): void {
  const index = queue.findIndex((e) => e.id === id);
  if (index >= 0) {
    queue.splice(index, 1);
    emit();
  }
}

async function work(): Promise<void> {
  if (working) return;
  working = true;
  try {
    // Kuyruk çalışırken yeni dosya eklenebilir; her turda baştan bakılıyor.
    for (;;) {
      // Biten satır "done", başarısız olan "error" olduğu için sıradaki bekleyen
      // daima ilk "uploading" satırdır; çalışan satır zaten await ediliyor.
      const current = queue.find((e) => e.status === "uploading" && !e.controller.signal.aborted);
      if (!current) break;

      try {
        const created = await uploadFile(
          current.target,
          current.file,
          current.context,
          (ratio) => {
            current.uploadedBytes = Math.round(ratio * current.sizeBytes);
            emit();
          },
          current.controller.signal
        );
        current.status = "done";
        current.uploadedBytes = current.sizeBytes;
        emit();
        doneListeners.forEach((fn) => fn(current.scope, created));
        // Biten satır köşede kısa süre kalsın: kullanıcı başka sayfadaysa
        // yüklemenin bittiğini görebilmeli.
        setTimeout(() => remove(current.id), DONE_LINGER_MS);
      } catch (e: any) {
        // İptal bir HATA DEĞİL: kullanıcı bilerek durdurdu, satır sessizce gider.
        if (e?.name === "AbortError") {
          remove(current.id);
          continue;
        }

        current.status = "error";
        current.error = uploadHatasi(e);
        emit();

        // Hız sınırına takıldıysak KUYRUĞU DURDUR. Devam etmenin anlamı yok:
        // bekleyen dosyaların hepsi aynı hatayı alır ve kullanıcı onlarca
        // kırmızı satır görür.
        if (e?.status === 429) {
          for (const waiting of queue) {
            if (waiting.status !== "uploading") continue;
            waiting.status = "error";
            waiting.error = "Çok fazla dosya yüklendi, biraz sonra tekrar dene.";
          }
          emit();
          break;
        }
      }
    }
  } finally {
    working = false;
  }
}

/** Dosyaları kuyruğa alır ve (çalışmıyorsa) işlemeyi başlatır. */
export function enqueueUploads(params: {
  target: UploadTarget;
  files: File[];
  context?: Omit<FileContext, "projectId">;
}): void {
  const context = params.context ?? {};
  const scope = uploadScope(params.target, context);
  for (const file of params.files) {
    queue.push({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      name: file.name,
      sizeBytes: file.size,
      uploadedBytes: 0,
      status: "uploading",
      scope,
      file,
      target: params.target,
      context,
      controller: new AbortController(),
    });
  }
  emit();
  void work();
}

export function cancelUpload(id: string): void {
  const entry = queue.find((e) => e.id === id);
  if (!entry) return;
  // Henüz sıra ona gelmediyse uçuşta bir istek yok; satırı doğrudan düşür.
  if (entry.uploadedBytes === 0 && entry.status === "uploading") {
    entry.controller.abort();
    remove(id);
    return;
  }
  entry.controller.abort();
}

/** Hata satırını kullanıcı okuduktan sonra kaldırır. */
export function dismissUpload(id: string): void {
  remove(id);
}

export { uploadScope };

export function useUploads(scope?: string): UploadJob[] {
  const [jobs, setJobs] = useState(() => getUploads(scope));

  useEffect(() => {
    const onChange = () => setJobs(getUploads(scope));
    onChange();
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, [scope]);

  return jobs;
}

/**
 * Bir yükleme bittiğinde haber verir.
 *
 * Dosya listesi açıksa yeni kaydı kendi listesine ekleyebilsin diye: kuyruk
 * artık panelin içinde olmadığı için panel sonucu başka türlü göremez.
 */
export function subscribeUploadDone(fn: (scope: string, file: ProjectFile) => void): () => void {
  doneListeners.add(fn);
  return () => {
    doneListeners.delete(fn);
  };
}
