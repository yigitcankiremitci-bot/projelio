import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

/**
 * Lio'nun sohbet turlarını isteğin ömründen ayıran arka plan iş deposu.
 *
 * NEDEN GEREKLİ: bir tur, araç döngüsünde sekiz model çağrısına kadar
 * uzayabiliyor ve büyük bir ekle (ör. 75 günlük çalışma programı) her çağrı
 * 20 bin karakterlik belgeyi yeniden okuyor. Tur rahatça 30 saniyeyi aşıyordu;
 * web istemcisi o sürede isteği kesiyor (bkz. web api/client.ts
 * REQUEST_TIMEOUT_MS) ve kullanıcı "Sunucu zamanında yanıt vermedi" görüyordu.
 * Sunucu ise çalışmayı sürdürüp cevabı sohbete kaydediyordu — kullanıcı aynı
 * isteği tekrar gönderince görevler İKİ KEZ açılıyordu.
 *
 * Zaman aşımını uzatmak sorunu ertelerdi: mobil kabukta uygulama arka plana
 * alınınca uzun süre açık duran bağlantı zaten kopuyor. Burada istek işi
 * başlatıp hemen bir kimlik döner, istemci sonucu kısa isteklerle sorar
 * (`GET /ai/jobs/:id`). Bağlantı arada kopsa da iş kaybolmaz.
 *
 * BELLEKTE tutuluyor, tabloda değil: duraklatılmış koşular (`pendingRuns`) ve
 * onay bekleyen işlemler de bellekte, yani süreç yeniden başlarsa onlar da
 * kayboluyor. Tek backend örneği çalıştığı sürece (docker-compose.prod.yml)
 * yeterli; ikinci örnek eklenirse bu depo da paylaşılan bir yere taşınmalı.
 */

/** Biten işin sonucunun saklandığı süre: istemci bir yoklamayı kaçırsa da alabilsin. */
const BITEN_IS_OMRU_MS = 10 * 60_000;

/**
 * Hiç bitmeyen bir işin bellekte kalabileceği en uzun süre. Sağlayıcı çağrısı
 * zaten zaman aşımlı (anthropic.provider.ts), sekiz adım bunun çok altında
 * kalır — bu yalnızca beklenmedik bir asılı kalmaya karşı tavan.
 */
const CALISAN_IS_OMRU_MS = 30 * 60_000;

/**
 * Bir kullanıcının aynı anda çalıştırabileceği iş sayısı. Arayüz gönderirken
 * kutuyu kilitliyor; birden fazla sekme açık olabilir diye tek değil. Tavan,
 * kimliği alınıp sonucu hiç sorulmayan işlerin sınırsız birikmesine karşı.
 */
const KULLANICI_BASINA_EN_COK = 3;

type Is =
  | { kullaniciId: string; baslangic: number; durum: "calisiyor" }
  | { kullaniciId: string; baslangic: number; durum: "bitti"; bitis: number; sonuc: unknown }
  | { kullaniciId: string; baslangic: number; durum: "hata"; bitis: number; hata: unknown };

export type IsDurumu<T> = { durum: "calisiyor" } | { durum: "bitti"; sonuc: T };

// Dekoratörsüz: testler Node'un tip ayıklayıcısıyla koşuyor ve o dekoratörü
// tanımıyor. Nest kaydı ai-chat-jobs.service.ts'teki ince sınıfta.
export class AiChatJobs {
  private readonly isler = new Map<string, Is>();

  /**
   * İşi başlatır ve beklemeden kimliğini döner.
   *
   * `bittiginde` yalnızca başarılı sonuçta çağrılır (ör. sayfaya "değişti"
   * sinyali — normalde bunu yanıt anında RealtimeChangeInterceptor gönderiyor,
   * ama burada yanıt iş bitmeden gidiyor).
   */
  baslat<T>(kullaniciId: string, calistir: () => Promise<T>, bittiginde?: () => void): string {
    this.temizle();
    let calisan = 0;
    for (const is of this.isler.values()) {
      if (is.kullaniciId === kullaniciId && is.durum === "calisiyor") calisan++;
    }
    if (calisan >= KULLANICI_BASINA_EN_COK) {
      throw new HttpException(
        "Lio şu an önceki isteklerin üzerinde çalışıyor. Bitince tekrar dene.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const id = randomUUID();
    const baslangic = Date.now();
    this.isler.set(id, { kullaniciId, baslangic, durum: "calisiyor" });

    // Reddi burada YAKALANIYOR: beklenmeyen bir promise reddi Node 22'de süreci
    // öldürür. Hata kaybolmuyor, yoklayan istemciye aynen fırlatılıyor.
    Promise.resolve()
      .then(calistir)
      .then(
        (sonuc) => {
          this.isler.set(id, { kullaniciId, baslangic, durum: "bitti", bitis: Date.now(), sonuc });
          try {
            bittiginde?.();
          } catch {
            // Sinyal yardımcı bir şey; gönderilemezse sonuç yine teslim edilir.
          }
        },
        (hata) => {
          this.isler.set(id, { kullaniciId, baslangic, durum: "hata", bitis: Date.now(), hata });
        }
      );
    return id;
  }

  /**
   * İşin durumu. Hatayla bittiyse AYNI hata fırlatılır: genel hata filtresi
   * onu doğrudan istekte oluşmuş gibi çevirip durum koduyla döner — istemci
   * 402 (bakiye yetersiz) gibi durumları eski akıştaki gibi ayırt eder.
   *
   * Başkasının işi "bulunamadı" görünür, var olduğu bile söylenmez.
   */
  oku<T>(kullaniciId: string, id: string): IsDurumu<T> {
    this.temizle();
    const is = this.isler.get(id);
    if (!is || is.kullaniciId !== kullaniciId) {
      throw new NotFoundException(
        "Lio'nun bu cevabı artık bulunamıyor. Sohbeti yeniden açıp son mesaja bak; tekrar göndermeden önce yapılanları kontrol et."
      );
    }
    if (is.durum === "calisiyor") return { durum: "calisiyor" };
    if (is.durum === "hata") throw is.hata;
    return { durum: "bitti", sonuc: is.sonuc as T };
  }

  private temizle(): void {
    const simdi = Date.now();
    for (const [id, is] of this.isler) {
      const eski =
        is.durum === "calisiyor" ? simdi - is.baslangic > CALISAN_IS_OMRU_MS : simdi - is.bitis > BITEN_IS_OMRU_MS;
      if (eski) this.isler.delete(id);
    }
  }
}
