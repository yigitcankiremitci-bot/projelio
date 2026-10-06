import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BultenRateLimitGuard } from "./bulten.guard";
import { BultenService } from "./bulten.service";
import type { BultenGirdisi } from "./bulten";

/**
 * KİMLİK DOĞRULAMASI OLMAYAN uç: tanıtım sitesinin bülten formu.
 * Landing'e çerezsiz CORS ile açık (bkz. common/config/cors-karari.ts).
 *
 * BU DENETLEYİCİYE YENİ UÇ EKLEME — buradaki her şey internete açıktır.
 */
@Controller("public/bulten")
export class BultenPublicController {
  constructor(private bulten: BultenService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(BultenRateLimitGuard)
  aboneOl(@Body() body: BultenGirdisi) {
    return this.bulten.aboneOl(body);
  }
}

/** Admin > Bülten. Hepsi yönetici rolüne kapalı. */
@Controller("admin/bulten")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class BultenAdminController {
  constructor(private bulten: BultenService) {}

  @Get()
  listele() {
    return this.bulten.listele();
  }

  @Post(":id/iptal")
  @HttpCode(200)
  iptal(@Param("id", ParseUUIDPipe) id: string) {
    return this.bulten.iptalEt(id);
  }

  @Delete(":id")
  sil(@Param("id", ParseUUIDPipe) id: string) {
    return this.bulten.sil(id);
  }
}
