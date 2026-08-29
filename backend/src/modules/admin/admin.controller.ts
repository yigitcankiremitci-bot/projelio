import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AdminService } from "./admin.service";
import { UsersService } from "../users/users.service";
import { DemoAnlikGoruntuService } from "../demo/demo-anlik-goruntu.service";
import { DemoSifirlamaService } from "../demo/demo-sifirlama.service";

@Controller("admin")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class AdminController {
  constructor(
    private adminService: AdminService,
    private usersService: UsersService,
    private demoAnlikGoruntu: DemoAnlikGoruntuService,
    private demoSifirlama: DemoSifirlamaService
  ) {}

  @Get("stats")
  getStats() {
    return this.adminService.getSystemStats();
  }

  // Admin'e özel görünüm: rol zaten @Roles("admin") ile korunuyor, bu yüzden
  // genel /users uç noktasındaki (tüm giriş yapmış kullanıcılara açık) daha
  // sıkı varsayılan üst sınır yerine daha yüksek bir tavan kullanılır.
  @Get("users")
  getUsers() {
    return this.usersService.findAll(1000);
  }

  // ------------------------------------------------------------------- demo
  //
  // Demo hesabı (ceo@celikhan.test) herkese açık ve verisi her girişte ilk
  // hâline dönüyor. Sahibi demoyu güzelleştirmek istediğinde araya bir
  // ziyaretçi girip emeğini silmesin diye "düzenleme kipi" var: açıkken
  // sıfırlama çalışmaz, kapatılırken o anki hâl yeni ilk hâl olarak kaydedilir.

  @Get("demo")
  async demoDurumu() {
    const [kip, ozet] = await Promise.all([
      this.demoAnlikGoruntu.duzenlemeKipi(),
      this.demoAnlikGoruntu.ozet(),
    ]);
    return { duzenlemeKipi: kip, anlikGoruntu: ozet };
  }

  /**
   * @param aktif  true: sıfırlamayı durdur (düzenlemeye başla)
   *               false: düzenlemeyi bitir
   * @param kaydet Kip kapatılırken o anki hâl kaydedilsin mi? Varsayılan evet.
   *               false verilirse yapılanlar bir sonraki girişte geri alınır —
   *               "denedim, beğenmedim" durumu için.
   */
  @Post("demo/duzenleme-kipi")
  async demoDuzenlemeKipi(@Body() body: { aktif?: boolean; kaydet?: boolean }, @Req() req: any) {
    const aktif = body?.aktif === true;
    let kaydedilen = null;
    if (!aktif && body?.kaydet !== false) {
      kaydedilen = await this.demoAnlikGoruntu.yakala();
    }
    const kip = await this.demoAnlikGoruntu.duzenlemeKipiniAyarla(aktif, req?.user?.userId);
    return { duzenlemeKipi: kip, kaydedilen };
  }

  /** Kipi kapatmadan "buraya kadarını kaydet". */
  @Post("demo/anlik-goruntu")
  async demoAnlikGoruntuAl() {
    return { kaydedilen: await this.demoAnlikGoruntu.yakala() };
  }

  /** Demoyu şimdi ilk hâline döndürür (kip kapalıyken anlamlı). */
  @Post("demo/sifirla")
  async demoSifirla() {
    await this.demoSifirlama.sifirla();
    return { ok: true };
  }
}
