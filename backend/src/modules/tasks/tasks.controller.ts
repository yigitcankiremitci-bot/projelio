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
  create(@Param("projectId") projectId: string, @Body() body: any, @Req() req: any) {
    return this.tasksService.create(projectId, body, req.user.userId);
  }

  @Get("departments/:departmentId/tasks")
  findByDepartment(@Param("departmentId") departmentId: string) {
    return this.tasksService.findByDepartment(departmentId);
  }

  @Post("departments/:departmentId/tasks")
  createForDepartment(@Param("departmentId") departmentId: string, @Body() body: any, @Req() req: any) {
    return this.tasksService.createForDepartment(departmentId, body, req.user.userId);
  }

  // NOT: bu route "tasks/:id" ile çakışmaması için ondan önce tanımlanmalı.
  @Patch("tasks/reorder")
  reorder(@Body("ids") ids: string[]) {
    return this.tasksService.reorder(ids);
  }

  // NOT: "tasks/:id" ile çakışmasın diye ondan önce tanımlanmalı (aksi halde
  // "duplicate"/"move" birer :id gibi yorumlanır).
  @Post("tasks/duplicate")
  duplicate(@Body("ids") ids: string[], @Req() req: any) {
    return this.tasksService.duplicate(ids, req.user.userId);
  }

  @Patch("tasks/move")
  move(@Body() body: { ids: string[]; projectId?: string; departmentId?: string }, @Req() req: any) {
    return this.tasksService.move(body.ids, { projectId: body.projectId, departmentId: body.departmentId }, req.user.userId);
  }

  @Patch("tasks/:id")
  update(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.tasksService.update(id, body, req.user.userId);
  }

  @Patch("tasks/:id/status")
  updateStatus(@Req() req: any, @Param("id") id: string, @Body("status") status: any) {
    return this.tasksService.updateStatus(id, status, req.user.userId);
  }

  @Patch("tasks/:id/budget-status")
  updateBudgetStatus(@Param("id") id: string, @Body("budgetStatus") budgetStatus: any) {
    return this.tasksService.updateBudgetStatus(id, budgetStatus);
  }

  @Patch("tasks/:id/schedule")
  updateSchedule(@Param("id") id: string, @Body() body: { startDate?: string; deadline?: string }) {
    return this.tasksService.updateSchedule(id, body.startDate, body.deadline);
  }

  // Kullanıcı "üzerinde çalışıyorum" diyerek o an aktif olarak bu görevde çalıştığını
  // işaretler/kaldırır. Bir kullanıcının aynı anda yalnızca tek bir aktif görevi olabilir.
  @Patch("tasks/:id/active-worker")
  setActiveWorker(@Req() req: any, @Param("id") id: string, @Body("active") active: boolean) {
    return this.tasksService.setActiveWorker(req.user.userId, id, active);
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
