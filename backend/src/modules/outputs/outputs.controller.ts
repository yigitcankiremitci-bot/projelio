import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
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
  create(@Param("projectId") projectId: string, @Body() body: any) {
    return this.outputsService.create(projectId, body);
  }

  @Patch("outputs/:id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.outputsService.update(id, body);
  }

  @Delete("outputs/:id")
  remove(@Param("id") id: string) {
    return this.outputsService.remove(id);
  }
}
