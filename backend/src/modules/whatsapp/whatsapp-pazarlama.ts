/**
 * Yabancı numaradan gelen WhatsApp mesajına Lio'nun pazarlama akışı — saf hesap.
 *
 * "Yabancı": Projelio kullanıcısı olmayan, konuşmasının sahibi bulunmayan
 * numara (kimse ona yazmamış, kendisi yazmış). Amaç: en fazla 10 mesajda onu
 * kayıt sayfasına yönlendirmek; kayıttan sonra eşleştirme kodunu yollayınca
 * zaten var olan kullanıcı akışı devralır (bkz. whatsapp-optin.ts).
 *
 * NEDEN MODEL YOK: akış baştan sona şablon. İki sebep:
 *  1. Maliyet — bu numaralara harcanan Lio Bakiyesi kimsenin hesabından
 *     düşmez ve tanımadığımız birinin sohbeti sınırsız token yakabilirdi.
 *  2. Güvenlik — gelen metin güvenilmez girdidir; modele hiç girmediği için
 *     "önceki talimatları unut" türü saldırının yüzeyi yoktur. Metin yalnızca
 *     dar bir anahtar kelime kümesiyle sınıflanır.
 *
 * Konuşmanın hangi adımda olduğu ayrı bir sütunda tutulmuyor: bu konuşmalarda
 * giden her mesaj bizim şablonumuzdur, yani giden mesaj sayısı = adım.
 *
 * Veritabanı yok: "şu ana kadar kaç mesaj gitti" dışarıdan verilir, karar
 * burada döner (lio-komut-sinir.ts ile aynı desen).
 */

export interface PazarlamaConfig {
  /** Bir yabancıya en fazla kaç mesaj gider (bitiş mesajı dahil). */
  maxGiden: number;
}

export const DEFAULT_PAZARLAMA: PazarlamaConfig = { maxGiden: 10 };

/** Özellik açık mı? Varsayılan KAPALI — tanımadığımız kişiye otomatik yazmak bilerek karar ister. */
export function isPazarlamaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.WHATSAPP_PAZARLAMA?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "evet";
}

export function pazarlamaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PazarlamaConfig {
  const n = Number(env.WHATSAPP_PAZARLAMA_MAKS);
  return { maxGiden: Number.isFinite(n) && n >= 3 ? Math.floor(n) : DEFAULT_PAZARLAMA.maxGiden };
}

export type Segment = "bireysel" | "ekip" | "merak" | "belirsiz";
export type Ilgi = "gorev" | "musteri" | "sosyal" | "diger";

/** Türkçe büyük/küçük harf tuzakları için yerel ayarlı küçültme. */
function fold(text: string): string {
  return text.trim().toLocaleLowerCase("tr-TR");
}

const KESIN_RED = [
  "ilgilenmiyorum",
  "ilgilenmiyoruz",
  "istemiyorum",
  "istemiyoruz",
  "rahatsız etmeyin",
  "rahatsiz etmeyin",
  "yazmayın",
  "yazmayin",
  "yazma ",
  "spam",
  "reklam istemiyorum",
  "numaramı sil",
  "numarami sil",
];
const TEK_KELIME_RED = new Set(["hayır", "hayir", "dur", "durdur", "stop", "iptal", "çık", "cik", "çıkış", "cikis"]);

/** Kişi konuşmayı bitirmek istiyor mu? Bir daha yazılmaz. */
export function redMi(gelen: string): boolean {
  const t = fold(gelen).replace(/[.!]+$/, "");
  if (!t) return false;
  if (TEK_KELIME_RED.has(t)) return true;
  return KESIN_RED.some((k) => (t + " ").includes(k));
}

/** 1. soruya (ne için kullanacaksınız) cevabı. */
export function segmentCoz(gelen: string): Segment {
  const t = fold(gelen);
  if (/^1\b/.test(t) || /(bireysel|freelance|serbest|kendi işim|kendi isim|tek başıma|tek basima)/.test(t)) return "bireysel";
  if (/^2\b/.test(t) || /(şirket|sirket|ekip|firma|işletme|isletme|ajans|personel|çalışan|calisan)/.test(t)) return "ekip";
  if (/^3\b/.test(t) || /(merak|bakıyorum|bakiyorum|sadece)/.test(t)) return "merak";
  return "belirsiz";
}

/** 2. soruya (en çok neye zaman kaybediyorsunuz) cevabı. */
export function ilgiCoz(gelen: string): Ilgi {
  const t = fold(gelen);
  if (/^1\b/.test(t) || /(görev|gorev|proje|takip|ekip|iş planı|is plani|planlama)/.test(t)) return "gorev";
  if (/^2\b/.test(t) || /(müşteri|musteri|tahsilat|fatura|sipariş|siparis|ödeme|odeme|alacak|kasa|bütçe|butce)/.test(t)) return "musteri";
  if (/^3\b/.test(t) || /(sosyal|[iı]nstagram|paylaşım|paylasim|içerik|icerik|reels)/.test(t)) return "sosyal";
  return "diger";
}

export interface PazarlamaGirdi {
  /** Gelen mesajın metni ("[medya]" olabilir). */
  gelen: string;
  /** Bu konuşmada şimdiye kadar giden mesaj sayısı. */
  gidenSayisi: number;
  /** Kayıt sayfasının tam adresi. */
  kayitUrl: string;
}

export type PazarlamaKarar =
  /** Cevap ver; `red` doğruysa kişi bir daha yazılmamak üzere işaretlenir. */
  | { reply: string; red?: boolean }
  /** Sessiz kal (tavan doldu). */
  | { reply: null; red?: undefined };

const KOD_TALIMATI =
  "Üye olduktan sonra Ayarlar › Bağlı hesaplar bölümünden aldığınız PROJELIO-XXXX kodunu bu sohbete yazın; sizin için çalışmaya hemen başlayayım.";

export const PAZARLAMA_METINLERI = {
  tanitim:
    "Merhaba, ben Lio. Projelio'nun yapay zekâ asistanıyım; görevlerinizi, ekibinizi, müşteri ve tahsilat takibinizi tek yerden yönetmenize yardım ediyorum. " +
    "Size doğru şeyi anlatabilmem için bir soru: Projelio'yu daha çok ne için düşünüyorsunuz?\n" +
    "1 - Kendi işim (bireysel)\n2 - Şirket ya da ekip\n3 - Sadece merak ettim",
  ilgiSorusu: (segment: Segment): string => {
    const giris =
      segment === "bireysel"
        ? "Tek başına çalışanlar için Projelio, işleri ve müşterileri kafada değil düzenli bir yerde tutmayı sağlıyor."
        : segment === "ekip"
          ? "Ekipler için Projelio, kimin neyi yaptığını ve paranın nereye gittiğini tek ekranda gösteriyor."
          : "Projelio iş, ekip, müşteri ve bütçe takibini tek uygulamada topluyor.";
    return (
      `${giris}\nEn çok hangisi zamanınızı alıyor?\n` +
      "1 - Görev ve ekip takibi\n2 - Müşteri, tahsilat ve fatura\n3 - Sosyal medya paylaşımları\n4 - Başka bir şey"
    );
  },
  oneri: (ilgi: Ilgi, kayitUrl: string): string => {
    const konu =
      ilgi === "gorev"
        ? "Görevleri, projeleri ve ekibi tek yerden izleyebilir; ben de hatırlatma ve planlamada yardım ederim."
        : ilgi === "musteri"
          ? "Müşteri siparişlerini, ay ay tahsilatları ve faturaları takip edebilir; belgeyi okuyup kaydı ben açabilirim."
          : ilgi === "sosyal"
            ? "Paylaşımlarınızı planlayıp yayınlayabilir; açıklama ve etiket önerisini ben hazırlayabilirim."
            : "Ne aradığınızı bilmek isterim ama en kolayı bir bakmak: Projelio'nun neler yaptığını kendiniz görebilirsiniz.";
    return `${konu}\n\nÜye olmak için: ${kayitUrl}\n${KOD_TALIMATI}`;
  },
  // Adım 3+: konuşma sürüyorsa serbest metne girilmez, kısa şablon döner.
  hatirlatma: (kayitUrl: string, sira: number): string => {
    const varyantlar = [
      `Detayları burada uzatmak yerine uygulamada göstermek isterim. Üye olmak için: ${kayitUrl}\n${KOD_TALIMATI}`,
      `Sorularınızın çoğunu uygulamayı açınca kendiniz görürsünüz. Kayıt: ${kayitUrl}\nKodu bu sohbete yazmanız yeterli.`,
      `Ben burada kısa yanıt verebiliyorum; asıl işi uygulamada yaparım. Üye olun: ${kayitUrl}\n${KOD_TALIMATI}`,
    ];
    return varyantlar[sira % varyantlar.length];
  },
  kapanis: (kayitUrl: string): string =>
    `Şimdilik buradan yazmayı bırakıyorum. Projelio'ya ne zaman isterseniz ${kayitUrl} adresinden üye olabilirsiniz; kodunuzu bu sohbete yazdığınızda ben yine buradayım.`,
  veda: "Anlaşıldı, bir daha yazmayacağım. İyi günler dilerim.",
} as const;

/**
 * Akış:
 *  0: tanıtım + 1. soru
 *  1: 1. cevabı → ilgi sorusu (2. soru)
 *  2: 2. cevabı → öneri + kayıt bağlantısı + kod talimatı
 *  3..max-2: kısa hatırlatma şablonları (konuşma uzasa da serbest metne girilmez)
 *  max-1: kapanış; sonrası sessizlik
 * Kesin ret gelirse (her adımda) tek bir veda mesajı, sonra sessizlik.
 */
export function decidePazarlama(cfg: PazarlamaConfig, girdi: PazarlamaGirdi): PazarlamaKarar {
  const { gelen, gidenSayisi, kayitUrl } = girdi;
  if (gidenSayisi >= cfg.maxGiden) return { reply: null };
  // İlk mesajda ret kelimesi aranmaz: "dur" ile başlayan bir konuşma yok,
  // ama "hayır" gibi bir ilk mesaj için de tanıtım yerine veda daha doğru.
  if (redMi(gelen)) return { reply: PAZARLAMA_METINLERI.veda, red: true };
  // Son hak kapanışa ayrılır.
  if (gidenSayisi === cfg.maxGiden - 1) return { reply: PAZARLAMA_METINLERI.kapanis(kayitUrl) };

  switch (gidenSayisi) {
    case 0:
      return { reply: PAZARLAMA_METINLERI.tanitim };
    case 1:
      return { reply: PAZARLAMA_METINLERI.ilgiSorusu(segmentCoz(gelen)) };
    case 2:
      return { reply: PAZARLAMA_METINLERI.oneri(ilgiCoz(gelen), kayitUrl) };
    default:
      return { reply: PAZARLAMA_METINLERI.hatirlatma(kayitUrl, gidenSayisi - 3) };
  }
}
