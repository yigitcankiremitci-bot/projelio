import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { consumeRateLimit } from "../../common/guards/rate-limit.store";

/**
 * Bülten formunun hız sınırı. Form kimliksiz satır yazdırıyor; sınırsız
 * bırakmak bir betiğin listeyi uydurma adreslerle doldurmasına izin verirdi.
 * Gerçek bir ziyaretçi bir iki kez dener (adresi yanlış yazdı); 10 dakikada 5 yeter.
 */
@Injectable()
export class BultenRateLimitGuard implements CanActivate {
  private readonly limit = 5;
  private readonly windowMs = 10 * 60_000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip: string = req.ip || req.socket?.remoteAddress || "unknown";
    if (!consumeRateLimit(`bulten:${ip}`, this.limit, this.windowMs)) {
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
