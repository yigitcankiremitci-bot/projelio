import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileLinksService, type LinkTargetKind } from "./file-links.service";

/** İstemciden gelen değer; tanınmayan her şey reddedilir. */
function normalizeKind(value?: string): LinkTargetKind {
  return value === "task" || value === "user" || value === "module_record" ? value : "task";
}

@Controller()
export class FileLinksController {
  constructor(private fileLinks: FileLinksService) {}

  /** Bir hedefe bağlı dosyalar — görev/kişi/modül kaydı ekranları bunu çağırıyor. */
  @Get("file-links")
  @UseGuards(AuthGuard("jwt"))
  listForTarget(
    @Query("targetKind") targetKind: string,
    @Query("targetId") targetId: string,
    @Req() req: any
  ) {
    return this.fileLinks.listForTarget(normalizeKind(targetKind), targetId, req.user.userId);
  }

  /** Bir dosyanın bağlı olduğu yerler — dosya ekranındaki rozet. */
  @Get("files/:id/links")
  @UseGuards(AuthGuard("jwt"))
  listForFile(@Param("id") id: string, @Req() req: any) {
    return this.fileLinks.listForFile(id, req.user.userId);
  }

  /** Bu dosyanın bağlanabileceği görev/kişi/modül kaydı adayları. */
  @Get("files/:id/link-targets")
  @UseGuards(AuthGuard("jwt"))
  linkTargets(@Param("id") id: string, @Query("q") q: string | undefined, @Req() req: any) {
    return this.fileLinks.linkTargets(id, req.user.userId, q || undefined);
  }

  @Post("files/:id/links")
  @UseGuards(AuthGuard("jwt"))
  link(
    @Param("id") id: string,
    @Body() body: { targetKind: string; targetId: string },
    @Req() req: any
  ) {
    return this.fileLinks.link(id, req.user.userId, normalizeKind(body?.targetKind), body?.targetId);
  }

  @Delete("files/:id/links")
  @UseGuards(AuthGuard("jwt"))
  async unlink(
    @Param("id") id: string,
    @Query("targetKind") targetKind: string,
    @Query("targetId") targetId: string,
    @Req() req: any
  ) {
    await this.fileLinks.unlink(id, req.user.userId, normalizeKind(targetKind), targetId);
    return { ok: true as const };
  }
}
