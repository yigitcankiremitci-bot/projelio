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
import { JobsService } from "./jobs.service";
import { ProjectsService } from "../projects/projects.service";

@Controller("jobs")
@UseGuards(AuthGuard("jwt"))
export class JobsController {
  constructor(
    private jobsService: JobsService,
    private projectsService: ProjectsService
  ) {}

  @Get()
  findAll(@Req() req: any) {
    return this.jobsService.findAllForUser(req.user.userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.jobsService.findOne(id);
  }

  @Get(":id/projects")
  findProjects(@Param("id") id: string) {
    return this.projectsService.findByJob(id);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.jobsService.create(req.user.userId, body);
  }

  // NOT: bu route ":id" ile çakışmaması için ondan önce tanımlanmalı.
  @Patch("reorder")
  reorder(@Req() req: any, @Body("ids") ids: string[]) {
    return this.jobsService.reorder(req.user.userId, ids);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.jobsService.update(id, body);
  }

  @Post(":id/cover")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.jobsService.uploadCover(id, file);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.jobsService.remove(id);
  }

  @Patch(":id/archive")
  archive(@Param("id") id: string) {
    return this.jobsService.archive(id);
  }

  @Patch(":id/restore")
  restore(@Param("id") id: string) {
    return this.jobsService.restore(id);
  }
}
