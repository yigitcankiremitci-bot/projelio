import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OutputsService } from "./outputs.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class OutputsController {
  constructor(private outputsService: OutputsService) {}

  @Get("projects/:projectId/outputs")
  findByProject(@Param("projectId") projectId: string) {
    return this.outputsService.findByProject(projectId);
  }

  @Post("projects/:projectId/outputs")
  create(@Param("projectId") projectId: string, @Body() body: any, @Req() req: any) {
    return this.outputsService.create(projectId, body, req.user.userId);
  }

  // NOT: bu route "outputs/:id" ile çakışmaması için ondan önce tanımlanmalı.
  @Patch("outputs/reorder")
  reorder(@Body("ids") ids: string[]) {
    return this.outputsService.reorder(ids);
  }

  @Patch("outputs/:id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.outputsService.update(id, body);
  }

  @Delete("outputs/:id")
  remove(@Param("id") id: string) {
    return this.outputsService.remove(id);
  }

  @Patch("outputs/:id/archive")
  archive(@Param("id") id: string) {
    return this.outputsService.archive(id);
  }

  @Patch("outputs/:id/restore")
  restore(@Param("id") id: string) {
    return this.outputsService.restore(id);
  }
}
