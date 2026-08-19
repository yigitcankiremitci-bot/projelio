import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OutputsService } from "./outputs.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class OutputsController {
  constructor(
    private outputsService: OutputsService,
    private access: AccessService
  ) {}

  // Çıktılar projenin/departmanın görünürlüğünü devralır.
  @Get("projects/:projectId/outputs")
  async findByProject(@Param("projectId") projectId: string, @Req() req: any) {
    await this.access.assertCanViewProject(projectId, req.user.userId);
    return this.outputsService.findByProject(projectId);
  }

  @Post("projects/:projectId/outputs")
  create(@Param("projectId") projectId: string, @Body() body: any, @Req() req: any) {
    return this.outputsService.create(projectId, body, req.user.userId);
  }

  @Get("departments/:departmentId/outputs")
  async findByDepartment(@Param("departmentId") departmentId: string, @Req() req: any) {
    await this.access.assertCanViewDepartment(departmentId, req.user.userId);
    return this.outputsService.findByDepartment(departmentId);
  }

  @Post("departments/:departmentId/outputs")
  createForDepartment(@Param("departmentId") departmentId: string, @Body() body: any, @Req() req: any) {
    return this.outputsService.createForDepartment(departmentId, body, req.user.userId);
  }

  // NOT: bu route "outputs/:id" ile çakışmaması için ondan önce tanımlanmalı.
  // Çıktı yönetimi: proje/iş sahibi ya da departman kadrosu
  // (bkz. OutputsService.assertCanManageOutput). Eskiden hiç kontrol yoktu.
  @Patch("outputs/reorder")
  reorder(@Body("ids") ids: string[], @Req() req: any) {
    return this.outputsService.reorder(ids, req.user.userId);
  }

  @Patch("outputs/:id")
  update(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.outputsService.update(id, body, req.user.userId);
  }

  @Delete("outputs/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.outputsService.remove(id, req.user.userId);
  }

  @Patch("outputs/:id/archive")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.outputsService.archive(id, req.user.userId);
  }

  @Patch("outputs/:id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.outputsService.restore(id, req.user.userId);
  }
}
