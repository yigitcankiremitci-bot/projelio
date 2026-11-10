import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { MuzeService } from "./muze.service";

/** Yalnızca okuma: plaketler değiştirilemez (bkz. migration 189). */
@Controller("muze")
@UseGuards(AuthGuard("jwt"))
export class MuzeController {
  constructor(private muze: MuzeService) {}

  @Get()
  list(@Req() req: any) {
    return this.muze.listForUser(req.user.userId);
  }

  /** Plaket kimliği ya da projenin kimliğiyle. */
  @Get(":id")
  findOne(@Param("id") id: string, @Req() req: any) {
    return this.muze.findOne(id, req.user.userId);
  }
}
