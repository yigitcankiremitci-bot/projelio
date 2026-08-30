import type { ProjectShareClosedReason, ProjectShareVisibility, ProjectStatus, TaskStatus } from "./types";
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

/**
 * Linkin neden kapandığı — açıksa null.
 *
 * TAMAMLANAN PROJE LİNKİ KAPATIR ve bu karar sütunda tutulmuyor, her okumada
 * projenin o anki durumuna bakılarak veriliyor. Sebep: proje yeniden açılırsa
 * (yanlışlıkla tamamlandı işaretlendi, ek iş çıktı) link de kendiliğinden
 * çalışsın. Damgalanmış bir "kapandı" bilgisi, sahibi linkleri tek tek
 * yeniden üretmeye zorlardı.
 *
 * Sıra en kesin sebepten en geçiciye: iptal geri alınamaz, süre geçmişte
 * kalmıştır, tamamlanma ise geri dönebilir.
 */
export function shareLinkClosedReason(
  link: { revokedAt?: string | null; expiresAt?: string | null; projectStatus?: ProjectStatus | null },
  now: Date = new Date()
): ProjectShareClosedReason | null {
  if (link.revokedAt) return "revoked";
  if (!isShareLinkActive({ expiresAt: link.expiresAt }, now)) return "expired";
  if (link.projectStatus === "completed") return "completed";
  return null;
}

/**
 * E-posta karşılaştırması için tek biçim: kırpılmış ve küçük harfli.
 *
 * Kapıyı açan kişi adresi "Ahmet@Firma.COM " diye yazabilir; sahibi de linki
 * oluştururken başka türlü yazmış olabilir. İkisinin aynı sayılmaması, kapıyı
 * kullanıcı hatasıyla kilitlenen bir şeye çevirirdi.
 */
export function normalizeShareEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Kabaca bir e-posta mı.
 *
 * Amaç doğrulamak değil, sahibinin yazım hatasını yakalamak: geçersiz bir
 * adres kaydedilirse kapı hiç açılmaz ve sahibi bunu ancak alıcı şikâyet
 * edince öğrenir. Tam RFC uyumu aranmıyor — o listeye uymayan geçerli
 * adresleri reddetmek, hatalı olanı kabul etmekten daha çok zarar verir.
 */
export function isLikelyEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 3 || v.length > 160) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf("@");
  if (at <= 0 || at !== v.lastIndexOf("@")) return false;
  const domain = v.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/**
 * Kapıyı açan adres doğru mu.
 *
 * Beklenen adres yoksa kapı da yoktur: link doğrudan açılır. Bu fonksiyon
 * ÇAĞIRANIN beklenen adresi dışarı sızdırmamasına güvenir — karşılaştırma
 * burada yapılır ki adres hiçbir yanıt gövdesine girmesin.
 */
export function shareEmailMatches(expected: unknown, given: unknown): boolean {
  const want = normalizeShareEmail(expected);
  if (!want) return true;
  return normalizeShareEmail(given) === want;
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
