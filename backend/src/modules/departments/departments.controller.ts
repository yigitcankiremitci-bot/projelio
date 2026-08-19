import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { memoryStorage } from "multer";
import { DepartmentsService } from "./departments.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  // Kullanıcının erişebildiği TÜM organizasyonlardaki departmanlar (organizasyon
  // bazlı findByOrganization'dan farklı olarak organizasyonlar arası) — örn. görev
  // taşıma hedefi seçicisi için (bkz. MoveTaskModal).
  @Get("departments")
  findAllForUser(@Req() req: any) {
    return this.departmentsService.findAllForUser(req.user.userId);
  }

  // Yalnızca isteyen kullanıcının görebildiği departmanlar döner: organizasyon
  // sahibi/üyesi hepsini, kadro üyesi (çalışan/taşeron) yalnızca kendi
  // departmanlarını (bkz. DepartmentsService.findByOrganization).
  @Get("organizations/:organizationId/departments")
  findByOrganization(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.departmentsService.findByOrganization(organizationId, req.user.userId);
  }

  @Post("organizations/:organizationId/departments")
  create(
    @Param("organizationId") organizationId: string,
    @Body() body: { catalogKey?: string; name?: string; description?: string },
    @Req() req: any
  ) {
    return this.departmentsService.create(organizationId, body, req.user.userId);
  }

  // Departmanlar sekmesinde basılı tutup sürükleyerek sıralama (bkz. OrganizationsController.reorder).
  @Patch("organizations/:organizationId/departments/reorder")
  reorder(@Param("organizationId") organizationId: string, @Body("ids") ids: string[], @Req() req: any) {
    return this.departmentsService.reorder(organizationId, ids, req.user.userId);
  }

  @Get("departments/:id")
  findOne(@Param("id") id: string, @Req() req: any) {
    return this.departmentsService.findOne(id, req.user.userId);
  }

  @Patch("departments/:id")
  update(
    @Param("id") id: string,
    @Body() body: { name?: string; description?: string; defaultTab?: string },
    @Req() req: any
  ) {
    return this.departmentsService.update(id, body, req.user.userId);
  }

  @Delete("departments/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.departmentsService.remove(id, req.user.userId);
  }

  @Post("departments/:id/cover")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.departmentsService.uploadCover(id, file, req.user.userId);
  }

  @Delete("departments/:id/cover")
  removeCover(@Param("id") id: string, @Req() req: any) {
    return this.departmentsService.removeCover(id, req.user.userId);
  }

  @Patch("departments/:id/archive")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.departmentsService.archive(id, req.user.userId);
  }

  @Patch("departments/:id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.departmentsService.restore(id, req.user.userId);
  }
}
