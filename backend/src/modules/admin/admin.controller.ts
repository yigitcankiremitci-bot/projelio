import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AdminService } from "./admin.service";
import { UsersService } from "../users/users.service";
import { DemoAnlikGoruntuService } from "../demo/demo-anlik-goruntu.service";
import { DemoSifirlamaService } from "../demo/demo-sifirlama.service";
import { AdminKullanicilarService } from "./admin-kullanicilar.service";
import { AdminMesajService } from "./admin-mesaj.service";
import type { AdminMesajGirdisi } from "@projelio/shared";

@Controller("admin")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class AdminController {
  constructor(
    private adminService: AdminService,
    private usersService: UsersService,
    private demoAnlikGoruntu: DemoAnlikGoruntuService,
    private demoSifirlama: DemoSifirlamaService,
    private kullanicilar: AdminKullanicilarService,
    private mesaj: AdminMesajService
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

  // ------------------------------------------------------ kullanıcı yönetimi
  //
  // Kurallar AdminKullanicilarService'te; buradaki uçlar yalnızca kapı.
  // Tüm işlemler admin_user_actions'a kaydediliyor.

  @Get("kullanicilar")
  kullaniciListesi() {
    return this.kullanicilar.liste();
  }

  /** Bir ya da birden çok kullanıcıya (en fazla 200) bildirim ve/veya e-posta. */
  @Post("kullanicilar/mesaj")
  mesajGonder(@Body() body: Partial<AdminMesajGirdisi> & { userIds?: string[] }, @Req() req: any) {
    const { userIds, ...girdi } = body ?? {};
    return this.mesaj.gonder(req.user.userId, userIds, girdi);
  }

  @Get("kullanicilar/:id")
  kullaniciDetayi(@Param("id", ParseUUIDPipe) id: string) {
    return this.kullanicilar.detay(id);
  }

  @Post("kullanicilar/:id/askiya-al")
  async askiyaAl(@Param("id", ParseUUIDPipe) id: string, @Body() body: { sebep?: string }, @Req() req: any) {
    await this.kullanicilar.askiyaAl(req.user.userId, id, body?.sebep);
    return { ok: true };
  }

  @Post("kullanicilar/:id/askiyi-kaldir")
  async askiyiKaldir(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    await this.kullanicilar.askiyiKaldir(req.user.userId, id);
    return { ok: true };
  }

  @Post("kullanicilar/:id/oturumlari-kapat")
  async oturumlariKapat(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    await this.kullanicilar.oturumlariKapat(req.user.userId, id);
    return { ok: true };
  }

  @Post("kullanicilar/:id/rol")
  async rolDegistir(@Param("id", ParseUUIDPipe) id: string, @Body() body: { rol?: "admin" | "freelancer" }, @Req() req: any) {
    await this.kullanicilar.rolDegistir(req.user.userId, id, body?.rol as any);
    return { ok: true };
  }

  @Post("kullanicilar/:id/eposta-dogrula")
  async epostayiDogrula(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    await this.kullanicilar.epostayiDogrula(req.user.userId, id);
    return { ok: true };
  }

  @Post("kullanicilar/:id/kredi/yukle")
  krediYukle(@Param("id", ParseUUIDPipe) id: string, @Body() body: { miktar?: number; aciklama?: string }, @Req() req: any) {
    return this.kullanicilar.krediYukle(req.user.userId, id, Number(body?.miktar), body?.aciklama);
  }

  @Post("kullanicilar/:id/kredi/dus")
  krediDus(@Param("id", ParseUUIDPipe) id: string, @Body() body: { miktar?: number; aciklama?: string }, @Req() req: any) {
    return this.kullanicilar.krediDus(req.user.userId, id, Number(body?.miktar), body?.aciklama);
  }

  @Post("kullanicilar/:id/kredi/:hareketId/geri-al")
  krediGeriAl(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("hareketId", ParseUUIDPipe) hareketId: string,
    @Body() body: { aciklama?: string },
    @Req() req: any
  ) {
    return this.kullanicilar.krediGeriAl(req.user.userId, id, hareketId, body?.aciklama);
  }

  @Post("kullanicilar/:id/silme-planla")
  silmePlanla(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    return this.kullanicilar.silmePlanla(req.user.userId, id);
  }

  @Post("kullanicilar/:id/silmeyi-iptal-et")
  async silmeyiIptalEt(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    await this.kullanicilar.silmeyiIptalEt(req.user.userId, id);
    return { ok: true };
  }

  /** GERİ ALINAMAZ — gövdede hesabın e-postası onay olarak istenir. */
  @Post("kullanicilar/:id/hemen-sil")
  async hemenSil(@Param("id", ParseUUIDPipe) id: string, @Body() body: { onayEposta?: string }, @Req() req: any) {
    await this.kullanicilar.hemenSil(req.user.userId, id, body?.onayEposta);
    return { ok: true };
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
