import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Basit, bellek içi hız sınırlayıcı — login/register/forgot-password/reset-password
 * gibi kaba kuvvet (brute-force) ve e-posta enumeration denemelerine açık uçlar için.
 *
 * Projede @nestjs/throttler gibi bir paket kurulu değil; bu minimal bir önlem
 * olarak IP + route başına bir zaman penceresinde en fazla N istek kabul eder.
 *
 * NOT: yalnızca TEK bir backend sürecinde çalışır — birden fazla instance'a yatay
 * ölçeklendirmede paylaşılmaz (her instance kendi sayacını tutar). Üretimde ciddi
 * bir koruma isteniyorsa Redis tabanlı bir çözüme (projede zaten ioredis var)
 * geçilmeli; bu, o zamana kadarki asgari önlemdir.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  // Guard her istekte yeniden örneklendiği (instance'lanmadığı - Nest guard'ları
  // singleton) için bucket'lar static DEĞİL, sınıf alanı olarak tutulabilir;
  // yine de netlik için burada modül düzeyinde tek bir Map kullanılıyor.
  private static readonly buckets = new Map<string, Bucket>();
  private readonly limit = 10;
  private readonly windowMs = 60_000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip: string = req.ip || req.socket?.remoteAddress || "unknown";
    const routeKey = req.route?.path ?? req.path ?? "unknown";
    const key = `${ip}:${routeKey}`;
    const now = Date.now();

    const bucket = AuthRateLimitGuard.buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      AuthRateLimitGuard.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (bucket.count >= this.limit) {
      throw new HttpException("Çok fazla deneme yapıldı. Lütfen bir dakika sonra tekrar deneyin.", HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.count += 1;
    return true;
  }
}
