import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { HabieService } from "./habie.service";

@Controller("habie")
export class HabieController {
  constructor(private readonly habieService: HabieService) {}

  /**
   * Habie oturumu açar. Giriş yapmış Projelio kullanıcısı çağırır.
   *
   * POST /habie/session
   * Authorization: Bearer <projelio jwt>
   *
   * Döner: { assertion, agent: { token, chatPath, ... }, user }
   */
  @UseGuards(AuthGuard("jwt"))
  @Post("session")
  session(@Req() req: any) {
    return this.habieService.createSession(req.user.userId, req.user.email, req.user.role);
  }

  /**
   * Habie'nin bağlanmadan önce yapılandırmayı kontrol edebilmesi için.
   * Kimlik doğrulaması istemez, sır sızdırmaz — sadece "hazır mı" der.
   */
  @Get("status")
  status() {
    return {
      configured: Boolean(process.env.HABIE_APP_SECRET?.trim()),
      agent: { name: "Lio", streaming: false },
    };
  }
}
