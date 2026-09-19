import { Body, Controller, Get, Header, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import type { DemoRandevuGirdisi } from "@projelio/shared";
import { ShareRateLimitGuard } from "../project-shares/share-rate-limit.guard";
import { DemoRandevuRateLimitGuard } from "./demo-randevu.guard";
import { DemoRandevuService } from "./demo-randevu.service";

/**
 * KİMLİK DOĞRULAMASI OLMAYAN uçlar: /demo-randevu sayfası ve e-postadaki
 * yönetim bağlantısı.
 *
 * BU DOSYAYA YENİ UÇ EKLEME. Buraya eklenen her şey internete açıktır; üyeye
 * ya da yöneticiye özgü bir ihtiyaç guard'lı denetleyicilere gider.
 *
 * Yönetim uçlarında erişimi token sağlıyor (192 bit); yanıt yalnızca
 * randevunun kendisini taşır — telefon, şirket, iç not buraya HİÇ gelmez.
 */
@Controller("public/demo")
@UseGuards(ShareRateLimitGuard)
export class DemoRandevuPublicController {
  constructor(private demo: DemoRandevuService) {}

  @Get("musaitlik")
  musaitlik() {
    return this.demo.musaitlik();
  }

  /** Yanıt boş olabilir (bot tuzağı) — sayfa yine "alındı" gösterir. */
  @Post("randevu")
  @UseGuards(DemoRandevuRateLimitGuard)
  async al(@Body() body: DemoRandevuGirdisi) {
    return (await this.demo.randevuAl(body ?? ({} as DemoRandevuGirdisi), null)) ?? { ok: true };
  }

  /** Yolda ".ics" soneki: bazı istemciler (iOS Safari) dosyayı uzantıdan tanıyor. */
  @Get(":token/takvim.ics")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="projelio-demo.ics"')
  @Header("Cache-Control", "no-store")
  ics(@Param("token") token: string) {
    return this.demo.tokenIcs(token);
  }

  @Get(":token")
  gorunum(@Param("token") token: string) {
    return this.demo.tokenGorunumu(token);
  }

  /** Taşıma için boş blokları gösterirken kişinin kendi bloğu da seçilebilir kalsın. */
  @Get(":token/musaitlik")
  async tasimaMusaitligi(@Param("token") token: string) {
    const r = await this.demo.tokenGorunumu(token);
    return this.demo.musaitlik(r.id);
  }

  @Post(":token/iptal")
  @HttpCode(200)
  @UseGuards(DemoRandevuRateLimitGuard)
  iptal(@Param("token") token: string, @Body("neden") neden?: string) {
    return this.demo.tokenIleIptal(token, neden);
  }

  @Post(":token/tasi")
  @HttpCode(200)
  @UseGuards(DemoRandevuRateLimitGuard)
  tasi(@Param("token") token: string, @Body("baslangic") baslangic?: string) {
    return this.demo.tokenIleTasi(token, baslangic);
  }
}
