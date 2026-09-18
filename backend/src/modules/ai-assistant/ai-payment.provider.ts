import { Injectable, Logger } from "@nestjs/common";
import { PayTRClient } from "../billing/paytr.client";
import type { CreditOrder } from "./ai-credit-orders.service";

/**
 * ÖDEME SAĞLAYICI BAĞLANTI NOKTASI — SAĞLAYICI PayTR.
 *
 * 2026-09-18: PayTR bağlandı. Bu sınıf artık yalnızca "ödeme açık mı" sorusunu
 * yanıtlıyor; ödeme oturumunu açan uç BillingModule'de
 * (POST /billing/paytr/lio-bakiyesi/:orderId, PayTROdemeService).
 *
 * NEDEN BURADA DEĞİL: oturum açmak için sipariş, kullanıcı ve PayTR istemcisi
 * bir arada gerekiyor; o mantığı buraya taşımak AiAssistantModule ile
 * BillingModule arasında modül DÖNGÜSÜ yaratırdı. Arayüz siparişi açtıktan
 * sonra ödeme ucunu ayrıca çağırıyor.
 *
 * PayTR anahtarları tanımsızsa isConfigured() false döner ve akış eski hâline
 * geri düşer: sipariş açılır, ödeme elden/havale alınır, yönetici onaylar.
 * Bu geri düşüş bilerek korunuyor — anahtarı olmayan bir kurulumda ekranın
 * kırılması yerine eski yol işlemeye devam etsin.
 *
 * UYARI: Buraya "test modunda hep başarılı dön" gibi bir kısayol EKLEME. Ödemesi
 * doğrulanmamış bir siparişin kredi yüklemesi, ücretsiz kredi dağıtmak demektir.
 * Bakiyeyi yükleyen tek yol, imzası doğrulanmış PayTR bildirimidir
 * (billing/paytr-odeme.service.ts).
 */
@Injectable()
export class AiPaymentProvider {
  private readonly logger = new Logger(AiPaymentProvider.name);

  constructor(private paytr: PayTRClient) {}

  /**
   * Ödeme entegrasyonu bağlandı mı. Anahtarlar tanımsızsa arayüz eski davranışa
   * döner: sipariş açılır, ödeme elden/havale alınıp yönetici onaylar.
   */
  isConfigured(): boolean {
    return this.paytr.isConfigured();
  }

  /**
   * HER ZAMAN null DÖNER — bu bir eksiklik değil, bilinçli bir sınır.
   *
   * PayTR'nin ödeme formu siparişten sonra AYRI bir uçtan açılıyor
   * (POST /billing/paytr/lio-bakiyesi/:orderId). Oturumu burada açmak, bu
   * modülün BillingModule'e bağımlı olmasını gerektirirdi; BillingModule zaten
   * bu modülü içe aktardığı için sonuç modül döngüsü olurdu.
   *
   * Sipariş oluşturma ucunun sözleşmesi korunsun diye imza duruyor: null,
   * çağıran tarafta "sipariş açıldı, ödeme adımını arayüz başlatacak" demek.
   */
  async createCheckout(order: CreditOrder): Promise<{ redirectUrl: string } | null> {
    if (!this.isConfigured()) {
      this.logger.log(`Ödeme sağlayıcısı bağlı değil; sipariş ${order.id} elle onay bekleyecek.`);
    }
    return null;
  }
}
