import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { describeCause, describeError, isNetworkFailure } from "../network-errors";
import { redactUrl } from "../redact-url";

/**
 * Global hata filtresi.
 *
 * Neden gerekti: Supabase'e ulaşılamadığında log'a yalnızca
 * `TypeError: fetch failed` düşüyordu — hangi uç noktada, hangi sebeple
 * olduğu görünmüyordu. Node 18+ fetch'i asıl sebebi `error.cause` içinde
 * saklar (ENOTFOUND, ECONNREFUSED, ETIMEDOUT…) ve varsayılan Nest filtresi
 * onu yazmaz.
 *
 * Ayrıca ağ hatası 500 değil 503'tür: sunucu kodu bozuk değil, bağımlı olduğu
 * servise ulaşılamıyor. İstemci bunu ayırt edip "tekrar dene" diyebilmeli.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    // Adres HAM hâlde yazılmaz: query string'inde dosya erişim jetonu (?t=),
    // OAuth kodu ve state jetonu dolaşıyor (bkz. common/redact-url.ts).
    const where = `${request.method} ${redactUrl(request.originalUrl ?? request.url)}`;

    // Beklenen (iş kuralı) hataları olduğu gibi geçir; bunlar zaten anlamlı:
    // yetki reddi, doğrulama, bulunamadı.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) this.logger.error(`${where} · ${exception.message}`);
      response.status(status).json(exception.getResponse());
      return;
    }

    const cause = describeCause(exception);
    const isNetwork = isNetworkFailure(exception);

    this.logger.error(
      `${where} · ${isNetwork ? "AĞ HATASI" : "BEKLENMEYEN HATA"} · ${describeError(exception)}${
        cause ? ` · sebep: ${cause}` : ""
      }`
    );

    if (isNetwork) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: "Veritabanına şu an ulaşılamıyor. Bağlantını kontrol edip tekrar dene.",
        error: "Service Unavailable",
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Beklenmeyen bir hata oluştu.",
      error: "Internal Server Error",
    });
  }
}
