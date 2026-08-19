import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JobMembersService } from "./job-members.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class JobMembersController {
  constructor(
    private jobMembersService: JobMembersService,
    private access: AccessService
  ) {}

  // NOT: bu uç "jobs/:jobId/members"tan bağımsız — giriş yapmış kullanıcının
  // TÜM işlerdeki bekleyen davetlerini döner (bildirim çanı bunu okur).
  @Get("me/job-invites")
  findMyInvites(@Req() req: any) {
    return this.jobMembersService.findPendingForUser(req.user.userId);
  }

  // İş ekibi listesi isim/e-posta içerir: işi görebilenlere açık, taşerona kapalı
  // (dış kaynak, ekibin kim olduğunu bilmemeli).
  @Get("jobs/:jobId/members")
  async findByJob(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "team");
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

  // Ekipten çıkarma: yalnızca işin sahibi (ya da kişinin kendisi — ayrılma).
  @Delete("job-members/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.jobMembersService.remove(id, req.user.userId);
  }
}
