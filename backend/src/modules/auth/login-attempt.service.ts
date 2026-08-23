import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Hesap (e-posta) başına başarısız giriş sayacı ve geçici kilit.
 *
 * NEDEN AYRI BİR ÖNLEM: AuthRateLimitGuard sayacı IP başına tutar. IP döndürmek
 * bugün ucuz olduğu için tek bir hesabı hedef alan saldırgan her denemeyi başka
 * bir IP'den yaparak o sınırı hiç görmez. Burada sayaç hedefin kendisine, yani
 * e-postaya bağlı; saldırganın IP'si değişse de sayaç aynı kalır. İkisi birlikte
 * anlam ifade ediyor: guard bir IP'nin çok sayıda HESABI denemesini, bu servis
 * çok sayıda IP'nin tek HESABI denemesini engeller.
 *
 * Hesap var olmasa bile sayılır. Aksi halde "kilitlendi" yanıtı yalnızca kayıtlı
 * adreslerde çıkar, bu da adresin sistemde olup olmadığını sızdırırdı — auth
 * akışının geri kalanı (bkz. forgot-password, resend-verification) bu sızıntıyı
 * özellikle kapatıyor, buradan geri açmayalım.
 *
 * Bellekte tutuluyor: tek instance çalışıyoruz (bkz. render.yaml) ve kayıtlar
 * dakikalar yaşıyor. Yeniden başlatmada sayaçlar sıfırlanır; brute-force için
 * anlamlı bir kaçış yolu değil, çünkü saldırgan restart'ı tetikleyemiyor.
 */

interface Attempt {
  failures: number;
  /** Pencerenin başlangıcı — bu andan windowMs sonra sayaç sıfırdan başlar. */
  windowStartedAt: number;
  /** 0 = kilitli değil. */
  lockedUntil: number;
}

// @Injectable() BİLEREK YOK: sınıfın hiç constructor bağımlılığı olmadığı için Nest
// onu dekoratörsüz de sağlayıcı olarak örnekleyebiliyor. Dekoratör eklenirse dosya
// test edilemez hale gelir — test koşucusu (node --test) tipleri sıyırıyor ama
// dekoratörleri çalıştıramıyor ve dosya "Invalid or unexpected token" ile patlıyor.
// Buraya bağımlılık eklemen gerekirse @Injectable() şart olur; o zaman saf mantığı
// ayrı bir modüle taşı ki testler yaşamaya devam etsin.
export class LoginAttemptService {
  private readonly attempts = new Map<string, Attempt>();
  private lastSweepAt = 0;

  private readonly maxFailures = 5;
  /** Bu süre içinde biriken başarısızlıklar sayılır; daha eskisi unutulur. */
  private readonly windowMs = 15 * 60_000;
  /** Sınır aşılınca hesabın kilitli kalacağı süre. */
  private readonly lockMs = 15 * 60_000;

  /**
   * Giriş denenmeden ÖNCE çağrılır. Kilitliyse 429 atar.
   *
   * Şifre karşılaştırması yapılmadan önce çalışması önemli: kilit hem denemeyi
   * hem de her denemede yapılan bcrypt hesabını (CPU) engellemiş olur.
   */
  assertNotLocked(email: string): void {
    const now = Date.now();
    this.sweep(now);

    const entry = this.attempts.get(this.key(email));
    if (!entry || entry.lockedUntil <= now) return;

    const remainingSeconds = Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000));

    // GÖVDE NESNE OLMALI, DÜZ METİN DEĞİL. `new HttpException("metin", 429)`
    // çağrısında Nest gövdeyi çıplak bir JSON string olarak gönderiyor; ön yüz ise
    // `parsed.message` arıyor (bkz. apps/web/src/api/client.ts) ve bulamayınca
    // kullanıcıya "API error 429" yazıyordu. Anlamlı mesaj yazıp okunmamasına
    // izin vermek, hiç yazmamaktan beter.
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Too Many Requests",
        message:
          "Çok fazla başarısız giriş denemesi yapıldı. Hesabın geçici olarak girişe kapatıldı. " +
          'Şifreni hatırlamıyorsan "Şifremi unuttum" ile sıfırlayabilirsin.',
        // Ön yüz bununla geri sayım gösteriyor; dakikaya yuvarlamak yerine saniye
        // veriyoruz ki sayaç gerçek kalan süreyi göstersin.
        retryAfterSeconds: remainingSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  /** Şifre yanlış olduğunda çağrılır. Sınıra ulaşıldıysa hesabı kilitler. */
  recordFailure(email: string): void {
    const now = Date.now();
    const key = this.key(email);
    const entry = this.attempts.get(key);

    if (!entry || now - entry.windowStartedAt > this.windowMs) {
      this.attempts.set(key, { failures: 1, windowStartedAt: now, lockedUntil: 0 });
      return;
    }

    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.lockedUntil = now + this.lockMs;
      // Sayaç sıfırlanır: kilit bitince kullanıcı yeniden maxFailures hakkı alsın,
      // aksi halde tek bir yanlış denemeyle anında tekrar kilitlenirdi.
      entry.failures = 0;
      entry.windowStartedAt = now;
    }
  }

  /** Şifre doğru olduğunda çağrılır — geçmiş başarısızlıklar silinir. */
  reset(email: string): void {
    this.attempts.delete(this.key(email));
  }

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Kilidi bitmiş ve penceresi geçmiş kayıtları siler; Map'in sınırsız büyümesini
   * engeller (aynı sorun AuthRateLimitGuard'da da vardı). Zamanlayıcı yerine istek
   * üzerinde, en fazla pencerede bir kez çalışır.
   */
  private sweep(now: number): void {
    if (now - this.lastSweepAt < this.windowMs) return;
    this.lastSweepAt = now;
    for (const [key, entry] of this.attempts) {
      const lockOver = entry.lockedUntil <= now;
      const windowOver = now - entry.windowStartedAt > this.windowMs;
      if (lockOver && windowOver) this.attempts.delete(key);
    }
  }
}
