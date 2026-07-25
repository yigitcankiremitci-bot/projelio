import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { MembersService } from "./members.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class MembersController {
  constructor(private membersService: MembersService) {}

  @Get("projects/:projectId/members")
  findByProject(@Param("projectId") projectId: string) {
    return this.membersService.findByProject(projectId);
  }

  @Post("projects/:projectId/members/invite")
  invite(@Param("projectId") projectId: string, @Body() body: { userId: string; role?: any }) {
    return this.membersService.invite(projectId, body.userId, body.role);
  }

  @Post("projects/:projectId/members/join-request")
  requestToJoin(@Param("projectId") projectId: string, @Body() body: { userId: string }) {
    return this.membersService.requestToJoin(projectId, body.userId);
  }

  @Patch("members/:id/respond")
  respond(@Param("id") id: string, @Body("approve") approve: boolean) {
    return this.membersService.respond(id, approve);
  }

  @Patch("members/:id/rate")
  setRate(@Param("id") id: string, @Body("rate") rate: number) {
    return this.membersService.setRate(id, rate);
  }
}
