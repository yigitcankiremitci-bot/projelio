import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { SupportService } from "./support.service";

/**
 * Destek talepleri.
 *
 * İki kitle, iki yetki seviyesi: kullanıcı yalnızca KENDİ taleplerini görür ve
 * yeni talep bırakır; panoyu görmek ve yanıtlamak admin'e özeldir. Bu yüzden
 * admin uçları ayrı bir denetleyicide (aşağıda) — sınıf seviyesindeki
 * @Roles("admin") kullanıcı uçlarını da kapatırdı.
 */
@Controller("support")
@UseGuards(AuthGuard("jwt"))
export class SupportController {
  constructor(private supportService: SupportService) {}

  @Post()
  create(@Req() req: any, @Body() body: { name?: string; subject?: string; message?: string }) {
    return this.supportService.create(req.user.userId, body);
  }

  @Get("mine")
  findMine(@Req() req: any) {
    return this.supportService.findMine(req.user.userId);
  }
}

@Controller("admin/support")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class SupportAdminController {
  constructor(private supportService: SupportService) {}

  @Get()
  findAll() {
    return this.supportService.findAll();
  }

  @Patch(":id/reply")
  reply(@Req() req: any, @Param("id") id: string, @Body("reply") reply?: string) {
    return this.supportService.reply(id, req.user.userId, reply);
  }
}
