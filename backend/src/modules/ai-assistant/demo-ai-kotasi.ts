/**
 * DEMO HESABINDA LİO: KREDİ DÜŞÜLMEZ, SAATLİK SINIR VAR.
 *
 * Demo herkese açık (bkz. common/demo-hesap.ts). İki uç da kötü:
 *  - Krediyi normal düşmek: demo hesabının bakiyesi ilk gelen ziyaretçilerde
 *    biter, sonrakiler için Lio ölü bir düğmeye döner. Bakiyeyi her sıfırlamada
 *    geri yüklesek bile Anthropic faturası sınırsız büyür.
 *  - Tamamen kapatmak: ürünün en iyi tarafını demoda göstermemek olurdu.
 *
 * Bu yüzden: ziyaretçi kredi ödemez, ama demo hesabının TAMAMI için saatlik bir
 * tavan vardır. Tavan dolduğunda Lio "demo sınırı" der ve saat ilerledikçe
 * kendiliğinden açılır.
 *
 * BELLEKTE TUTULUYOR, veritabanında değil — LoginAttemptService ile aynı
 * gerekçe: sayaç kısa ömürlü, sunucu yeniden başlarsa sıfırlanması sorun değil.
 * Birden fazla sunucu kopyası çalıştırılırsa her kopyanın kendi tavanı olur;
 * tek kopyalı kurulumda (Render) böyle bir durum yok.
 */

/**
 * Saatlik tavan (kredi), tüm ziyaretçiler için ORTAK.
 *
 * Ölçek: 10.000 kredi ≈ 1 USD satış bedeli (CREDIT_UNIT_USD). Lio'nun orta
 * boy bir turu (20 bin girdi + 4 bin çıktı token) ~480 kredi tutuyor, yani
 * 8.000 kredi saatte kabaca 15-20 tur demek. Demo aynı anda kaç kişiyle
 * dolarsa dolsun saatlik gerçek maliyet ~0,7 USD'yi geçmez.
 */
export const DEMO_SAATLIK_KREDI = Number(process.env.AI_DEMO_SAATLIK_KREDI ?? 8000);

/** Pencere uzunluğu: kayan bir saat. */
const PENCERE_MS = 60 * 60 * 1000;

type Harcama = { zaman: number; kredi: number };

export class DemoAiKotasi {
  private harcamalar: Harcama[] = [];

  /** Kayan pencerede kalan kredi. */
  kalan(simdi = Date.now()): number {
    this.temizle(simdi);
    const kullanilan = this.harcamalar.reduce((toplam, h) => toplam + h.kredi, 0);
    return Math.max(0, DEMO_SAATLIK_KREDI - kullanilan);
  }

  /** Harcamayı yazar. Krediyi gerçekten düşmez — yalnızca tavanı takip eder. */
  harca(kredi: number, simdi = Date.now()): void {
    if (!(kredi > 0)) return;
    this.harcamalar.push({ zaman: simdi, kredi });
    this.temizle(simdi);
  }

  /** Tavan dolduysa ne kadar sonra açılacağını dakika olarak söyler. */
  acilmayaKalanDakika(simdi = Date.now()): number {
    this.temizle(simdi);
    const enEski = this.harcamalar[0];
    if (!enEski) return 0;
    return Math.max(1, Math.ceil((enEski.zaman + PENCERE_MS - simdi) / 60000));
  }

  /** Testlerin ve yeniden başlatmanın kullandığı sıfırlama. */
  unut(): void {
    this.harcamalar = [];
  }

  private temizle(simdi: number): void {
    const sinir = simdi - PENCERE_MS;
    if (this.harcamalar.length && this.harcamalar[0].zaman < sinir) {
      this.harcamalar = this.harcamalar.filter((h) => h.zaman >= sinir);
    }
  }
}
