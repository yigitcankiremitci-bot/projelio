import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ProjectSharesService } from "./project-shares.service";
import { ShareRateLimitGuard } from "./share-rate-limit.guard";

/**
 * KİMLİK DOĞRULAMASI OLMAYAN tek uç: paylaşım linkinin açtığı sayfa.
 *
 * `AuthGuard` BİLEREK YOK — linki açan kişinin Projelio hesabı yok, olması da
 * gerekmiyor. Erişimi token sağlıyor; ne göndereceğimize
 * ProjectSharesService.resolve karar veriyor.
 *
 * Bu dosyaya YENİ UÇ EKLEME. Buraya eklenen her şey internete açıktır; yeni bir
 * ihtiyaç çıkarsa ProjectSharesController'a (guard'lı) ekle.
 */
@Controller("public/projects")
@UseGuards(ShareRateLimitGuard)
export class PublicProjectController {
  constructor(private shares: ProjectSharesService) {}

  @Get(":token")
  view(@Param("token") token: string) {
    return this.shares.resolve(token);
  }
}
