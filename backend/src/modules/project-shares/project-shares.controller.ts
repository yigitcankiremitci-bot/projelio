import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { CreateProjectShareLinkInput, ProjectShareVisibility } from "@projelio/shared";
import { ProjectSharesService } from "./project-shares.service";

/**
 * Paylaşım linklerinin YÖNETİMİ — giriş yapmış proje sahibi için.
 *
 * Linki AÇAN kişinin kullandığı uç ayrı bir dosyada ve kimlik doğrulaması yok
 * (bkz. public-project.controller.ts). İkisinin ayrı durması bilinçli: bu
 * dosyadaki her uç `AuthGuard`'ın arkasında, oradaki tek uç değil — ikisi aynı
 * sınıfta olsaydı guard'ı yanlışlıkla kaldırmak/eklemek çok kolay olurdu.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class ProjectSharesController {
  constructor(private shares: ProjectSharesService) {}

  @Get("projects/:projectId/share-links")
  list(@Param("projectId") projectId: string, @Req() req: any) {
    return this.shares.list(projectId, req.user.userId);
  }

  @Post("projects/:projectId/share-links")
  create(
    @Param("projectId") projectId: string,
    @Body() body: CreateProjectShareLinkInput,
    @Req() req: any
  ) {
    return this.shares.create(projectId, req.user.userId, body);
  }

  @Patch("project-share-links/:id")
  update(
    @Param("id") id: string,
    @Body() body: { label?: string; visibility?: ProjectShareVisibility; expiresInDays?: number | null },
    @Req() req: any
  ) {
    return this.shares.update(id, req.user.userId, body);
  }

  /** Linki kapatır. Satır silinmez, `revoked_at` damgalanır. */
  @Delete("project-share-links/:id")
  revoke(@Param("id") id: string, @Req() req: any) {
    return this.shares.revoke(id, req.user.userId);
  }
}
