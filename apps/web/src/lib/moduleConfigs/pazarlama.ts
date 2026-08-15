import {
  NOTES_FIELD,
  countBy,
  countWhere,
  currencyField,
  joinDetail,
  labelOf,
  moneyStats,
  opts,
  type ModuleRecordConfig,
} from "./shared";

// PAZARLAMA ve BÜYÜME departmanının modülleri.

// ============================================================ Sosyal medya
// A5 (takvim) arketibi. Takvim görünümü ve plandan otomatik görev üretimi
// A5 motoruyla gelecek — bugün planlanan tarih bir alan.
const SOCIAL_PLATFORM = {
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  other: "Diğer",
};
const SOCIAL_STATUS = { draft: "Taslak", scheduled: "Planlandı", published: "Yayınlandı" };

export const socialMediaConfig: ModuleRecordConfig = {
  periodKey: "scheduledDate",
  title: "Sosyal Medya",
  addLabel: "Gönderi ekle",
  emptyLabel: "Henüz planlanmış gönderi yok.",
  fields: [
    { key: "platform", label: "Platform", type: "select", defaultValue: "instagram", options: opts(SOCIAL_PLATFORM) },
    { key: "title", label: "Başlık / konu", type: "text", required: true },
    { key: "scheduledDate", label: "Planlanan tarih", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "draft", options: opts(SOCIAL_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => (d.title as string) ?? "",
  detail: (d) =>
    joinDetail(labelOf(SOCIAL_PLATFORM, d.platform), labelOf(SOCIAL_STATUS, d.status), d.scheduledDate as string),
  computeStats: (records) => [
    { label: "Taslak", value: String(countBy(records, "status", "draft")) },
    { label: "Planlanan", value: String(countBy(records, "status", "scheduled")) },
    { label: "Yayınlanan", value: String(countBy(records, "status", "published")) },
  ],
};

// ============================================================ E-mail pazarlama
// Sosyal medyayla aynı motoru kullanır (A5); ikisinin tek "İçerik Takvimi"
// modülünde kanal alanıyla birleştirilmesi öneriliyor
// (bkz. docs/moduller/01-modul-arketip-eslesmesi.md ⚠️). Birleşene kadar ayrı,
// çünkü e-posta açılma/tıklanma gibi kendine özgü ölçütler taşıyor.
const EMAIL_STATUS = { draft: "Taslak", scheduled: "Planlandı", sent: "Gönderildi", cancelled: "İptal" };

export const emailCampaignConfig: ModuleRecordConfig = {
  periodKey: "sendDate",
  title: "E-mail Kampanyaları",
  addLabel: "Kampanya ekle",
  emptyLabel: "Henüz e-posta kampanyası yok.",
  fields: [
    { key: "campaignName", label: "Kampanya", type: "text", required: true },
    { key: "audience", label: "Hedef liste", type: "text", placeholder: "Örn. Tüm müşteriler, Yeni kayıtlar" },
    { key: "sendDate", label: "Gönderim tarihi", type: "date" },
    { key: "recipientCount", label: "Alıcı sayısı", type: "number" },
    { key: "openRate", label: "Açılma oranı (%)", type: "number" },
    { key: "clickRate", label: "Tıklanma oranı (%)", type: "number" },
    { key: "status", label: "Durum", type: "select", defaultValue: "draft", options: opts(EMAIL_STATUS) },
  ],
  summary: (d) => (d.campaignName as string) ?? "",
  detail: (d) =>
    joinDetail(
      labelOf(EMAIL_STATUS, d.status),
      d.audience as string,
      d.recipientCount ? `${d.recipientCount} alıcı` : undefined,
      d.openRate ? `Açılma %${d.openRate}` : undefined,
      d.sendDate as string
    ),
  computeStats: (records) => {
    const sent = records.filter((r) => r.data.status === "sent");
    // Ortalama açılma oranı yalnızca gönderilmiş ve oranı girilmiş kampanyalardan
    // hesaplanır; taslakları katmak ortalamayı yanıltıcı biçimde düşürür.
    const withRate = sent.filter((r) => Number.isFinite(Number(r.data.openRate)));
    const avgOpen =
      withRate.length > 0
        ? Math.round(withRate.reduce((sum, r) => sum + Number(r.data.openRate), 0) / withRate.length)
        : null;
    return [
      { label: "Planlanan", value: String(countBy(records, "status", "scheduled")) },
      { label: "Gönderilen", value: String(sent.length) },
      { label: "Ort. açılma", value: avgOpen === null ? "—" : `%${avgOpen}` },
    ];
  },
};

// ============================================================ Reklam
const AD_PLATFORM = {
  google: "Google Ads",
  meta: "Meta (Facebook/Instagram)",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X / Twitter",
  local: "Yerel / basılı",
  other: "Diğer",
};
const AD_STATUS = { draft: "Taslak", live: "Yayında", paused: "Duraklatıldı", ended: "Bitti" };

export const advertisingConfig: ModuleRecordConfig = {
  periodKey: "startDate",
  title: "Reklam Kampanyaları",
  addLabel: "Kampanya ekle",
  emptyLabel: "Henüz reklam kampanyası yok.",
  fields: [
    { key: "campaignName", label: "Kampanya", type: "text", required: true },
    { key: "platform", label: "Platform", type: "select", defaultValue: "google", options: opts(AD_PLATFORM) },
    currencyField("amount", "Bütçe"),
    { key: "startDate", label: "Başlangıç", type: "date" },
    { key: "endDate", label: "Bitiş", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "draft", options: opts(AD_STATUS) },
    { key: "result", label: "Sonuç / not", type: "textarea" },
  ],
  summary: (d) => `${d.campaignName ?? ""}${d.platform ? ` · ${labelOf(AD_PLATFORM, d.platform)}` : ""}`,
  detail: (d) => {
    const range = [d.startDate, d.endDate].filter(Boolean).join(" → ");
    return joinDetail(labelOf(AD_STATUS, d.status), range || undefined);
  },
  computeStats: (records) => [
    { label: "Yayında", value: String(countBy(records, "status", "live")) },
    // İptal edilmemiş tüm kampanyaların bütçesi — harcama taahhüdünü gösterir.
    ...moneyStats("Toplam bütçe", records.filter((r) => r.data.status !== "draft")),
    { label: "Biten", value: String(countBy(records, "status", "ended")) },
  ],
};

// ============================================================ SEO / SEM
// "Dijital Pazarlama ve SEO/SEM" ikiye bölündü: bu yarısı anahtar kelime
// takibi (veri girişi), diğer yarısı kanal performans paneli (A6, henüz yok).
// Bkz. docs/moduller/01-modul-arketip-eslesmesi.md Karar 2.
const SEO_CHANNEL = { seo: "SEO (organik)", sem: "SEM (ücretli)", both: "Her ikisi" };
const SEO_STATUS = { tracking: "Takipte", improving: "İyileşiyor", declining: "Geriliyor", reached: "Hedefe ulaşıldı" };

export const seoSemConfig: ModuleRecordConfig = {
  periodKey: "lastCheckDate",
  title: "SEO / SEM",
  addLabel: "Anahtar kelime ekle",
  emptyLabel: "Henüz takip edilen anahtar kelime yok.",
  fields: [
    { key: "keyword", label: "Anahtar kelime", type: "text", required: true },
    { key: "targetUrl", label: "Hedef sayfa", type: "text", placeholder: "Örn. /fiyatlandirma" },
    { key: "channel", label: "Kanal", type: "select", defaultValue: "seo", options: opts(SEO_CHANNEL) },
    { key: "searchVolume", label: "Aylık arama hacmi", type: "number" },
    { key: "currentRank", label: "Mevcut sıra", type: "number" },
    { key: "status", label: "Durum", type: "select", defaultValue: "tracking", options: opts(SEO_STATUS) },
    { key: "lastCheckDate", label: "Son kontrol", type: "date" },
  ],
  summary: (d) => `${d.keyword ?? ""}${d.currentRank ? ` · ${d.currentRank}. sıra` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(SEO_CHANNEL, d.channel),
      labelOf(SEO_STATUS, d.status),
      d.searchVolume ? `${d.searchVolume}/ay` : undefined,
      d.targetUrl as string
    ),
  computeStats: (records) => {
    const inTop10 = countWhere(records, (d) => {
      const rank = Number(d.currentRank);
      return Number.isFinite(rank) && rank > 0 && rank <= 10;
    });
    return [
      { label: "Anahtar kelime", value: String(records.length) },
      { label: "İlk 10'da", value: String(inTop10) },
      { label: "Geriliyor", value: String(countBy(records, "status", "declining")) },
    ];
  },
};

// ============================================================ Rakip ve sektör analizi
const PRICE_POSITION = { cheaper: "Bizden ucuz", similar: "Benzer", pricier: "Bizden pahalı", unknown: "Bilinmiyor" };
const THREAT_LEVEL = { low: "Düşük", medium: "Orta", high: "Yüksek" };

export const competitorConfig: ModuleRecordConfig = {
  periodKey: "lastReviewDate",
  title: "Rakip ve Sektör Analizi",
  addLabel: "Rakip ekle",
  emptyLabel: "Henüz rakip kaydı yok.",
  fields: [
    { key: "competitorName", label: "Rakip", type: "text", required: true },
    { key: "segment", label: "Segment / pazar", type: "text" },
    { key: "strengths", label: "Güçlü yanları", type: "textarea" },
    { key: "weaknesses", label: "Zayıf yanları", type: "textarea" },
    {
      key: "pricePosition",
      label: "Fiyat konumu",
      type: "select",
      defaultValue: "unknown",
      options: opts(PRICE_POSITION),
    },
    { key: "threatLevel", label: "Tehdit seviyesi", type: "select", defaultValue: "medium", options: opts(THREAT_LEVEL) },
    { key: "lastReviewDate", label: "Son inceleme", type: "date" },
  ],
  summary: (d) => `${d.competitorName ?? ""}${d.segment ? ` · ${d.segment}` : ""}`,
  detail: (d) =>
    joinDetail(
      d.threatLevel ? `Tehdit: ${labelOf(THREAT_LEVEL, d.threatLevel)}` : undefined,
      labelOf(PRICE_POSITION, d.pricePosition),
      d.lastReviewDate ? `İnceleme: ${d.lastReviewDate}` : undefined
    ),
  computeStats: (records) => [
    { label: "Rakip", value: String(records.length) },
    { label: "Yüksek tehdit", value: String(countBy(records, "threatLevel", "high")) },
    { label: "Bizden ucuz", value: String(countBy(records, "pricePosition", "cheaper")) },
  ],
};

// ============================================================ Hedef kitle
const AUDIENCE_SEGMENT = { b2b: "B2B", b2c: "B2C", both: "Her ikisi" };
const PERSONA_PRIORITY = { primary: "Birincil", secondary: "İkincil", experimental: "Deneysel" };

export const targetAudienceConfig: ModuleRecordConfig = {
  title: "Hedef Kitle",
  addLabel: "Persona ekle",
  emptyLabel: "Henüz hedef kitle tanımı yok.",
  fields: [
    { key: "personaName", label: "Persona", type: "text", required: true, placeholder: "Örn. Küçük işletme sahibi Ayşe" },
    { key: "segment", label: "Segment", type: "select", defaultValue: "b2c", options: opts(AUDIENCE_SEGMENT) },
    { key: "ageRange", label: "Yaş aralığı", type: "text", placeholder: "Örn. 28-45" },
    { key: "needs", label: "İhtiyaçları / sorunları", type: "textarea" },
    { key: "channels", label: "Ulaşılan kanallar", type: "text", placeholder: "Örn. Instagram, Google" },
    { key: "priority", label: "Öncelik", type: "select", defaultValue: "primary", options: opts(PERSONA_PRIORITY) },
    NOTES_FIELD,
  ],
  summary: (d) => (d.personaName as string) ?? "",
  detail: (d) =>
    joinDetail(
      labelOf(AUDIENCE_SEGMENT, d.segment),
      labelOf(PERSONA_PRIORITY, d.priority),
      d.ageRange as string,
      d.channels as string
    ),
  computeStats: (records) => [
    { label: "Persona", value: String(records.length) },
    { label: "Birincil", value: String(countBy(records, "priority", "primary")) },
    { label: "B2B", value: String(countWhere(records, (d) => d.segment === "b2b" || d.segment === "both")) },
  ],
};

// ============================================================ Ürün stratejileri
const PRICING_STRATEGY = {
  premium: "Premium",
  competitive: "Rekabetçi",
  penetration: "Pazara giriş",
  value: "Değer bazlı",
  cost_plus: "Maliyet artı",
};
const PRODUCT_STATUS = { idea: "Fikir", developing: "Geliştiriliyor", live: "Yayında", retired: "Emekli" };

export const productStrategyConfig: ModuleRecordConfig = {
  periodKey: "launchDate",
  title: "Ürün Stratejileri",
  addLabel: "Strateji ekle",
  emptyLabel: "Henüz ürün stratejisi yok.",
  fields: [
    { key: "productName", label: "Ürün / hizmet", type: "text", required: true },
    { key: "positioning", label: "Konumlandırma", type: "textarea", placeholder: "Kime, neden bizi tercih ettirir?" },
    { key: "targetSegment", label: "Hedef segment", type: "text" },
    {
      key: "pricingStrategy",
      label: "Fiyatlandırma stratejisi",
      type: "select",
      defaultValue: "competitive",
      options: opts(PRICING_STRATEGY),
    },
    { key: "launchDate", label: "Lansman tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "idea", options: opts(PRODUCT_STATUS) },
  ],
  summary: (d) => (d.productName as string) ?? "",
  detail: (d) =>
    joinDetail(labelOf(PRODUCT_STATUS, d.status), labelOf(PRICING_STRATEGY, d.pricingStrategy), d.targetSegment as string),
  computeStats: (records) => [
    { label: "Ürün", value: String(records.length) },
    { label: "Yayında", value: String(countBy(records, "status", "live")) },
    { label: "Geliştirilen", value: String(countBy(records, "status", "developing")) },
  ],
};

// ============================================================ Büyüme hedefleri
// Not: Yönetim'deki "Hedef belirleme" ile aynı yapı; ikisinin tek hedef/OKR
// modülünde birleştirilmesi öneriliyor. Bu modül ölçüt + sayısal hedef tuttuğu
// için ayrı kaldı: hedefe ne kadar yaklaşıldığı buradan okunabiliyor.
const GROWTH_STATUS = { not_started: "Başlanmadı", in_progress: "Devam ediyor", reached: "Ulaşıldı", missed: "Kaçırıldı" };

export const growthGoalConfig: ModuleRecordConfig = {
  title: "Büyüme Hedefleri",
  addLabel: "Hedef ekle",
  emptyLabel: "Henüz büyüme hedefi yok.",
  fields: [
    { key: "title", label: "Hedef", type: "text", required: true },
    { key: "metric", label: "Ölçüt", type: "text", placeholder: "Örn. Aylık yeni müşteri, Ciro" },
    { key: "targetValue", label: "Hedef değer", type: "number" },
    { key: "currentValue", label: "Mevcut değer", type: "number" },
    { key: "period", label: "Dönem", type: "text", placeholder: "Örn. 2026 Q4" },
    { key: "status", label: "Durum", type: "select", defaultValue: "not_started", options: opts(GROWTH_STATUS) },
  ],
  summary: (d) => {
    const progress =
      Number(d.targetValue) > 0 ? ` · %${Math.round((Number(d.currentValue) || 0) / Number(d.targetValue) * 100)}` : "";
    return `${d.title ?? ""}${progress}`;
  },
  detail: (d) =>
    joinDetail(
      labelOf(GROWTH_STATUS, d.status),
      d.metric ? `${d.metric}: ${d.currentValue ?? 0} / ${d.targetValue ?? "—"}` : undefined,
      d.period as string
    ),
  computeStats: (records) => [
    { label: "Hedef", value: String(records.length) },
    { label: "Devam eden", value: String(countBy(records, "status", "in_progress")) },
    { label: "Ulaşılan", value: String(countBy(records, "status", "reached")) },
  ],
};
