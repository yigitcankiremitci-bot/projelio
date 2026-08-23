import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { consumeRateLimit } from "./rate-limit.store";

/**
 * Basit, bellek içi hız sınırlayıcı — login/register/forgot-password/reset-password
 * gibi kaba kuvvet (brute-force) ve e-posta enumeration denemelerine açık uçlar için.
 *
 * Projede @nestjs/throttler gibi bir paket kurulu değil; bu minimal bir önlem
 * olarak IP + route başına bir zaman penceresinde en fazla N istek kabul eder.
 *
 * Sayaç IP başına tutulduğu için main.ts'teki `trust proxy` ayarına BAĞIMLIDIR:
 * o ayar olmadan req.ip vekil sunucunun IP'sini döner ve herkes tek kovaya düşer.
 * İkisi birlikte anlam ifade ediyor, birini kaldırırken diğerini de düşün.
 *
 * Tek başına yeterli değil: IP değiştirmek ucuz olduğu için tek bir hesabı hedef
 * alan saldırgan bu sınırı IP döndürerek aşar. Hesap başına sayacı LoginAttemptService
 * tutuyor (bkz. modules/auth/login-attempt.service.ts); bu ikisi birbirini tamamlar.
 *
 * Sayaç ve temizlik mantığı rate-limit.store.ts'te — UploadRateLimitGuard ile ortak.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly limit = 10;
  private readonly windowMs = 60_000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip: string = req.ip || req.socket?.remoteAddress || "unknown";
    const routeKey = req.route?.path ?? req.path ?? "unknown";

    if (!consumeRateLimit(`auth:${ip}:${routeKey}`, this.limit, this.windowMs)) {
      // Gövde nesne: düz metin verilirse ön yüz mesajı okuyamıyor
      // (bkz. login-attempt.service.ts'teki aynı not).
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
