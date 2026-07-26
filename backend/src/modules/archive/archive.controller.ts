import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ArchiveService } from "./archive.service";

@Controller("archive")
@UseGuards(AuthGuard("jwt"))
export class ArchiveController {
  constructor(private archiveService: ArchiveService) {}

  @Get()
  getArchived(@Req() req: any) {
    return this.archiveService.getArchivedForUser(req.user.userId);
  }
}
