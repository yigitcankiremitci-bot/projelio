import type { NotificationPayload } from "./types";

/**
 * BİLDİRİM TERCİHLERİ — hangi bildirim, hangi kanaldan (bkz. migration 135).
 *
 * Sunucu (notifyUser, e-posta ve WhatsApp işleyicileri) ile Ayarlar kartı AYNI
 * tanımdan okur: kategori listesi arayüzde bir kopya olsaydı, yeni bir tip
 * eklendiğinde ayarda görünmez ama sunucuda uygulanırdı (ya da tersi).
 *
 * Model: tercih TİP başına tutulur, arayüz tipleri kategorilerle gruplar ve
 * kategori anahtarı altındaki bütün tipleri birlikte değiştirir. Kaydı olmayan
 * tip için her kanal AÇIK — yani tablo boşken davranış eskisinin aynısı ve
 * sonradan eklenen bir tip kimsenin ayarında kapalı başlamaz.
 */

export type BildirimTipi = NotificationPayload["type"];

/**
 * uygulama: çan + uygulama içi ses. KAPALIYSA bildirim hiç yazılmaz, diğer
 *   kanallar da gitmez — hepsi o satırdan besleniyor.
 * anlik: telefon (FCM) ve tarayıcı (web push) sistem bildirimi.
 * eposta: "bildirim geldikçe" ve "günde bir özet" e-postaları.
 * whatsapp: bağlı WhatsApp numarasına mesaj.
 */
export type BildirimKanali = "uygulama" | "anlik" | "eposta" | "whatsapp";

export const BILDIRIM_KANALLARI: readonly BildirimKanali[] = ["uygulama", "anlik", "eposta", "whatsapp"];

export const BILDIRIM_KANALI_ETIKETI: Record<BildirimKanali, string> = {
  uygulama: "Uygulamada", // dil:anahtar
  anlik: "Telefon ve tarayıcı", // dil:anahtar
  eposta: "E-posta", // dil:anahtar
  whatsapp: "WhatsApp", // dil:anahtar
};

/** Tip başına kanal tercihi; yazılmayan kanal açık sayılır. */
export type TipTercihi = Partial<Record<BildirimKanali, boolean>>;

export interface BildirimTercihleri {
  tipler: Partial<Record<BildirimTipi, TipTercihi>>;
  /** Uygulama açıkken bildirim sesi çalsın mı (web). Telefonun sesi Android'in kanal ayarında. */
  ses: boolean;
}

export const VARSAYILAN_BILDIRIM_TERCIHLERI: BildirimTercihleri = { tipler: {}, ses: true };

/**
 * Çanda KAPATILAMAYAN tipler. Hepsi ya kullanıcıdan bir yanıt bekliyor (davet,
 * onay talebi) ya da ona doğrudan yazılmış bir mesaj (destek, yönetici). Çandan
 * kaldırılırsa kabul/ret düğmesinin başka bir yeri yok; davet sessizce
 * cevapsız kalır. Diğer kanalları (telefon, e-posta) kapatılabilir.
 */
export const KILITLI_BILDIRIM_TIPLERI: ReadonlySet<BildirimTipi> = new Set<BildirimTipi>([
  "job_invite",
  "team_invite",
  "creation_request",
  "support_reply",
  "admin_message",
  "ai_spend_alert",
]);

/**
 * Hangi tipler WhatsApp'a gidebiliyor — her tip gitmiyor (kota ve ban riski,
 * bkz. whatsapp-notification-types.ts). Liste orada; burada yalnızca arayüzün
 * gitmeyecek bir kanal için anahtar göstermemesi için kullanılır.
 */
export const WHATSAPP_GIDEN_TIPLER: ReadonlySet<BildirimTipi> = new Set<BildirimTipi>([
  "task_due_24h",
  "task_due_1h",
  "task_reminder",
  "project_deadline_24h",
  "task_assigned",
  "team_invite",
  "job_invite",
  "job_invite_answered",
  "creation_request",
  "creation_request_answered",
  "post_mention",
  "post_comment",
  "support_reply",
]);

export interface BildirimKategorisi {
  kimlik: string;
  baslik: string;
  aciklama: string;
  tipler: { tip: BildirimTipi; etiket: string }[];
}

/**
 * Ayarlarda görünen gruplar. `ai_spend_alert` yok: yalnızca yöneticilere gidiyor
 * ve kilitli; listede görünse kullanıcıların çoğuna anlamsız gelirdi.
 * `daily_digest`/`weekly_digest` de yok: bunlar e-posta kartındaki ayar.
 */
export const BILDIRIM_KATEGORILERI: BildirimKategorisi[] = [
  {
    kimlik: "gorevler",
    baslik: "Görevler ve hatırlatmalar", // dil:anahtar
    aciklama: "Sana atanan görevler, değişiklikler ve bitiş saati hatırlatmaları.", // dil:anahtar
    tipler: [
      { tip: "task_reminder", etiket: "Kurduğun hatırlatmalar" }, // dil:anahtar
      { tip: "task_assigned", etiket: "Bana görev atandığında" }, // dil:anahtar
      { tip: "task_updated", etiket: "Görevim güncellendiğinde" }, // dil:anahtar
      { tip: "task_due_24h", etiket: "Görev bitimine 24 saat kala" }, // dil:anahtar
      { tip: "task_due_1h", etiket: "Görev bitimine 1 saat kala" }, // dil:anahtar
      { tip: "project_deadline_24h", etiket: "Proje bitimine 24 saat kala" }, // dil:anahtar
    ],
  },
  {
    kimlik: "ekip",
    baslik: "Ekip ve davetler", // dil:anahtar
    aciklama: "Davetler, katılım istekleri, rol değişiklikleri ve onay talepleri.", // dil:anahtar
    tipler: [
      { tip: "job_invite", etiket: "Bir işe davet edildiğimde" }, // dil:anahtar
      { tip: "team_invite", etiket: "Bir ekibe davet edildiğimde" }, // dil:anahtar
      { tip: "job_invite_answered", etiket: "Davetim yanıtlandığında" }, // dil:anahtar
      { tip: "join_request", etiket: "Katılım isteği geldiğinde" }, // dil:anahtar
      { tip: "member_joined", etiket: "Yeni üye katıldığında" }, // dil:anahtar
      { tip: "role_updated", etiket: "Rolüm değiştiğinde" }, // dil:anahtar
      { tip: "creation_request", etiket: "Onay talebi geldiğinde" }, // dil:anahtar
      { tip: "creation_request_answered", etiket: "Talebim yanıtlandığında" }, // dil:anahtar
    ],
  },
  {
    kimlik: "paylasimlar",
    baslik: "Paylaşımlar ve yorumlar", // dil:anahtar
    aciklama: "Akıştaki etiketlemeler, yorumlar ve beğeniler.", // dil:anahtar
    tipler: [
      { tip: "post_mention", etiket: "Etiketlendiğimde" }, // dil:anahtar
      { tip: "post_comment", etiket: "Paylaşımıma yorum yapıldığında" }, // dil:anahtar
      { tip: "post_like", etiket: "Paylaşımım beğenildiğinde" }, // dil:anahtar
      { tip: "comment_like", etiket: "Yorumum beğenildiğinde" }, // dil:anahtar
    ],
  },
  {
    kimlik: "arkadaslar",
    baslik: "Arkadaşlar", // dil:anahtar
    aciklama: "Arkadaşlık istekleri ve duvarına yazılanlar.", // dil:anahtar
    tipler: [
      { tip: "friend_request", etiket: "Arkadaşlık isteği geldiğinde" }, // dil:anahtar
      { tip: "friend_accepted", etiket: "İsteğim kabul edildiğinde" }, // dil:anahtar
      { tip: "wall_post", etiket: "Duvarıma yazıldığında" }, // dil:anahtar
    ],
  },
  {
    kimlik: "butce",
    baslik: "Bütçe ve ödemeler", // dil:anahtar
    aciklama: "Bütçe değişiklikleri ve düzenli ödemelerin vadeleri.", // dil:anahtar
    tipler: [
      { tip: "budget_changed", etiket: "Bütçe değiştiğinde" }, // dil:anahtar
      { tip: "recurring_payment_reminder", etiket: "Düzenli ödeme yaklaştığında" }, // dil:anahtar
      { tip: "recurring_payment_due", etiket: "Düzenli ödemenin vadesi geldiğinde" }, // dil:anahtar
    ],
  },
  {
    kimlik: "dosyalar",
    baslik: "Dosyalar", // dil:anahtar
    aciklama: "Sana bağlanan dosyalar ve paylaştığın bağlantıların indirilmesi.", // dil:anahtar
    tipler: [
      { tip: "file_linked", etiket: "Bana dosya bağlandığında" }, // dil:anahtar
      { tip: "file_link_downloaded", etiket: "Paylaştığım dosya indirildiğinde" }, // dil:anahtar
    ],
  },
  {
    kimlik: "sosyal_medya",
    baslik: "Sosyal medya ve WhatsApp", // dil:anahtar
    aciklama: "Zamanlanmış paylaşımların sonucu ve müşterilerden gelen WhatsApp mesajları.", // dil:anahtar
    tipler: [
      { tip: "social_post_published", etiket: "Paylaşım yayımlandığında" }, // dil:anahtar
      { tip: "social_post_failed", etiket: "Paylaşım yayımlanamadığında" }, // dil:anahtar
      { tip: "whatsapp_inbound", etiket: "Müşteriden WhatsApp mesajı geldiğinde" }, // dil:anahtar
    ],
  },
  {
    kimlik: "destek",
    baslik: "Destek ve duyurular", // dil:anahtar
    aciklama: "Destek yanıtları ve Projelio ekibinden gelen mesajlar. Uygulamada her zaman görünür.", // dil:anahtar
    tipler: [
      { tip: "support_reply", etiket: "Destek talebim yanıtlandığında" }, // dil:anahtar
      { tip: "admin_message", etiket: "Projelio ekibinden mesaj" }, // dil:anahtar
    ],
  },
];

/**
 * Bu kanal bu tip için açık mı? TEK karar noktası — sunucu da arayüz de bunu çağırır.
 *
 * Kilitli tipte `uygulama` her zaman açık. `uygulama` kapalıysa diğer kanallar
 * da kapalı sayılır: bildirim satırı yazılmıyorsa telefona ne gideceği de yok.
 */
export function bildirimKanaliAcikMi(tercihler: BildirimTercihleri | null | undefined, tip: BildirimTipi, kanal: BildirimKanali): boolean {
  const tercih = tercihler?.tipler?.[tip];
  const uygulamaAcik = KILITLI_BILDIRIM_TIPLERI.has(tip) || tercih?.uygulama !== false;
  if (kanal === "uygulama") return uygulamaAcik;
  if (!uygulamaAcik) return false;
  return tercih?.[kanal] !== false;
}

/**
 * Dışarıdan gelen (istemci gövdesi ya da veritabanı) tercihi temizler: bilinmeyen
 * tip, bilinmeyen kanal ve boolean olmayan değer DÜŞER. Kötü bir kayıt
 * notifyUser'ı her çağrıda şaşırtmasın ve tablo çöp birikmesin diye.
 */
export function bildirimTercihleriniTemizle(ham: unknown): BildirimTercihleri {
  const bilinenTipler = new Set<string>(BILDIRIM_KATEGORILERI.flatMap((k) => k.tipler.map((t) => t.tip)));
  const nesne = (ham && typeof ham === "object" ? ham : {}) as { tipler?: unknown; ses?: unknown };
  const tipler: BildirimTercihleri["tipler"] = {};
  if (nesne.tipler && typeof nesne.tipler === "object") {
    for (const [tip, deger] of Object.entries(nesne.tipler as Record<string, unknown>)) {
      if (!bilinenTipler.has(tip) || !deger || typeof deger !== "object") continue;
      const temiz: TipTercihi = {};
      for (const kanal of BILDIRIM_KANALLARI) {
        const v = (deger as Record<string, unknown>)[kanal];
        // Yalnızca KAPALI olanı saklamak yeter: yazılmayan kanal zaten açık.
        if (v === false) temiz[kanal] = false;
      }
      if (Object.keys(temiz).length) tipler[tip as BildirimTipi] = temiz;
    }
  }
  return { tipler, ses: nesne.ses !== false };
}
