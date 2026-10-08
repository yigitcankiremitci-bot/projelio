import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { ProjeEtkinlikGirdisi } from "@projelio/shared";
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

  // ------------------------------------------------------------ Proje takvimi

  /**
   * Kişisel Takvim'e düşen proje etkinlikleri. `projects/:id`'den ÖNCE
   * tanımlı — sıranın bir önemi yok (yollar ayrışıyor) ama okuyan kişi iki
   * listeleme ucunu yan yana görsün.
   */
  @Get("mine")
  kisisel(@Req() req: any, @Query("from") from: string, @Query("to") to: string) {
    return this.calendarService.kisiselTakvim(req.user.userId, from, to);
  }

  /** Proje takviminin tek istekle beslenmesi: etkinlikler + bakanın kendi blokları. */
  @Get("projects/:projectId")
  projeTakvimi(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("from") from: string,
    @Query("to") to: string
  ) {
    return this.calendarService.projeTakvimi(projectId, req.user.userId, from, to);
  }

  @Post("projects/:projectId/events")
  etkinlikEkle(@Req() req: any, @Param("projectId") projectId: string, @Body() body: ProjeEtkinlikGirdisi) {
    return this.calendarService.etkinlikEkle(projectId, req.user.userId, body);
  }

  @Patch("events/:id")
  etkinlikGuncelle(@Req() req: any, @Param("id") id: string, @Body() body: ProjeEtkinlikGirdisi) {
    return this.calendarService.etkinlikGuncelle(id, req.user.userId, body);
  }

  @Delete("events/:id")
  etkinlikSil(@Req() req: any, @Param("id") id: string) {
    return this.calendarService.etkinlikSil(id, req.user.userId);
  }
}
