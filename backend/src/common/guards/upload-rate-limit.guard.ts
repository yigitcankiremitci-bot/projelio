import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { consumeRateLimit } from "./rate-limit.store";

/**
 * Dosya yükleme uçları için hız sınırı.
 *
 * NEDEN GEREKTİ. Yükleme uçlarında DOSYA BAŞINA boyut sınırı vardı (multer
 * `limits.fileSize`) ama İSTEK SAYISI sınırsızdı. İki somut sonucu vardı:
 *
 *   1. Bellek. Yüklemeler memoryStorage() ile RAM'e alınıyor; her eşzamanlı
 *      istek dosya boyutu kadar bellek tutuyor. Render starter planı 512 MB —
 *      birkaç düzine eşzamanlı 8 MB yükleme süreci düşürmeye yeter.
 *   2. Depolama. Kapak/avatar her yüklemede yeni bir nesne yazıyor ve eskisi
 *      silinmiyordu (bkz. removePublicUploadByUrl ile birlikte düzeltildi).
 *      Sınırsız istek = sınırsız depolama maliyeti.
 *
 * NEDEN IP DEĞİL KULLANICI BAŞINA. Yükleme uçlarının hepsi kimlik doğrulamalı,
 * yani isteği yapan belli. Kötüye kullanımın ölçüsü de kişi başına depolama;
 * IP başına saymak hem aynı ofisten çalışan ekipleri birbirine bağlar hem de
 * IP değiştiren tek kullanıcıyı serbest bırakırdı. Kullanıcı yoksa (guard
 * yanlışlıkla kimliksiz bir uca takılırsa) IP'ye düşülür.
 *
 * SINIR NEDEN BU DEĞER. 30 yükleme / 5 dakika, elle çalışan bir insan için
 * fazlasıyla geniş (dosya modülünden toplu yükleme yapan kullanıcı bile bu
 * hızda gitmez), ama otomatik bir döngüyü anında durdurur.
 */
@Injectable()
export class UploadRateLimitGuard implements CanActivate {
  private readonly limit = 30;
  private readonly windowMs = 5 * 60_000;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.userId;
    const subject = userId ? `user:${userId}` : `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;

    if (!consumeRateLimit(`upload:${subject}`, this.limit, this.windowMs)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "Too Many Requests",
          message: "Çok fazla dosya yüklediniz. Lütfen birkaç dakika sonra tekrar deneyin.",
          retryAfterSeconds: Math.ceil(this.windowMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    return true;
  }
}
