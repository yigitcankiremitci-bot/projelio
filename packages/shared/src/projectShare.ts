import type { ProjectShareVisibility, TaskStatus } from "./types";
import { PROJECT_SHARE_VISIBILITY_KEYS } from "./types";

/**
 * Proje paylaşım linkinin saf kuralları.
 *
 * NEDEN AYRI DOSYA: buradaki iki karar da güvenlikle ilgili ve ikisi de
 * sunucuda ÇALIŞTIĞI gibi test edilebilmeli — "hangi bölümler görünür" ve
 * "bu link hâlâ açık mı". React'e ya da Nest'e bulaşmadan test edilebilsinler
 * diye shared pakette duruyorlar (bkz. safeUrl.ts ile aynı gerekçe).
 */

/**
 * Dışarıdan gelen görünürlük nesnesini güvenli hale getirir.
 *
 * VARSAYILAN KAPALI. Tanınmayan/eksik bir alan "açık" sayılsaydı, ileride yeni
 * bir bölüm eklendiğinde ESKİ linkler o bölümü kendiliğinden göstermeye
 * başlardı — sahibi hiç öyle bir seçim yapmamışken. Bir bölümün görünmesi için
 * istekte açıkça `true` yazması gerekir.
 */
export function normalizeShareVisibility(input: unknown): ProjectShareVisibility {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out = {} as ProjectShareVisibility;
  for (const key of PROJECT_SHARE_VISIBILITY_KEYS) out[key] = raw[key] === true;
  return out;
}

/** Link ömrünü bitiren iki durum: sahibi iptal etti ya da süresi doldu. */
export function isShareLinkActive(
  link: { revokedAt?: string | null; expiresAt?: string | null },
  now: Date = new Date()
): boolean {
  if (link.revokedAt) return false;
  if (!link.expiresAt) return true;
  const expires = new Date(link.expiresAt.endsWith("Z") ? link.expiresAt : `${link.expiresAt}Z`);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() > now.getTime();
}

export interface TaskProgress {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  /** Görev yoksa undefined: "%0 ilerleme" ile "henüz görev yok" aynı şey değil. */
  percent?: number;
}

/**
 * Projenin ilerlemesi: tamamlanan görev / toplam görev.
 *
 * Neden ağırlıksız sayım: görevlerin süre/bütçe ağırlığı var ama hepsi
 * doldurulmuyor; yarısı boş bir ağırlıkla hesaplanan yüzde, sayımdan daha
 * yanıltıcı olurdu. Yüzde AŞAĞI yuvarlanır — takip eden kişiye projeyi
 * olduğundan ileride göstermemek, geride göstermekten daha önemli.
 */
export function taskProgress(tasks: { status: TaskStatus }[]): TaskProgress {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const todo = total - completed - inProgress;
  return {
    total,
    completed,
    inProgress,
    todo,
    percent: total === 0 ? undefined : Math.floor((completed / total) * 100),
  };
}
