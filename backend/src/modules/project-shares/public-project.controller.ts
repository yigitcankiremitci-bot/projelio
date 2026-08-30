import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ProjectSharesService } from "./project-shares.service";
import { ShareRateLimitGuard, ShareUnlockRateLimitGuard } from "./share-rate-limit.guard";

/**
 * KİMLİK DOĞRULAMASI OLMAYAN uçlar: paylaşım linkinin açtığı sayfa.
 *
 * `AuthGuard` BİLEREK YOK — linki açan kişinin Projelio hesabı yok, olması da
 * gerekmiyor. Erişimi token sağlıyor; ne göndereceğimize
 * ProjectSharesService.resolve karar veriyor.
 *
 * Bu dosyaya YENİ UÇ EKLEME. Buraya eklenen her şey internete açıktır; yeni bir
 * ihtiyaç çıkarsa ProjectSharesController'a (guard'lı) ekle.
 *
 * İKİNCİ UÇ NEDEN VAR (unlock): e-posta kapısının adresi GET'in sorgu dizesine
 * konsaydı, kişisel bir adres tarayıcı geçmişine, ara belleklere ve sunucu
 * erişim loglarına düşerdi. Gövdeyle gönderilebilmesi için POST gerekti —
 * aynı kaynağın aynı kararı, yalnızca farklı taşıma.
 */
@Controller("public/projects")
@UseGuards(ShareRateLimitGuard)
export class PublicProjectController {
  constructor(private shares: ProjectSharesService) {}

  /** İlk açılış. Linkte e-posta kapısı varsa görünüm değil, kapı döner. */
  @Get(":token")
  view(@Param("token") token: string) {
    return this.shares.resolve(token);
  }

  /**
   * Kapıyı açma denemesi.
   *
   * 200 döner: yanlış adres bir HATA değil, kapının "tekrar dene" hâli.
   * Durum kodunu ayırmak, kaba kuvvet deneyen bir betiğe doğru/yanlış ayrımını
   * ücretsiz verirdi — yanıt gövdesi zaten aynı bilgiyi taşıyor ama sınır
   * (ShareUnlockRateLimitGuard) denemeleri sayıyor.
   */
  @Post(":token/unlock")
  @HttpCode(200)
  @UseGuards(ShareUnlockRateLimitGuard)
  unlock(@Param("token") token: string, @Body("email") email?: string) {
    // `?? ""` bilinçli: gövdesiz istek de bir DENEME sayılır ve reddedilir.
    // undefined olsaydı servis "henüz denemedi" sanıp kapıyı yeniden gösterirdi.
    return this.shares.resolve(token, email ?? "");
  }
}
