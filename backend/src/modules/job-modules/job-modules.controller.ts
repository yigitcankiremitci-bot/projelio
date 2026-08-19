import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JobModulesService } from "./job-modules.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class JobModulesController {
  constructor(
    private jobModulesService: JobModulesService,
    private access: AccessService
  ) {}

  @Get("jobs/:jobId/modules")
  async findByJob(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    return this.jobModulesService.findByJob(jobId);
  }

  @Post("jobs/:jobId/modules")
  assign(@Param("jobId") jobId: string, @Body("moduleKey") moduleKey: string, @Req() req: any) {
    return this.jobModulesService.assign(jobId, moduleKey, req.user.userId);
  }

  @Delete("jobs/:jobId/modules/:moduleKey")
  unassign(@Param("jobId") jobId: string, @Param("moduleKey") moduleKey: string, @Req() req: any) {
    return this.jobModulesService.unassign(jobId, moduleKey, req.user.userId);
  }
}
