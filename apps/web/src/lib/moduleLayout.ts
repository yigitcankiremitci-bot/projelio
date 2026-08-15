/**
 * Modül yerleşimi: hangi modüller sekme çubuğuna çıkar.
 *
 * Tamamen otomatiktir — kullanıcı sabitleme yapmaz. Karar üç şeye bakar:
 * şirketin büyüklüğü (kaç slot var), kullanıcının o modülle ilişkisi (puan) ve
 * bir önceki durum (histerezis).
 *
 * Bu dosya BİLEREK saf tutuldu: ağ yok, React yok, `new Date()` yok. Yerleşim
 * kuralı ekranın en görünür davranışı; test edilemezse güvenilmez.
 *
 * Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §3
 */

export interface ModuleUsage {
  key: string;
  name: string;
  /** Modüldeki toplam kayıt (arşivlenmemiş). */
  recordCount: number;
  /** Son kayıt hareketi (ISO). Hiç kayıt yoksa boş. */
  lastActivityAt?: string;
  /** Modülün açıldığı tarih (organization_modules / job_modules). */
  enabledAt?: string;
  /** Kullanıcı bu modüle atanmış mı (module_members). */
  assignedToMe: boolean;
}

export interface OrganizationSize {
  userCount: number;
  departmentCount: number;
}

export interface ModuleLayoutInput {
  size: OrganizationSize;
  modules: ModuleUsage[];
  /** Şimdiki zaman (ISO) — dışarıdan verilir ki fonksiyon saf kalsın. */
  now: string;
  /** Dar ekran: modül sekmesi çıkmaz, karşılığı "Sık kullandıkların" satırıdır. */
  isMobile?: boolean;
  /** Bir önceki terfi listesi (sıralı). Histerezis bunun üzerinden çalışır. */
  previous?: string[];
}

export interface ModuleTab {
  key: string;
  name: string;
  score: number;
  /** İlk kez terfi etti: tek seferlik "yeni" işareti için. */
  isNew: boolean;
}

/** Terfi eşiği: bu puanın altındaki modül sekmeye ÇIKMAZ. */
export const PROMOTE_AT = 6;
/** Düşme eşiği: sekmedeki modül bu puanın altına inerse iner. */
export const DEMOTE_BELOW = 3;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Çekirdek sekmelerle örtüşen modüller.
 *
 * Bütçe paneli zaten "Bütçe" sekmesinde, dosya yönetimi "Dosyalar"da. Aynı şeyi
 * iki sekmede göstermek kullanıcıya iki farklı yer varmış hissi veriyor.
 */
const CORE_OVERLAP = new Set([
  "yonetim_butce_yonetimi",
  "panel_butce",
  "yonetim_dosya_yonetimi",
  "yonetim_proje_yonetimi",
  "yonetim_gorev_yonetimi",
  "yonetim_program_yonetimi",
  "yonetim_cikti_yonetimi",
]);

function daysBetween(fromIso: string | undefined, nowIso: string): number | undefined {
  if (!fromIso) return undefined;
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return undefined;
  return (now - from) / DAY;
}

/**
 * Kaç modül sekmesi gösterilebilir.
 *
 * Sezgiye ters ama doğru olan kural: şirket büyüdükçe modül sekmesi AZALIR.
 * Küçük şirkette gezinilecek bir yapı yoktur, modül yüzeye çıkmazsa gömülü
 * kalır; büyük şirkette departman zaten gezinmenin ekseni olur ve sekme
 * çubuğunun sabit kalması gezinmeyi öğrenilebilir kılar.
 */
export function slotCount(size: OrganizationSize, isMobile = false): number {
  // Mobilde sekme çubuğu zaten 3+3 ızgaraya bölünüyor; yedinci sekme okunmuyor.
  if (isMobile) return 0;
  if (size.userCount >= 50 || size.departmentCount >= 5) return 0;
  if (size.userCount >= 10) return 1;
  return 2;
}

/** Bir modülün kullanıcı için puanı. Eşikler için bkz. PROMOTE_AT / DEMOTE_BELOW. */
export function scoreModule(module: ModuleUsage, now: string): number {
  let score = 0;

  // En güçlü sinyal: bu modül bu kişinin işi.
  if (module.assignedToMe) score += 3;

  const sinceActivity = daysBetween(module.lastActivityAt, now);
  if (sinceActivity !== undefined && sinceActivity <= 14) score += 2;
  else if (sinceActivity !== undefined && sinceActivity <= 30) score += 1;

  if (module.recordCount > 100) score += 2;
  else if (module.recordCount > 20) score += 1;

  // Yeni açılan modül hemen görünür olmalı, yoksa açıldığı gün unutulur.
  const sinceEnabled = daysBetween(module.enabledAt, now);
  if (sinceEnabled !== undefined && sinceEnabled <= 14) score += 2;

  if (CORE_OVERLAP.has(module.key)) score -= 2;

  // Terk edilmiş modül sekme işgal etmez: hiç kaydı yok ve 30 gündür açık.
  const abandoned =
    module.recordCount === 0 && sinceEnabled !== undefined && sinceEnabled > 30 && sinceActivity === undefined;
  if (abandoned) score -= 3;

  return score;
}

/**
 * Sekme çubuğuna çıkacak modüller.
 *
 * Histerezis: sekmedeki bir modül DEMOTE_BELOW'un altına inene kadar yerinde
 * kalır; yeni bir modülün girmesi için PROMOTE_AT gerekir. Arada kalan bant
 * sekmelerin haftadan haftaya yer değiştirmesini engeller — kullanıcının en çok
 * güvendiği şey sekmenin dünkü yerinde olmasıdır.
 */
export function resolveModuleTabs(input: ModuleLayoutInput): ModuleTab[] {
  const slots = slotCount(input.size, input.isMobile);
  if (slots === 0) return [];

  const scored = input.modules.map((m) => ({
    key: m.key,
    name: m.name,
    score: scoreModule(m, input.now),
  }));
  const byKey = new Map(scored.map((s) => [s.key, s]));
  const previous = input.previous ?? [];

  // 1) Mevcut sekmeler, hâlâ hak ediyorlarsa sırasını koruyarak kalır.
  const kept = previous
    .map((key) => byKey.get(key))
    .filter((s): s is (typeof scored)[number] => Boolean(s) && s!.score >= DEMOTE_BELOW);

  // Şirket büyüyüp slot azaldıysa en düşük puanlılar düşer.
  const keptWithinSlots = [...kept].sort((a, b) => b.score - a.score).slice(0, slots);
  const keptOrdered = kept.filter((k) => keptWithinSlots.includes(k));

  // 2) Kalan slotlar terfi eşiğini geçenlerle dolar.
  const promoted = scored
    .filter((s) => !keptOrdered.some((k) => k.key === s.key))
    .filter((s) => s.score >= PROMOTE_AT)
    // Eşit puanda ada göre: sıra rastgele olmasın, aynı girdi aynı sonucu versin.
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "tr"))
    .slice(0, Math.max(0, slots - keptOrdered.length));

  return [
    ...keptOrdered.map((s) => ({ ...s, isNew: false })),
    ...promoted.map((s) => ({ ...s, isNew: true })),
  ];
}
