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

const HORIZON = { y1: "1 yıl", y3: "3 yıl", y5: "5 yıl", y10: "10 yıl" }; // dil:anahtar
const STATUS = { draft: "Taslak", approved: "Onaylandı", outdated: "Güncellenmeli" }; // dil:anahtar

export const kimlikVeYonConfig: ModuleFormConfig = {
  kind: "form",
  title: "Kimlik ve Yön", // dil:anahtar
  scope: "organization",

  groups: [
    { key: "yon", label: "Yön", hint: "Nereye gidiyoruz?" }, // dil:anahtar
    { key: "kimlik", label: "Kimlik", hint: "Bugün kimiz, kime ne sunuyoruz?" }, // dil:anahtar
    { key: "durum", label: "Durum", hint: "Geçerlilik ve gözden geçirme" }, // dil:anahtar
  ],

  fields: [
    {
      key: "vision",
      label: "Vizyon",
      type: "longtext",
      group: "yon",
      requiredForApproval: true,
      placeholder: "Gelecekte nerede olmak istiyoruz?",
      help: "Tek paragraf yeter. Ölçülebilir olmak zorunda değil; yön göstermeli.", // dil:anahtar
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
      placeholder: "Bugün kime, hangi değeri sunuyoruz?", // dil:anahtar
      help: "Vizyondan farkı: misyon bugünü anlatır, vizyon geleceği.", // dil:anahtar
    },
    {
      key: "audience",
      label: "Kime hizmet ediyoruz",
      type: "text",
      group: "kimlik",
      placeholder: "Örn. küçük ve orta ölçekli üreticiler", // dil:anahtar
    },
    {
      key: "values",
      label: "Değerler", // dil:anahtar
      type: "tags",
      group: "kimlik",
      help: "3–7 arası tutun. Her şey değerse hiçbir şey değer değildir.", // dil:anahtar
    },
    {
      key: "valueNotes",
      label: "Değerlerin açıklaması", // dil:anahtar
      type: "longtext",
      group: "kimlik",
      placeholder: "Her değerin bu şirkette ne anlama geldiği", // dil:anahtar
      help: "Boş bırakılırsa değerler süs kalır; bir cümle bile yeter.", // dil:anahtar
    },
    {
      key: "positioning",
      label: "Tek cümlelik konumlandırma", // dil:anahtar
      type: "text",
      group: "kimlik",
      placeholder: "X için Y yapan Z'yiz.", // dil:anahtar
      help: "Slogan değil, iç kullanım. Hedef kitle ve ürün stratejisi buradan başlar.", // dil:anahtar
    },

    { key: "effectiveFrom", label: "Geçerlilik tarihi", type: "date", group: "durum" }, // dil:anahtar
    {
      key: "reviewAt",
      label: "Sonraki gözden geçirme", // dil:anahtar
      type: "date",
      group: "durum",
      help: "Boş bırakılırsa onay tarihinden 12 ay sonrası önerilir.", // dil:anahtar
    },
    {
      key: "status",
      label: "Durum",
      type: "select",
      group: "durum",
      defaultValue: "draft",
      options: opts(STATUS),
    },
    { key: "notes", label: "İç not", type: "longtext", group: "durum" }, // dil:anahtar
  ],

  reviewIntervalMonths: 12,

  templates: [
    {
      key: "uretim",
      label: "Üretim / imalat", // dil:anahtar
      data: {
        vision: "Bölgemizde kalitesiyle ilk akla gelen üretici olmak.", // dil:atla
        mission: "Küçük ve orta ölçekli işletmelere, zamanında teslim edilen ve tekrar sipariş ettiren ürünler üretiyoruz.", // dil:atla
        audience: "Küçük ve orta ölçekli işletmeler", // dil:atla
        // tags: multiselect ile aynı biçim — virgülle ayrılmış tek metin.
        values: "Zamanında teslim,Ölçülebilir kalite,Sözünü tutmak", // dil:atla
        horizon: "y5",
      },
    },
    {
      key: "hizmet",
      label: "Hizmet / ajans",
      data: {
        vision: "Çalıştığımız her müşterinin kendi alanında öne çıktığı bir portföy kurmak.", // dil:atla
        mission: "İşini büyütmek isteyen markalara, sonucu ölçülebilir hizmet veriyoruz.", // dil:atla
        audience: "Büyüme aşamasındaki markalar", // dil:atla
        values: "Şeffaflık,Ölçülebilir sonuç,Hız", // dil:atla
        horizon: "y3",
      },
    },
  ],

  empty: {
    title: "Şirketinin yönünü bir kez yaz", // dil:anahtar
    body:
      "Hedefler, işe alım ve müşteri iletişimi aynı cümleye dayansın. " + // dil:anahtar
      "Sonra istediğin zaman güncellersin; eski hali sürüm olarak durur.", // dil:anahtar
    action: "Kimliği yaz", // dil:anahtar
  },
};
