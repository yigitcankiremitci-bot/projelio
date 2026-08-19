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
import { OrganizationsService } from "./organizations.service";
import { JobsService } from "../jobs/jobs.service";

@Controller("organizations")
@UseGuards(AuthGuard("jwt"))
export class OrganizationsController {
  constructor(
    private organizationsService: OrganizationsService,
    private jobsService: JobsService
  ) {}

  @Get()
  findAll(@Req() req: any) {
    return this.organizationsService.findAllForUser(req.user.userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Req() req: any) {
    return this.organizationsService.findOne(id, req.user.userId);
  }

  // Bu organizasyona bağlı işler (hiyerarşi: Organizasyon -> İş -> Proje).
  @Get(":id/jobs")
  findJobs(@Param("id") id: string, @Req() req: any) {
    return this.jobsService.findByOrganization(id, req.user.userId);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.organizationsService.create(req.user.userId, body);
  }

  // NOT: bu route ":id" ile çakışmaması için ondan önce tanımlanmalı.
  @Patch("reorder")
  reorder(@Req() req: any, @Body("ids") ids: string[]) {
    return this.organizationsService.reorder(req.user.userId, ids);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.organizationsService.update(id, body, req.user.userId);
  }

  @Post(":id/cover")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.organizationsService.uploadCover(id, file, req.user.userId);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.organizationsService.remove(id, req.user.userId);
  }

  @Patch(":id/archive")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.organizationsService.archive(id, req.user.userId);
  }

  @Patch(":id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.organizationsService.restore(id, req.user.userId);
  }
}
