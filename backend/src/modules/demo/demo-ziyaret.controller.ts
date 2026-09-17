import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { demoEpostasiMi } from "../../common/demo-hesap";
import { DemoZiyaretService } from "./demo-ziyaret.service";

@Controller("demo")
@UseGuards(AuthGuard("jwt"))
export class DemoZiyaretController {
  constructor(private ziyaret: DemoZiyaretService) {}

  /**
   * Demo ziyaretçisinin gezinme olayları (apps/web/src/lib/demoZiyaret.ts).
   *
   * Yalnızca demo hesabının oturumu yazabilir; başka biri çağırırsa sessizce
   * 204 döner — gerçek kullanıcıların gezinmesi ÖLÇÜLMÜYOR ve bu uç onu
   * ölçmeye kapı olmamalı. Hata yok: istemci yanıta bakmıyor.
   */
  @Post("ziyaret")
  @HttpCode(204)
  async olaylar(@Body() body: unknown, @Req() req: any): Promise<void> {
    if (req.user.agent || !demoEpostasiMi(req.user.email)) return;
    await this.ziyaret.kaydet(body);
  }
}
