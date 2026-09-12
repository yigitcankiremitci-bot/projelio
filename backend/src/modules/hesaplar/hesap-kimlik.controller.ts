import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { HesapKilitService } from "./hesap-kilit.service";
import { HesapKimlikService, type HesapKimlikGirdisi } from "./hesap-kimlik.service";

/**
 * Giriş bilgilerinin ve kilidin uçları.
 *
 * HesaplarController'dan ayrı dosyada olmasının sebebi sınır: bu uçlar bir SIR
 * döndürüyor, hepsinin yetki kontrolü kaydın kendisinden geçiyor ve hepsi
 * kilit istiyor. Aynı dosyada dursalar, "kapsam yolun başında" düzenine uyan
 * sıradan uçlarla karışırlardı (076'daki aynı karar).
 *
 * Sır yalnızca `reveal` ucundan çıkar; listeleme sırsızdır.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class HesapKimlikController {
  private kimlik: HesapKimlikService;
  private kilit: HesapKilitService;

  constructor(kimlik: HesapKimlikService, kilit: HesapKilitService) {
    this.kimlik = kimlik;
    this.kilit = kilit;
  }

  // ------------------------------------------------------------- Kilit

  /**
   * Kilidi Projelio şifresiyle açar.
   *
   * POST ve `no-store`: yanıt kısa ömürlü bir jeton taşıyor, hiçbir yerde
   * saklanmasın. Gövdede şifre var, yani GET olması mümkün de değil.
   */
  @Post("service-accounts/unlock/password")
  @Header("Cache-Control", "no-store")
  sifreyleAc(@Body() body: { password?: string }, @Req() req: any) {
    return this.kilit.sifreyleAc(req.user.userId, body.password);
  }

  /** Geçiş anahtarı için meydan okuma — her çağrı tek kullanımlık satır yazar. */
  @Post("service-accounts/unlock/passkey-options")
  @Header("Cache-Control", "no-store")
  gecisAnahtariSecenekleri(@Req() req: any) {
    return this.kilit.gecisAnahtariSecenekleri(req.user.userId);
  }

  @Post("service-accounts/unlock/passkey")
  @Header("Cache-Control", "no-store")
  gecisAnahtariylaAc(
    @Body()
    body: {
      challenge?: string;
      credentialId?: string;
      clientDataJSON?: string;
      authenticatorData?: string;
      signature?: string;
    },
    @Req() req: any
  ) {
    return this.kilit.gecisAnahtariylaAc(req.user.userId, body);
  }

  // ------------------------------------------------------------- Giriş bilgileri

  /** Hesabın giriş kayıtları — sır içermez, yalnızca "kayıt var" bilgisi. */
  @Get("service-accounts/:accountId/credentials")
  liste(@Param("accountId") accountId: string, @Req() req: any) {
    return this.kimlik.liste(accountId, req.user.userId);
  }

  @Post("service-accounts/:accountId/credentials")
  ekle(@Param("accountId") accountId: string, @Body() body: HesapKimlikGirdisi, @Req() req: any) {
    return this.kimlik.ekle(accountId, body, req.user.userId);
  }

  @Patch("service-credentials/:id")
  guncelle(@Param("id") id: string, @Body() body: HesapKimlikGirdisi, @Req() req: any) {
    return this.kimlik.guncelle(id, body, req.user.userId);
  }

  @Delete("service-credentials/:id")
  sil(@Param("id") id: string, @Req() req: any) {
    return this.kimlik.sil(id, req.user.userId);
  }

  /**
   * Bilgileri gösterir.
   *
   * GET değil POST: her çağrı bir denetim satırı yazıyor (yan etki), gövdede
   * kilit jetonu geliyor ve GET olsaydı adres tarayıcı geçmişine, ara
   * belleklere, sunucu erişim loglarına düşerdi. `no-store` de aynı sebeple.
   */
  @Post("service-credentials/:id/reveal")
  @Header("Cache-Control", "no-store")
  goster(@Param("id") id: string, @Body() body: { unlockToken?: string }, @Req() req: any) {
    return this.kimlik.goster(id, req.user.userId, body.unlockToken);
  }

  /** Denetim izi: bilgileri kim, ne zaman, hangi hakla ve nasıl gördü. */
  @Get("service-accounts/:accountId/credential-views")
  gosterimler(@Param("accountId") accountId: string, @Req() req: any) {
    return this.kimlik.gosterimler(accountId, req.user.userId);
  }
}
