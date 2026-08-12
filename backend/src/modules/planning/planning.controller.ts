import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { PlanBlockStatus, PlanPeriodKind, PlanPreferences } from "@projelio/shared";
import { PlanningService, type BlockInput } from "./planning.service";
import { today } from "./planning.dates";

/**
 * Takvim / kişisel planlama uç noktaları.
 *
 * Buradaki hiçbir uç nokta kullanıcı kimliğini gövdeden veya parametreden
 * almaz; daima `req.user.userId` kullanılır. Planlar kullanıcının kimseyle
 * paylaşmadığı kayıtlar olduğu için bu kural istisnasızdır
 * (bkz. PlanningService başındaki güvenlik notu).
 *
 * NOT: Eski `GET /calendar` (proje görevlerini "benim / ekip" diye filtreleyen
 * uç nokta) yerinde duruyor — o ekip takvimidir, burası kişisel planlamadır.
 * İkisi bilinçli olarak ayrı: biri paylaşılan veriyi okur, diğeri kimsenin
 * görmediği bir katmanı yazar.
 */
@Controller("planning")
@UseGuards(AuthGuard("jwt"))
export class PlanningController {
  constructor(private planning: PlanningService) {}

  // ------------------------------------------------------------------ Görünüm

  /** Takvimin tek istekle beslenmesi: bloklar, hedefler, ilerleme ve bekleyen ritüel. */
  @Get("calendar")
  getCalendar(@Req() req: any, @Query("kind") kind?: string, @Query("date") date?: string) {
    return this.planning.getCalendar(req.user.userId, (kind ?? "week") as PlanPeriodKind, date ?? today());
  }

  @Get("progress")
  getProgress(@Req() req: any, @Query("kind") kind?: string, @Query("date") date?: string) {
    return this.planning.getProgress(req.user.userId, (kind ?? "week") as PlanPeriodKind, date ?? today());
  }

  /**
   * Takvime sürüklenebilecek görevler: kullanıcının erişebildiği tüm proje ve
   * program görevleri. Kişisel panodan (calendar.unscheduled) ayrı, çünkü
   * kapsamı farklı — pano "benim tabağım", burası "erişebildiğim her şey".
   *
   * Takvim yükünü şişirmemek için ayrı uç noktada: arayüz bu listeyi ancak
   * kullanıcı ilgili sekmeye geçtiğinde çekiyor.
   */
  @Get("schedulable-tasks")
  listSchedulableTasks(
    @Req() req: any,
    @Query("query") query?: string,
    @Query("projectId") projectId?: string,
    @Query("limit") limit?: string
  ) {
    return this.planning.listSchedulableTasks(req.user.userId, {
      query: query?.trim() || undefined,
      projectId: projectId || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // --------------------------------------------------------------- Tercihler

  @Get("preferences")
  getPreferences(@Req() req: any) {
    return this.planning.getPreferences(req.user.userId);
  }

  @Patch("preferences")
  updatePreferences(@Req() req: any, @Body() body: Partial<PlanPreferences>) {
    return this.planning.updatePreferences(req.user.userId, body);
  }

  // ------------------------------------------------------------ Odak alanları

  @Get("focus-areas")
  listFocusAreas(@Req() req: any, @Query("includeArchived") includeArchived?: string) {
    return this.planning.listFocusAreas(req.user.userId, includeArchived === "true");
  }

  @Post("focus-areas")
  createFocusArea(@Req() req: any, @Body() body: { name?: string; color?: string; jobId?: string }) {
    return this.planning.createFocusArea(req.user.userId, body);
  }

  // NOT: "focus-areas/:id" ile çakışmasın diye ondan önce tanımlı.
  @Patch("focus-areas/reorder")
  reorderFocusAreas(@Req() req: any, @Body("ids") ids: string[]) {
    return this.planning.reorderFocusAreas(req.user.userId, ids);
  }

  @Patch("focus-areas/:id")
  updateFocusArea(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { name?: string; color?: string | null; jobId?: string | null }
  ) {
    return this.planning.updateFocusArea(req.user.userId, id, body);
  }

  /** Kalıcı silmez, arşivler: geçmiş dönemlerin raporları alanın adına dayanır. */
  @Delete("focus-areas/:id")
  archiveFocusArea(@Req() req: any, @Param("id") id: string) {
    return this.planning.archiveFocusArea(req.user.userId, id);
  }

  // ----------------------------------------------------------------- Dönemler

  @Get("periods")
  getPeriod(@Req() req: any, @Query("kind") kind?: string, @Query("date") date?: string) {
    return this.planning.getPeriod(req.user.userId, (kind ?? "week") as PlanPeriodKind, date ?? today());
  }

  @Patch("periods/:id")
  updatePeriod(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: { theme?: string | null; note?: string | null; reviewNote?: string | null; capacityMinutes?: number | null; status?: string }
  ) {
    return this.planning.updatePeriod(req.user.userId, id, body);
  }

  // ----------------------------------------------------------------- Hedefler

  @Get("periods/:id/targets")
  listTargets(@Req() req: any, @Param("id") id: string) {
    return this.planning.listTargets(req.user.userId, id);
  }

  /**
   * Dönemin hedeflerini TOPLU yazar. Gelen liste dönemin yeni tam hâlidir;
   * listede olmayan hedefler silinir. Sihirbaz da arayüz de bu yolu kullanır.
   */
  // POST, PUT değil: api/client.ts yalnızca get/post/patch/delete konuşuyor
  // (bkz. apps/web/src/api/client.ts). Uç noktanın yerine koyma semantiği
  // gövdedeki tam listeden anlaşılıyor.
  @Post("periods/:id/targets")
  setTargets(@Req() req: any, @Param("id") id: string, @Body("targets") targets: any[]) {
    return this.planning.setTargets(req.user.userId, id, targets ?? []);
  }

  /** Adet hedefinin sayacını ilerletir ("10 içerikten 4'ünü yaptım"). */
  @Patch("targets/:id/count")
  bumpTargetCount(@Req() req: any, @Param("id") id: string, @Body("delta") delta: number) {
    return this.planning.bumpTargetCount(req.user.userId, id, delta ?? 1);
  }

  // ------------------------------------------------------------ Zaman blokları

  @Get("blocks")
  listBlocks(@Req() req: any, @Query("from") from: string, @Query("to") to: string) {
    return this.planning.listBlocks(req.user.userId, from, to);
  }

  @Post("blocks")
  createBlock(@Req() req: any, @Body() body: BlockInput) {
    return this.planning.createBlock(req.user.userId, body);
  }

  /** Toplu ekleme; sihirbazın ve Lio'nun yolu. */
  @Post("blocks/bulk")
  createBlocks(@Req() req: any, @Body("blocks") blocks: BlockInput[]) {
    return this.planning.createBlocks(req.user.userId, blocks ?? []);
  }

  /**
   * Lio'nun dokunulmamış önerilerini temizler. NOT: ":id" yollarından önce
   * tanımlı olmalı, aksi halde "suggestions" bir blok id'si sanılır.
   */
  @Delete("blocks/suggestions")
  clearSuggestions(@Req() req: any, @Query("from") from: string, @Query("to") to: string) {
    return this.planning.clearSuggestions(req.user.userId, from, to);
  }

  /** Sürükle-bırak. endsAt verilmezse bloğun mevcut süresi korunur. */
  @Patch("blocks/:id/move")
  moveBlock(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { blockDate?: string; startsAt?: string; endsAt?: string }
  ) {
    return this.planning.moveBlock(req.user.userId, id, body);
  }

  @Patch("blocks/:id/status")
  setBlockStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { status?: PlanBlockStatus; actualMinutes?: number }
  ) {
    return this.planning.setBlockStatus(req.user.userId, id, body.status as PlanBlockStatus, body.actualMinutes);
  }

  @Patch("blocks/:id")
  updateBlock(@Req() req: any, @Param("id") id: string, @Body() body: BlockInput) {
    return this.planning.updateBlock(req.user.userId, id, body);
  }

  @Delete("blocks/:id")
  deleteBlock(@Req() req: any, @Param("id") id: string) {
    return this.planning.deleteBlock(req.user.userId, id);
  }

  // ---------------------------------------------------------------- Ritüeller

  /** Bugün bekleyen sihirbaz varsa döner; yoksa boş gövde. */
  @Get("rituals/due")
  getDueRitual(@Req() req: any, @Query("date") date?: string) {
    return this.planning.getDueRitual(req.user.userId, date);
  }

  @Get("rituals")
  listRituals(@Req() req: any, @Query("kind") kind?: string, @Query("limit") limit?: string) {
    return this.planning.listRituals(req.user.userId, kind, limit ? Number(limit) : undefined);
  }

  /** Oturumu kapatır. status='skipped' de bir cevaptır: aynı gün tekrar sorulmaz. */
  @Post("rituals")
  completeRitual(
    @Req() req: any,
    @Body()
    body: { kind?: string; occurredOn?: string; periodId?: string; answers?: Record<string, unknown>; summary?: string; status?: string }
  ) {
    return this.planning.completeRitual(req.user.userId, body);
  }

  // ----------------------------------------------------------- Otomatik dağıtım

  /**
   * Hedefleri takvime dağıtır.
   *
   * `apply=false` (varsayılan) yalnızca ne olacağını hesaplar ve döner —
   * kullanıcı önizlemeyi görmeden takvimi değiştirmiyoruz.
   */
  @Post("suggest")
  suggest(
    @Req() req: any,
    @Body() body: { kind?: string; date?: string; apply?: boolean; replaceExisting?: boolean }
  ) {
    return this.planning.suggestSchedule(
      req.user.userId,
      (body.kind ?? "week") as PlanPeriodKind,
      body.date ?? today(),
      { apply: body.apply === true, replaceExisting: body.replaceExisting === true }
    );
  }
}
