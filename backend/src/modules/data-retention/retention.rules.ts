/**
 * Saklama süreleri — gizlilik politikasında verilen sözün TEK kaynağı.
 *
 * NEDEN AYRI VE SAF BİR DOSYA: bu sayılar hukuki bir taahhüt. Politikada
 * "en fazla 90 gün" yazıp kodda 180 gün tutmak, tutulamayan bir söz demektir ve
 * bir denetimde en pahalıya patlayan şey budur. Sayılar burada tek yerde durur,
 * testi (retention.rules.test.ts) politikadaki değerlerle karşılaştırır ve
 * silme işini yapan processor yalnızca buradan okur.
 *
 * DEĞİŞTİRİRKEN: bir süreyi burada değiştiriyorsan gizlilik politikasının §12
 * bölümünü de değiştir — iki yer: apps/web/src/lib/legal/privacyPolicy.ts ve
 * landing/src/i18n/legal.ts.
 */

export const SAKLAMA_GUN = {
  /**
   * Lio sohbetleri. Sayaç son mesajdan (updated_at) işler; süresi dolan sohbet
   * mesajlarıyla birlikte silinir.
   *
   * Kredi/kullanım kayıtları BU SİLMEDEN ETKİLENMEZ: ai_usage satırlarındaki
   * conversation_id "on delete set null" — fatura izi kalır, konuşmanın içeriği
   * gider. Politikadaki "kredi kayıtları mesajlarınızın içeriğini barındırmaz"
   * cümlesi tam olarak bunu anlatıyor.
   */
  aiSohbet: 90,

  /** WhatsApp mesaj gövdeleri. Kişi ve konuşma başlığı kalır, içerik gider. */
  whatsappMesaj: 90,

  /**
   * WAHA'dan gelen ham webhook olayları. İşlendikten sonra tek işlevi
   * mükerrer olayı elemek; payload'ında mesajın TAM METNİ duruyor, yani
   * mesajın kendisini 90 gün sonra silip ham kopyasını bırakmak silmeyi
   * anlamsız kılardı. Bu yüzden çok daha kısa.
   */
  whatsappWebhookOlayi: 7,

  /**
   * Süresi dolmuş tek kullanımlık jetonlar (e-posta doğrulama, parola
   * sıfırlama, WhatsApp bağlama kodu). Süre dolduktan SONRA bu kadar bekleriz;
   * sıfır değil, çünkü "bu bağlantının süresi dolmuş" mesajını verebilmek için
   * kaydın bir süre daha durması gerekiyor.
   */
  suresiDolmusJeton: 30,
} as const;

export type SaklamaAlani = keyof typeof SAKLAMA_GUN;

const GUN_MS = 24 * 60 * 60 * 1000;

/**
 * Bir alanın kesim tarihi: bundan ESKİ kayıtlar silinir.
 *
 * `simdi` dışarıdan veriliyor ki test saatin geçmesini beklemek zorunda
 * kalmasın (aynı desen: planning.dates.ts).
 */
export function kesimTarihi(alan: SaklamaAlani, simdi: Date): Date {
  return new Date(simdi.getTime() - SAKLAMA_GUN[alan] * GUN_MS);
}

/** Postgres'e gidecek biçim. Tüm zaman sütunları UTC saklanıyor. */
export function kesimTarihiIso(alan: SaklamaAlani, simdi: Date): string {
  return kesimTarihi(alan, simdi).toISOString();
}
