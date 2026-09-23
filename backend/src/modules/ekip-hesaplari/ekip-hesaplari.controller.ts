import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { EkipHesabiGirdisi } from "@projelio/shared";
import { cevirmen, istekDili } from "../../common/i18n";
import { EkipHesaplariService } from "./ekip-hesaplari.service";

type BaslikliIstek = { headers: Record<string, string | string[] | undefined> };

/** Modül adları veritabanında Türkçe; isteğin diline burada çevrilir (catalog.controller.ts ile aynı). */
function katalogCevirmeni(req: BaslikliIstek) {
  const baslik = (ad: string) => {
    const deger = req.headers[ad];
    return typeof deger === "string" ? deger : undefined;
  };
  return cevirmen(istekDili(baslik("x-projelio-locale"), baslik("accept-language")));
}

/**
 * Ekip Hesapları uçları (bkz. migration 130).
 *
 * Şirket yolun BAŞINDA: yetki (sahip mi, hangi departmanların yöneticisi)
 * hep oradan çözülüyor. Kayıt başına uçta şirket kaydın kendisinden okunur.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class EkipHesaplariController {
  constructor(private ekipHesaplari: EkipHesaplariService) {}

  @Get("organizations/:organizationId/ekip-hesaplari/secenekler")
  async secenekler(@Param("organizationId") organizationId: string, @Req() req: any) {
    const t = katalogCevirmeni(req);
    const s = await this.ekipHesaplari.secenekler(organizationId, req.user.userId);
    return {
      ...s,
      departmanlar: s.departmanlar.map((d) => ({ ...d, moduller: d.moduller.map((m) => ({ ...m, name: t(m.name) })) })),
    };
  }

  @Get("organizations/:organizationId/ekip-hesaplari/kullanici-adi")
  kullaniciAdi(
    @Param("organizationId") organizationId: string,
    @Query("username") username: string,
    @Req() req: any
  ) {
    return this.ekipHesaplari.kullaniciAdiUygunMu(organizationId, req.user.userId, username);
  }

  @Get("organizations/:organizationId/ekip-hesaplari")
  liste(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.ekipHesaplari.liste(organizationId, req.user.userId);
  }

  @Post("organizations/:organizationId/ekip-hesaplari")
  olustur(@Param("organizationId") organizationId: string, @Body() body: EkipHesabiGirdisi, @Req() req: any) {
    return this.ekipHesaplari.olustur(organizationId, body, req.user.userId);
  }

  @Post("ekip-hesaplari/:id/baglanti")
  baglanti(@Param("id") id: string, @Req() req: any) {
    return this.ekipHesaplari.baglantiyiYenidenGonder(id, req.user.userId);
  }
}
