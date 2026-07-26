import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TasksService } from "./tasks.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get("projects/:projectId/tasks")
  findByProject(@Param("projectId") projectId: string, @Req() req: any) {
    return this.tasksService.findByProject(projectId, req.user.userId);
  }

  @Post("projects/:projectId/tasks")
  create(@Param("projectId") projectId: string, @Body() body: any) {
    return this.tasksService.create(projectId, body);
  }

  // NOT: bu route "tasks/:id" ile çakışmaması için ondan önce tanımlanmalı.
  @Patch("tasks/reorder")
  reorder(@Body("ids") ids: string[]) {
    return this.tasksService.reorder(ids);
  }

  @Patch("tasks/:id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.tasksService.update(id, body);
  }

  @Patch("tasks/:id/status")
  updateStatus(@Param("id") id: string, @Body("status") status: any) {
    return this.tasksService.updateStatus(id, status);
  }

  @Patch("tasks/:id/budget-status")
  updateBudgetStatus(@Param("id") id: string, @Body("budgetStatus") budgetStatus: any) {
    return this.tasksService.updateBudgetStatus(id, budgetStatus);
  }

  @Patch("tasks/:id/schedule")
  updateSchedule(@Param("id") id: string, @Body() body: { startDate?: string; deadline?: string }) {
    return this.tasksService.updateSchedule(id, body.startDate, body.deadline);
  }

  @Delete("tasks/:id")
  remove(@Param("id") id: string) {
    return this.tasksService.remove(id);
  }

  @Patch("tasks/:id/archive")
  archive(@Param("id") id: string) {
    return this.tasksService.archive(id);
  }

  @Patch("tasks/:id/restore")
  restore(@Param("id") id: string) {
    return this.tasksService.restore(id);
  }
}
