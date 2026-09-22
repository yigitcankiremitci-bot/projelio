/**
 * Belgeden fatura çıkarma: modele ne sorulduğu ve yanıtın nasıl okunduğu.
 *
 * Saf, ayrı dosya: buradaki iki karar da (istem metni ve yanıtın doğrulanması)
 * ne ağa ne veritabanına ihtiyaç duyuyor, ama ikisi de YANLIŞ OLDUĞUNDA
 * deftere yanlış tutar yazıyor. Sınanabilir olmaları bu yüzden şart.
 */

/** Modelin döndürmesini istediğimiz alanlar (fm_fatura veri alanlarıyla aynı adlar). */
export interface OkunanFatura {
  /** Kesilen (bizim kestiğimiz, para girişi) ya da alınan (bize kesilen, çıkış). */
  direction: "issued" | "received";
  amount: number;
  currency: string;
  /** YYYY-MM-DD. Belgedeki DÜZENLEME tarihi; ödeme/vade tarihi değil. */
  issueDate: string;
  invoiceNo?: string;
  counterpartyName?: string;
  category?: string;
  description?: string;
  /**
   * Modelin kendi beyanı: belgeyi ne kadar okuyabildi (0-1).
   *
   * Deftere kayıt açan bir akışta "okuyamadım" demenin bir yolu OLMALI. Yoksa
   * model buruşuk bir fişten uydurulmuş bir tutar üretir ve o tutar kasaya
   * sessizce girerdi; düşük güvende kayıt açılmıyor, kullanıcıya soruluyor.
   */
  confidence: number;
}

/** Modelin okuyabildiği belge türleri. Geri kalanı elle girilmeli. */
export const OKUNABILIR_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * Bu eşiğin altında kayıt AÇILMAZ.
 *
 * 0.5 değil 0.6: yarı yarıya emin olunan bir tutarın deftere girmesi,
 * girmemesinden pahalı. Kullanıcı reddedilen belgeyi elle girebiliyor;
 * yanlış girilen tutarı ise ancak ay sonunda, toplamlar tutmayınca fark eder.
 */
export const GUVEN_ESIGI = 0.6;

const ISO_TARIH = /^\d{4}-\d{2}-\d{2}$/;

export const FATURA_OKUMA_SISTEMI = [
  "Sen bir muhasebe asistanısın. Sana verilen belge bir fatura, fiş ya da makbuz.",
  "Görevin belgedeki bilgileri okumak — yorumlamak, tamamlamak ya da tahmin etmek DEĞİL.",
  "",
  "Yalnızca tek bir JSON nesnesi döndür. Açıklama, selamlama, kod bloğu yazma.",
  "",
  "Alanlar:",
  '  direction: "issued" (bu faturayı KULLANICI kesmiş, yani para girişi) ya da',
  '             "received" (fatura kullanıcıya kesilmiş, yani para çıkışı).',
  "             Fiş ve market/akaryakıt makbuzları her zaman \"received\".",
  "  amount: KDV DAHİL genel toplam, sayı olarak. Binlik ayıracı ve para birimi simgesi yazma.",
  "  currency: ISO 4217 kodu (TRY, USD, EUR). Simge gördüysen koda çevir: ₺=TRY, $=USD, €=EUR.",
  "  issueDate: belgenin DÜZENLENME tarihi, YYYY-MM-DD. Vade ya da ödeme tarihi değil.",
  "  invoiceNo: belge/fatura numarası (yoksa alanı hiç yazma).",
  "  counterpartyName: karşı tarafın ünvanı — satıcı ya da alıcı, hangisi kullanıcı değilse o.",
  "  category: kısa gider/gelir başlığı (Akaryakıt, Kira, Yazılım, Danışmanlık gibi).",
  "  description: tek cümlelik özet.",
  "  confidence: 0 ile 1 arası, belgeyi ne kadar okuyabildiğin.",
  "",
  "Bir alanı okuyamadıysan UYDURMA: alanı hiç yazma ve confidence değerini düşür.",
  "Belge fatura/fiş değilse confidence 0 döndür.",
].join("\n");

/** Modelin metin yanıtından JSON'u ayıklar. */
function jsonuAyikla(metin: string): unknown {
  const temiz = metin.trim();
  try {
    return JSON.parse(temiz);
  } catch {
    // Model kod bloğu ya da bir cümle eklemiş olabilir: istem bunu yasaklıyor
    // ama yasak yanlış bir varsayım değil, YALNIZCA bir istek. İlk süslü
    // parantezden sonuncusuna kadarını denemek, her seferinde tüm işi
    // düşürmekten iyi.
    const bas = temiz.indexOf("{");
    const son = temiz.lastIndexOf("}");
    if (bas < 0 || son <= bas) return null;
    try {
      return JSON.parse(temiz.slice(bas, son + 1));
    } catch {
      return null;
    }
  }
}

/** Metne dönüşen sayı: "1.234,56", "1,234.56" ve "1234.56" aynı sayıdır. */
function sayiyaCevir(deger: unknown): number | null {
  if (typeof deger === "number") return Number.isFinite(deger) ? deger : null;
  if (typeof deger !== "string") return null;
  let ham = deger.replace(/[^\d.,-]/g, "").trim();
  if (!ham) return null;
  const sonNokta = ham.lastIndexOf(".");
  const sonVirgul = ham.lastIndexOf(",");
  // Ondalık ayıracı SONDA duran işarettir; öndekiler binlik ayıracıdır.
  // ("1.234,56" Türkçe, "1,234.56" İngilizce — ikisi de gelebiliyor.)
  if (sonNokta >= 0 && sonVirgul >= 0) {
    ham = sonVirgul > sonNokta ? ham.replace(/\./g, "").replace(",", ".") : ham.replace(/,/g, "");
  } else if (sonNokta >= 0 || sonVirgul >= 0) {
    // TEK ayıraç var ve hangisi olduğu belirsiz: "2.500" Türkçe'de iki bin
    // beş yüz, İngilizce'de iki buçuk. Ayraçtan sonra TAM ÜÇ basamak varsa
    // binlik sayılıyor — kimse iki buçuğu "2.500" diye yazmaz, ama iki bin
    // beş yüzü herkes böyle yazar. Bunu bilmeden "2.5" kabul etmek, 2.500 TL'lik
    // bir faturayı deftere 2,50 TL olarak yazmak demekti.
    const yer = Math.max(sonNokta, sonVirgul);
    const basamak = ham.length - yer - 1;
    ham = basamak === 3 && yer > 0 ? ham.slice(0, yer) + ham.slice(yer + 1) : ham.replace(",", ".");
  }
  const sayi = Number(ham);
  return Number.isFinite(sayi) ? sayi : null;
}

const SIMGE_PARA: Record<string, string> = { "₺": "TRY", TL: "TRY", $: "USD", "€": "EUR", "£": "GBP" };

function paraBirimi(deger: unknown): string {
  if (typeof deger !== "string") return "TRY";
  const ham = deger.trim().toUpperCase();
  if (SIMGE_PARA[ham]) return SIMGE_PARA[ham];
  return /^[A-Z]{3}$/.test(ham) ? ham : "TRY";
}

function metin(deger: unknown, tavan = 200): string | undefined {
  if (typeof deger !== "string") return undefined;
  const temiz = deger.trim();
  return temiz ? temiz.slice(0, tavan) : undefined;
}

export class FaturaOkunamadi extends Error {}

/**
 * Modelin yanıtını doğrulanmış bir faturaya çevirir.
 *
 * Doğrulama SERT: eksik ya da anlamsız her alan işi düşürüyor. Sebep, akışın
 * sonunda deftere gerçek bir para satırı yazılması — "0 TL" ya da "bugün"
 * gibi sessiz varsayılanlar, kullanıcının hiç fark etmeyeceği yanlış kayıtlar
 * üretirdi. Reddedilen belge elle girilebiliyor; yanlış kayıt geri alınmıyor.
 */
export function faturaCevabiniCoz(yanit: string): OkunanFatura {
  const ham = jsonuAyikla(yanit) as Record<string, unknown> | null;
  if (!ham || typeof ham !== "object") throw new FaturaOkunamadi("Belge okunamadı: yanıt anlaşılamadı."); // dil:anahtar

  const confidence = typeof ham.confidence === "number" ? ham.confidence : 0;
  if (confidence < GUVEN_ESIGI) {
    throw new FaturaOkunamadi(
      "Belge yeterince okunamadı. Daha net bir fotoğraf deneyebilir ya da faturayı elle girebilirsin." // dil:anahtar
    );
  }

  const amount = sayiyaCevir(ham.amount);
  if (amount === null || amount <= 0) {
    throw new FaturaOkunamadi("Belgedeki tutar okunamadı. Faturayı elle girebilirsin."); // dil:anahtar
  }

  const issueDate = metin(ham.issueDate, 10);
  if (!issueDate || !ISO_TARIH.test(issueDate) || Number.isNaN(Date.parse(issueDate))) {
    throw new FaturaOkunamadi("Belgedeki tarih okunamadı. Faturayı elle girebilirsin."); // dil:anahtar
  }

  return {
    // Tanınmayan her şey "alınan": gider yönü yanlış olursa kasada eksi yerine
    // artı görünür ve hata toplamlarda gizlenir. Fişlerin ezici çoğunluğu da
    // zaten alınan faturadır.
    direction: ham.direction === "issued" ? "issued" : "received",
    amount,
    currency: paraBirimi(ham.currency),
    issueDate,
    invoiceNo: metin(ham.invoiceNo, 60),
    counterpartyName: metin(ham.counterpartyName, 150),
    category: metin(ham.category, 60),
    description: metin(ham.description, 300),
    confidence,
  };
}
