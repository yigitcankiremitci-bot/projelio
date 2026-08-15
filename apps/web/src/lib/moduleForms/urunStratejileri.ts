import { opts } from "../moduleConfigs/shared";
import type { ModuleFormConfig } from "./types";

// ============================================================ Ürün Stratejileri
//
// A1'in "varlık kapsamlı" örneği: her ÜRÜN için bir strateji dokümanı.
// Ürünün kendisi products tablosunda (fiyat, açıklama, satış yüzü); burada
// duran şey o ürünle ilgili KARARLAR — kime, neden, hangi kanaldan.
//
// Kapsam alanı (productId) kayıt açıldıktan sonra değişmez: strateji ürüne
// aittir, taşınmaz. Ürün silinirse kayıt arşivlenir, silinmez.
//
// Bkz. docs/moduller/20-motor-a1-form.md §6.2

const STATUS = { draft: "Taslak", approved: "Onaylandı", outdated: "Güncellenmeli" };
const CHANNELS = {
  direct: "Doğrudan satış",
  dealer: "Bayi / distribütör",
  marketplace: "Pazaryeri",
  web: "Kendi web sitemiz",
  export: "İhracat",
  retail: "Perakende",
};

export const urunStratejileriConfig: ModuleFormConfig = {
  kind: "form",
  title: "Ürün Stratejisi",
  scope: "entity",
  scopeEntity: "product",
  scopeFieldKey: "productId",

  groups: [
    { key: "konum", label: "Konumlandırma", hint: "Bu ürün kime, neden?" },
    { key: "pazar", label: "Pazar", hint: "Kiminle yarışıyor, nasıl fiyatlanıyor?" },
    { key: "plan", label: "Plan", hint: "Nereden satılacak, başarısı nasıl ölçülecek?" },
    { key: "durum", label: "Durum" },
  ],

  fields: [
    // Not: kapsam alanı (productId) bilerek burada YOK. Ürün seçimi kaydın
    // kimliğidir, bir form alanı değil: panel onu kendi başlığında gösterir ve
    // kayıt açıldıktan sonra değiştirilemez (bkz. ModuleFormConfig.scopeFieldKey).
    {
      key: "positioning",
      label: "Konumlandırma",
      type: "longtext",
      group: "konum",
      requiredForApproval: true,
      placeholder: "Bu ürün kimin hangi sorununu çözüyor?",
    },
    {
      key: "differentiator",
      label: "Farklılaştırıcı",
      type: "longtext",
      group: "konum",
      placeholder: "Rakipten ayıran tek şey",
      help: "Birden fazla yazılıyorsa muhtemelen hiçbiri gerçek farklılaştırıcı değil.",
    },

    {
      key: "targetSegment",
      label: "Hedef segment",
      type: "text",
      group: "pazar",
      requiredForApproval: true,
      help: "Hedef kitle modülü açıksa oradaki personalardan biri seçilebilir.",
    },
    {
      key: "pricingNote",
      label: "Fiyatlandırma yaklaşımı",
      type: "longtext",
      group: "pazar",
      placeholder: "Maliyet artı mı, değer bazlı mı, rakip referanslı mı?",
      help: "Fiyatın kendisi ürün kaydında durur; burada duran gerekçesi.",
    },
    { key: "competitors", label: "Rakipler", type: "tags", group: "pazar" },

    {
      key: "channels",
      label: "Satış kanalları",
      type: "multiselect",
      group: "plan",
      options: opts(CHANNELS),
    },
    {
      key: "roadmapNote",
      label: "Yol haritası",
      type: "longtext",
      group: "plan",
      placeholder: "Önümüzdeki dönemde ürün nasıl gelişecek?",
    },
    {
      key: "successMetric",
      label: "Başarı ölçütü",
      type: "text",
      group: "plan",
      placeholder: "Örn. çeyrekte 40 adet satış",
      help: "Hedef yönetimi modülü açıksa buradan bir hedef kaydı açılabilir.",
    },

    { key: "effectiveFrom", label: "Geçerlilik tarihi", type: "date", group: "durum" },
    { key: "reviewAt", label: "Sonraki gözden geçirme", type: "date", group: "durum" },
    {
      key: "status",
      label: "Durum",
      type: "select",
      group: "durum",
      defaultValue: "draft",
      options: opts(STATUS),
    },
    { key: "notes", label: "İç not", type: "longtext", group: "durum" },
  ],

  // Ürün stratejisi yılda iki kez gözden geçirilir: pazar, kimlik metninden
  // daha hızlı değişiyor.
  reviewIntervalMonths: 6,

  empty: {
    title: "Bu ürün için strateji yaz",
    body:
      "Kime sattığını, rakipten farkını ve başarı ölçütünü bir kez netleştir. " +
      "Pazarlama ve satış modülleri bu cümlelere dayanır.",
    action: "Stratejiyi yaz",
  },
};
