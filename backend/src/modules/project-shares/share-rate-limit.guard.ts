import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { consumeRateLimit } from "../../common/guards/rate-limit.store";

/**
 * Paylaşım linki ucunun hız sınırı.
 *
 * Token'ı kaba kuvvetle bulmak zaten pratikte imkânsız (192 bit rastgelelik);
 * bu sınır onun için değil. İki gerçek gerekçe var:
 *
 * 1. Bu, uygulamanın kimlik doğrulaması OLMAYAN tek ucu — yani veritabanına
 *    kimliksiz istek yaptırabilen tek yer. Sınırsız bırakmak, tek bir linki
 *    bilen birinin sunucuyu meşgul etmesine izin vermek demek.
 * 2. Sayfa her açılışta birkaç sorgu çalıştırıyor; sekmeyi yenileyip duran bir
 *    ziyaretçi de farkında olmadan aynı yükü üretiyor.
 *
 * Sınır cömert: linki açan kişi normalde dakikada birkaç istek yapar.
 * Sayaç ve temizlik mantığı AuthRateLimitGuard ile ortak (rate-limit.store.ts).
 */
@Injectable()
export class ShareRateLimitGuard implements CanActivate {
  private readonly limit = 60;
  private readonly windowMs = 60_000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip: string = req.ip || req.socket?.remoteAddress || "unknown";

    if (!consumeRateLimit(`share:${ip}`, this.limit, this.windowMs)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "Too Many Requests",
          message: "Çok fazla istek yapıldı. Lütfen biraz sonra tekrar deneyin.",
          retryAfterSeconds: Math.ceil(this.windowMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    return true;
  }
}

/**
 * E-posta kapısı denemelerinin sınırı — yukarıdakinden çok daha dar.
 *
 * NEDEN AYRI VE SIKI: token 192 bit rastgele, kaba kuvvetle bulunamaz. Ama
 * e-posta öyle değil — linki ele geçiren biri alıcının adresini tahmin
 * edebilir ("info@firma.com", "ahmet@firma.com"). Kapının tek gerçek koruması
 * deneme sayısının sınırlı olması.
 *
 * Sayaç TOKEN BAŞINA: aynı IP'den farklı linkleri denemek birbirini
 * etkilemesin, ama tek bir link üzerinde sistematik deneme erken dursun.
 */
@Injectable()
export class ShareUnlockRateLimitGuard implements CanActivate {
  private readonly limit = 10;
  private readonly windowMs = 10 * 60_000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip: string = req.ip || req.socket?.remoteAddress || "unknown";
    const token: string = req.params?.token ?? "bilinmeyen";

    if (!consumeRateLimit(`share-unlock:${ip}:${token}`, this.limit, this.windowMs)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "Too Many Requests",
          message: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.",
          retryAfterSeconds: Math.ceil(this.windowMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    return true;
  }
}
