import { Readable } from "node:stream";
import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { getCorsOrigins } from "../../common/config/env";
import { ShareRateLimitGuard, ShareUnlockRateLimitGuard } from "../project-shares/share-rate-limit.guard";
import { FileDownloadLinksService } from "./file-download-links.service";

/**
 * KİMLİK DOĞRULAMASI OLMAYAN uçlar: indirme bağlantısının açtığı sayfa.
 *
 * `AuthGuard` BİLEREK YOK — bağlantıyı açan kişinin Projelio hesabı yok, olması
 * da gerekmiyor. Erişimi token sağlıyor; ne göndereceğimize
 * FileDownloadLinksService karar veriyor.
 *
 * BU DOSYAYA YENİ UÇ EKLEME. Buraya eklenen her şey internete açıktır; yeni bir
 * ihtiyaç çıkarsa FileDownloadLinksController'a (guard'lı) ekle.
 *
 * Hız sınırı sınıfları project-shares'ten ORTAK kullanılıyor: ikisi de "tek
 * token'ı bilen birinin sunucuyu meşgul etmesini" engelliyor ve kuralın ikinci
 * bir kopyası ayrışırdı (bkz. share-rate-limit.guard.ts).
 */
@Controller("public/file-links")
@UseGuards(ShareRateLimitGuard)
export class PublicFileLinkController {
  constructor(private links: FileDownloadLinksService) {}

  /**
   * Dosyanın içeriği — önizleme ve indirme.
   *
   * ADRESTE PAYLAŞIM TOKEN'I YOK, kısa ömürlü içerik jetonu var (`t`). Sebep:
   * bu adres <img>/<iframe> içine giriyor ve sayfadan dışarı kopyalanabiliyor;
   * oraya kalıcı token'ı koymak, önizleme adresini paylaşılabilir ikinci bir
   * bağlantıya çevirirdi.
   *
   * Yol sırası önemli: ":token" parametreli rotalardan ÖNCE tanımlı olmalı,
   * yoksa "content" bir token sanılır.
   */
  @Get("content")
  async content(
    @Query("t") contentToken: string,
    @Query("download") download: string,
    @Res() res: Response
  ) {
    const indir = download === "1";
    const { response, fileName, mimeType, link } = await this.links.icerikIcinCoz(contentToken, indir);

    res.setHeader("Content-Type", mimeType);
    const length = response.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);
    res.setHeader("X-Content-Type-Options", "nosniff");

    // GÜVENLİK — files.controller'daki içerik ucuyla AYNI karar ve aynı sebep:
    // içerik kullanıcının yüklediği, Content-Type da onun bildirdiği değer.
    // Yalnızca tarayıcıda güvenle gösterilebilen türler satır içi açılır;
    // geri kalan HER ŞEY indirmeye zorlanır, böylece "text/html" diye yüklenmiş
    // bir dosya bizim alan adımızda sayfa olarak çalışamaz. Burada risk daha da
    // yüksek: bu uca giriş yapmamış, bağlantıya güvenen biri geliyor.
    const inlineSafe = mimeType.startsWith("image/") || mimeType === "application/pdf";
    const disposition = indir || !inlineSafe ? "attachment" : "inline";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    const allowedAncestors = getCorsOrigins();
    res.removeHeader("X-Frame-Options");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; frame-ancestors ${allowedAncestors.length ? allowedAncestors.join(" ") : "*"}`
    );
    res.setHeader("Cache-Control", "private, no-store");

    // Sayaç ve bildirim akış BAŞLADIKTAN sonra, beklenmeden: burada çıkacak bir
    // hata (e-posta sağlayıcısı, veritabanı) indirmeyi bozmamalı.
    if (indir) {
      void this.links.indirmeyiKaydet(link).catch(() => undefined);
    }

    if (!response.body) {
      res.end();
      return;
    }
    Readable.fromWeb(response.body as any).pipe(res);
  }

  /**
   * Önizlenemeyen türlerin kapak görseli.
   *
   * İçerik ucundan ayrı: burada tür HER ZAMAN sağlayıcının ürettiği bir görsel,
   * kullanıcı etkileyemiyor (bkz. files.controller thumbnail).
   */
  @Get("thumbnail")
  async thumbnail(@Query("t") contentToken: string, @Res() res: Response) {
    const upstream = await this.links.icerikIcinKucukResim(contentToken);
    if (!upstream?.body) return res.status(404).end();

    const type = upstream.headers.get("content-type") ?? "";
    res.setHeader("Content-Type", type.startsWith("image/") ? type : "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("Cache-Control", "private, max-age=300");

    Readable.fromWeb(upstream.body as any).pipe(res);
  }

  /** İlk açılış. Bağlantıda e-posta kapısı varsa görünüm değil, kapı döner. */
  @Get(":token")
  view(@Param("token") token: string) {
    return this.links.resolve(token);
  }

  /**
   * Kapıyı açma denemesi.
   *
   * 200 döner: yanlış adres bir HATA değil, kapının "tekrar dene" hâli. Durum
   * kodunu ayırmak, kaba kuvvet deneyen bir betiğe doğru/yanlış ayrımını
   * ücretsiz verirdi (bkz. public-project.controller.ts).
   *
   * Adres GÖVDEYLE gidiyor: sorgu dizesine konsaydı kişisel bir adres tarayıcı
   * geçmişine, ara belleklere ve sunucu erişim loglarına düşerdi.
   */
  @Post(":token/unlock")
  @HttpCode(200)
  @UseGuards(ShareUnlockRateLimitGuard)
  unlock(@Param("token") token: string, @Body("email") email?: string) {
    // `?? ""` bilinçli: gövdesiz istek de bir DENEME sayılır ve reddedilir.
    return this.links.resolve(token, email ?? "");
  }
}
