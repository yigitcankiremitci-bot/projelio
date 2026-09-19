import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { DemoAyarlari, DemoRandevuDurumu, DemoRandevuGirdisi } from "@projelio/shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { DemoRandevuService } from "./demo-randevu.service";
import { DemoMeetService } from "./demo-meet.service";

/**
 * Üye uçları: Ayarlar > Yardımcılar'daki "Canlı demo" kartı.
 *
 * Randevunun iptali ve taşınması üye için de yönetim token'ı üzerinden
 * (public/demo/:token) yapılıyor — kural tek yerde, e-postadaki bağlantıyla
 * kart aynı yoldan geçiyor.
 */
@Controller("demo-randevu")
@UseGuards(AuthGuard("jwt"))
export class DemoRandevuController {
  constructor(
    private demo: DemoRandevuService,
    private meet: DemoMeetService
  ) {}

  /** Takvim izni yalnızca demo yapan kişiden istenir: moderatör ya da yönetici. */
  private async sunucuOlmali(req: any) {
    if (req.user.role !== "admin" && !(await this.demo.sunucuMu(req.user.userId))) {
      throw new ForbiddenException("Yalnızca demo sunucuları Google Meet bağlayabilir.");
    }
  }

  @Get("google")
  async googleDurum(@Req() req: any) {
    await this.sunucuOlmali(req);
    return this.meet.durum(req.user.userId);
  }

  /** `donus`: Google'dan sonra dönülecek sayfa (ör. Admin paneli); yalnızca uygulama içi yol. */
  @Get("google/baglan")
  async googleBaglan(@Req() req: any, @Query("donus") donus?: string) {
    await this.sunucuOlmali(req);
    const next = donus && donus.startsWith("/") && !donus.startsWith("//") ? donus : "/settings";
    return { url: this.meet.baglantiAdresi(req.user.userId, next) };
  }

  @Delete("google")
  async googleKes(@Req() req: any) {
    await this.sunucuOlmali(req);
    await this.meet.baglantiyiKes(req.user.userId);
    return this.meet.durum(req.user.userId);
  }

  @Get("benim")
  async benim(@Req() req: any) {
    const [randevu, sunucu] = await Promise.all([this.demo.benim(req.user.userId), this.demo.sunucuMu(req.user.userId)]);
    return { randevu, sunucu: sunucu || req.user.role === "admin" };
  }

  @Post()
  al(@Body() body: DemoRandevuGirdisi, @Req() req: any) {
    // Herkese açık demo hesabını herkes kullanıyor; randevu ona bağlanırsa
    // kimin aldığı belli olmaz ve e-postalar ortak adrese gider.
    if (req.user.role === "demo") throw new ForbiddenException("Demo hesabıyla randevu alınamaz.");
    // Üyeden ad/e-posta ALINMAZ: hesabındaki bilgiler kullanılıyor, başkası
    // adına randevu açılamasın.
    const { ad: _a, eposta: _e, ...girdi } = body ?? ({} as DemoRandevuGirdisi);
    return this.demo.randevuAl(girdi as DemoRandevuGirdisi, req.user.userId);
  }

  /** Moderatörün kendisine atanan görüşmeler. */
  @Get("gorevlerim")
  gorevlerim(@Req() req: any) {
    return this.demo.gorevlerim(req.user.userId);
  }

  /** Moderatör: sonucu işaretle ya da iç not yaz. Yetki kararı serviste. */
  @Patch("gorevlerim/:id")
  async gorevGuncelle(@Param("id") id: string, @Body() body: { durum?: DemoRandevuDurumu; icNot?: string }, @Req() req: any) {
    const yonetici = req.user.role === "admin";
    if (!yonetici && !(await this.demo.sunucuMu(req.user.userId))) throw new ForbiddenException();
    return this.demo.guncelle(id, { durum: body?.durum, icNot: body?.icNot }, { userId: req.user.userId, yonetici: false });
  }
}

/** Admin > Demo randevuları. Hepsi yönetici rolüne kapalı. */
@Controller("admin/demo-randevu")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class DemoRandevuAdminController {
  constructor(private demo: DemoRandevuService) {}

  @Get("ayarlar")
  ayarlar() {
    return this.demo.ayarlariOku();
  }

  @Patch("ayarlar")
  ayarlariKaydet(@Body() body: Partial<DemoAyarlari>, @Req() req: any) {
    return this.demo.ayarlariKaydet(body ?? {}, req.user.userId);
  }

  @Get("randevular")
  liste(@Query("kapsam") kapsam?: string) {
    return this.demo.liste(kapsam === "gecmis" ? "gecmis" : "yaklasan");
  }

  @Get("musaitlik")
  musaitlik(@Query("haric") haric?: string) {
    return this.demo.musaitlik(haric || undefined);
  }

  @Patch("randevular/:id")
  guncelle(
    @Param("id") id: string,
    @Body() body: { sunucuId?: string | null; toplantiLinki?: string | null; icNot?: string | null; durum?: DemoRandevuDurumu },
    @Req() req: any
  ) {
    return this.demo.guncelle(id, body ?? {}, { userId: req.user.userId, yonetici: true });
  }

  @Post("randevular/:id/iptal")
  iptal(@Param("id") id: string, @Body("neden") neden?: string) {
    return this.demo.yoneticiIptal(id, neden);
  }

  @Post("randevular/:id/meet")
  meetOlustur(@Param("id") id: string, @Req() req: any) {
    return this.demo.meetOlustur(id, req.user.userId);
  }

  @Post("randevular/:id/tasi")
  tasi(@Param("id") id: string, @Body("baslangic") baslangic?: string) {
    return this.demo.yoneticiTasi(id, baslangic);
  }

  @Get("sunucular")
  sunucular(@Req() req: any) {
    return this.demo.sunucular(req.user.userId);
  }

  @Post("sunucular")
  sunucuEkle(@Body() body: { eposta?: string; toplantiLinki?: string | null }, @Req() req: any) {
    return this.demo.sunucuEkle(body?.eposta ?? "", body?.toplantiLinki, req.user.userId);
  }

  @Patch("sunucular/:userId")
  sunucuGuncelle(@Param("userId") userId: string, @Req() req: any, @Body("toplantiLinki") toplantiLinki?: string | null) {
    return this.demo.sunucuGuncelle(userId, toplantiLinki ?? null, req.user.userId);
  }

  @Delete("sunucular/:userId")
  sunucuSil(@Param("userId") userId: string, @Req() req: any) {
    return this.demo.sunucuSil(userId, req.user.userId);
  }
}
