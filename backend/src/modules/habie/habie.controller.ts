import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { HabieService } from "./habie.service";

@Controller("habie")
export class HabieController {
  constructor(private readonly habieService: HabieService) {}

  /**
   * Habie oturumu açar. Giriş yapmış Projelio kullanıcısı çağırır.
   * Habie Projelio'nun İÇİNE gömülüyse kullanılacak yol budur.
   *
   * POST /habie/session   ·   Authorization: Bearer <projelio jwt>
   */
  @UseGuards(AuthGuard("jwt"))
  @Post("session")
  session(@Req() req: any) {
    return this.habieService.createSession(req.user.userId, req.user.email, req.user.role);
  }

  /**
   * Ayrı alan adındaki Habie için devir kodu üretir.
   *
   * Projelio'daki /habie sayfası bunu çağırıp kullanıcıyı
   * habie.../?code=... adresine yönlendirir. Token URL'e konmaz.
   *
   * POST /habie/handoff   ·   Authorization: Bearer <projelio jwt>
   */
  @UseGuards(AuthGuard("jwt"))
  @Post("handoff")
  handoff(@Req() req: any) {
    return { code: this.habieService.createHandoff(req.user.userId, req.user.email, req.user.role) };
  }

  /**
   * Devir kodunu Habie oturumuna çevirir. Kimlik doğrulaması İSTEMEZ —
   * kodun kendisi tek kullanımlık ve 2 dakika ömürlü bir kimlik kanıtı.
   *
   * POST /habie/exchange  ·  { code }
   */
  @Post("exchange")
  exchange(@Body("code") code: string) {
    if (!code) throw new BadRequestException("code gerekli");
    return this.habieService.consumeHandoff(code);
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
