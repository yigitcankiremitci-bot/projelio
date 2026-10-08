import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ShareRateLimitGuard } from "../project-shares/share-rate-limit.guard";
import { alanAdindanAdres } from "./kartvizit-girdi";
import { kartvizitBulunamadiSayfasi, kartvizitSayfasi } from "./kartvizit-sayfa";
import { KartvizitService } from "./kartvizit.service";

/**
 * KİMLİK DOĞRULAMASI OLMAYAN uçlar: <adres>.projelio.app'in kendisi.
 *
 * Caddy joker bloğu (deploy/Caddyfile, *.projelio.app) her isteği
 * /public/kartvizit/<adres><yol> olarak buraya çeviriyor; style.css ve app.js
 * ise Caddy'den doğrudan gidiyor (kartvizit/_ortak). Sayfa yolları göreli
 * (style.css, qr.svg, kartvizit.vcf) — tarayıcı onları alt alan adının kökünde
 * istiyor, Caddy yine buraya çeviriyor.
 *
 * BU DOSYAYA YENİ UÇ EKLEME. Buraya eklenen her şey internete açıktır.
 */
@Controller("public/kartvizit")
export class PublicKartvizitController {
  constructor(private kartvizit: KartvizitService) {}

  /**
   * Caddy on_demand_tls "ask" ucu: ?domain=ali.projelio.app için 200 dönerse
   * Caddy sertifika alır, başka her şeyde almaz. Böylece rastgele alt alan
   * adlarıyla Let's Encrypt kotası tüketilemez.
   *
   * Hız sınırı YOK, bilerek: istek Caddy'den, tek IP'den geliyor; sınır
   * konsaydı yoğun bir anda gerçek kartların sertifikası reddedilirdi.
   * Sorgu tek satırlık indeksli okuma.
   */
  @Get("izin")
  async izin(@Query("domain") domain: string | undefined, @Res() res: Response) {
    const adres = alanAdindanAdres(domain);
    const ok = adres ? await this.kartvizit.aktifMi(adres) : false;
    res.status(ok ? 200 : 404).end();
  }

  @Get(":adres")
  @UseGuards(ShareRateLimitGuard)
  async sayfa(@Param("adres") adres: string, @Res() res: Response) {
    const k = await this.kartvizit.herkeseAcik(adres);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Kart güncellenince hemen görünsün; tarayıcı yine 304 ile doğrulayabilir.
    res.setHeader("Cache-Control", "no-cache");
    if (!k) {
      res.status(404).send(kartvizitBulunamadiSayfasi());
      return;
    }
    res.send(kartvizitSayfasi(k));
  }

  @Get(":adres/kartvizit.vcf")
  @UseGuards(ShareRateLimitGuard)
  vcfTr(@Param("adres") adres: string, @Res() res: Response) {
    return this.vcf(adres, "tr", res);
  }

  @Get(":adres/kartvizit-en.vcf")
  @UseGuards(ShareRateLimitGuard)
  vcfEn(@Param("adres") adres: string, @Res() res: Response) {
    return this.vcf(adres, "en", res);
  }

  @Get(":adres/qr.svg")
  @UseGuards(ShareRateLimitGuard)
  async qr(@Param("adres") adres: string, @Res() res: Response) {
    const k = await this.kartvizit.herkeseAcik(adres);
    if (!k) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(this.kartvizit.qrSvg(k));
  }

  private async vcf(adres: string, dil: "tr" | "en", res: Response) {
    const k = await this.kartvizit.herkeseAcik(adres);
    if (!k) {
      res.status(404).end();
      return;
    }
    const dosya = await this.kartvizit.vcard(k, dil);
    // text/vcard ŞART: iOS ancak bu türde "Kişilere ekle" önerir. attachment
    // YOK: iPhone dosyayı indirmek yerine kişi kartını doğrudan açsın.
    res.setHeader("Content-Type", "text/vcard; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${k.adres}${dil === "en" ? "-en" : ""}.vcf"`);
    res.setHeader("Cache-Control", "no-cache");
    res.send(dosya);
  }
}
