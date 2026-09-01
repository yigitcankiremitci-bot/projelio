import { opts } from "../moduleConfigs";
import type { ModuleFormConfig } from "./types";

// ============================================================ Marka Kimliği
//
// Neden ayrı bir modül:
//   - kimlik_ve_yon (Yönetim) şirketin NEDEN var olduğunu yazar — vizyon,
//     misyon, iç kullanım için tek cümlelik konumlandırma. İçeriye bakar.
//   - Burası aynı şirketin DIŞARIYA nasıl göründüğünü ve konuştuğunu yazar:
//     vaat, ses, renk, logo kuralı. Konumlandırma cümlesi bilerek burada
//     tekrarlanmıyor; ikisi ayrı yerde yazılırsa er geç birbirini tutmaz.
//   - hud_marka_patent_telif ise tescil takibidir (Hukuk); marka kimliğiyle
//     ilgisi yalnızca adın ortak olmasıdır.
//
// A1 olmasının sebebi: bir şirketin bir marka kimliği vardır. Liste değil tek
// kayıt, geçmişi sürüm olarak durur — "logo kuralı ne zaman değişti" sorusunun
// cevabı kaybolmasın.
//
// Bkz. docs/moduller/20-motor-a1-form.md §6.3

const TONE = {
  resmi: "Resmî",
  profesyonel: "Profesyonel ama sıcak",
  samimi: "Samimi / arkadaşça",
  esprili: "Esprili",
  ilham: "İlham verici",
  teknik: "Teknik / doğrudan",
};
const STATUS = { draft: "Taslak", approved: "Onaylandı", outdated: "Güncellenmeli" };

export const markaKimligiConfig: ModuleFormConfig = {
  kind: "form",
  title: "Marka Kimliği",
  scope: "organization",

  groups: [
    { key: "oz", label: "Öz", hint: "Marka neyi vaat ediyor?" },
    { key: "ses", label: "Ses ve dil", hint: "Nasıl konuşuyor?" },
    { key: "gorunum", label: "Görünüm", hint: "Nasıl görünüyor?" },
    { key: "durum", label: "Durum", hint: "Geçerlilik ve gözden geçirme" },
  ],

  fields: [
    {
      key: "brandName",
      label: "Marka adı",
      type: "text",
      group: "oz",
      help: "Organizasyon adından farklıysa yaz; müşterinin gördüğü ad budur.",
    },
    {
      key: "promise",
      label: "Marka vaadi",
      type: "longtext",
      group: "oz",
      requiredForApproval: true,
      placeholder: "Bu markayı seçen kişi ne elde ediyor?",
      help: "Ürünü değil, sonucu anlat. Konumlandırma cümlesi Kimlik ve Yön'de durur.",
    },
    {
      key: "tagline",
      label: "Slogan",
      type: "text",
      group: "oz",
      help: "Zorunlu değil. Vaadi tekrar eden bir slogan, hiç sloganı olmamasından iyi değildir.",
    },
    {
      key: "personality",
      label: "Marka kişiliği",
      type: "tags",
      group: "oz",
      help: "3–5 sıfat. \"Kaliteli\", \"güvenilir\" herkesin yazdığı şeyler; ayırt edeni yaz.",
    },

    {
      key: "tone",
      label: "Ton",
      type: "select",
      group: "ses",
      requiredForApproval: true,
      options: opts(TONE),
      help: "Sosyal medya hesaplarındaki \"marka sesi\" alanı buradan beslenir.",
    },
    {
      key: "voiceRules",
      label: "Dil kuralları",
      type: "longtext",
      group: "ses",
      placeholder: "Sen mi siz mi, emoji var mı, teknik terim ne kadar?",
      help: "Metni kim yazarsa yazsın aynı çıksın diye. Birkaç madde yeter.",
    },
    {
      key: "avoid",
      label: "Kaçınılan sözler",
      type: "tags",
      group: "ses",
      help: "Abartı vaatler, rakip taklidi kalıplar, artık kullanılmayan eski terimler.",
    },
    {
      key: "boilerplate",
      label: "Kısa tanıtım metni",
      type: "longtext",
      group: "ses",
      placeholder: "Teklif, e-posta imzası ve sosyal profil biyografisinde kullanılacak sabit paragraf",
    },

    {
      key: "primaryColor",
      label: "Ana renk",
      type: "text",
      group: "gorunum",
      placeholder: "#3E4858",
      help: "HEX kodu yaz. \"Lacivert\" baskıda ve ekranda aynı çıkmaz, kod çıkar.",
    },
    { key: "secondaryColors", label: "Yardımcı renkler", type: "tags", group: "gorunum" },
    {
      key: "typography",
      label: "Tipografi",
      type: "text",
      group: "gorunum",
      placeholder: "Başlık ve metin yazı tipi",
    },
    {
      key: "logoUsage",
      label: "Logo kullanımı",
      type: "longtext",
      group: "gorunum",
      placeholder: "En küçük boyut, çevresindeki boşluk, yapılmayacaklar",
    },
    {
      key: "imagery",
      label: "Görsel dil",
      type: "longtext",
      group: "gorunum",
      placeholder: "Fotoğraf mı illüstrasyon mu, hangi ton, insan var mı?",
    },
    {
      key: "guidelineUrl",
      label: "Marka kılavuzu bağlantısı",
      type: "text",
      group: "gorunum",
      help: "Kılavuz dosya olarak yüklendiyse Dosyalar'daki bağlantısını yapıştır.",
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
      key: "kurumsal",
      label: "Kurumsal / B2B",
      data: {
        promise: "Müşterimiz işini bize devrettiğinde takip etmek zorunda kalmaz; süreç zamanında ve raporlanabilir ilerler.",
        personality: "Sözünü tutan,Ölçülebilir,Sakin",
        tone: "profesyonel",
        voiceRules: "Siz diliyle yazılır. Emoji kullanılmaz. Teknik terim, karşılığı bir kez açıklandıktan sonra serbesttir.",
        avoid: "Devrim niteliğinde,Sektör lideri,Anahtar teslim mutluluk",
      },
    },
    {
      key: "perakende",
      label: "Perakende / tüketici",
      data: {
        promise: "Aradığını ilk denemede bulur, beğenmezse sorunsuz iade eder.",
        personality: "Sıcak,Anlaşılır,Hızlı",
        tone: "samimi",
        voiceRules: "Sen diliyle yazılır. Kısa cümle. Emoji az ve yerinde.",
        avoid: "Kampanya kaçmasın,Son 3 ürün,Efsane fırsat",
      },
    },
  ],

  empty: {
    title: "Markanın nasıl göründüğünü ve konuştuğunu bir kez yaz",
    body:
      "Teklif, sosyal medya ve reklam metinlerini kim yazarsa yazsın aynı yerden beslensin. " +
      "Sonra güncellersin; eski hali sürüm olarak durur.",
    action: "Marka kimliğini yaz",
  },
};
