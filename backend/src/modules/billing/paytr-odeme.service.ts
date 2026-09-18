import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { AiCreditOrdersService } from "../ai-assistant/ai-credit-orders.service";
import { getWebAppUrl } from "../../common/config/env";
import { describeError } from "../../common/network-errors";
import { PayTRClient } from "./paytr.client";
import { kurusaCevir, siparisNumarasiCoz, siparisNumarasiUret, telefonAlani } from "./paytr-imza";

/** Bildirim ucunun PayTR'ye vereceği yanıt. Gövde SADECE "OK" olmalı. */
export const BILDIRIM_YANITI = "OK";

/**
 * PayTR ile tek seferlik ödeme akışı (Lio Bakiyesi paketleri).
 *
 * AKIŞ:
 *   1. Kullanıcı paket seçer, sipariş 'pending_payment' olarak zaten açılmıştır
 *      (AiCreditOrdersService.create).
 *   2. Bu servis o sipariş için PayTR'den bir iframe token'ı alır.
 *   3. Müşteri kartını PayTR'nin formuna girer — kart bilgisi bize UĞRAMAZ.
 *   4. PayTR sonucu Bildirim URL'ye POST eder; bakiye O ANDA yüklenir.
 *
 * TARAYICININ DÖNMESİ ÖDEME KANITI DEĞİLDİR. Müşteri "başarılı" sayfasına
 * yönlendirilse bile bakiye yüklenmez; tek yetkili kaynak imzalı bildirimdir
 * (repo genelindeki kural, bkz. CLAUDE.md "Ödemenin kanıtı sağlayıcının
 * API'sidir").
 */
@Injectable()
export class PayTROdemeService {
  private readonly logger = new Logger(PayTROdemeService.name);

  constructor(
    private supabase: SupabaseService,
    private orders: AiCreditOrdersService,
    private paytr: PayTRClient
  ) {}

  /** Arayüzün ödeme formunu açabilmesi için iframe token'ı üretir. */
  async bakiyeOdemesiBaslat(
    userId: string,
    orderId: string,
    userIp: string
  ): Promise<{ token: string; iframeUrl: string; testMode: boolean }> {
    const siparisler = await this.orders.listMine(userId, 50);
    const siparis = siparisler.find((s) => s.id === orderId);
    // Başkasının siparişi de "bulunamadı" der: sipariş kimliğinin varlığını
    // doğrulamak, kimliklerin denenerek keşfedilmesine kapı açardı.
    if (!siparis) throw new NotFoundException("Sipariş bulunamadı.");
    if (siparis.status !== "pending_payment") {
      throw new ConflictException("Bu siparişin ödemesi zaten sonuçlanmış.");
    }

    const kullanici = await this.kullaniciBilgisi(userId);
    const merchantOid = siparisNumarasiUret(siparis.id);
    // Rota adı /settings/lio-units — "credits" DEĞİL. Yanlış yazılınca müşteri
    // ödemeyi tamamladıktan sonra var olmayan bir sayfada kalıyor (canlıda
    // yaşandı). Karşılığı: apps/web/src/App.tsx rota tablosu.
    const donusTabani = `${getWebAppUrl()}/settings/lio-units`;

    const sonuc = await this.paytr.odemeBaslat({
      merchantOid,
      email: kullanici.email,
      tutar: siparis.priceAmount,
      userIp,
      userName: kullanici.ad,
      userPhone: telefonAlani(kullanici.telefon),
      // Fatura adresi PayTR'de zorunlu ama bizde toplanmıyor ve ürün sanal.
      // Boş göndermek reddedilir, yer tutucu gidiyor. Fatura bilgisi toplamaya
      // başlanırsa BURASI gerçek adresle değişmeli (iyzico tarafındaki notun aynısı).
      userAddress: "Elektronik teslimat",
      sepet: [[`Lio Bakiyesi — ${siparis.credits} birim`, String(siparis.priceAmount), 1]],
      basariliUrl: `${donusTabani}?odeme=bekleniyor`,
      basarisizUrl: `${donusTabani}?odeme=basarisiz`,
    });

    return { ...sonuc, testMode: this.paytr.isTestMode() };
  }

  /**
   * PayTR'nin bildirimini işler.
   *
   * HER DURUMDA "OK" DÖNÜLÜR (uç bu servisin fırlatmadığına güvenir). PayTR OK
   * yanıtı alamazsa bildirimi başarısız sayar, siparişi "devam ediyor"da bırakır
   * ve PARAYI BİZE AKTARMAZ. Yani burada bir hata fırlatmak, müşteriden tahsil
   * edilmiş bir ödemeyi askıda bırakmak demek. Sorunlu durumlar log'a yazılır,
   * sipariş ödeme bekler hâlde kalır ve yönetici elle çözer.
   */
  async bildirimIsle(govde: Record<string, unknown>): Promise<void> {
    if (!this.paytr.bildirimDogrula(govde)) {
      // İmzası tutmayan istek PayTR'den gelmemiştir; hiçbir şey yapma.
      this.logger.warn(`PayTR bildirimi imza doğrulamasından geçemedi: ${String(govde?.merchant_oid ?? "-")}`);
      return;
    }

    const merchantOid = String(govde.merchant_oid ?? "");
    const orderId = siparisNumarasiCoz(merchantOid);
    if (!orderId) {
      // Bizim üretmediğimiz bir sipariş numarası. İmza geçtiyse mağaza doğru
      // ama numara başka bir akışa ait olabilir (ileride abonelik eklenince).
      this.logger.warn(`PayTR bildiriminde tanınmayan sipariş numarası: ${merchantOid}`);
      return;
    }

    if (String(govde.status ?? "") !== "success") {
      this.logger.log(
        `PayTR ödemesi başarısız (${merchantOid}): ${String(govde.failed_reason_msg ?? "sebep bildirilmedi")}`
      );
      // Sipariş 'pending_payment' kalır; kullanıcı yeniden deneyebilir.
      return;
    }

    const siparis = await this.siparisiBul(orderId);
    if (!siparis) {
      this.logger.error(`PayTR ödemesi alındı ama sipariş bulunamadı: ${merchantOid}`);
      return;
    }

    // TUTAR DOĞRULAMASI: imza tutarı da kapsıyor, yani buraya düşen bir
    // uyuşmazlık saldırı değil bizim hatamızdır (fiyat sipariş açıldıktan sonra
    // değişmiş olabilir). Yine de bakiye yüklenmez — eksik ödemeyle bakiye
    // vermek sessizce para kaybetmektir.
    const beklenen = kurusaCevir(siparis.priceAmount);
    const gelen = String(govde.total_amount ?? "");
    if (gelen !== beklenen) {
      this.logger.error(
        `PayTR ödeme tutarı siparişle uyuşmuyor (${merchantOid}): beklenen ${beklenen}, gelen ${gelen}. Bakiye YÜKLENMEDİ.`
      );
      return;
    }

    try {
      await this.orders.markPaid(orderId, null, { provider: "paytr", reference: merchantOid });
      this.logger.log(`PayTR ödemesi tamamlandı: ${merchantOid}`);
    } catch (hata) {
      // Aynı ödeme için birden fazla bildirim gelmesi OLAĞAN (PayTR ağ sorunu
      // olduğunda tekrar gönderiyor). markPaid ikinci çağrıda ConflictException
      // atar; bu bir hata değil, beklenen sonuçtur.
      if (hata instanceof ConflictException) {
        this.logger.log(`PayTR bildirimi tekrar geldi, sipariş zaten işlenmiş: ${merchantOid}`);
        return;
      }
      // Buraya düşen her kayıt, ödemesi alınmış ama bakiyesi yüklenmemiş bir
      // sipariş demektir. Yönetici panelindeki "bakiyeyi yeniden yükle" ile
      // çözülür (AiCreditOrdersService.retryCredit).
      this.logger.error(
        `PayTR ödemesi alındı ama bakiye yüklenemedi (${merchantOid}): ${describeError(hata)}`
      );
    }
  }

  private async siparisiBul(orderId: string): Promise<{ id: string; priceAmount: number } | null> {
    const { data, error } = await this.supabase.client
      .from("ai_credit_orders")
      .select("id, price_amount")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, priceAmount: Number(data.price_amount) } : null;
  }

  private async kullaniciBilgisi(userId: string): Promise<{ ad: string; email: string; telefon?: string }> {
    const { data, error } = await this.supabase.client
      .from("users")
      .select("full_name, email, phone")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ForbiddenException("Kullanıcı bulunamadı.");
    return {
      // PayTR ad alanını zorunlu tutuyor ve boş bırakılırsa token reddediliyor.
      ad: String(data.full_name ?? "").trim() || "Projelio kullanıcısı",
      email: String(data.email ?? ""),
      telefon: data.phone ?? undefined,
    };
  }
}
