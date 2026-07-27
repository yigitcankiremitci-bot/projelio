import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JobMembersService } from "./job-members.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class JobMembersController {
  constructor(private jobMembersService: JobMembersService) {}

  @Get("jobs/:jobId/members")
  findByJob(@Param("jobId") jobId: string) {
    return this.jobMembersService.findByJob(jobId);
  }

  @Post("jobs/:jobId/members")
  hire(@Param("jobId") jobId: string, @Body() body: { userId: string; title?: string }) {
    return this.jobMembersService.hire(jobId, body.userId, body.title);
  }

  @Delete("job-members/:id")
  remove(@Param("id") id: string) {
    return this.jobMembersService.remove(id);
  }
}
