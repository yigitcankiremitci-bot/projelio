import { fmtMoney, sumByCurrency } from "../moduleConfigs";
import { NA, countRecords, groupBy, percent, recordsOf, recordsOfAll, sumMoney, type PanelConfig } from "./types";

// YÖNETİM, PAZARLAMA ve HOLDİNG panelleri.

const LEDGER = "fm_gelir_gider";
const SALES = "spd_satis_planlama_b2b_b2c";
const ADS = "pd_reklam";
const TICKETS = "mid_teknik_destek";
const COMPLAINTS = "mid_sikayet_oneri";
const GOALS = "yonetim_hedef_belirleme";
const SOCIAL = "pd_sosyal_medya";
const EMAIL = "pd_email";
const SEO = "pd_dijital_pazarlama_seo_sem";

const CLOSED_STAGES = ["won", "lost"];

// ============================================================ Yönetim Analizi
export const managementAnalysisPanel: PanelConfig = {
  title: "Analiz",
  purpose: "Şirketin dönemsel durumu: para, satış, müşteri ve açık işler tek ekranda.", // dil:anahtar
  sources: [LEDGER, SALES, TICKETS, GOALS],
  metrics: [
    {
      label: "Net",
      sources: [LEDGER],
      compute: (ctx) => {
        const totals = new Map<string, number>();
        for (const r of recordsOf(ctx, LEDGER)) {
          const currency = (r.data.currency as string) || "TRY";
          const amount = Number(r.data.amount) || 0;
          totals.set(currency, (totals.get(currency) ?? 0) + (r.data.type === "expense" ? -amount : amount));
        }
        if (totals.size === 0) return fmtMoney(0, "TRY");
        return Array.from(totals.entries()).map(([c, v]) => fmtMoney(v, c)).join(" + ");
      },
    },
    {
      label: "Açık fırsat", // dil:anahtar
      sources: [SALES],
      compute: (ctx) => String(countRecords(ctx, [SALES], (d) => !CLOSED_STAGES.includes(d.stage as string))),
      hint: (ctx) => {
        const acik = recordsOf(ctx, SALES).filter((r) => !CLOSED_STAGES.includes(r.data.stage as string));
        if (acik.length === 0) return undefined;
        const totals = sumByCurrency(acik);
        return Array.from(totals.entries()).map(([c, v]) => fmtMoney(v, c)).join(" + ") + " değerinde"; // dil:atla
      },
    },
    {
      label: "Müşteri", // dil:anahtar
      sources: [],
      // party tablosundan gelir; modül kaydı değil, ortak varlık.
      compute: (ctx) => String(ctx.customerCount),
      hint: (ctx) => (ctx.partyCount > ctx.customerCount ? `${ctx.partyCount} kayıttan` : undefined), // dil:atla
    },
    {
      label: "Açık talep", // dil:anahtar
      sources: [TICKETS, COMPLAINTS],
      compute: (ctx) =>
        String(
          countRecords(ctx, [TICKETS, COMPLAINTS], (d) => d.status !== "resolved" && d.status !== "closed")
        ),
    },
  ],
  breakdowns: [
    {
      title: "Satış hunisi", // dil:anahtar
      sources: [SALES],
      emptyLabel: "Bu dönemde satış fırsatı yok.", // dil:anahtar
      compute: (ctx) => {
        const STAGE_LABELS: Record<string, string> = {
          lead: "Potansiyel",
          contacted: "İletişim kuruldu", // dil:anahtar
          proposal: "Teklif verildi",
          negotiation: "Görüşme", // dil:anahtar
          won: "Kazanıldı", // dil:anahtar
          lost: "Kaybedildi",
        };
        return groupBy(recordsOf(ctx, SALES), "stage", (v) => STAGE_LABELS[v] ?? v);
      },
    },
    {
      title: "Hedef durumu",
      sources: [GOALS],
      emptyLabel: "Henüz hedef tanımlanmamış.", // dil:anahtar
      compute: (ctx) => {
        const LABELS: Record<string, string> = {
          not_started: "Başlanmadı", // dil:anahtar
          in_progress: "Devam ediyor",
          done: "Tamamlandı", // dil:anahtar
        };
        return groupBy(recordsOf(ctx, GOALS), "status", (v) => LABELS[v] ?? v);
      },
    },
  ],
};

// ============================================================ Raporlama
export const reportingPanel: PanelConfig = {
  title: "Raporlama",
  purpose: "Dönem özetini tek tabloda toplar ve dışa aktarır.", // dil:anahtar
  sources: [LEDGER, SALES, TICKETS, "hud_sozlesme", "oud_tedarik"],
  metrics: [
    { label: "Gelir kaydı", sources: [LEDGER], compute: (ctx) => String(countRecords(ctx, [LEDGER], (d) => d.type === "income")) }, // dil:anahtar
    { label: "Gider kaydı", sources: [LEDGER], compute: (ctx) => String(countRecords(ctx, [LEDGER], (d) => d.type === "expense")) }, // dil:anahtar
    { label: "Satış fırsatı", sources: [SALES], compute: (ctx) => String(countRecords(ctx, [SALES])) }, // dil:anahtar
    { label: "Toplam kayıt", sources: [], compute: (ctx) => String(recordsOfAll(ctx, Array.from(ctx.records.keys())).length) }, // dil:anahtar
  ],
  breakdowns: [
    {
      title: "Modül bazında kayıt sayısı", // dil:anahtar
      sources: [],
      emptyLabel: "Bu dönemde hiç kayıt yok.", // dil:anahtar
      compute: (ctx) =>
        Array.from(ctx.records.entries())
          .filter(([, rows]) => rows.length > 0)
          .map(([key, rows]) => ({ label: key, value: rows.length }))
          .sort((a, b) => b.value - a.value),
    },
  ],
};

// ============================================================ Müşteri Kazanım Optimizasyonu
export const acquisitionPanel: PanelConfig = {
  title: "Müşteri Kazanım", // dil:anahtar
  purpose: "Bir müşteri kazanmak ne kadara mal oluyor ve hangi kanal işe yarıyor.", // dil:anahtar
  sources: [ADS, SALES],
  metrics: [
    {
      label: "Reklam harcaması", // dil:anahtar
      sources: [ADS],
      compute: (ctx) => sumMoney(ctx, [ADS], "amount", (d) => d.status !== "draft"),
    },
    {
      label: "Kazanılan satış", // dil:anahtar
      sources: [SALES],
      compute: (ctx) => String(countRecords(ctx, [SALES], (d) => d.stage === "won")),
    },
    {
      label: "Kazanım maliyeti", // dil:anahtar
      sources: [ADS, SALES],
      compute: (ctx) => {
        // Yalnızca TRY: kur dönüşümü olmadan bölme yapmak yanıltıcı olur.
        const harcama = sumByCurrency(recordsOf(ctx, ADS).filter((r) => r.data.status !== "draft")).get("TRY");
        const kazanilan = countRecords(ctx, [SALES], (d) => d.stage === "won");
        if (!harcama || !kazanilan) return NA;
        return fmtMoney(harcama / kazanilan, "TRY");
      },
      hint: () => "TRY reklam bütçesi ÷ kazanılan fırsat", // dil:anahtar
    },
    {
      label: "Dönüşüm", // dil:anahtar
      sources: [SALES],
      compute: (ctx) => {
        const kapanan = countRecords(ctx, [SALES], (d) => CLOSED_STAGES.includes(d.stage as string));
        const kazanilan = countRecords(ctx, [SALES], (d) => d.stage === "won");
        return percent(kazanilan, kapanan);
      },
      hint: () => "Kazanılan ÷ kapanan fırsat", // dil:anahtar
    },
  ],
  breakdowns: [
    {
      title: "Reklam bütçesi (platform)", // dil:anahtar
      sources: [ADS],
      emptyLabel: "Bu dönemde reklam kampanyası yok.", // dil:anahtar
      compute: (ctx) => {
        const LABELS: Record<string, string> = {
          google: "Google Ads",
          meta: "Meta",
          linkedin: "LinkedIn",
          tiktok: "TikTok",
          x: "X / Twitter",
          local: "Yerel / basılı", // dil:anahtar
          other: "Diğer", // dil:anahtar
        };
        return groupBy(recordsOf(ctx, ADS), "platform", (v) => LABELS[v] ?? v, { sumField: "amount" });
      },
    },
  ],
};

// ============================================================ Dijital Pazarlama
export const digitalMarketingPanel: PanelConfig = {
  title: "Dijital Pazarlama",
  purpose: "Tüm dijital kanalların tek ekranda performansı.", // dil:anahtar
  sources: [SOCIAL, EMAIL, ADS, SEO],
  metrics: [
    {
      label: "Yayınlanan içerik", // dil:anahtar
      sources: [SOCIAL],
      compute: (ctx) => String(countRecords(ctx, [SOCIAL], (d) => d.status === "published")),
    },
    {
      label: "Gönderilen kampanya", // dil:anahtar
      sources: [EMAIL],
      compute: (ctx) => String(countRecords(ctx, [EMAIL], (d) => d.status === "sent")),
      hint: (ctx) => {
        const gonderilen = recordsOf(ctx, EMAIL).filter((r) => r.data.status === "sent");
        const oranli = gonderilen.filter((r) => Number.isFinite(Number(r.data.openRate)));
        if (oranli.length === 0) return undefined;
        const ort = Math.round(oranli.reduce((s, r) => s + Number(r.data.openRate), 0) / oranli.length);
        return `ortalama %${ort} açılma`; // dil:atla
      },
    },
    {
      label: "Yayındaki reklam", // dil:anahtar
      sources: [ADS],
      compute: (ctx) => String(countRecords(ctx, [ADS], (d) => d.status === "live")),
    },
    {
      label: "İlk 10'daki kelime", // dil:anahtar
      sources: [SEO],
      compute: (ctx) =>
        String(
          countRecords(ctx, [SEO], (d) => {
            const rank = Number(d.currentRank);
            return Number.isFinite(rank) && rank > 0 && rank <= 10;
          })
        ),
      hint: (ctx) => {
        const toplam = countRecords(ctx, [SEO]);
        return toplam ? `${toplam} kelime takipte` : undefined;
      },
    },
  ],
  breakdowns: [
    {
      title: "Sosyal medya (platform)",
      sources: [SOCIAL],
      emptyLabel: "Bu dönemde planlanmış gönderi yok.", // dil:anahtar
      compute: (ctx) => {
        const LABELS: Record<string, string> = {
          instagram: "Instagram",
          facebook: "Facebook",
          twitter: "X / Twitter",
          linkedin: "LinkedIn",
          tiktok: "TikTok",
          youtube: "YouTube",
          other: "Diğer", // dil:anahtar
        };
        return groupBy(recordsOf(ctx, SOCIAL), "platform", (v) => LABELS[v] ?? v);
      },
    },
  ],
};

// ============================================================ Holding panelleri
// Bugün yalnızca içinde bulunulan organizasyonun verisini gösterirler; gerçek
// konsolidasyon (gruba bağlı tüm şirketler) organizasyonlar arası veri erişimi
// gerektiriyor ve ayrı bir iş.
const HOLDING_NOTE =
  "Holding geneli konsolidasyon henüz yok: şu an yalnızca bu organizasyonun verisi gösteriliyor."; // dil:anahtar

export const holdingAnalysisPanel: PanelConfig = {
  ...managementAnalysisPanel,
  title: "Analiz (Holding)",
  purpose: "Gruba bağlı şirketlerin karşılaştırmalı durumu.", // dil:anahtar
  scopeNote: HOLDING_NOTE,
};

export const holdingReportingPanel: PanelConfig = {
  ...reportingPanel,
  title: "Raporlama (Holding)",
  purpose: "Grup geneli konsolide dönem raporu.", // dil:anahtar
  scopeNote: HOLDING_NOTE,
};
