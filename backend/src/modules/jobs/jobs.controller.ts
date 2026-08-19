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
import { memoryStorage } from "multer";
import { JobsService } from "./jobs.service";
import { ProjectsService } from "../projects/projects.service";
import { OperationsService } from "../operations/operations.service";
import { AccessService } from "../../common/access/access.service";
import { CreationRequestsService } from "../creation-requests/creation-requests.service";

@Controller("jobs")
@UseGuards(AuthGuard("jwt"))
export class JobsController {
  constructor(
    private jobsService: JobsService,
    private projectsService: ProjectsService,
    private operationsService: OperationsService,
    private access: AccessService,
    @Inject(forwardRef(() => CreationRequestsService))
    private creationRequests: CreationRequestsService
  ) {}

  @Get()
  findAll(@Req() req: any) {
    return this.jobsService.findAllForUser(req.user.userId);
  }

  // İş detayı: eskiden hiç yetki sorulmuyordu — id'yi bilen herkes başkasının
  // iş dosyasını açabiliyordu.
  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: any) {
    await this.access.assertCanViewJob(id, req.user.userId);
    return this.jobsService.findOne(id);
  }

  @Get(":id/projects")
  findProjects(@Param("id") id: string, @Req() req: any) {
    return this.projectsService.findByJob(id, req.user.userId);
  }

  // Bir işin altında projelerin yanı sıra rutinler de yaşar (süreli iş / sürekli iş).
  @Get(":id/operations")
  findOperations(@Param("id") id: string, @Req() req: any) {
    return this.operationsService.findByJob(id, req.user.userId);
  }

  /**
   * Taşeron bir ORGANİZASYONA bağlı iş açmak istediğinde kayıt doğrudan
   * oluşmaz: talep açılır, yetkililere bildirim (+push) gider, onaylanınca iş
   * doğar (bkz. CreationRequestsService). Organizasyona bağlanmayan kişisel iş
   * ve taşeron olmayan kullanıcılar eskisi gibi doğrudan açar.
   *
   * Yanıt iki biçimden biridir — istemci hangisi olduğunu `outcome` ile anlar,
   * ayrı bir uç çağırmak zorunda kalmaz (bkz. shared CreateOrRequestResult).
   */
  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const userId = req.user.userId;
    const needsApproval = await this.creationRequests.requiresApproval("job", userId, {
      organizationId: body?.organizationId,
    });
    if (needsApproval) {
      const request = await this.creationRequests.create(userId, {
        kind: "job",
        organizationId: body.organizationId,
        payload: { title: body?.title, description: body?.description },
      });
      return { outcome: "pending", request };
    }
    return { outcome: "created", entity: await this.jobsService.create(userId, body) };
  }

  // NOT: bu route ":id" ile çakışmaması için ondan önce tanımlanmalı.
  @Patch("reorder")
  reorder(@Req() req: any, @Body("ids") ids: string[]) {
    return this.jobsService.reorder(req.user.userId, ids);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.jobsService.update(id, body, req.user.userId);
  }

  @Post(":id/cover")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.jobsService.uploadCover(id, file, req.user.userId);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.jobsService.remove(id, req.user.userId);
  }

  @Patch(":id/archive")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.jobsService.archive(id, req.user.userId);
  }

  @Patch(":id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.jobsService.restore(id, req.user.userId);
  }
}
