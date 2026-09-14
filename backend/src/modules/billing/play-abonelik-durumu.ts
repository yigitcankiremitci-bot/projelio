import type { AbonelikDurumu } from "./billing.service";
import type { PlayAbonelikDurumu } from "./google-play.client";

/**
 * Google Play'in abonelik durumunu bizim hak modelimize çevirir.
 *
 * NEDEN AYRI DOSYA: karar saf, ama servisin kendisi NestJS dekoratörleri
 * taşıyor ve bu projenin test koşucusu (Node'un tip silmeli yerleşiği, bkz.
 * scripts/run-tests.mjs) dekoratörlü bir dosyayı içe aktaramıyor. Servisin
 * içinde kaldığı sürece bu fonksiyon TEST EDİLEMİYORDU — oysa parayla ilgili
 * en ince kararlardan biri burada veriliyor.
 *
 * İPTAL İKİ ANLAMA GELİYOR ve ayrımı burası yapıyor: kullanıcı iptal etmiş ama
 * ödediği dönem henüz bitmemişse erişim SÜRER ("canceled"); dönem bittiyse
 * erişim yoktur ("expired"). Karıştırmak ya parasını ödediği süreyi gasbetmek
 * ya da bedava erişim vermek olurdu.
 *
 * Tanımadığı bir durum için null döner — sessizce "expired" saymak, Google yeni
 * bir durum eklediğinde ödeme yapan müşterinin erişimini kesebilirdi.
 */
export function playAbonelikDurumu(
  durum: Pick<PlayAbonelikDurumu, "state" | "expiryTime">,
  now: Date
): AbonelikDurumu | null {
  if (durum.state === "SUBSCRIPTION_STATE_ACTIVE") return "active";
  // Ödeme alınamadı ama Google yeniden deniyor: erişim sürüyor (bkz. CLAUDE.md,
  // past_due hak vermeye devam eder).
  if (durum.state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") return "past_due";
  if (durum.state === "SUBSCRIPTION_STATE_PENDING") return "pending";
  if (durum.state === "SUBSCRIPTION_STATE_CANCELED") {
    return durum.expiryTime && durum.expiryTime.getTime() > now.getTime() ? "canceled" : "expired";
  }
  if (
    [
      "SUBSCRIPTION_STATE_EXPIRED",
      "SUBSCRIPTION_STATE_ON_HOLD",
      "SUBSCRIPTION_STATE_PAUSED",
      "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
    ].includes(durum.state)
  ) {
    return "expired";
  }
  return null;
}
