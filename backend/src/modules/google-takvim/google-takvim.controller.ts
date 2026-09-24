import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { GoogleTakvimEtkinlikGirdisi, TakvimIsleme } from "@projelio/shared";
import { GoogleTakvimService } from "./google-takvim.service";

/**
 * Google Takvim uçları. Her şey istekte bulunan kullanıcının KENDİ takvimi
 * üzerinde — başka birinin takvimine bakmanın yolu yok (ekip takvimi bilinçli
 * olarak kapsam dışı, bkz. pages/Calendar.tsx başlığı).
 */
@Controller("google-takvim")
@UseGuards(AuthGuard("jwt"))
export class GoogleTakvimController {
  constructor(private takvim: GoogleTakvimService) {}

  @Get()
  durum(@Req() req: any) {
    return this.takvim.durum(req.user.userId);
  }

  /** `donus`: Google'dan sonra dönülecek uygulama içi yol (varsayılan takvim). */
  @Get("baglan")
  baglan(@Req() req: any, @Query("donus") donus?: string) {
    const next = donus && donus.startsWith("/") && !donus.startsWith("//") ? donus : "/calendar";
    return { url: this.takvim.baglantiAdresi(req.user.userId, next) };
  }

  @Delete()
  kes(@Req() req: any) {
    return this.takvim.baglantiyiKes(req.user.userId);
  }

  @Patch("ayarlar")
  ayarlar(@Req() req: any, @Body() body: { seciliTakvimler?: string[]; hedefTakvimId?: string }) {
    return this.takvim.ayarlariGuncelle(req.user.userId, body ?? {});
  }

  @Post("takvimler/yenile")
  takvimleriYenile(@Req() req: any) {
    return this.takvim.takvimleriYenile(req.user.userId);
  }

  @Get("etkinlikler")
  etkinlikler(@Req() req: any, @Query("from") from: string, @Query("to") to: string) {
    return this.takvim.etkinlikler(req.user.userId, from, to);
  }

  /** Görünen aralığı Google'dan tazeler. `zorla`: "Şimdi eşitle" düğmesi. */
  @Post("esitle")
  esitle(@Req() req: any, @Body() body: { from: string; to: string; zorla?: boolean }) {
    return this.takvim.esitle(req.user.userId, body?.from, body?.to, Boolean(body?.zorla));
  }

  @Post("etkinlikler")
  ekle(@Req() req: any, @Body() body: GoogleTakvimEtkinlikGirdisi) {
    return this.takvim.etkinlikEkle(req.user.userId, body);
  }

  @Patch("etkinlikler/:id")
  duzenle(@Req() req: any, @Param("id") id: string, @Body() body: GoogleTakvimEtkinlikGirdisi) {
    return this.takvim.etkinlikDuzenle(req.user.userId, id, body);
  }

  @Delete("etkinlikler/:id")
  sil(@Req() req: any, @Param("id") id: string) {
    return this.takvim.etkinlikSil(req.user.userId, id);
  }

  @Patch("etkinlikler/:id/isleme")
  isleme(@Req() req: any, @Param("id") id: string, @Body() body: { isleme: TakvimIsleme; gorevId?: string | null }) {
    return this.takvim.islemeAyarla(req.user.userId, id, body?.isleme, body?.gorevId);
  }

  @Post("bloklar/:blokId")
  blokuGonder(@Req() req: any, @Param("blokId") blokId: string) {
    return this.takvim.blokuGonder(req.user.userId, blokId);
  }

  @Delete("bloklar/:blokId")
  blokBaginiKaldir(@Req() req: any, @Param("blokId") blokId: string) {
    return this.takvim.blokBaginiKaldir(req.user.userId, blokId);
  }
}
