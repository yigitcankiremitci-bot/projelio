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
// da bu yüzden var — boş 40 alanla karşılaşan kimse başlamıyor.
//
// KİŞİSEL MARKA da bir marka türü: Projelio'yu kullananların önemli bir kısmı
// serbest çalışan, danışman ya da kurucusuyla anılan küçük şirket. Onlarda
// "kategori / vaat / ton" soruları aynen geçerli, ama kimliğin gövdesi
// başkadır — uzmanlık, hikâye ve NEYİN PAYLAŞILMAYACAĞI. Bu yüzden ayrı bir
// modül değil, bu modülün içinde bir tür (`brandType`) ve kendi bölümü var:
// ikiye ayırmak, aynı ton/renk/tescil sorularını iki yerde yaşatmak olurdu.
//
// KALDIRILAN SORULAR (2026-09): "Marka bir insan olsaydı" ve "renk kullanım
// oranı (%70/%20/%10)". İkisi de ajans atölyesinde anlamlı, kendi markasını
// yazan kullanıcıda değil: birincisi cevaplanabilir bir soru değil, ikincisi
// tasarımcının işini kullanıcıya sorduruyordu. Eski kayıtlarda bu iki anahtar
// duruyor olabilir — veri silinmedi, yalnızca ekranda sorulmuyor.
//
// Bkz. docs/moduller/20-motor-a1-form.md §6.3

// Markanın kim olduğu: şirket mi, kişi mi. Bu seçim ekranda hiçbir alanı
// gizlemiyor — bilinçli. Karma markada iki taraf da doldurulur ve "kişisel"
// seçince kapanan bir bölüm, kurucusuyla anılan şirketin yarısını yok sayardı.
const BRAND_TYPE = {
  kurumsal: "Kurumsal — şirketin adı öne çıkar", // dil:anahtar
  kisisel: "Kişisel — bir kişinin adı öne çıkar", // dil:anahtar
  karma: "Karma — kurucunun adı şirketle birlikte anılır", // dil:anahtar
};

// 12 arketip: markaya bir kişilik ekseni verir. Ekipteki herkesin aklındaki
// sesi tek noktada buluşturmanın en ucuz yolu — sıfat listesinden daha
// bağlayıcı, çünkü seçilmeyen 11 tanesi de bir karardır.
const ARCHETYPE = {
  masum: "Masum — sadelik, iyimserlik",
  bilge: "Bilge — bilgi, doğruluk", // dil:anahtar
  kasif: "Kâşif — özgürlük, keşif", // dil:anahtar
  kahraman: "Kahraman — cesaret, başarma", // dil:anahtar
  asi: "Asi — kuralı bozma", // dil:anahtar
  sihirbaz: "Sihirbaz — dönüşüm", // dil:anahtar
  sirandan: "Sıradan insan — ait olma, samimiyet", // dil:anahtar
  asik: "Âşık — yakınlık, güzellik", // dil:anahtar
  soytari: "Soytarı — neşe, hafiflik", // dil:anahtar
  bakici: "Bakıcı — koruma, şefkat", // dil:anahtar
  yaratici: "Yaratıcı — hayal gücü, ifade", // dil:anahtar
  yonetici: "Yönetici — düzen, otorite", // dil:anahtar
};

// Ton kaydırıcıları. Tek bir "ton" seçimi metni yazana yetmiyor: "profesyonel"
// diyen iki kişi iki farklı metin yazıyor. Üç eksende beşer kademe, yazarken
// bakılabilecek somut bir ayar veriyor.
const FORMALITY = {
  f2: "Tamamen resmî",
  f1: "Resmîye yakın", // dil:anahtar
  orta: "Ortada",
  s1: "Samimiye yakın", // dil:anahtar
  s2: "Tamamen samimi",
};
const HUMOR = {
  c2: "Hep ciddi",
  c1: "Ciddiye yakın", // dil:anahtar
  orta: "Ortada",
  e1: "Esprili sayılır", // dil:anahtar
  e2: "Belirgin esprili",
};
const BOLDNESS = {
  k2: "Klasik, temkinli",
  k1: "Klasiğe yakın", // dil:anahtar
  orta: "Ortada",
  c1: "Cesura yakın", // dil:anahtar
  c2: "Belirgin cesur",
};

// Son dört seçenek kişisel markanın temas noktaları. Kurumsal listeye
// eklenmelerinin sebebi, ayrı bir liste tutmamak: bülten çıkaran bir şirket de
// var, sahneye çıkan bir kurucu da.
const TOUCHPOINT = {
  web: "Web sitesi",
  sosyal: "Sosyal medya",
  eposta: "E-posta",
  teklif: "Teklif ve sunum",
  fatura: "Fatura ve sözleşme", // dil:anahtar
  ambalaj: "Ambalaj / etiket",
  magaza: "Mağaza / ofis", // dil:anahtar
  arac: "Araç giydirme", // dil:anahtar
  reklam: "Reklam",
  etkinlik: "Fuar / etkinlik",
  uygulama: "Mobil uygulama",
  basili: "Kartvizit ve basılı", // dil:anahtar
  podcast: "Podcast / video kanalı", // dil:anahtar
  bulten: "Bülten / e-posta listesi", // dil:anahtar
  sahne: "Konuşma / sahne", // dil:anahtar
  egitim: "Eğitim / kurs", // dil:anahtar
};

const TRADEMARK = {
  yok: "Tescil yok",
  arastirma: "Araştırılıyor", // dil:anahtar
  basvuru: "Başvuruldu", // dil:anahtar
  tescilli: "Tescilli",
  yenileme: "Yenilenmeli",
};

const STATUS = { draft: "Taslak", approved: "Onaylandı", outdated: "Güncellenmeli" }; // dil:anahtar

export const markaKimligiConfig: ModuleFormConfig = {
  kind: "form",
  title: "Marka Kimliği", // dil:anahtar
  scope: "organization",

  groups: [
    { key: "konum", label: "Konum", hint: "Kimin gözünde, neyin alternatifiyiz?" }, // dil:anahtar
    { key: "oz", label: "Öz", hint: "Ne vaat ediyoruz, neye dayanarak?" }, // dil:anahtar
    { key: "kisilik", label: "Kişilik", hint: "Nasıl bir karakteri var?" }, // dil:anahtar
    {
      key: "kisisel",
      label: "Kişi ve uzmanlık", // dil:anahtar
      hint: "Markanın arkasında bir kişi varsa burası. Kurumsal markada boş kalabilir.", // dil:anahtar
    },
    { key: "ses", label: "Ses ve dil", hint: "Nasıl konuşuyor?" }, // dil:anahtar
    { key: "isim", label: "Ad ve yazım", hint: "Adımız nasıl yazılır, yenileri nasıl adlandırılır?" }, // dil:anahtar
    { key: "gorunum", label: "Görünüm", hint: "Renk, yazı, logo, görsel dil" }, // dil:anahtar
    { key: "temas", label: "Temas noktaları", hint: "Marka fiilen nerelerde görünüyor?" }, // dil:anahtar
    { key: "koruma", label: "Koruma", hint: "Ad, alan adı ve hesaplar elimizde mi?" }, // dil:anahtar
    { key: "durum", label: "Durum", hint: "Sorumlu, geçerlilik, gözden geçirme" }, // dil:anahtar
  ],

  fields: [
    // ---------------------------------------------------------- Konum
    {
      key: "brandType",
      label: "Marka türü", // dil:anahtar
      type: "select",
      group: "konum",
      defaultValue: "kurumsal",
      options: opts(BRAND_TYPE),
      help: "Kişisel markada güven kişiye, kurumsalda şirkete yazılır; aşağıdaki cevapların tonu buna göre değişir.", // dil:anahtar
    },
    {
      key: "brandName",
      label: "Marka adı", // dil:anahtar
      type: "text",
      group: "konum",
      help: "Organizasyon adından farklıysa yaz; müşterinin gördüğü ad budur.", // dil:anahtar
    },
    {
      key: "category",
      label: "Kategori",
      type: "text",
      group: "konum",
      requiredForApproval: true,
      placeholder: "Neyin alternatifi olarak anılıyoruz?", // dil:anahtar
      help: "Müşteri seni neyin yerine koyuyorsa kategorin odur — sen ne dersen de.", // dil:anahtar
    },
    {
      key: "primaryAudience",
      label: "Birincil hedef",
      type: "text",
      group: "konum",
      placeholder: "Örn. büyümek isteyen küçük üreticiler", // dil:anahtar
      help: "Tek kitle yaz. Persona detayı Hedef Kitle modülünde durur.", // dil:anahtar
    },
    {
      key: "notFor",
      label: "Kime uygun değil", // dil:anahtar
      type: "text",
      group: "konum",
      help: "Herkese hitap eden marka kimseye hitap etmez. Bunu yazmak vaadi keskinleştirir.", // dil:anahtar
    },
    {
      key: "alternatives",
      label: "Bizim yerimize ne seçilir", // dil:anahtar
      type: "tags",
      group: "konum",
      help: "Müşterinin gerçekten değerlendirdiği seçenekler — \"kendimiz yaparız\" ve \"şimdilik dursun\" dahil.", // dil:anahtar
    },

    // ---------------------------------------------------------- Öz
    {
      key: "promise",
      label: "Marka vaadi",
      type: "longtext",
      group: "oz",
      requiredForApproval: true,
      placeholder: "Bu markayı seçen kişi ne elde ediyor?", // dil:anahtar
      help: "Ürünü değil sonucu anlat. Şirketin niye var olduğu Kimlik ve Yön'de duruyor.", // dil:anahtar
    },
    {
      key: "differentiator",
      label: "Ayrışma", // dil:anahtar
      type: "longtext",
      group: "oz",
      placeholder: "Bizi seçmenin, diğerini seçmemekten farkı", // dil:anahtar
      help: "Aynı cümleyi rakip de kurabiliyorsa ayrışma değil, kategori girişidir.", // dil:anahtar
    },
    {
      key: "reasonsToBelieve",
      label: "Kanıtlar", // dil:anahtar
      type: "tags",
      group: "oz",
      attachments: true,
      help: "Vaadi ayakta tutan somut şeyler: teslim süresi, garanti, sertifika, referans sayısı. Belgesi varsa ekle.", // dil:anahtar
    },

    // ---------------------------------------------------------- Kişilik
    {
      key: "archetype",
      label: "Arketip",
      type: "select",
      group: "kisilik",
      options: opts(ARCHETYPE),
      help: "Bir tane seç. İki arketip seçmek, kararı ertelemenin kibar hâli.", // dil:anahtar
    },
    {
      key: "personality",
      label: "Kişilik sıfatları", // dil:anahtar
      type: "tags",
      group: "kisilik",
      help: "3–5 sıfat. \"Kaliteli\" ve \"güvenilir\" herkesin yazdığı şey; ayırt edeni yaz.", // dil:anahtar
    },

    // ---------------------------------------------------------- Kişi ve uzmanlık
    {
      key: "expertise",
      label: "Uzmanlık alanı", // dil:anahtar
      type: "text",
      group: "kisisel",
      placeholder: "Hangi konu akla seni getiriyor?", // dil:anahtar
      help: "Tek konu yaz. \"Her işi yaparım\" diyen kişiye kimse belirli bir iş için gelmiyor.", // dil:anahtar
    },
    {
      key: "personalStory",
      label: "Kişisel hikâye", // dil:anahtar
      type: "longtext",
      group: "kisisel",
      placeholder: "Bu işi neden yapıyorsun, buraya nasıl geldin?", // dil:anahtar
      help: "Kişisel markada güvenin yarısı hikâyeden gelir; kurumsalda referanstan. Biri diğerinin yerine geçmiyor.", // dil:anahtar
    },
    {
      key: "contentThemes",
      label: "İçerik temaları", // dil:anahtar
      type: "tags",
      group: "kisisel",
      help: "3–5 konu. Her gün başka bir şey anlatan hesap, ne için takip edildiğini kaybediyor.", // dil:anahtar
    },
    {
      key: "boundaries",
      label: "Paylaşılmayanlar", // dil:anahtar
      type: "tags",
      group: "kisisel",
      help: "Aile, sağlık, siyaset, gelir… Sınır önceden çizilmezse kararı yoğun bir günün ruh hâli veriyor.", // dil:anahtar
    },

    // ---------------------------------------------------------- Ses ve dil
    {
      key: "toneFormality",
      label: "Resmî ↔ Samimi",
      type: "select",
      group: "ses",
      requiredForApproval: true,
      options: opts(FORMALITY),
      help: "Üç kaydırıcı, metni yazarken bakılacak ayardır. \"Profesyonel\" diyen iki kişi iki farklı metin yazıyor.", // dil:anahtar
    },
    { key: "toneHumor", label: "Ciddi ↔ Esprili", type: "select", group: "ses", options: opts(HUMOR) },
    { key: "toneBoldness", label: "Klasik ↔ Cesur", type: "select", group: "ses", options: opts(BOLDNESS) },
    {
      key: "voiceRules",
      label: "Dil kuralları", // dil:anahtar
      type: "longtext",
      group: "ses",
      placeholder: "Sen mi siz mi, emoji var mı, teknik terim ne kadar, cümleler ne uzunlukta?", // dil:anahtar
      help: "Birkaç madde yeter. Amaç, metni kim yazarsa yazsın aynı çıkması.", // dil:anahtar
    },
    {
      key: "sayThis",
      label: "Kullandığımız sözler", // dil:anahtar
      type: "tags",
      group: "ses",
      help: "Markanın kendi sözlüğü: ürüne, müşteriye, ekibe ne diyoruz.", // dil:anahtar
    },
    {
      key: "avoid",
      label: "Kaçınılan sözler", // dil:anahtar
      type: "tags",
      group: "ses",
      help: "Abartı vaatler, rakip taklidi kalıplar, artık kullanılmayan eski terimler.", // dil:anahtar
    },
    {
      key: "boilerplate",
      label: "Kısa tanıtım metni", // dil:anahtar
      type: "longtext",
      group: "ses",
      placeholder: "Teklifin sonunda, e-posta imzasında, sosyal profil biyografisinde kullanılacak sabit paragraf", // dil:anahtar
      help: "Bir kez yazılır, her yerde aynısı yapıştırılır. Yoksa herkes kendi tanıtımını uydurur.", // dil:anahtar
    },

    // ---------------------------------------------------------- Ad ve yazım
    {
      key: "tagline",
      label: "Slogan",
      type: "text",
      group: "isim",
      help: "Zorunlu değil. Vaadi tekrar eden slogan, hiç sloganı olmamasından iyi değildir.", // dil:anahtar
    },
    {
      key: "spelling",
      label: "Yazım kuralı", // dil:anahtar
      type: "text",
      group: "isim",
      placeholder: "Örn. Projelio (büyük P, kalanı küçük); PROJELIO yazılmaz", // dil:anahtar
      help: "Adın yanlış yazıldığı her yer, markanın biraz daha silikleşmesi demek.", // dil:anahtar
    },
    {
      key: "namingRule",
      label: "Yeni ürün adlandırma kuralı", // dil:anahtar
      type: "longtext",
      group: "isim",
      placeholder: "Yeni ürün/hizmet adları hangi kalıba uyacak?", // dil:anahtar
      help: "Kural yoksa her yeni ürün kendi markasını kurar; üçüncüden sonra kimin kim olduğu belirsizleşir.", // dil:anahtar
    },

    // ---------------------------------------------------------- Görünüm
    {
      key: "primaryColor",
      label: "Ana renk",
      type: "text",
      group: "gorunum",
      placeholder: "#3E4858",
      help: "HEX kodu yaz. \"Lacivert\" baskıda ve ekranda aynı çıkmaz, kod çıkar.", // dil:anahtar
    },
    { key: "secondaryColors", label: "Yardımcı renkler", type: "tags", group: "gorunum" }, // dil:anahtar
    {
      key: "typography",
      label: "Tipografi",
      type: "text",
      group: "gorunum",
      attachments: true,
      placeholder: "Başlık yazı tipi / metin yazı tipi", // dil:anahtar
      help: "Satın alınmış bir yazı tipi varsa dosyasını da ekle; lisans dosyası aranırken hep kayıp oluyor.", // dil:anahtar
    },
    {
      key: "logoUsage",
      label: "Logo kullanımı", // dil:anahtar
      type: "longtext",
      group: "gorunum",
      attachments: true,
      placeholder: "En küçük boyut, çevresindeki boş alan, koyu/açık zemin sürümleri", // dil:anahtar
      help: "Logo dosyalarını buraya ekle — kılavuzu okuyan kişi doğru dosyayı aynı yerde bulsun.", // dil:anahtar
    },
    {
      key: "logoDonts",
      label: "Logoda yapılmayacaklar", // dil:anahtar
      type: "tags",
      group: "gorunum",
      help: "Örn. germe, gölge ekleme, rengini değiştirme, desenli zemine koyma.", // dil:anahtar
    },
    {
      key: "imagery",
      label: "Görsel dil", // dil:anahtar
      type: "longtext",
      group: "gorunum",
      attachments: true,
      placeholder: "Fotoğraf mı illüstrasyon mu, insan var mı, hangi ışık ve ton?", // dil:anahtar
      help: "Anlatmak yerine göstermek daha kısa: doğru bulduğun birkaç örnek görseli ekle.", // dil:anahtar
    },
    {
      key: "guidelineUrl",
      label: "Kılavuz ve dosyalar bağlantısı", // dil:anahtar
      type: "text",
      group: "gorunum",
      attachments: true,
      help: "Logo dosyaları ve kılavuz nerede duruyorsa oranın bağlantısı — Dosyalar modülünden alabilirsin.", // dil:anahtar
    },

    // ---------------------------------------------------------- Temas
    {
      key: "touchpoints",
      label: "Marka nerelerde görünüyor", // dil:anahtar
      type: "multiselect",
      group: "temas",
      options: opts(TOUCHPOINT),
      help: "İşaretlenen her yer, kılavuzun uygulanması gereken bir yerdir. Fatura ve teklif en çok unutulanlar.", // dil:anahtar
    },
    {
      key: "signatureElement",
      label: "Ayırt edici işaret", // dil:anahtar
      type: "text",
      group: "temas",
      placeholder: "Uzaktan bakınca bizi belli eden tek şey", // dil:anahtar
      help: "Bir renk, bir şekil, bir kalıp cümle. Tek şey seç.", // dil:anahtar
    },

    // ---------------------------------------------------------- Koruma
    {
      key: "trademarkStatus",
      label: "Tescil durumu",
      type: "select",
      group: "koruma",
      options: opts(TRADEMARK),
      attachments: true,
      help: "Yalnızca son durum; belgesi varsa ekle. Başvuru, sınıf ve süre takibi Hukuk'un Marka/Patent/Telif modülünde.", // dil:anahtar
    },
    {
      key: "domains",
      label: "Alan adları", // dil:anahtar
      type: "tags",
      group: "koruma",
      help: "Elimizdekiler ve almamız gerekenler. Marka adına sahip olmak, alan adına sahip olmak değildir.", // dil:anahtar
    },
    {
      key: "handles",
      label: "Sosyal hesap adları", // dil:anahtar
      type: "tags",
      group: "koruma",
      help: "Hesapların kendisi Sosyal Medya modülünde; burada adların her kanalda aynı olması için liste.", // dil:anahtar
    },

    // ---------------------------------------------------------- Durum
    {
      key: "brandOwner",
      label: "Marka sorumlusu",
      type: "user_ref",
      group: "durum",
      help: "Tereddütte kararı kim veriyor? Sahipsiz marka kılavuzu ilk sıkışık teslimde delinir.", // dil:anahtar
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

  // Şablonlar daima TASLAK yüklenir. Amaç doğru cevabı vermek değil, boş
  // sayfayı kaldırmak: kullanıcı hazır cümleyi okuyunca kendi cümlesini
  // yazması kolaylaşıyor.
  templates: [
    {
      key: "hizmet",
      label: "Hizmet / ajans",
      hint: "Şirket adıyla iş alan, ekiple çalışan hizmet işi", // dil:anahtar
      data: {
        brandType: "kurumsal",
        category: "İşini büyütmek isteyen markalar için dış ekip", // dil:atla
        primaryAudience: "Büyüme aşamasındaki küçük ve orta ölçekli markalar", // dil:atla
        notFor: "En ucuzu arayan, süreci kendi yönetmek isteyenler", // dil:atla
        alternatives: "İçeride birini işe almak,Serbest çalışanla ilerlemek,Hiçbir şey yapmamak", // dil:atla
        promise: "İşini bize devreden müşteri, süreci takip etmek zorunda kalmaz; sonucu rakamla görür.", // dil:atla
        differentiator: "Her işin sonunda ne yaptığımızı ve neye yaradığını tek sayfada raporlarız.", // dil:atla
        reasonsToBelieve: "Aylık tek sayfa rapor,Sabit ekip,İlk 30 günde çıkış hakkı", // dil:atla
        archetype: "bilge",
        personality: "Sözünü tutan,Açık sözlü,Sakin", // dil:atla
        toneFormality: "s1",
        toneHumor: "c1",
        toneBoldness: "orta",
        voiceRules: "Siz diliyle yazılır. Emoji kullanılmaz. Terim kullanılacaksa bir kez açıklanır. Cümleler kısa.", // dil:atla
        sayThis: "İş,Çıktı,Rapor", // dil:atla
        avoid: "Devrim niteliğinde,Sektör lideri,Anahtar teslim mutluluk", // dil:atla
        touchpoints: "web,sosyal,eposta,teklif,fatura",
      },
    },
    {
      key: "perakende",
      label: "Perakende / tüketici", // dil:anahtar
      hint: "Rafta ya da pazaryerinde, son kullanıcıya satan marka", // dil:anahtar
      data: {
        brandType: "kurumsal",
        category: "Günlük kullanım ürünü", // dil:atla
        primaryAudience: "Aradığını hızlı bulmak isteyen şehirli alıcı", // dil:atla
        notFor: "Uzun uzun araştırıp en ucuzu bulmayı sevenler", // dil:atla
        alternatives: "Pazaryerinden almak,Markete gitmek,Ertelemek",
        promise: "Aradığını ilk denemede bulur, beğenmezse sorunsuz iade eder.", // dil:atla
        differentiator: "İade tek tıkla ve soru sorulmadan.", // dil:atla
        reasonsToBelieve: "14 gün koşulsuz iade,Aynı gün kargo,Gerçek müşteri fotoğrafları", // dil:atla
        archetype: "sirandan",
        personality: "Sıcak,Anlaşılır,Hızlı", // dil:atla
        toneFormality: "s2",
        toneHumor: "e1",
        toneBoldness: "c1",
        voiceRules: "Sen diliyle yazılır. Kısa cümle. Emoji az ve yerinde. Büyük harfle bağırılmaz.", // dil:atla
        avoid: "Kampanya kaçmasın,Son 3 ürün,Efsane fırsat", // dil:atla
        touchpoints: "web,sosyal,eposta,ambalaj,reklam",
      },
    },
    {
      key: "uretim",
      label: "Üretim / B2B", // dil:anahtar
      hint: "Başka firmalara üreten ya da tedarik eden iş", // dil:anahtar
      data: {
        brandType: "kurumsal",
        category: "Tedarikçi", // dil:atla
        primaryAudience: "Zamanında teslim ve sabit kalite arayan üretici firmalar", // dil:atla
        notFor: "Tek seferlik, en düşük fiyatlı iş arayanlar", // dil:atla
        alternatives: "Mevcut tedarikçide kalmak,İthalat,Kendi üretimini kurmak", // dil:atla
        promise: "Söz verilen tarihte, söz verilen kalitede gelir; hattı durdurmaz.", // dil:atla
        differentiator: "Gecikme ihtimalini biz haber veririz, müşteri sormadan.", // dil:atla
        reasonsToBelieve: "ISO belgesi,Parti bazlı kalite raporu,Yıllık kapasite taahhüdü", // dil:atla
        archetype: "yonetici",
        personality: "Güvenilir,Ölçülü,Şeffaf", // dil:atla
        toneFormality: "f1",
        toneHumor: "c2",
        toneBoldness: "k1",
        voiceRules: "Siz dili. Rakam ve tarih verilir, sıfat verilmez. Taahhüt edilmeyen şey yazılmaz.", // dil:atla
        avoid: "En iyisi,Rakipsiz,Sınırsız", // dil:atla
        touchpoints: "web,eposta,teklif,fatura,etkinlik,basili",
      },
    },
    {
      // Kişisel marka şablonu diğer üçünden bir alan fazlasını doldurur:
      // "Paylaşılmayanlar". Kimse o soruyu kendiliğinden sormuyor, ama sınır
      // sonradan çizilince çoktan aşılmış oluyor.
      key: "kisisel",
      label: "Kişisel marka", // dil:anahtar
      hint: "Danışman, eğitmen, serbest çalışan — işi kendi adıyla alan kişi", // dil:anahtar
      data: {
        brandType: "kisisel",
        category: "Kendi alanında danışmanlık veren uzman", // dil:atla
        primaryAudience: "Konuyu bilen birine doğrudan ulaşmak isteyen küçük işletme sahipleri", // dil:atla
        notFor: "Kurumsal bir ekip ve uzun süreç bekleyenler", // dil:atla
        alternatives: "Ajansla çalışmak,İçeriden birine öğretmek,Kendi kendine öğrenmek", // dil:atla
        promise: "İşi konuşurken karşısında hep aynı kişi olur; devredilmez, anlatılan baştan anlatılmaz.", // dil:atla
        differentiator: "İşi yapan da anlatan da aynı kişi; arada aktarım kaybı yok.", // dil:atla
        reasonsToBelieve: "Adı geçen çalışmalar,Yayımlanmış içerik,Ulaşılabilir referanslar", // dil:atla
        archetype: "bilge",
        personality: "Açık sözlü,Meraklı,Ulaşılabilir", // dil:atla
        expertise: "Tek bir konu — adının yanına yazılan şey", // dil:atla
        personalStory: "Bu işi neden yaptığını, nereden başladığını ve ne öğrendiğini birkaç cümleyle anlat. Kişisel markada güvenin yarısı buradan geliyor.", // dil:atla
        contentThemes: "Yaptığım işten çıkarımlar,Sık sorulan sorular,Sektörde değişenler", // dil:atla
        boundaries: "Aile,Sağlık,Siyaset,Müşteri adları", // dil:atla
        toneFormality: "s1",
        toneHumor: "e1",
        toneBoldness: "c1",
        voiceRules: "Birinci tekil şahıs: \"biz\" değil \"ben\". Bilmediğime bilmiyorum derim. Müşteri adı izinsiz geçmez.", // dil:atla
        sayThis: "Deneyimim,Gördüğüm kadarıyla,Şöyle çözdük", // dil:atla
        avoid: "Ekibimiz,Kurumsal çözümler,Uzman kadromuz", // dil:atla
        touchpoints: "web,sosyal,eposta,podcast,bulten,sahne",
      },
    },
  ],

  empty: {
    title: "Markanı bir kez kur, her yerde aynı marka çıksın", // dil:anahtar
    body:
      "Neyin alternatifi olduğun, ne vaat ettiğin, nasıl konuştuğun ve neye benzediğin tek sayfada dursun; " + // dil:anahtar
      "teklif, reklam ve sosyal medya metinleri aynı yerden beslensin. Şablondan başlayıp üstüne yazabilirsin — " + // dil:anahtar
      "her düzenleme sürüm olarak saklanır.", // dil:anahtar
    action: "Markayı kur", // dil:anahtar
  },
};
