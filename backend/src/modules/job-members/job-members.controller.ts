import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JobMembersService } from "./job-members.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class JobMembersController {
  constructor(private jobMembersService: JobMembersService) {}

  // NOT: bu uç "jobs/:jobId/members"tan bağımsız — giriş yapmış kullanıcının
  // TÜM işlerdeki bekleyen davetlerini döner (bildirim çanı bunu okur).
  @Get("me/job-invites")
  findMyInvites(@Req() req: any) {
    return this.jobMembersService.findPendingForUser(req.user.userId);
  }

  @Get("jobs/:jobId/members")
  findByJob(@Param("jobId") jobId: string) {
    return this.jobMembersService.findByJob(jobId);
  }

  @Post("jobs/:jobId/members")
  hire(@Param("jobId") jobId: string, @Body() body: { userId: string; title?: string }, @Req() req: any) {
    return this.jobMembersService.hire(jobId, body.userId, body.title, req.user.userId);
  }

  // Daveti yanıtlama: userId body'den DEĞİL, giriş yapmış kullanıcıdan alınır —
  // yoksa biri başkasının davetini kabul edebilirdi.
  @Patch("job-members/:id/respond")
  respond(@Param("id") id: string, @Body("approve") approve: boolean, @Req() req: any) {
    return this.jobMembersService.respond(id, approve, req.user.userId);
  }

  @Delete("job-members/:id")
  remove(@Param("id") id: string) {
    return this.jobMembersService.remove(id);
  }
}
