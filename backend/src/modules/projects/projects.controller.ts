import {
  BadRequestException,
  Inject,
  forwardRef,
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
import { UploadRateLimitGuard } from "../../common/guards/upload-rate-limit.guard";
import { memoryStorage } from "multer";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto, UpdateProjectDto } from "./dto/project.dto";
import { CreationRequestsService } from "../creation-requests/creation-requests.service";

@Controller("projects")
@UseGuards(AuthGuard("jwt"))
export class ProjectsController {
  constructor(
    private projectsService: ProjectsService,
    @Inject(forwardRef(() => CreationRequestsService))
    private creationRequests: CreationRequestsService
  ) {}

  @Get()
  findAll(@Req() req: any) {
    return this.projectsService.findAllForUser(req.user.userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Req() req: any) {
    return this.projectsService.findOne(id, req.user.userId);
  }

  /**
   * Taşeron, SAHİBİ OLMADIĞI bir işin altına proje açamaz: talep oluşur, işin
   * sahibine bildirim (+push) gider, onaylanınca proje doğar. Kendi işinin
   * altına ve taşeron olmayan kullanıcılar eskisi gibi doğrudan açar.
   * Yanıt biçimi için bkz. shared CreateOrRequestResult.
   */
  @Post()
  async create(@Req() req: any, @Body() body: CreateProjectDto) {
    const userId = req.user.userId;
    const needsApproval = await this.creationRequests.requiresApproval("project", userId, {
      jobId: body?.jobId,
    });
    if (needsApproval) {
      const request = await this.creationRequests.create(userId, {
        kind: "project",
        jobId: body.jobId,
        payload: {
          title: body?.title,
          description: body?.description,
          totalBudget: body?.totalBudget,
          startDate: body?.startDate,
          deadline: body?.deadline,
        },
      });
      return { outcome: "pending", request };
    }
    return { outcome: "created", entity: await this.projectsService.create(userId, body) };
  }

  // NOT: bu route ":id" ile çakışmaması için ondan önce tanımlanmalı.
  @Patch("reorder")
  reorder(@Req() req: any, @Body("ids") ids: string[]) {
    return this.projectsService.reorder(req.user.userId, ids);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateProjectDto, @Req() req: any) {
    return this.projectsService.update(id, body, req.user.userId);
  }

  @Post(":id/cover")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.projectsService.uploadCover(id, file, req.user.userId);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.projectsService.remove(id, req.user.userId);
  }

  @Patch(":id/archive")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.projectsService.archive(id, req.user.userId);
  }

  @Patch(":id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.projectsService.restore(id, req.user.userId);
  }
}
