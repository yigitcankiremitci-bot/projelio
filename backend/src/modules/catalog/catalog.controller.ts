import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { cevirmen, istekDili } from "../../common/i18n";
import { CatalogService } from "./catalog.service";

type BaslikliIstek = { headers: Record<string, string | string[] | undefined> };

/**
 * Katalog adları ve açıklamaları veritabanında yalnızca Türkçe duruyor;
 * isteğin diline burada çevriliyor (sözlük: common/i18n/en/katalog.ts).
 *
 * Servis bilerek dile bağımsız kaldı: Lio da aynı servisten okuyor ve ona
 * giden metin modele yazılıyor, kullanıcıya değil.
 */
function katalogCevirmeni(req: BaslikliIstek) {
  const baslik = (ad: string) => {
    const deger = req.headers[ad];
    return typeof deger === "string" ? deger : undefined;
  };
  return cevirmen(istekDili(baslik("x-projelio-locale"), baslik("accept-language")));
}

@Controller()
@UseGuards(AuthGuard("jwt"))
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get("department-catalog")
  async findDepartments(@Req() req: BaslikliIstek) {
    const t = katalogCevirmeni(req);
    const liste = await this.catalogService.findDepartments();
    return liste.map((d) => ({ ...d, name: t(d.name), description: d.description && t(d.description) }));
  }

  @Get("module-catalog")
  async findModules(
    @Req() req: BaslikliIstek,
    @Query("departmentKey") departmentKey?: string,
    @Query("freelancer") freelancer?: string
  ) {
    const t = katalogCevirmeni(req);
    const liste = await this.catalogService.findModules({ departmentKey, freelancerOnly: freelancer === "true" });
    return liste.map((m) => ({ ...m, name: t(m.name), description: m.description && t(m.description) }));
  }
}
