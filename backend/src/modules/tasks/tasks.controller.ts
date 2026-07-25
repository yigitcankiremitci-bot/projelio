import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TasksService } from "./tasks.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get("projects/:projectId/tasks")
  findByProject(@Param("projectId") projectId: string) {
    return this.tasksService.findByProject(projectId);
  }

  @Post("projects/:projectId/tasks")
  create(@Param("projectId") projectId: string, @Body() body: any) {
    return this.tasksService.create(projectId, body);
  }

  @Patch("tasks/:id/status")
  updateStatus(@Param("id") id: string, @Body("status") status: any) {
    return this.tasksService.updateStatus(id, status);
  }

  @Patch("tasks/:id/schedule")
  updateSchedule(@Param("id") id: string, @Body() body: { startDate?: string; deadline?: string }) {
    return this.tasksService.updateSchedule(id, body.startDate, body.deadline);
  }

  @Delete("tasks/:id")
  remove(@Param("id") id: string) {
    return this.tasksService.remove(id);
  }
}
