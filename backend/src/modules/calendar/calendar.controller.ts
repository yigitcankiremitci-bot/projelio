import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CalendarService } from "./calendar.service";
import { TasksService } from "../tasks/tasks.service";

@Controller("calendar")
@UseGuards(AuthGuard("jwt"))
export class CalendarController {
  constructor(
    private calendarService: CalendarService,
    private tasksService: TasksService
  ) {}

  @Get()
  async getCalendar(
    @Req() req: any,
    @Query("projectId") projectId: string,
    @Query("scope") scope: "mine" | "team" = "mine"
  ) {
    const tasks = await this.tasksService.findByProject(projectId, req.user.userId);
    return this.calendarService.filterTasks(tasks, req.user.userId, scope);
  }
}
