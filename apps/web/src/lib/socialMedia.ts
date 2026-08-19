import type {
  SocialAccount,
  SocialConnectionStatus,
  SocialContentType,
  SocialPlatform,
  SocialPost,
  SocialPostStatus,
  SocialTargetStatus,
} from "@projelio/shared";

/**
 * Sosyal Medya modülünün sözlüğü ve küçük hesapları.
 *
 * Panel, composer ve hesap modali aynı etiketleri kullanıyor; üç dosyaya
 * kopyalanırsa biri güncellenip diğerleri unutuluyor. Bileşen değil veri
 * olduğu için lib altında.
 *
 * Modül kendi tablolarına yazar (bkz. 054_social_media.sql), bu yüzden
 * moduleConfigs altındaki alan tanımı sözleşmesine tabi değil.
 */

export const SOCIAL_MEDIA_MODULE_KEY = "pd_sosyal_medya";

export function isSocialMediaModule(moduleKey: string): boolean {
  return moduleKey === SOCIAL_MEDIA_MODULE_KEY;
}

export interface PlatformMeta {
  label: string;
  /** Takvimde ve rozetlerde varsayılan renk (hesabın kendi rengi yoksa). */
  color: string;
  /**
   * Metin sınırı. Composer'daki sayaç bunu aşınca uyarır — "gönderiyi
   * yapıştırırken kesildi" hatası ancak yayından sonra fark ediliyordu.
   * Sınırsız kabul edilen kanallarda undefined.
   */
  captionLimit?: number;
  /** Kullanıcının profil adresini elle yazmasına gerek kalmasın. */
  profilePrefix?: string;
}

export const SOCIAL_PLATFORMS: Record<SocialPlatform, PlatformMeta> = {
  instagram: { label: "Instagram", color: "#C13584", captionLimit: 2200, profilePrefix: "https://instagram.com/" },
  facebook: { label: "Facebook", color: "#1877F2", captionLimit: 63206, profilePrefix: "https://facebook.com/" },
  x: { label: "X / Twitter", color: "#1A1F29", captionLimit: 280, profilePrefix: "https://x.com/" },
  linkedin: { label: "LinkedIn", color: "#0A66C2", captionLimit: 3000, profilePrefix: "https://linkedin.com/in/" },
  tiktok: { label: "TikTok", color: "#111318", captionLimit: 2200, profilePrefix: "https://tiktok.com/@" },
  youtube: { label: "YouTube", color: "#C13434", captionLimit: 5000, profilePrefix: "https://youtube.com/@" },
  pinterest: { label: "Pinterest", color: "#BD081C", captionLimit: 500, profilePrefix: "https://pinterest.com/" },
  threads: { label: "Threads", color: "#3E4858", captionLimit: 500, profilePrefix: "https://threads.net/@" },
  blog: { label: "Blog / web", color: "#C0813F" },
  other: { label: "Diğer", color: "#66707F" },
};

export const PLATFORM_ORDER: SocialPlatform[] = [
  "instagram",
  "facebook",
  "x",
  "linkedin",
  "tiktok",
  "youtube",
  "pinterest",
  "threads",
  "blog",
  "other",
];

export interface StatusMeta {
  label: string;
  color: string;
  /** Kısa açıklama — durum seçicide ipucu olarak gösterilir. */
  hint: string;
}

/**
 * İçeriğin akıştaki yeri.
 *
 * Akışın tamamı zorunlu değil: iki kişilik bir ekip fikirden doğrudan
 * "yayımlandı"ya geçer. Onay adımları (ready/approved) ancak müşteri onayı
 * olan ajanslarda anlamlı; ikisi de listede ama hiçbiri dayatılmıyor.
 */
export const SOCIAL_STATUS: Record<SocialPostStatus, StatusMeta> = {
  idea: { label: "Fikir", color: "#8593A8", hint: "Havuzda bekleyen içerik fikri" },
  draft: { label: "Taslak", color: "#66707F", hint: "Metin/görsel hazırlanıyor" },
  ready: { label: "Onaya hazır", color: "#C0813F", hint: "Yayın için onay bekliyor" },
  approved: { label: "Onaylandı", color: "#2E9E5B", hint: "Onaylandı, yayın saati bekleniyor" },
  scheduled: { label: "Planlandı", color: "#3E4858", hint: "Yayın tarihi belirlendi" },
  published: { label: "Yayımlandı", color: "#2E9E5B", hint: "Kanallarda yayında" },
  failed: { label: "Başarısız", color: "#C13434", hint: "Yayımlanamadı" },
  cancelled: { label: "İptal", color: "#9AA2B0", hint: "Yayımlanmayacak" },
};

export const STATUS_ORDER: SocialPostStatus[] = [
  "idea",
  "draft",
  "ready",
  "approved",
  "scheduled",
  "published",
  "failed",
  "cancelled",
];

/** Takvim ve panoda gösterilen ana akış — iptal/başarısız gürültü yapmasın. */
export const ACTIVE_STATUSES: SocialPostStatus[] = ["idea", "draft", "ready", "approved", "scheduled", "published"];

export const CONTENT_TYPES: Record<SocialContentType, string> = {
  image: "Görsel",
  video: "Video",
  carousel: "Karusel",
  story: "Hikâye",
  reel: "Reels / kısa video",
  text: "Yalnızca metin",
  article: "Yazı / blog",
  poll: "Anket",
  other: "Diğer",
};

export const CONTENT_TYPE_ORDER: SocialContentType[] = [
  "image",
  "video",
  "carousel",
  "reel",
  "story",
  "text",
  "article",
  "poll",
  "other",
];

// ============================================================ Bağlantı ve yayın durumu

/**
 * Hesabın Instagram bağlantısı.
 *
 * `manual` bir arıza değil, geçerli bir çalışma biçimi: Projelio planı ve metni
 * tutar, yayını kullanıcı kendi yapar. Bu yüzden nötr renkte — kırmızı bir
 * uyarı, hiçbir şeyi yanlış yapmamış kullanıcıyı telaşlandırıyordu.
 */
export const CONNECTION_STATUS: Record<SocialConnectionStatus, { label: string; color: string; hint: string }> = {
  manual: { label: "Elle yönetiliyor", color: "#66707F", hint: "Yayını siz yapıyorsunuz" },
  connected: { label: "Bağlı", color: "#2E9E5B", hint: "Projelio bu hesaba doğrudan yayımlayabilir" },
  expired: { label: "Süresi doldu", color: "#C0813F", hint: "Bağlantıyı yenilemek için tekrar bağlanın" },
  revoked: { label: "İptal edildi", color: "#C13434", hint: "Instagram tarafında erişim kaldırılmış" },
};

/** Bir içeriğin TEK bir kanaldaki yayın durumu. */
export const TARGET_STATUS: Record<SocialTargetStatus, { label: string; color: string }> = {
  pending: { label: "Bekliyor", color: "#66707F" },
  scheduled: { label: "Sırada", color: "#3E4858" },
  published: { label: "Yayımlandı", color: "#2E9E5B" },
  failed: { label: "Başarısız", color: "#C13434" },
  skipped: { label: "Atlandı", color: "#9AA2B0" },
};

/** Hesap otomatik yayına hazır mı — "Şimdi paylaş" düğmesi buna bakar. */
export function canAutoPublish(account: SocialAccount): boolean {
  return account.connectionStatus === "connected" && account.platform === "instagram";
}

// ============================================================ Hesap yardımcıları

export function accountLabel(account: SocialAccount): string {
  return account.displayName?.trim() || `@${account.handle}`;
}

export function accountColor(account: SocialAccount): string {
  return account.color || SOCIAL_PLATFORMS[account.platform]?.color || "#66707F";
}

/**
 * Gönderinin takvimdeki rengi.
 *
 * İlk hedef hesabın rengi kullanılır: bir içerik çoğunlukla tek kanala gider,
 * çok kanallıda da ilk kanal yeterli bir işaret. Hesabı olmayan (henüz kanal
 * seçilmemiş) içerik nötr gri kalır — "nereye gideceği belli değil" bilgisi
 * zaten kendi başına anlamlı.
 */
export function postColor(post: SocialPost, accounts: SocialAccount[]): string {
  const first = post.targets[0];
  const account = first ? accounts.find((a) => a.id === first.accountId) : undefined;
  return account ? accountColor(account) : "#9AA2B0";
}

// ============================================================ Metin yardımcıları

/**
 * Yayımlanacak metnin uzunluğu.
 *
 * Etiketler ve bağlantı ayrı alanlarda duruyor ama kanalda aynı gönderinin
 * içinde yayımlanıyor; sayaç ikisini de katmazsa sınır aşımı geç fark edilir.
 */
export function captionLength(caption?: string, hashtags?: string): number {
  return `${caption ?? ""}${hashtags ? ` ${hashtags}` : ""}`.trim().length;
}

/** Seçili kanallar arasındaki EN DAR sınır — uyarı en katı kanala göre verilir. */
export function tightestLimit(platforms: SocialPlatform[]): number | undefined {
  const limits = platforms
    .map((p) => SOCIAL_PLATFORMS[p]?.captionLimit)
    .filter((l): l is number => typeof l === "number");
  return limits.length > 0 ? Math.min(...limits) : undefined;
}

/** "#kahve #istanbul" → 2. Etiket sayısı kanal başına öneri sınırı taşır. */
export function hashtagCount(hashtags?: string): number {
  if (!hashtags) return 0;
  return hashtags.split(/[\s,]+/).filter((t) => t.trim().length > 1).length;
}

// ============================================================ Tarih yardımcıları

/** Yerel takvim günü (YYYY-MM-DD). toISOString UTC'ye kaydırır, kullanılmaz. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Gönderinin düştüğü takvim günü. Tarihi olmayanlar "planlanmamış" kutusunda. */
export function postDay(post: SocialPost): string | undefined {
  if (!post.scheduledAt) return undefined;
  return localDay(new Date(post.scheduledAt));
}

/** "14:30" — takvim kartında saat, gün zaten belli. */
export function postTime(post: SocialPost): string | undefined {
  if (!post.scheduledAt) return undefined;
  const d = new Date(post.scheduledAt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * <input type="datetime-local"> değeri.
 *
 * Bu girdi yerel saat bekler; ISO string'i doğrudan vermek saati dilim farkı
 * kadar kaydırır (Türkiye'de 3 saat).
 */
export function toDateTimeLocal(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${localDay(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** datetime-local değerini sunucunun beklediği ISO ana çevirir. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const WEEKDAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export const MONTH_LABELS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

/**
 * Ay ızgarasının günleri: pazartesiyle başlayan 6 haftalık sabit blok.
 *
 * Sabit 42 hücre, ay değiştikçe ızgaranın yüksekliğinin zıplamasını önler —
 * takvimde gezinirken içerik kartları yer değiştirmiş gibi görünüyordu.
 */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // getDay(): 0 = Pazar. Hafta pazartesi başladığı için kaydırıyoruz.
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}
