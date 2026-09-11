import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { WorkLogTargetKind } from "@projelio/shared";
import { WorklogService } from "./worklog.service";

/**
 * Yaptım sayfası: kullanıcının kişisel iş günlüğü.
 *
 * Buradaki hiçbir uç kullanıcı kimliğini gövdeden/parametreden almaz; daima
 * `req.user.userId`. Kayıtlar kullanıcının kimseyle paylaşmadığı notlar olduğu
 * için bu kural istisnasızdır (bkz. WorklogService güvenlik notu).
 */
@Controller("worklog")
@UseGuards(AuthGuard("jwt"))
export class WorklogController {
  constructor(private worklogService: WorklogService) {}

  @Get()
  list(
    @Req() req: any,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("unlinkedOnly") unlinkedOnly?: string,
    @Query("limit") limit?: string
  ) {
    return this.worklogService.list(req.user.userId, {
      from,
      to,
      unlinkedOnly: unlinkedOnly === "true",
      limit: limit ? Number(limit) : undefined,
    });
  }

  // NOT: ":id" ile çakışmasın diye ondan önce tanımlı.
  @Get("summary")
  summary(@Req() req: any, @Query("from") from?: string, @Query("to") to?: string) {
    return this.worklogService.summary(req.user.userId, { from, to });
  }

  /** O an kronometresi çalışan kayıtlar; birden fazla olabilir (bkz. migration 101). */
  @Get("running")
  running(@Req() req: any) {
    return this.worklogService.runningEntries(req.user.userId);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.worklogService.create(req.user.userId, body);
  }

  @Get(":id")
  findOne(@Req() req: any, @Param("id") id: string) {
    return this.worklogService.findOne(req.user.userId, id);
  }

  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.worklogService.update(req.user.userId, id, body);
  }

  /**
   * Kaydı bir yere iliştirir; targetKind boş gönderilirse bağlantıyı koparır.
   * Hedefe erişim SORULMAZ — bağlantı erişim vermez, bkz. servis notu.
   */
  @Patch(":id/link")
  link(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { targetKind?: WorkLogTargetKind | null; targetId?: string | null; targetLabel?: string | null }
  ) {
    return this.worklogService.link(req.user.userId, id, body);
  }

  /** Kaydı hedefte gerçek bir kayda dönüştürür (görev, kasa hareketi, modül kaydı…). */
  @Post(":id/push")
  push(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.worklogService.push(req.user.userId, id, body);
  }

  @Post(":id/timer/start")
  startTimer(@Req() req: any, @Param("id") id: string) {
    return this.worklogService.startTimer(req.user.userId, id);
  }

  /** Ara ver: süre birikime eklenir, kayıt "devam et" bekler hâlde kalır. */
  @Post(":id/timer/pause")
  pauseTimer(@Req() req: any, @Param("id") id: string) {
    return this.worklogService.stopTimer(req.user.userId, id, true);
  }

  /** Bitir: süre birikime eklenir ve kayıt sessizleşir. */
  @Post(":id/timer/stop")
  stopTimer(@Req() req: any, @Param("id") id: string) {
    return this.worklogService.stopTimer(req.user.userId, id);
  }

  /** Kalıcı silmez, arşivler. */
  @Delete(":id")
  archive(@Req() req: any, @Param("id") id: string) {
    return this.worklogService.archive(req.user.userId, id);
  }

  @Patch(":id/restore")
  restore(@Req() req: any, @Param("id") id: string) {
    return this.worklogService.restore(req.user.userId, id);
  }
}
