import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { consumeRateLimit } from "../../common/guards/rate-limit.store";

/**
 * Herkese açık randevu formunun hız sınırı.
 *
 * Randevu almak veritabanına kimliksiz satır yazdırıyor VE yöneticilere
 * e-posta attırıyor. Sınırsız bırakmak, bir betiğin takvimi sahte randevuyla
 * doldurup gelen kutularını boğmasına izin verirdi. Gerçek bir ziyaretçi bir
 * iki deneme yapar (yanlış telefon, dolmuş saat); 10 dakikada 6 cömert.
 *
 * Aynı sınıf yönetim bağlantısındaki iptal/taşıma için de kullanılıyor.
 */
@Injectable()
export class DemoRandevuRateLimitGuard implements CanActivate {
  private readonly limit = 6;
  private readonly windowMs = 10 * 60_000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip: string = req.ip || req.socket?.remoteAddress || "unknown";
    if (!consumeRateLimit(`demo-randevu:${ip}`, this.limit, this.windowMs)) {
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
