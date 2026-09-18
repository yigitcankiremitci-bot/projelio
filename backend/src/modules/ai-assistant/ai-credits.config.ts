import { catalogPricing, defaultModelForTier, PROVIDER_CATALOG } from "./providers/providers.config";
import { tlFiyat } from "@projelio/shared";
import { PLANS } from "../billing/billing.plans";

/**
 * Projelio AI kredi ekonomisi.
 *
 * Zincir şu şekilde işler:
 *   token kullanımı -> ham maliyet (USD) -> + komisyon -> satış bedeli (USD) -> kredi
 *
 * Projelio, Anthropic'ten token bazlı maliyetle hizmet alır ve kullanıcıya soyut
 * "Projelio Kredisi" olarak, üzerine komisyon ekleyerek satar. Kullanıcı token/dolar
 * görmez; yalnızca kredi bakiyesini görür.
 */

/** Anthropic liste fiyatları — milyon token başına USD. */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Fiyatlar Anthropic tarafından güncellenebilir; model eklerken burayı güncelleyin.
 * Listede olmayan bir model kullanılırsa DEFAULT_PRICING geçerli olur (marjı korumak
 * için kasıtlı olarak yüksek tutulmuştur).
 *
 * ÖNEMLİ: Bu tablo Anthropic'in canlı fiyatlarını OTOMATİK çekmez. Anthropic fiyat
 * değiştirirse burası (veya AI_PRICE_OVERRIDE ortam değişkeni) güncellenmelidir;
 * aksi halde kâr marjı hesabı yanlış olur.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Fiyatların TEK KAYNAĞI sağlayıcı kataloğu: her model orada zaten fiyatıyla
  // birlikte tanımlı, burada ikinci bir liste tutmak ikisinin ayrışmasına ve
  // müşteriden yanlış kredi kesilmesine yol açardı.
  ...catalogPricing(),

  // Katalogda karşılığı olmayan takma adlar. Sürüm sabitlenmemiş model adı
  // (`claude-haiku-4-5`) eski kayıtlarda ve ANTHROPIC_MODEL değerinde geçebiliyor.
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
};

export const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 15, outputPerMillion: 75 };

/**
 * Prompt caching çarpanları (standart girdi fiyatına göre):
 * önbelleğe yazma 1,25× — önbellekten okuma 0,10×.
 */
export const CACHE_WRITE_MULTIPLIER = Number(process.env.AI_CACHE_WRITE_MULTIPLIER ?? 1.25);
export const CACHE_READ_MULTIPLIER = Number(process.env.AI_CACHE_READ_MULTIPLIER ?? 0.1);
/** 1 saatlik önbelleğe yazma 2× (5 dakikalığın 1,25× yerine). */
export const CACHE_WRITE_1H_MULTIPLIER = Number(process.env.AI_CACHE_WRITE_1H_MULTIPLIER ?? 2);

/**
 * Fiyatları kod değiştirmeden güncelleyebilmek için isteğe bağlı override.
 * Biçim: AI_PRICE_OVERRIDE='{"claude-haiku-4-5-20251001":{"inputPerMillion":1,"outputPerMillion":5}}'
 */
function readPriceOverride(): Record<string, ModelPricing> {
  const raw = process.env.AI_PRICE_OVERRIDE;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, ModelPricing>;
  } catch {
    return {};
  }
}

const PRICE_OVERRIDE = readPriceOverride();

/** Projelio komisyon oranı. 0.20 = %20. */
export const COMMISSION_RATE = Number(process.env.AI_COMMISSION_RATE ?? 0.2);

/**
 * 1 Projelio Kredisi'nin USD karşılığı (satış bedeli üzerinden).
 * 0.0001 => 10.000 kredi ≈ 1 USD'lik satış bedeli.
 * Bu değer, kullanıcının gördüğü sayıların "okunabilir" büyüklükte olmasını sağlar:
 * Haiku ile tipik bir asistan turu yaklaşık 40-80 kredi tutar.
 */
export const CREDIT_UNIT_USD = Number(process.env.AI_CREDIT_UNIT_USD ?? 0.0001);

/**
 * Bir kredi tutmasının (hold) yaşam süresi.
 *
 * Süreç tur ortasında çökerse tutma açık kalır ve kullanıcının kredisi bloke olurdu;
 * bu süreyi geçen tutmalar bir sonraki rezervasyonda silinir. Değer, en uzun makul
 * asistan koşusundan (duraklatma + devam dahil) uzun tutulmalı.
 */
export const HOLD_TTL_SECONDS = Number(process.env.AI_HOLD_TTL_SECONDS ?? 900);

/** Bakiye bunun altındayken hiçbir istek başlatılmaz (mutlak taban). */
export const MIN_BALANCE_TO_START = Number(process.env.AI_MIN_BALANCE_TO_START ?? 20);

/**
 * Sistem promptu + araç şemaları + günlük bağlamın kabaca token karşılığı.
 *
 * Bir turun bedelini ÖNDEN kestirmek için kullanılır (bkz. AiAssistantService.reserveFor).
 *
 * GERÇEK ÖLÇÜM (2026-09-16, canlı kredi defteri): web kanalında ~50.100, WhatsApp'ta
 * ~45.700 token. Aşağıdaki karakter hesabı yarıya yakın az tahmin ediyordu — Türkçe
 * metin ve JSON şeması 3,5 karakter/token'dan çok daha kötü bölünüyor. Bu yüzden
 * "tahmin 600'ün altında, sormadan geç" diyen kontrol 760 kredilik ilk turları
 * yakalayamıyordu. Yeniden ölçmek için ai_credit_transactions'ta yeni bir sohbetin
 * ilk satırındaki input_tokens'a bakın.
 *
 * Eski ölçüm (2026-09, tablodan toplu içe aktarma araçları eklendikten sonra):
 * araç şemaları JSON olarak 51.629 karakter (≈14.750 token), statik sistem promptu
 * 24.442 karakter (≈7.000 token), günlük bağlam ~800 token → ≈22.550. Varsayılan
 * bunun biraz üstünde tutuldu ki yeni bir araç eklendiğinde pay hemen erimesin.
 * Prompt/araç listesi belirgin şekilde büyürse burayı yeniden ölçün — ölçmenin
 * yolu: `JSON.stringify(AI_TOOLS).length` ve STATIC_SYSTEM_PROMPT'un uzunluğu,
 * ikisi de 3,5 karakter/token ile bölünür.
 *
 * ESKİ DEĞER 10.000'Dİ ve ölçümün gerisinde kalmıştı: araç listesi 63'ten 90'a,
 * sistem promptu iki katına çıkmıştı. Az tahmin, kullanıcının eksi bakiyeye
 * düşmesi demek. Karşılığında bir turun ÖNDEN tutulan bedeli büyüdü; istekler
 * "devam edeyim mi?" eşiğine daha erken çarpıyorsa AI_BASE_PROMPT_TOKENS ile
 * düşürülebilir (bkz. aşağıdaki not).
 *
 * Bu önek artık kullanıcıya her zaman önbellek OKUMA fiyatından yansıtılıyor (bkz.
 * calculateUsageCost), dolayısıyla tahminler de öyle hesaplar — önbellek ıskalasa
 * bile kullanıcının ödeyeceği değişmez. Önbelleği hiç desteklemeyen sağlayıcıda
 * önek tam fiyattır ama o sağlayıcıların modelleri zaten ~10 kat ucuz.
 */
export const BASE_PROMPT_TOKENS = Number(process.env.AI_BASE_PROMPT_TOKENS ?? 52_000);

/**
 * Yeni kullanıcılara ilk kullanımda tanımlanan deneme kredisi (0 = kapalı).
 * 2.000 kredi ≈ 14 asistan işlemi; Projelio'ya maliyeti ≈ 0,17 USD.
 */
export const WELCOME_CREDITS = Number(process.env.AI_WELCOME_CREDITS ?? 2000);

export function getPricing(model: string): ModelPricing {
  return PRICE_OVERRIDE[model] ?? MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

export interface UsageCost {
  costUsd: number;
  chargedUsd: number;
  credits: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Önbelleğe yazılan token'lar (standart girdinin 1,25 katı fiyatlanır). */
  cacheWriteTokens?: number;
  /** Önbellekten okunan token'lar (standart girdinin 0,10 katı fiyatlanır). */
  cacheReadTokens?: number;
  /**
   * PAYLAŞILAN önekin (araç şemaları + statik sistem promptu) 1 saatlik önbelleğe
   * yazımı. Maliyete gerçek fiyatıyla (2×) girer ama kullanıcıya OKUMA fiyatından
   * yansıtılır — bkz. calculateUsageCost.
   */
  sharedCacheWriteTokens?: number;
}

/**
 * Token kullanımını krediye çevirir.
 *
 * Önbellek token'ları ayrı fiyatlandığı için ayrı hesaplanır — bunları normal girdi
 * gibi saymak maliyeti olduğundan yüksek gösterir ve kullanıcıdan fazla kredi keser.
 * Kredi sayısı yukarı yuvarlanır (2 ondalık) ki küsurattan Projelio zarar etmesin.
 *
 * `costUsd` GERÇEK maliyettir (marj takibi ve harcama uyarıları buna bakar);
 * `chargedUsd` ve `credits` kullanıcıya yansıyandır. İkisi yalnızca paylaşılan
 * önek yazımında ayrışır: o önek (~50 bin token) tüm kullanıcılar için aynı ve
 * Anthropic tarafında ortak önbellekte duruyor. Bedelini, önbellek soğukken
 * denk gelen kullanıcıya yüklemek kredi faturasını şansa bağlıyordu — 2026-09-16'da
 * bir test kullanıcısı iki mesaja ~1.460 kredi ödedi, birkaç dakika sonra aynı
 * mesajlar 80'er kredi tuttu. Yazımın farkını Projelio üstleniyor; 1 saatlik
 * ömür sayesinde bu, trafiğe göre saatte en fazla bir kez oluyor.
 */
export function calculateUsageCost(model: string, usage: TokenUsage): UsageCost {
  const pricing = getPricing(model);
  const perInputToken = pricing.inputPerMillion / 1_000_000;
  const shared = usage.sharedCacheWriteTokens ?? 0;

  const commonUsd =
    usage.inputTokens * perInputToken +
    (usage.cacheWriteTokens ?? 0) * perInputToken * CACHE_WRITE_MULTIPLIER +
    (usage.cacheReadTokens ?? 0) * perInputToken * CACHE_READ_MULTIPLIER +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;

  const costUsd = commonUsd + shared * perInputToken * CACHE_WRITE_1H_MULTIPLIER;
  const billedUsd = commonUsd + shared * perInputToken * CACHE_READ_MULTIPLIER;
  const chargedUsd = billedUsd * (1 + COMMISSION_RATE);
  const credits = Math.ceil((chargedUsd / CREDIT_UNIT_USD) * 100) / 100;

  return {
    costUsd: Number(costUsd.toFixed(6)),
    chargedUsd: Number(chargedUsd.toFixed(6)),
    credits,
  };
}

// --- Model kademeleri ----------------------------------------------------
/**
 * Lio her işi en ucuz modelle yapmaya çalışır; ama bazı işler (çok adımlı planlama,
 * belirsiz bir isteği doğru yorumlama, uzun analiz) küçük modelde ya yarım kalır ya
 * da defalarca tur atarak sonunda DAHA pahalıya gelir. Bu yüzden kademe seçimi
 * kullanıcıya bırakılır: kredi bedelini o ödüyor, kararı da o versin.
 *
 * `costMultiplier` yalnızca arayüzde gösterilen kaba bir orandır — gerçek ücret
 * her zaman MODEL_PRICING üzerinden token'lardan hesaplanır.
 */
export type ModelTier = "fast" | "smart" | "max";

export interface ModelTierInfo {
  tier: ModelTier;
  model: string;
  label: string;
  description: string;
  costMultiplier: number;
}

/**
 * Kademe tanımları. `model` alanı ARTIK BURADA SABİT DEĞİL: gerçekte kullanılan
 * model, etkin sağlayıcıya göre çalışma anında seçilir (bkz. provider-registry).
 * Buradaki değer yalnızca sağlayıcı katmanı hiçbir aday bulamazsa geçerli olan
 * son çare ve geriye dönük uyumluluk içindir.
 */
export const MODEL_TIERS: Record<ModelTier, ModelTierInfo> = {
  fast: {
    tier: "fast",
    model: anthropicModelFor("fast"),
    label: "Hızlı",
    description: "Günlük işler: listeleme, görev ekleme, durum güncelleme.",
    costMultiplier: 1,
  },
  smart: {
    tier: "smart",
    model: anthropicModelFor("smart"),
    label: "Dengeli",
    description: "Çok adımlı planlama, analiz ve belirsiz isteklerin yorumlanması.",
    costMultiplier: 3,
  },
  max: {
    tier: "max",
    model: anthropicModelFor("max"),
    label: "Güçlü",
    description: "En zor işler. Belirgin şekilde pahalıdır; yalnızca gerektiğinde seçin.",
    costMultiplier: 15,
  },
};

/** Kademenin Anthropic karşılığı — kademe tablosunun son çare varsayılanı. */
function anthropicModelFor(tier: ModelTier): string {
  const anthropic = PROVIDER_CATALOG.find((p) => p.id === "anthropic")!;
  return defaultModelForTier(anthropic, tier)!.id;
}

export const DEFAULT_TIER: ModelTier = "fast";

export function resolveTier(value?: string | null): ModelTierInfo {
  const key = (value ?? "").trim() as ModelTier;
  return MODEL_TIERS[key] ?? MODEL_TIERS[DEFAULT_TIER];
}

/**
 * Bir istek bu kredi eşiğini aşacaksa Lio durur ve kullanıcıya "devam edeyim mi?"
 * diye sorar. Amaç, kullanıcının haberi olmadan tek bir mesajın yüzlerce kredi
 * yakmasını engellemek: eşiğe kadar harcanan zaten faturalanır, ötesi onaya bağlıdır.
 */
export const CREDIT_CONFIRM_THRESHOLD = Number(process.env.AI_CREDIT_CONFIRM_THRESHOLD ?? 600);

// --- Ses çözümleme -------------------------------------------------------
/**
 * Transkripsiyonun dakika başına liste fiyatı (USD).
 *
 * Anthropic token fiyatlarından ayrı durur: sağlayıcı farklı (bkz.
 * AiTranscriptionService) ve birim token değil SÜREdir. Komisyon oranı ve kredi
 * birimi ortaktır — kullanıcı yine tek bir "kredi" görür.
 */
export const TRANSCRIPTION_USD_PER_MINUTE = Number(process.env.AI_TRANSCRIPTION_USD_PER_MINUTE ?? 0.006);

/**
 * Ses dosyasının saniyesi başına kaç bayt düştüğüne dair varsayım (≈96 kbps).
 *
 * Süreyi çözümlemeden önce bilmenin tek yolu bu: dosyanın gerçek süresi ancak
 * transkripsiyondan SONRA öğreniliyor, oysa bakiye kontrolü ÖNCE yapılmalı.
 * Değer, tipik sesli notların (mp3/m4a) altında tutuldu; böylece tahmin gerçek
 * süreyi biraz AŞAR ve kullanıcı borç bakiyesine düşmez.
 */
export const AUDIO_BYTES_PER_SECOND = Number(process.env.AI_AUDIO_BYTES_PER_SECOND ?? 12_000);

/** Dosya boyutundan çözümleme bedelinin ihtiyatlı tahmini. */
export function estimateTranscriptionCredits(sizeBytes: number): number {
  return calculateTranscriptionCost(sizeBytes / AUDIO_BYTES_PER_SECOND).credits;
}

/**
 * Seslendirmenin (TTS) milyon karakter başına liste fiyatı.
 *
 * Çözümlemeden farkı birim: orada SÜRE, burada KARAKTER. Karakter sayısı istekten
 * önce tam olarak bilindiği için bedel tahmin değil, KESİN hesaplanabiliyor —
 * kullanıcıya "bu yanıt şu kadar tutacak" demek mümkün.
 */
export const TTS_USD_PER_MILLION_CHARS = Number(process.env.AI_TTS_USD_PER_MILLION_CHARS ?? 15);

export function calculateSpeechCost(chars: number): UsageCost {
  const costUsd = (Math.max(chars, 0) / 1_000_000) * TTS_USD_PER_MILLION_CHARS;
  const chargedUsd = costUsd * (1 + COMMISSION_RATE);
  const credits = Math.ceil((chargedUsd / CREDIT_UNIT_USD) * 100) / 100;
  return {
    costUsd: Number(costUsd.toFixed(6)),
    chargedUsd: Number(chargedUsd.toFixed(6)),
    credits,
  };
}

export function calculateTranscriptionCost(durationSeconds: number): UsageCost {
  const minutes = Math.max(durationSeconds, 0) / 60;
  const costUsd = minutes * TRANSCRIPTION_USD_PER_MINUTE;
  const chargedUsd = costUsd * (1 + COMMISSION_RATE);
  const credits = Math.ceil((chargedUsd / CREDIT_UNIT_USD) * 100) / 100;
  return {
    costUsd: Number(costUsd.toFixed(6)),
    chargedUsd: Number(chargedUsd.toFixed(6)),
    credits,
  };
}

/**
 * HARCAMA UYARISI EŞİKLERİ.
 *
 * Bunlar kullanıcıyı değil, İŞLETMEYİ (yöneticiyi) uyarır. Kullanıcı tarafındaki
 * eşik ayrı: CREDIT_CONFIRM_THRESHOLD, pahalı bir Lio koşusundan önce kullanıcıya
 * "devam edeyim mi" diye sorar. Buradakiler ise Anthropic hesabındaki gerçek
 * paranın bitmesini önceden haber verir — bakiye biterse Lio TÜM kullanıcılar
 * için durur.
 */

/** Bu tutarın altına inince "azalıyor" uyarısı (USD). */
export const BALANCE_WARNING_USD = Number(process.env.AI_BALANCE_WARNING_USD ?? 15);

/** Bu tutarın altına inince "kritik" uyarısı (USD). */
export const BALANCE_CRITICAL_USD = Number(process.env.AI_BALANCE_CRITICAL_USD ?? 5);

/** Günlük harcama, önceki 7 günün ortalamasının bu katına çıkarsa sıçrama uyarısı. */
export const SPEND_SPIKE_MULTIPLIER = Number(process.env.AI_SPEND_SPIKE_MULTIPLIER ?? 3);

/**
 * Sıçrama uyarısı için günlük harcama tabanı (USD).
 * Küçük sayılarda oran yanıltıcı: 0,02'den 0,10'a çıkmak "5 kat" ama önemsiz.
 */
export const SPEND_SPIKE_FLOOR_USD = Number(process.env.AI_SPEND_SPIKE_FLOOR_USD ?? 1);

// --- Kredi paketleri (self-servis yükleme) -------------------------------
/*
 * KUR BURADA YOK. Eskiden AI_USD_TRY_RATE (varsayılan 42) ile ayrı bir kur
 * tutuluyordu; abonelikler ise admin panelindeki kurla fiyatlanıyordu. İki kur
 * iki farklı fiyat demekti. Artık tek kur: billing_config.usd_try_rate (Admin >
 * Paketler ve ödeme), okuyan yer common/usd-try-kuru.ts.
 */

export interface CreditPackage {
  key: string;
  label: string;
  credits: number;
  /** Sipariş anında dondurulan ₺ fiyat (bkz. ai_credit_orders.price_amount). */
  priceTry: number;
  description: string;
}

/**
 * EK BAKİYE — ABONELİĞİN YERİNE DEĞİL, YANINA.
 *
 * Kurgu: abone her ay paketinin Lio Bakiyesini alır. Ek bakiye bittiğinde
 * başvurulan pahalı bir seçenektir; düzenli ihtiyaçta bir üst pakete geçmek her
 * zaman daha ucuz olmalı.
 *
 * ESKİ HATA: paket fiyatı Lio'nun iç birim değerinden (CREDIT_UNIT_USD) türetiliyordu
 * ve aboneliğin 2,5 KAT ALTINDAYDI (1.000 birim: ek paket 0,10 $, Starter 0,25 $).
 * Abone olmadan 130 ₺'ye Lio kullanmak mümkündü; abonelik anlamsızlaşıyordu.
 *
 * ŞİMDİ: birim fiyatı en pahalı aboneliğin (birim başına) EK_BAKIYE_CARPANI katı,
 * abonelik kataloğundan türetiliyor — abonelik fiyatı değişirse ek bakiye de
 * kendiliğinden pahalı kalır. Paketler bilerek KÜÇÜK: büyük ek paketler üst
 * pakete geçmeyi gereksiz kılardı.
 */
export const EK_BAKIYE_CARPANI = 1.5;

/** Aboneliklerin en pahalı birim fiyatı (USD / birim). Ek bakiye bunun üstünde olmak zorunda. */
export function abonelikEnYuksekBirimUsd(): number {
  return Math.max(
    ...PLANS.filter((p) => p.priceUsdMonthly > 0 && p.monthlyCredits > 0).map((p) => p.priceUsdMonthly / p.monthlyCredits)
  );
}

const PACKAGE_SIZES: { key: string; label: string; credits: number; description: string }[] = [
  { key: "ek-10", label: "Ek 10.000", credits: 10_000, description: "Ay sonuna yetişmeyen birkaç gün için." },
  { key: "ek-25", label: "Ek 25.000", credits: 25_000, description: "Yoğun geçen bir ay için." },
  { key: "ek-50", label: "Ek 50.000", credits: 50_000, description: "Sık ihtiyaç duyuyorsan üst pakete geçmek daha ucuz." },
];

export const CREDIT_PACKAGE_KEYS = PACKAGE_SIZES.map((p) => p.key);

/** Ek bakiyenin USD fiyatı: birim × en pahalı abonelik birim fiyatı × çarpan. */
export function creditsToUsd(credits: number): number {
  return credits * abonelikEnYuksekBirimUsd() * EK_BAKIYE_CARPANI;
}

/**
 * Paketleri verilen kurla fiyatlar: USD × kur, 10 ₺'ye yukarı — aboneliklerle
 * AYNI TL hesabı (shared/tlFiyat). Kur yoksa (hiç kaydedilmemiş) boş liste döner:
 * uydurma bir kurla satış yapmaktansa satışı durdurmak doğru.
 */
export function creditPackagesAt(kur: number | null): CreditPackage[] {
  if (kur === null) return [];
  const sonuc: CreditPackage[] = [];
  for (const p of PACKAGE_SIZES) {
    const priceTry = tlFiyat(creditsToUsd(p.credits), kur);
    if (priceTry !== null) sonuc.push({ ...p, priceTry });
  }
  return sonuc;
}

export function findCreditPackage(key: string, kur: number | null): CreditPackage | undefined {
  return creditPackagesAt(kur).find((p) => p.key === key);
}
