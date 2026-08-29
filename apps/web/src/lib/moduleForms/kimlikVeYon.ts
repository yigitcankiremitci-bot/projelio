import { opts } from "../moduleConfigs";
import type { ModuleFormConfig } from "./types";

// ============================================================ Kimlik ve Yön
//
// Vizyon ve Misyon modüllerinin birleşimi. Ayrı tutulduklarında iki sorun
// vardı: (1) ikisi de tek cümlelik metinler olduğu halde iki ayrı modül,
// iki ayrı ekran ve iki ayrı "boş kutu" üretiyordu; (2) vizyon ile misyon
// birbirine referansla yazılır — ayrı ekranlarda yazılınca birbirini tutmuyor.
//
// Bkz. docs/moduller/12-modul-kimlik_ve_yon.md

const HORIZON = { y1: "1 yıl", y3: "3 yıl", y5: "5 yıl", y10: "10 yıl" };
const STATUS = { draft: "Taslak", approved: "Onaylandı", outdated: "Güncellenmeli" };

export const kimlikVeYonConfig: ModuleFormConfig = {
  kind: "form",
  title: "Kimlik ve Yön",
  scope: "organization",

  groups: [
    { key: "yon", label: "Yön", hint: "Nereye gidiyoruz?" },
    { key: "kimlik", label: "Kimlik", hint: "Bugün kimiz, kime ne sunuyoruz?" },
    { key: "durum", label: "Durum", hint: "Geçerlilik ve gözden geçirme" },
  ],

  fields: [
    {
      key: "vision",
      label: "Vizyon",
      type: "longtext",
      group: "yon",
      requiredForApproval: true,
      placeholder: "Gelecekte nerede olmak istiyoruz?",
      help: "Tek paragraf yeter. Ölçülebilir olmak zorunda değil; yön göstermeli.",
    },
    {
      key: "horizon",
      label: "Zaman ufku",
      type: "select",
      group: "yon",
      defaultValue: "y5",
      options: opts(HORIZON),
    },

    {
      key: "mission",
      label: "Misyon",
      type: "longtext",
      group: "kimlik",
      requiredForApproval: true,
      placeholder: "Bugün kime, hangi değeri sunuyoruz?",
      help: "Vizyondan farkı: misyon bugünü anlatır, vizyon geleceği.",
    },
    {
      key: "audience",
      label: "Kime hizmet ediyoruz",
      type: "text",
      group: "kimlik",
      placeholder: "Örn. küçük ve orta ölçekli üreticiler",
    },
    {
      key: "values",
      label: "Değerler",
      type: "tags",
      group: "kimlik",
      help: "3–7 arası tutun. Her şey değerse hiçbir şey değer değildir.",
    },
    {
      key: "valueNotes",
      label: "Değerlerin açıklaması",
      type: "longtext",
      group: "kimlik",
      placeholder: "Her değerin bu şirkette ne anlama geldiği",
      help: "Boş bırakılırsa değerler süs kalır; bir cümle bile yeter.",
    },
    {
      key: "positioning",
      label: "Tek cümlelik konumlandırma",
      type: "text",
      group: "kimlik",
      placeholder: "X için Y yapan Z'yiz.",
      help: "Slogan değil, iç kullanım. Hedef kitle ve ürün stratejisi buradan başlar.",
    },

    { key: "effectiveFrom", label: "Geçerlilik tarihi", type: "date", group: "durum" },
    {
      key: "reviewAt",
      label: "Sonraki gözden geçirme",
      type: "date",
      group: "durum",
      help: "Boş bırakılırsa onay tarihinden 12 ay sonrası önerilir.",
    },
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

  reviewIntervalMonths: 12,

  templates: [
    {
      key: "uretim",
      label: "Üretim / imalat",
      data: {
        vision: "Bölgemizde kalitesiyle ilk akla gelen üretici olmak.",
        mission: "Küçük ve orta ölçekli işletmelere, zamanında teslim edilen ve tekrar sipariş ettiren ürünler üretiyoruz.",
        audience: "Küçük ve orta ölçekli işletmeler",
        // tags: multiselect ile aynı biçim — virgülle ayrılmış tek metin.
        values: "Zamanında teslim,Ölçülebilir kalite,Sözünü tutmak",
        horizon: "y5",
      },
    },
    {
      key: "hizmet",
      label: "Hizmet / ajans",
      data: {
        vision: "Çalıştığımız her müşterinin kendi alanında öne çıktığı bir portföy kurmak.",
        mission: "İşini büyütmek isteyen markalara, sonucu ölçülebilir hizmet veriyoruz.",
        audience: "Büyüme aşamasındaki markalar",
        values: "Şeffaflık,Ölçülebilir sonuç,Hız",
        horizon: "y3",
      },
    },
  ],

  empty: {
    title: "Şirketinin yönünü bir kez yaz",
    body:
      "Hedefler, işe alım ve müşteri iletişimi aynı cümleye dayansın. " +
      "Sonra istediğin zaman güncellersin; eski hali sürüm olarak durur.",
    action: "Kimliği yaz",
  },
};
