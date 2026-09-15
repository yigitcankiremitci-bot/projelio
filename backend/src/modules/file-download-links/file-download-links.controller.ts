import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { CreateFileDownloadLinkInput, UpdateFileDownloadLinkInput } from "@projelio/shared";
import { FileDownloadLinksService } from "./file-download-links.service";

/**
 * İndirme bağlantılarının YÖNETİMİ — giriş yapmış kullanıcı için.
 *
 * Bağlantıyı AÇAN kişinin kullandığı uçlar ayrı bir dosyada ve kimlik
 * doğrulaması yok (bkz. public-file-link.controller.ts). İkisinin ayrı durması
 * bilinçli: bu dosyadaki her uç guard'ın arkasında, oradakiler değil — aynı
 * sınıfta olsalardı guard'ı yanlışlıkla kaldırmak/eklemek çok kolay olurdu
 * (proje paylaşım linkleriyle aynı desen).
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class FileDownloadLinksController {
  constructor(private links: FileDownloadLinksService) {}

  @Get("files/:fileId/download-links")
  list(@Param("fileId") fileId: string, @Req() req: any) {
    return this.links.list(fileId, req.user.userId);
  }

  @Post("files/:fileId/download-links")
  create(
    @Param("fileId") fileId: string,
    @Body() body: CreateFileDownloadLinkInput,
    @Req() req: any
  ) {
    return this.links.create(fileId, req.user.userId, body ?? {});
  }

  @Patch("file-download-links/:id")
  update(@Param("id") id: string, @Body() body: UpdateFileDownloadLinkInput, @Req() req: any) {
    return this.links.update(id, req.user.userId, body ?? {});
  }

  /** Bağlantıyı kapatır. Satır silinmez, `revoked_at` damgalanır. */
  @Delete("file-download-links/:id")
  revoke(@Param("id") id: string, @Req() req: any) {
    return this.links.revoke(id, req.user.userId);
  }

  /**
   * Bağlantıyı alıcının e-postasına gönderir (link@ alan adından).
   *
   * Yanıt `sent` taşıyor: e-posta sağlayıcısı yapılandırılmamışsa ya da
   * reddederse arayüz bunu kullanıcıya söylemek zorunda.
   */
  @Post("file-download-links/:id/send")
  send(@Param("id") id: string, @Body() body: { email?: string; note?: string }, @Req() req: any) {
    return this.links.sendByEmail(id, req.user.userId, body ?? {});
  }
}
