import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { memoryStorage } from "multer";
import { OperationsService } from "./operations.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class OperationsController {
  constructor(private operationsService: OperationsService) {}

  @Get("operations")
  findAll(@Req() req: any) {
    return this.operationsService.findAllForUser(req.user.userId);
  }

  // NOT: "operations/:id" ile çakışmaması için ondan önce tanımlı olmalı.
  @Patch("operations/reorder")
  reorder(@Req() req: any, @Body("ids") ids: string[]) {
    return this.operationsService.reorder(req.user.userId, ids);
  }

  @Post("operations/routines/preview")
  previewRoutine(@Body() body: any) {
    return this.operationsService.previewRoutineDates(body);
  }

  @Get("operations/:id")
  findOne(@Param("id") id: string) {
    return this.operationsService.findOne(id);
  }

  @Post("operations")
  create(@Req() req: any, @Body() body: any) {
    return this.operationsService.create(req.user.userId, body);
  }

  @Patch("operations/:id")
  update(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.operationsService.update(id, body, req.user.userId);
  }

  @Post("operations/:id/cover")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.operationsService.uploadCover(id, file, req.user.userId);
  }

  @Delete("operations/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.operationsService.remove(id, req.user.userId);
  }

  @Patch("operations/:id/archive")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.operationsService.archive(id, req.user.userId);
  }

  @Patch("operations/:id/restore")
  restore(@Param("id") id: string) {
    return this.operationsService.restore(id);
  }

  // ------------------------------------------------------------------ rutinler

  @Get("operations/:id/routines")
  findRoutines(@Param("id") id: string) {
    return this.operationsService.findRoutines(id);
  }

  @Post("operations/:id/routines")
  createRoutine(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.operationsService.createRoutine(id, body, req.user.userId);
  }

  @Patch("routines/:routineId")
  updateRoutine(@Param("routineId") routineId: string, @Body() body: any, @Req() req: any) {
    return this.operationsService.updateRoutine(routineId, body, req.user.userId);
  }

  @Delete("routines/:routineId")
  removeRoutine(@Param("routineId") routineId: string, @Req() req: any) {
    return this.operationsService.removeRoutine(routineId, req.user.userId);
  }

  // ----------------------------------------------------------------- tekrarlar

  @Get("operations/:id/occurrences")
  findOccurrences(@Param("id") id: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.operationsService.findOccurrences(id, from, to);
  }

  @Patch("occurrences/:occurrenceId/status")
  setOccurrenceStatus(
    @Param("occurrenceId") occurrenceId: string,
    @Body("status") status: string,
    @Req() req: any
  ) {
    return this.operationsService.setOccurrenceStatus(occurrenceId, status, req.user.userId);
  }

  @Patch("occurrences/:occurrenceId/skip")
  setOccurrenceSkipped(
    @Param("occurrenceId") occurrenceId: string,
    @Body("skipped") skipped: boolean,
    @Req() req: any
  ) {
    return this.operationsService.setOccurrenceSkipped(occurrenceId, skipped !== false, req.user.userId);
  }
}
