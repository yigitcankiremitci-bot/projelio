import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  EPOSTA_KAMPANYA_SINIRI,
  isLocale,
  type EpostaAyarlariDto,
  type EpostaHedefi,
  type EpostaIpucuSatiri,
  type EpostaKampanyaGirdisi,
} from "@projelio/shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { EtkinIpucu } from "../notifications/ipucu.icerik";
import { EpostaAyarlariService, type EpostaAyarlari } from "./eposta-ayarlari.service";
import { IpucuDeposuService, type IpucuYamasi } from "./ipucu-deposu.service";
import { KampanyaService } from "./kampanya.service";
import { LioEpostaYazariService } from "./lio-eposta-yazari.service";
import { EpostaMaliyetService } from "./eposta-maliyet.service";
import { IpucuEpostaProcessor } from "./ipucu-eposta.processor";

/**
 * Admin > E-posta. Kurallar servislerde; buradaki uçlar yalnızca kapı.
 * Hepsi yönetici rolüne kapalı.
 */
@Controller("admin/eposta")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class EpostaAdminController {
  constructor(
    private ayarlar: EpostaAyarlariService,
    private depo: IpucuDeposuService,
    private kampanyalar: KampanyaService,
    private lio: LioEpostaYazariService,
    private maliyet: EpostaMaliyetService,
    private ipucuIsleyici: IpucuEpostaProcessor
  ) {}

  // ─────────────────────────────── Ayarlar
  @Get("ayarlar")
  async ayarlariGetir(): Promise<EpostaAyarlariDto> {
    return { ...(await this.ayarlar.oku()), lioKullanilabilir: this.lio.kullanilabilir() };
  }

  @Patch("ayarlar")
  async ayarlariKaydet(@Body() body: Partial<EpostaAyarlari>, @Req() req: any): Promise<EpostaAyarlariDto> {
    return { ...(await this.ayarlar.kaydet(body ?? {}, req.user.userId)), lioKullanilabilir: this.lio.kullanilabilir() };
  }

  // ─────────────────────────────── İpuçları
  @Get("ipuclari")
  async ipuclari(): Promise<EpostaIpucuSatiri[]> {
    return (await this.depo.liste()).map(satir);
  }

  @Post("ipuclari")
  async ipucuEkle(@Body() body: IpucuYamasi, @Req() req: any): Promise<EpostaIpucuSatiri> {
    return satir(await this.depo.ekle(body ?? {}, req.user.userId));
  }

  /** Sıralama ":anahtar"dan ÖNCE tanımlı — yoksa "sirala" bir anahtar sanılırdı. */
  @Post("ipuclari/sirala")
  async ipucuSirala(@Body("anahtarlar") anahtarlar: unknown, @Req() req: any): Promise<EpostaIpucuSatiri[]> {
    return (await this.depo.sirala(anahtarlar, req.user.userId)).map(satir);
  }

  @Patch("ipuclari/:anahtar")
  async ipucuGuncelle(
    @Param("anahtar") anahtar: string,
    @Body() body: IpucuYamasi,
    @Req() req: any
  ): Promise<EpostaIpucuSatiri> {
    return satir(await this.depo.guncelle(anahtar, body ?? {}, req.user.userId));
  }

  @Delete("ipuclari/:anahtar")
  async ipucuSil(@Param("anahtar") anahtar: string) {
    await this.depo.sil(anahtar);
    return { ok: true };
  }

  /** İpucunu yöneticinin kendi adresine gönderir (Lio işaretliyse Lio'yla). */
  @Post("ipuclari/:anahtar/deneme")
  ipucuDene(@Param("anahtar") anahtar: string, @Req() req: any) {
    return this.ipucuIsleyici.denemeGonder(req.user.userId, anahtar);
  }

  // ─────────────────────────────── Gönderim
  @Post("hedef-sayisi")
  hedefSayisi(@Body("hedef") hedef: EpostaHedefi) {
    return this.kampanyalar.hedefSayisi(hedef);
  }

  /** Yöneticinin birkaç cümlelik isteğinden Lio'ya taslak yazdırır. */
  @Post("taslak")
  async taslak(@Body() body: { istek?: string; dil?: string }, @Req() req: any) {
    const istek = (body?.istek ?? "").trim();
    if (!istek) throw new BadRequestException("Lio'ya ne yazmasını istediğini anlat.");
    if (istek.length > EPOSTA_KAMPANYA_SINIRI.istek) throw new BadRequestException("İstek çok uzun.");
    if (!this.lio.kullanilabilir()) throw new BadRequestException("Sunucuda Lio için tanımlı bir AI sağlayıcısı yok.");
    try {
      return await this.lio.taslakYaz(istek, isLocale(body?.dil) ? body.dil : "tr", req.user.userId);
    } catch (err) {
      throw new BadRequestException("Lio taslağı yazamadı; biraz sonra tekrar dene.");
    }
  }

  @Post("onizleme")
  onizleme(@Body() body: Partial<EpostaKampanyaGirdisi> & { aliciId?: string }, @Req() req: any) {
    return this.kampanyalar.onizle(req.user.userId, body ?? {});
  }

  @Get("kampanyalar")
  kampanyaListesi() {
    return this.kampanyalar.liste();
  }

  @Post("kampanyalar")
  kampanyaOlustur(@Body() body: Partial<EpostaKampanyaGirdisi>, @Req() req: any) {
    return this.kampanyalar.olustur(req.user.userId, body ?? {});
  }

  @Post("kampanyalar/:id/iptal")
  kampanyaIptal(@Param("id") id: string) {
    return this.kampanyalar.iptal(id);
  }

  // ─────────────────────────────── Maliyet
  @Get("maliyet")
  maliyetOzeti(@Query("gun") gun?: string) {
    return this.maliyet.ozet(gun);
  }
}

function satir(i: EtkinIpucu): EpostaIpucuSatiri {
  return {
    anahtar: i.anahtar,
    kaynak: i.kaynak,
    baslik: i.baslik,
    govde: i.govde,
    link: i.link,
    dugme: i.dugme,
    sira: i.sira,
    aktif: i.aktif,
    lioIle: i.lioIle,
    duzenlendi: i.duzenlendi,
  };
}
