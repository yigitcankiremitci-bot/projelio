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

  // Kendi kadro kaydım. Ekip listesinin tamamını açmaz — taşeron ekibi göremez
  // (yukarıdaki assertNotSubcontractor) ama kendi kaydını görmeli, yoksa işten
  // ayrılma düğmesinin görünüp görünmeyeceği bilinemezdi.
  @Get("jobs/:jobId/members/me")
  async findMine(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    return this.jobMembersService.findMembership(jobId, req.user.userId);
  }

  // İşten ayrılma. "job-members/:id" ile aynı işi yapar ama üyelik kimliğini
  // bilmeyi gerektirmez: ekip listesini göremeyen (taşeron) ya da Ekip sekmesi
  // kapatılmış bir işteki kişinin ayrılabilmesinin tek yolu bu.
  @Delete("jobs/:jobId/members/me")
  leave(@Param("jobId") jobId: string, @Req() req: any) {
    return this.jobMembersService.leaveJob(jobId, req.user.userId);
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
