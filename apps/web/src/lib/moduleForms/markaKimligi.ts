import { opts } from "../moduleConfigs";
import type { ModuleFormConfig } from "./types";

// ============================================================ Marka Kimliği
//
// Neden ayrı bir modül:
//   - kimlik_ve_yon (Yönetim) şirketin NEDEN var olduğunu yazar — vizyon,
//     misyon, iç kullanım için tek cümlelik konumlandırma. İçeriye bakar.
//   - Burası aynı şirketin DIŞARIYA nasıl göründüğünü, konuştuğunu ve neye
//     benzediğini yazar. Vizyon/misyon burada tekrarlanmıyor; iki yerde
//     yazılan cümle er geç birbirini tutmaz.
//   - hud_marka_patent_telif tescil TAKİBİDİR (Hukuk). Burada yalnızca son
//     durum duruyor, süreç orada.
//   - pd_hedef_kitle persona detayını, pd_rakip_sektor_analizi rakip kartını
//     tutar. Buradaki "birincil hedef" ve "alternatifler" alanları o
//     kayıtların özeti değil, marka kararının kendisidir: tek hedef, tek
//     cümle. Uzunu ilgili modülde.
//
// Alan çokluğu bilinçli: marka kurmak tek soruyla bitmiyor, ama A1 okuma
// görünümü BOŞ alanları gizliyor (ModuleFormPanel). Yani doldurulmamış alan
// kimseye görünmez; doküman kullanıcının doldurduğu kadar uzundur. Şablonlar
// da bu yüzden var — boş 37 alanla karşılaşan kimse başlamıyor.
//
// Bkz. docs/moduller/20-motor-a1-form.md §6.3

// 12 arketip: markaya bir kişilik ekseni verir. Ekipteki herkesin aklındaki
// sesi tek noktada buluşturmanın en ucuz yolu — sıfat listesinden daha
// bağlayıcı, çünkü seçilmeyen 11 tanesi de bir karardır.
const ARCHETYPE = {
  masum: "Masum — sadelik, iyimserlik",
  bilge: "Bilge — bilgi, doğruluk",
  kasif: "Kâşif — özgürlük, keşif",
  kahraman: "Kahraman — cesaret, başarma",
  asi: "Asi — kuralı bozma",
  sihirbaz: "Sihirbaz — dönüşüm",
  sirandan: "Sıradan insan — ait olma, samimiyet",
  asik: "Âşık — yakınlık, güzellik",
  soytari: "Soytarı — neşe, hafiflik",
  bakici: "Bakıcı — koruma, şefkat",
  yaratici: "Yaratıcı — hayal gücü, ifade",
  yonetici: "Yönetici — düzen, otorite",
};

// Ton kaydırıcıları. Tek bir "ton" seçimi metni yazana yetmiyor: "profesyonel"
// diyen iki kişi iki farklı metin yazıyor. Üç eksende beşer kademe, yazarken
// bakılabilecek somut bir ayar veriyor.
const FORMALITY = {
  f2: "Tamamen resmî",
  f1: "Resmîye yakın",
  orta: "Ortada",
  s1: "Samimiye yakın",
  s2: "Tamamen samimi",
};
const HUMOR = {
  c2: "Hep ciddi",
  c1: "Ciddiye yakın",
  orta: "Ortada",
  e1: "Esprili sayılır",
  e2: "Belirgin esprili",
};
const BOLDNESS = {
  k2: "Klasik, temkinli",
  k1: "Klasiğe yakın",
  orta: "Ortada",
  c1: "Cesura yakın",
  c2: "Belirgin cesur",
};

const TOUCHPOINT = {
  web: "Web sitesi",
  sosyal: "Sosyal medya",
  eposta: "E-posta",
  teklif: "Teklif ve sunum",
  fatura: "Fatura ve sözleşme",
  ambalaj: "Ambalaj / etiket",
  magaza: "Mağaza / ofis",
  arac: "Araç giydirme",
  reklam: "Reklam",
  etkinlik: "Fuar / etkinlik",
  uygulama: "Mobil uygulama",
  basili: "Kartvizit ve basılı",
};

const TRADEMARK = {
  yok: "Tescil yok",
  arastirma: "Araştırılıyor",
  basvuru: "Başvuruldu",
  tescilli: "Tescilli",
  yenileme: "Yenilenmeli",
};

const STATUS = { draft: "Taslak", approved: "Onaylandı", outdated: "Güncellenmeli" };

export const markaKimligiConfig: ModuleFormConfig = {
  kind: "form",
  title: "Marka Kimliği",
  scope: "organization",

  groups: [
    { key: "konum", label: "Konum", hint: "Kimin gözünde, neyin alternatifiyiz?" },
    { key: "oz", label: "Öz", hint: "Ne vaat ediyoruz, neye dayanarak?" },
    { key: "kisilik", label: "Kişilik", hint: "Marka bir insan olsaydı nasıl biri olurdu?" },
    { key: "ses", label: "Ses ve dil", hint: "Nasıl konuşuyor?" },
    { key: "isim", label: "Ad ve yazım", hint: "Adımız nasıl yazılır, yenileri nasıl adlandırılır?" },
    { key: "gorunum", label: "Görünüm", hint: "Renk, yazı, logo, görsel dil" },
    { key: "temas", label: "Temas noktaları", hint: "Marka fiilen nerelerde görünüyor?" },
    { key: "koruma", label: "Koruma", hint: "Ad, alan adı ve hesaplar elimizde mi?" },
    { key: "durum", label: "Durum", hint: "Sorumlu, geçerlilik, gözden geçirme" },
  ],

  fields: [
    // ---------------------------------------------------------- Konum
    {
      key: "brandName",
      label: "Marka adı",
      type: "text",
      group: "konum",
      help: "Organizasyon adından farklıysa yaz; müşterinin gördüğü ad budur.",
    },
    {
      key: "category",
      label: "Kategori",
      type: "text",
      group: "konum",
      requiredForApproval: true,
      placeholder: "Neyin alternatifi olarak anılıyoruz?",
      help: "Müşteri seni neyin yerine koyuyorsa kategorin odur — sen ne dersen de.",
    },
    {
      key: "primaryAudience",
      label: "Birincil hedef",
      type: "text",
      group: "konum",
      placeholder: "Örn. büyümek isteyen küçük üreticiler",
      help: "Tek kitle yaz. Persona detayı Hedef Kitle modülünde durur.",
    },
    {
      key: "notFor",
      label: "Kime göre değil",
      type: "text",
      group: "konum",
      help: "Herkese hitap eden marka kimseye hitap etmez. Bunu yazmak vaadi keskinleştirir.",
    },
    {
      key: "alternatives",
      label: "Bizim yerimize ne seçilir",
      type: "tags",
      group: "konum",
      help: "Rakip kartları Rakip Analizi'nde. Buraya müşterinin gözündeki gerçek alternatifleri yaz — \"kendi yapmak\", \"hiçbir şey yapmamak\" dahil.",
    },

    // ---------------------------------------------------------- Öz
    {
      key: "promise",
      label: "Marka vaadi",
      type: "longtext",
      group: "oz",
      requiredForApproval: true,
      placeholder: "Bu markayı seçen kişi ne elde ediyor?",
      help: "Ürünü değil sonucu anlat. Şirketin niye var olduğu Kimlik ve Yön'de duruyor.",
    },
    {
      key: "differentiator",
      label: "Ayrışma",
      type: "longtext",
      group: "oz",
      placeholder: "Bizi seçmenin, diğerini seçmemekten farkı",
      help: "Aynı cümleyi rakip de kurabiliyorsa ayrışma değil, kategori girişidir.",
    },
    {
      key: "reasonsToBelieve",
      label: "Kanıtlar",
      type: "tags",
      group: "oz",
      help: "Vaadi ayakta tutan somut şeyler: teslim süresi, garanti, sertifika, referans sayısı. Kanıtsız vaat slogandır.",
    },

    // ---------------------------------------------------------- Kişilik
    {
      key: "archetype",
      label: "Arketip",
      type: "select",
      group: "kisilik",
      options: opts(ARCHETYPE),
      help: "Bir tane seç. İki arketip seçmek, kararı ertelemenin kibar hâli.",
    },
    {
      key: "personality",
      label: "Kişilik sıfatları",
      type: "tags",
      group: "kisilik",
      help: "3–5 sıfat. \"Kaliteli\" ve \"güvenilir\" herkesin yazdığı şey; ayırt edeni yaz.",
    },
    {
      key: "humanReference",
      label: "Marka bir insan olsaydı",
      type: "text",
      group: "kisilik",
      placeholder: "Tanıdığın bir tip, bir karakter",
      help: "Ölçülemez ama işe yarar: metni yazan kişi kimin ağzından yazdığını bilir.",
    },

    // ---------------------------------------------------------- Ses ve dil
    {
      key: "toneFormality",
      label: "Resmî ↔ Samimi",
      type: "select",
      group: "ses",
      requiredForApproval: true,
      options: opts(FORMALITY),
      help: "Üç kaydırıcı, metni yazarken bakılacak ayardır. \"Profesyonel\" diyen iki kişi iki farklı metin yazıyor.",
    },
    { key: "toneHumor", label: "Ciddi ↔ Esprili", type: "select", group: "ses", options: opts(HUMOR) },
    { key: "toneBoldness", label: "Klasik ↔ Cesur", type: "select", group: "ses", options: opts(BOLDNESS) },
    {
      key: "voiceRules",
      label: "Dil kuralları",
      type: "longtext",
      group: "ses",
      placeholder: "Sen mi siz mi, emoji var mı, teknik terim ne kadar, cümleler ne uzunlukta?",
      help: "Birkaç madde yeter. Amaç, metni kim yazarsa yazsın aynı çıkması.",
    },
    {
      key: "sayThis",
      label: "Kullandığımız sözler",
      type: "tags",
      group: "ses",
      help: "Markanın kendi sözlüğü: ürüne, müşteriye, ekibe ne diyoruz.",
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
      placeholder: "Teklifin sonunda, e-posta imzasında, sosyal profil biyografisinde kullanılacak sabit paragraf",
      help: "Bir kez yazılır, her yerde aynısı yapıştırılır. Yoksa herkes kendi tanıtımını uydurur.",
    },

    // ---------------------------------------------------------- Ad ve yazım
    {
      key: "tagline",
      label: "Slogan",
      type: "text",
      group: "isim",
      help: "Zorunlu değil. Vaadi tekrar eden slogan, hiç sloganı olmamasından iyi değildir.",
    },
    {
      key: "spelling",
      label: "Yazım kuralı",
      type: "text",
      group: "isim",
      placeholder: "Örn. Projelio (büyük P, kalanı küçük); PROJELIO yazılmaz",
      help: "Adın yanlış yazıldığı her yer, markanın biraz daha silikleşmesi demek.",
    },
    {
      key: "namingRule",
      label: "Yeni ürün adlandırma kuralı",
      type: "longtext",
      group: "isim",
      placeholder: "Yeni ürün/hizmet adları hangi kalıba uyacak?",
      help: "Kural yoksa her yeni ürün kendi markasını kurar; üçüncüden sonra kimin kim olduğu belirsizleşir.",
    },

    // ---------------------------------------------------------- Görünüm
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
      key: "colorRule",
      label: "Renk kullanım oranı",
      type: "text",
      group: "gorunum",
      placeholder: "Örn. %70 nötr, %20 ana renk, %10 vurgu",
      help: "Oran yazılmazsa ana renk her yeri kaplar ve vurgu diye bir şey kalmaz.",
    },
    {
      key: "typography",
      label: "Tipografi",
      type: "text",
      group: "gorunum",
      placeholder: "Başlık yazı tipi / metin yazı tipi",
    },
    {
      key: "logoUsage",
      label: "Logo kullanımı",
      type: "longtext",
      group: "gorunum",
      placeholder: "En küçük boyut, çevresindeki boş alan, koyu/açık zemin sürümleri",
    },
    {
      key: "logoDonts",
      label: "Logoda yapılmayacaklar",
      type: "tags",
      group: "gorunum",
      help: "Örn. germe, gölge ekleme, rengini değiştirme, desenli zemine koyma.",
    },
    {
      key: "imagery",
      label: "Görsel dil",
      type: "longtext",
      group: "gorunum",
      placeholder: "Fotoğraf mı illüstrasyon mu, insan var mı, hangi ışık ve ton?",
    },
    {
      key: "guidelineUrl",
      label: "Kılavuz ve dosyalar bağlantısı",
      type: "text",
      group: "gorunum",
      help: "Logo dosyaları ve kılavuz nerede duruyorsa oranın bağlantısı — Dosyalar modülünden alabilirsin.",
    },

    // ---------------------------------------------------------- Temas
    {
      key: "touchpoints",
      label: "Marka nerelerde görünüyor",
      type: "multiselect",
      group: "temas",
      options: opts(TOUCHPOINT),
      help: "İşaretlenen her yer, kılavuzun uygulanması gereken bir yerdir. Fatura ve teklif en çok unutulanlar.",
    },
    {
      key: "signatureElement",
      label: "Ayırt edici işaret",
      type: "text",
      group: "temas",
      placeholder: "Uzaktan bakınca bizi belli eden tek şey",
      help: "Bir renk, bir şekil, bir kalıp cümle. Tek şey seç — iki tane \"ayırt edici\" zaten değildir.",
    },

    // ---------------------------------------------------------- Koruma
    {
      key: "trademarkStatus",
      label: "Tescil durumu",
      type: "select",
      group: "koruma",
      options: opts(TRADEMARK),
      help: "Yalnızca son durum. Başvuru, sınıf ve süre takibi Hukuk'un Marka/Patent/Telif modülünde.",
    },
    {
      key: "domains",
      label: "Alan adları",
      type: "tags",
      group: "koruma",
      help: "Elimizdekiler ve almamız gerekenler. Marka adına sahip olmak, alan adına sahip olmak değildir.",
    },
    {
      key: "handles",
      label: "Sosyal hesap adları",
      type: "tags",
      group: "koruma",
      help: "Hesapların kendisi Sosyal Medya modülünde; burada adların her kanalda aynı olması için liste.",
    },

    // ---------------------------------------------------------- Durum
    {
      key: "brandOwner",
      label: "Marka sorumlusu",
      type: "user_ref",
      group: "durum",
      help: "Tereddütte kararı kim veriyor? Sahipsiz marka kılavuzu ilk sıkışık teslimde delinir.",
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

  // Şablonlar daima TASLAK yüklenir. Amaç doğru cevabı vermek değil, boş
  // sayfayı kaldırmak: kullanıcı hazır cümleyi okuyunca kendi cümlesini
  // yazması kolaylaşıyor.
  templates: [
    {
      key: "hizmet",
      label: "Hizmet / ajans",
      data: {
        category: "İşini büyütmek isteyen markalar için dış ekip",
        primaryAudience: "Büyüme aşamasındaki küçük ve orta ölçekli markalar",
        notFor: "En ucuzu arayan, süreci kendi yönetmek isteyenler",
        alternatives: "İçeride birini işe almak,Serbest çalışanla ilerlemek,Hiçbir şey yapmamak",
        promise: "İşini bize devreden müşteri, süreci takip etmek zorunda kalmaz; sonucu rakamla görür.",
        differentiator: "Her işin sonunda ne yaptığımızı ve neye yaradığını tek sayfada raporlarız.",
        reasonsToBelieve: "Aylık tek sayfa rapor,Sabit ekip,İlk 30 günde çıkış hakkı",
        archetype: "bilge",
        personality: "Sözünü tutan,Açık sözlü,Sakin",
        toneFormality: "s1",
        toneHumor: "c1",
        toneBoldness: "orta",
        voiceRules: "Siz diliyle yazılır. Emoji kullanılmaz. Terim kullanılacaksa bir kez açıklanır. Cümleler kısa.",
        sayThis: "İş,Çıktı,Rapor",
        avoid: "Devrim niteliğinde,Sektör lideri,Anahtar teslim mutluluk",
        touchpoints: "web,sosyal,eposta,teklif,fatura",
      },
    },
    {
      key: "perakende",
      label: "Perakende / tüketici",
      data: {
        category: "Günlük kullanım ürünü",
        primaryAudience: "Aradığını hızlı bulmak isteyen şehirli alıcı",
        notFor: "Uzun uzun araştırıp en ucuzu bulmayı sevenler",
        alternatives: "Pazaryerinden almak,Markete gitmek,Ertelemek",
        promise: "Aradığını ilk denemede bulur, beğenmezse sorunsuz iade eder.",
        differentiator: "İade tek tıkla ve soru sorulmadan.",
        reasonsToBelieve: "14 gün koşulsuz iade,Aynı gün kargo,Gerçek müşteri fotoğrafları",
        archetype: "sirandan",
        personality: "Sıcak,Anlaşılır,Hızlı",
        toneFormality: "s2",
        toneHumor: "e1",
        toneBoldness: "c1",
        voiceRules: "Sen diliyle yazılır. Kısa cümle. Emoji az ve yerinde. Büyük harfle bağırılmaz.",
        avoid: "Kampanya kaçmasın,Son 3 ürün,Efsane fırsat",
        touchpoints: "web,sosyal,eposta,ambalaj,reklam",
      },
    },
    {
      key: "uretim",
      label: "Üretim / B2B",
      data: {
        category: "Tedarikçi",
        primaryAudience: "Zamanında teslim ve sabit kalite arayan üretici firmalar",
        notFor: "Tek seferlik, en düşük fiyatlı iş arayanlar",
        alternatives: "Mevcut tedarikçide kalmak,İthalat,Kendi üretimini kurmak",
        promise: "Söz verilen tarihte, söz verilen kalitede gelir; hattı durdurmaz.",
        differentiator: "Gecikme ihtimalini biz haber veririz, müşteri sormadan.",
        reasonsToBelieve: "ISO belgesi,Parti bazlı kalite raporu,Yıllık kapasite taahhüdü",
        archetype: "yonetici",
        personality: "Güvenilir,Ölçülü,Şeffaf",
        toneFormality: "f1",
        toneHumor: "c2",
        toneBoldness: "k1",
        voiceRules: "Siz dili. Rakam ve tarih verilir, sıfat verilmez. Taahhüt edilmeyen şey yazılmaz.",
        avoid: "En iyisi,Rakipsiz,Sınırsız",
        touchpoints: "web,eposta,teklif,fatura,etkinlik,basili",
      },
    },
  ],

  empty: {
    title: "Markanı bir kez kur, her yerde aynı marka çıksın",
    body:
      "Neyin alternatifi olduğun, ne vaat ettiğin, nasıl konuştuğun ve neye benzediğin tek sayfada dursun; " +
      "teklif, reklam ve sosyal medya metinleri aynı yerden beslensin. Şablondan başlayıp üstüne yazabilirsin — " +
      "her düzenleme sürüm olarak saklanır.",
    action: "Markayı kur",
  },
};
