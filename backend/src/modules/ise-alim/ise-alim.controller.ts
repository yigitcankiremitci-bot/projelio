import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { IseAlimDaveti, IseAlimGirdisi } from "@projelio/shared";
import { cevirmen, istekDili } from "../../common/i18n";
import { IseAlimService } from "./ise-alim.service";

type BaslikliIstek = { headers: Record<string, string | string[] | undefined> };

/** Modül adları veritabanında Türkçe; isteğin diline burada çevrilir (ekip-hesaplari.controller.ts ile aynı). */
function modulAdlariniCevir(req: BaslikliIstek, davet: IseAlimDaveti): IseAlimDaveti {
  const baslik = (ad: string) => {
    const deger = req.headers[ad];
    return typeof deger === "string" ? deger : undefined;
  };
  const t = cevirmen(istekDili(baslik("x-projelio-locale"), baslik("accept-language")));
  return { ...davet, moduller: davet.moduller.map((m) => ({ ...m, name: t(m.name) })) };
}

/**
 * İşe alım uçları (bkz. migration 143). Form seçenekleri Ekip Hesapları'nın
 * ucundan gelir: GET organizations/:id/ekip-hesaplari/secenekler.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class IseAlimController {
  constructor(private iseAlim: IseAlimService) {}

  @Get("organizations/:organizationId/ekip")
  async ekip(@Param("organizationId") organizationId: string, @Req() req: any) {
    const ekip = await this.iseAlim.ekip(organizationId, req.user.userId);
    return { ...ekip, bekleyenDavetler: ekip.bekleyenDavetler.map((d) => modulAdlariniCevir(req, d)) };
  }

  @Post("organizations/:organizationId/ise-alim")
  async davetEt(@Param("organizationId") organizationId: string, @Body() body: IseAlimGirdisi, @Req() req: any) {
    return modulAdlariniCevir(req, await this.iseAlim.davetEt(organizationId, body, req.user.userId));
  }

  @Get("ise-alim/davetlerim")
  async davetlerim(@Req() req: any) {
    return (await this.iseAlim.davetlerim(req.user.userId)).map((d) => modulAdlariniCevir(req, d));
  }

  @Get("ise-alim/:id")
  async detay(@Param("id") id: string, @Req() req: any) {
    return modulAdlariniCevir(req, await this.iseAlim.detay(id, req.user.userId));
  }

  @Post("ise-alim/:id/yanit")
  async yanitla(@Param("id") id: string, @Body() body: { kabul?: boolean }, @Req() req: any) {
    return modulAdlariniCevir(req, await this.iseAlim.yanitla(id, body?.kabul === true, req.user.userId));
  }

  @Post("ise-alim/:id/iptal")
  iptal(@Param("id") id: string, @Req() req: any) {
    return this.iseAlim.iptal(id, req.user.userId);
  }
}
