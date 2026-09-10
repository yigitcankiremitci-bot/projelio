import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileLinksService, type LinkSource, type LinkTargetKind } from "./file-links.service";

/** İstemciden gelen değer; tanınmayan her şey en dar hedefe düşer. */
function normalizeKind(value?: string): LinkTargetKind {
  return value === "task" || value === "user" || value === "module_record" || value === "project"
    ? value
    : "task";
}

/**
 * Dosya ve klasör bağlantıları.
 *
 * Uçlar KAYNAĞA göre ikiye ayrılmış (`files/:id/...` ve `file-folders/:id/...`),
 * gövdeler ortak: kaynağı sorgu parametresi yapmak, kimliğin hangi tabloya ait
 * olduğunu istemcinin doğru bildirmesine güvenmek olurdu.
 */
@Controller()
export class FileLinksController {
  constructor(private fileLinks: FileLinksService) {}

  /** Bir hedefe bağlı dosyalar ve klasörler. */
  @Get("file-links")
  @UseGuards(AuthGuard("jwt"))
  listForTarget(
    @Query("targetKind") targetKind: string,
    @Query("targetId") targetId: string,
    @Req() req: any
  ) {
    return this.fileLinks.listForTarget(normalizeKind(targetKind), targetId, req.user.userId);
  }

  /**
   * Hedefin kapsamındaki dosya ağacında gezinme ("Çağır/Seç" akışı).
   *
   * Kapsam HEDEFTEN çıkıyor: istemci yalnızca hangi klasöre bakacağını
   * söylüyor, hangi şirketin ağacı olduğunu değil.
   */
  @Get("file-links/browse")
  @UseGuards(AuthGuard("jwt"))
  browse(
    @Query("targetKind") targetKind: string,
    @Query("targetId") targetId: string,
    @Query("folderId") folderId: string | undefined,
    @Req() req: any
  ) {
    return this.fileLinks.browseForTarget(
      normalizeKind(targetKind),
      targetId,
      req.user.userId,
      folderId || undefined
    );
  }

  // ------------------------------------------------------------------ dosya

  @Get("files/:id/links")
  @UseGuards(AuthGuard("jwt"))
  listForFile(@Param("id") id: string, @Req() req: any) {
    return this.fileLinks.listForSource({ fileId: id }, req.user.userId);
  }

  @Get("files/:id/link-targets")
  @UseGuards(AuthGuard("jwt"))
  fileLinkTargets(@Param("id") id: string, @Query("q") q: string | undefined, @Req() req: any) {
    return this.fileLinks.linkTargets({ fileId: id }, req.user.userId, q || undefined);
  }

  @Post("files/:id/links")
  @UseGuards(AuthGuard("jwt"))
  linkFile(@Param("id") id: string, @Body() body: { targetKind: string; targetId: string }, @Req() req: any) {
    return this.link({ fileId: id }, body, req);
  }

  @Delete("files/:id/links")
  @UseGuards(AuthGuard("jwt"))
  unlinkFile(
    @Param("id") id: string,
    @Query("targetKind") targetKind: string,
    @Query("targetId") targetId: string,
    @Req() req: any
  ) {
    return this.unlink({ fileId: id }, targetKind, targetId, req);
  }

  // ----------------------------------------------------------------- klasör

  @Get("file-folders/:id/links")
  @UseGuards(AuthGuard("jwt"))
  listForFolder(@Param("id") id: string, @Req() req: any) {
    return this.fileLinks.listForSource({ folderId: id }, req.user.userId);
  }

  @Get("file-folders/:id/link-targets")
  @UseGuards(AuthGuard("jwt"))
  folderLinkTargets(@Param("id") id: string, @Query("q") q: string | undefined, @Req() req: any) {
    return this.fileLinks.linkTargets({ folderId: id }, req.user.userId, q || undefined);
  }

  @Post("file-folders/:id/links")
  @UseGuards(AuthGuard("jwt"))
  linkFolder(@Param("id") id: string, @Body() body: { targetKind: string; targetId: string }, @Req() req: any) {
    return this.link({ folderId: id }, body, req);
  }

  @Delete("file-folders/:id/links")
  @UseGuards(AuthGuard("jwt"))
  unlinkFolder(
    @Param("id") id: string,
    @Query("targetKind") targetKind: string,
    @Query("targetId") targetId: string,
    @Req() req: any
  ) {
    return this.unlink({ folderId: id }, targetKind, targetId, req);
  }

  // ------------------------------------------------------------ ortak gövde

  private link(source: LinkSource, body: { targetKind: string; targetId: string }, req: any) {
    return this.fileLinks.link(source, req.user.userId, normalizeKind(body?.targetKind), body?.targetId);
  }

  private async unlink(source: LinkSource, targetKind: string, targetId: string, req: any) {
    await this.fileLinks.unlink(source, req.user.userId, normalizeKind(targetKind), targetId);
    return { ok: true as const };
  }
}
