import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { describeCause, describeError, isNetworkFailure } from "../network-errors";
import { redactUrl } from "../redact-url";
import { cevirmen, istekDili } from "../i18n";
import type { Locale } from "@projelio/shared";

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
 *
 * ## Hata mesajlarının çevirisi
 *
 * Kod tabanında 570'ten fazla `throw new ...Exception("Türkçe mesaj")` var ve
 * bu mesajlar doğrudan kullanıcının ekranına çıkıyor (bkz. web api/client.ts).
 * Çeviriyi fırlatma yerlerinde yapmak, elli servise dil bağımlılığı enjekte
 * etmek demekti — üstelik bir kısmı `common/validation/input.ts` gibi
 * kullanıcıyı hiç bilmeyen yardımcılardan fırlatılıyor, orada dil bulunamazdı.
 *
 * Burası doğru yer: filtre isteği görüyor, dolayısıyla kullanıcıyı da. Türkçe
 * mesaj sözlük ANAHTARI olarak kalıyor, çeviri çıkışta bir kez yapılıyor.
 * Karşılığı olmayan mesaj Türkçe gider — arayüzün geri kalanıyla aynı davranış.
 *
 * Dil, isteği yapan kullanıcının hesabından okunuyor; JWT guard'ı çalışmadan
 * (ör. 401) ya da oturumsuz uçlarda `Accept-Language` başlığına düşülüyor.
 * Hesap tercihi burada SENKRON okunamıyor (filtre async değil), bu yüzden
 * guard'ın isteğe iliştirdiği kullanıcı nesnesindeki dil kullanılıyor.
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

    const locale = this.dili(request);

    // Beklenen (iş kuralı) hataları olduğu gibi geçir; bunlar zaten anlamlı:
    // yetki reddi, doğrulama, bulunamadı. Yalnızca metni çevriliyor.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) this.logger.error(`${where} · ${exception.message}`);
      response.status(status).json(this.cevrilmisGovde(exception.getResponse(), locale));
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
        message: cevirmen(locale)("Veritabanına şu an ulaşılamıyor. Bağlantını kontrol edip tekrar dene."),
        error: "Service Unavailable",
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: cevirmen(locale)("Beklenmeyen bir hata oluştu."),
      error: "Internal Server Error",
    });
  }

  /**
   * İsteğin dili: oturum açmış kullanıcının tercihi, yoksa tarayıcı başlığı.
   *
   * `request.user` JWT guard'ından geliyor ve guard çalışmadıysa (401, açık
   * uçlar) tanımsız — o hâlde `Accept-Language` tek ipucu.
   */
  private dili(request: Request): Locale {
    const istemciDili = request.headers["x-projelio-locale"];
    return istekDili(typeof istemciDili === "string" ? istemciDili : undefined, request.headers["accept-language"]);
  }

  /**
   * Nest'in hata gövdesindeki `message` alanını çevirir, gerisine dokunmaz.
   *
   * Gövde üç biçimde gelebiliyor: düz dize, `{ message: string }` ve
   * doğrulama hatalarında `{ message: string[] }`. Web istemcisi üçünü de
   * ayıklıyor (bkz. api/client.ts) ve `retryAfterSeconds` gibi ek alanlara
   * bakıyor — bu yüzden gövde yeniden kurulmuyor, yalnızca metin değişiyor.
   */
  private cevrilmisGovde(govde: unknown, locale: Locale): unknown {
    const t = cevirmen(locale);
    if (typeof govde === "string") return t(govde);
    if (!govde || typeof govde !== "object") return govde;

    const kayit = govde as Record<string, unknown>;

    // `hataMetni()` ile kurulmuş gövde: anahtar ve parametreler ayrı duruyor,
    // çünkü değişken içeren bir mesaj gömülü hâliyle sözlükte bulunamaz
    // (bkz. common/i18n/index.ts). Alan yanıttan DÜŞÜRÜLÜYOR: istemcinin
    // işine yaramaz ve iç metin anahtarlarını dışarı sızdırmanın anlamı yok.
    const i18n = kayit.i18n as { metin?: unknown; params?: unknown } | undefined;
    if (i18n && typeof i18n.metin === "string") {
      const { i18n: _i18n, ...kalan } = kayit;
      return { ...kalan, message: t(i18n.metin, i18n.params as Record<string, string | number>) };
    }

    const mesaj = kayit.message;
    if (typeof mesaj === "string") return { ...kayit, message: t(mesaj) };
    if (Array.isArray(mesaj)) return { ...kayit, message: mesaj.map((m) => (typeof m === "string" ? t(m) : m)) };
    return govde;
  }
}
