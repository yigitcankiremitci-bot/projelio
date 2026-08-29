import { Injectable, Logger } from "@nestjs/common";
import type { CreditOrder } from "./ai-credit-orders.service";

/**
 * ÖDEME SAĞLAYICI BAĞLANTI NOKTASI — HENÜZ BAĞLI DEĞİL.
 *
 * Şu an bilinçli olarak boş: şirket kurulumu tamamlanıp bir ödeme kuruluşuyla
 * (iyzico, PayTR, Stripe…) anlaşma yapıldıktan sonra doldurulacak. Kredi yükleme
 * akışının GERİ KALANI çalışır durumda; eksik olan yalnızca burası.
 *
 * NEDEN ŞİMDİDEN BİR SINIF: sipariş akışının her yerine "ödeme yok" koşulu
 * serpiştirmek yerine eksiklik TEK noktada duruyor. Entegrasyon geldiğinde
 * değişecek dosya sayısı bir: burası (artı sağlayıcının callback'ini karşılayacak
 * bir uç). Sipariş kayıtları, kredi yükleme ve çift-yükleme korumaları hazır.
 *
 * BAĞLARKEN YAPILACAKLAR:
 *   1. `isConfigured()` gerçek yapılandırmayı (API anahtarı vb.) kontrol etsin.
 *   2. `createCheckout()` sağlayıcıda ödeme oturumu açıp kullanıcıyı yönlendireceğin
 *      URL'yi dönsün; sağlayıcı referansını ai_credit_orders.payment_reference'a yaz.
 *   3. Sağlayıcının callback/webhook'unu karşılayan uçta İMZAYI DOĞRULA, sonra
 *      AiCreditOrdersService.markPaid(orderId, sistemKullanıcısı, { provider, reference })
 *      çağır. markPaid zaten idempotent — webhook'un birden çok kez gelmesi güvenli.
 *   4. Ödeme reddedilirse siparişi 'failed' durumuna geçir.
 *
 * UYARI: Buraya "test modunda hep başarılı dön" gibi bir kısayol EKLEME. Ödemesi
 * doğrulanmamış bir siparişin kredi yüklemesi, ücretsiz kredi dağıtmak demektir.
 */
@Injectable()
export class AiPaymentProvider {
  private readonly logger = new Logger(AiPaymentProvider.name);

  /** Ödeme entegrasyonu bağlandı mı. Bağlanana kadar arayüz havale yönergesi gösterir. */
  isConfigured(): boolean {
    return false;
  }

  /**
   * Ödeme oturumu açar ve kullanıcının yönlendirileceği URL'yi döner.
   * Entegrasyon bağlanana kadar null döner — çağıran taraf bunu "ödeme otomatik
   * alınamıyor, elden/havale ile devam" diye yorumlar.
   */
  async createCheckout(order: CreditOrder): Promise<{ redirectUrl: string } | null> {
    if (!this.isConfigured()) {
      this.logger.log(`Ödeme sağlayıcısı bağlı değil; sipariş ${order.id} elle onay bekleyecek.`);
      return null;
    }
    // Entegrasyon buraya gelecek.
    throw new Error("Ödeme sağlayıcısı yapılandırıldı ama createCheckout uygulanmadı.");
  }
}
