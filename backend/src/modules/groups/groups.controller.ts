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
import { GroupsService } from "./groups.service";
import { JobsService } from "../jobs/jobs.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { AccessService } from "../../common/access/access.service";

@Controller("groups")
@UseGuards(AuthGuard("jwt"))
export class GroupsController {
  constructor(
    private groupsService: GroupsService,
    private jobsService: JobsService,
    private organizationsService: OrganizationsService,
    private access: AccessService
  ) {}

  @Get()
  findAll(@Req() req: any) {
    return this.groupsService.findAllForUser(req.user.userId);
  }

  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: any) {
    await this.access.assertCanViewGroup(id, req.user.userId);
    return this.groupsService.findOne(id);
  }

  // Gruba doğrudan bağlanmış (bir organizasyon üzerinden değil) işler.
  @Get(":id/jobs")
  findJobs(@Param("id") id: string, @Req() req: any) {
    return this.jobsService.findByGroup(id, req.user.userId);
  }

  // Gruba bağlı organizasyonlar.
  @Get(":id/organizations")
  async findOrganizations(@Param("id") id: string, @Req() req: any) {
    await this.access.assertCanViewGroup(id, req.user.userId);
    return this.organizationsService.findByGroupId(id);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.groupsService.create(req.user.userId, body);
  }

  // NOT: bu route ":id" ile çakışmaması için ondan önce tanımlanmalı.
  @Patch("reorder")
  reorder(@Req() req: any, @Body("ids") ids: string[]) {
    return this.groupsService.reorder(req.user.userId, ids);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.groupsService.update(id, body, req.user.userId);
  }

  @Post(":id/cover")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.groupsService.uploadCover(id, file, req.user.userId);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.groupsService.remove(id, req.user.userId);
  }

  @Patch(":id/archive")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.groupsService.archive(id, req.user.userId);
  }

  @Patch(":id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.groupsService.restore(id, req.user.userId);
  }
}
