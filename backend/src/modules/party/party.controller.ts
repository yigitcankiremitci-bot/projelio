import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UploadRateLimitGuard } from "../../common/guards/upload-rate-limit.guard";
import type { Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import type { Party, PartyActivity, PartyContact, PartyRole } from "@projelio/shared";
import { PartyService } from "./party.service";
import { musteriSablonuOlustur, musteriSayfasiniSec, SABLON_DOSYA_ADI, tabloyuOku } from "./musteri-sablonu";
import type { PartyScope } from "./party.service";

/** Şablon dosyası: 1000 satırlık dolu bir xlsx bile 1 MB'ı bulmuyor, 5 MB bol. */
const SABLON_YUKLEME = FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PartyController {
  constructor(
    private partyService: PartyService,
    private access: AccessService
  ) {}

  // ============================================================ Excel şablonu

  /**
   * Boş müşteri şablonu. Veri içermez, o yüzden kapsam ve yetki istemiyor —
   * yalnızca oturum. Yol "party/..." altında DEĞİL: aşağıdaki "party/:id"
   * yolu onu kimlik sanıp yakalardı.
   */
  @Get("party-template")
  async sablon(@Res() res: Response) {
    const icerik = await musteriSablonuOlustur();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Length", String(icerik.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(SABLON_DOSYA_ADI)}`);
    res.end(icerik);
  }

  /**
   * Doldurulmuş şablonu yükler. `onizleme=0` gelmedikçe HİÇBİR ŞEY YAZILMAZ —
   * arayüz önce önizler, kullanıcı "N müşteriyi ekle"ye basınca aynı dosyayı
   * onizleme=0 ile yeniden gönderir. Dosya sunucuda saklanmıyor: iki istek
   * arasında durum tutmamak, yarım kalan bir önizlemenin bellekte asılı
   * kalmaması demek; dosya küçük, iki kez göndermek ucuz.
   */
  @Post("organizations/:organizationId/party/import")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(SABLON_YUKLEME)
  async importOrg(
    @Param("organizationId") organizationId: string,
    @Query("onizleme") onizleme: string | undefined,
    @Query("departmentId") departmentId: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.iceAktar({ organizationId, departmentId }, onizleme, req.user.userId, file);
  }

  @Post("jobs/:jobId/party/import")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(SABLON_YUKLEME)
  async importJob(
    @Param("jobId") jobId: string,
    @Query("onizleme") onizleme: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.iceAktar({ jobId }, onizleme, req.user.userId, file);
  }

  private async iceAktar(scope: PartyScope, onizleme: string | undefined, userId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    // multer dosya adını latin1 okuyor; "Müşteriler.xlsx" bozuk gelmesin.
    const ad = Buffer.from(file.originalname, "latin1").toString("utf8");
    const sayfa = musteriSayfasiniSec(await tabloyuOku(file.buffer, ad));
    return this.partyService.sablondanIceAktar(scope, sayfa, userId, { onizleme: onizleme !== "0" });
  }

  // ============================================================ Organizasyon

  // Müşteri/tedarikçi kayıtları ticari veridir: organizasyonu görebilenlere
  // açık, taşerona kapalı.
  @Get("organizations/:organizationId/party")
  async findByOrganization(
    @Param("organizationId") organizationId: string,
    @Req() req: any,
    @Query("role") role?: PartyRole,
    @Query("departmentId") departmentId?: string
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.findAll({ organizationId, departmentId }, { role });
  }

  @Post("organizations/:organizationId/party")
  create(
    @Param("organizationId") organizationId: string,
    @Body() body: Partial<Party> & { departmentId?: string },
    @Req() req: any
  ) {
    const { departmentId, ...payload } = body;
    return this.partyService.create({ organizationId, departmentId }, payload, req.user.userId);
  }

  /** Kaydetmeden önce "bu kaydı daha önce girmiş olabilirsiniz" kontrolü. */
  @Post("organizations/:organizationId/party/check-duplicates")
  checkOrgDuplicates(
    @Param("organizationId") organizationId: string,
    @Body() body: { displayName?: string; taxNumber?: string; email?: string; excludeId?: string }
  ) {
    return this.partyService.checkDuplicates({ organizationId }, body);
  }

  // ============================================================ Serbest çalışan

  @Get("jobs/:jobId/party")
  async findByJob(@Param("jobId") jobId: string, @Req() req: any, @Query("role") role?: PartyRole) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.findAll({ jobId }, { role });
  }

  @Post("jobs/:jobId/party")
  createForJob(@Param("jobId") jobId: string, @Body() body: Partial<Party>, @Req() req: any) {
    return this.partyService.create({ jobId }, body, req.user.userId);
  }

  @Post("jobs/:jobId/party/check-duplicates")
  checkJobDuplicates(
    @Param("jobId") jobId: string,
    @Body() body: { displayName?: string; taxNumber?: string; email?: string; excludeId?: string }
  ) {
    return this.partyService.checkDuplicates({ jobId }, body);
  }

  // ============================================================ Tekil kayıt

  @Get("party/:id")
  findOne(@Param("id") id: string, @Req() req: any) {
    return this.partyService.viewOne(id, req.user.userId);
  }

  @Patch("party/:id")
  update(@Param("id") id: string, @Body() body: Partial<Party>, @Req() req: any) {
    return this.partyService.update(id, body, req.user.userId);
  }

  // Silme değil arşivleme: geçmiş kayıtlardaki referanslar korunur.
  @Delete("party/:id")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.partyService.archive(id, req.user.userId);
  }

  @Patch("party/:id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.partyService.restore(id, req.user.userId);
  }

  @Patch("party/:id/roles")
  addRole(@Param("id") id: string, @Body("role") role: PartyRole, @Req() req: any) {
    return this.partyService.addRoleTo(id, role, req.user.userId);
  }

  @Post("party/:id/merge")
  merge(@Param("id") sourceId: string, @Body("targetId") targetId: string, @Req() req: any) {
    return this.partyService.merge(sourceId, targetId, req.user.userId);
  }

  // ============================================================ Kişiler

  @Get("party/:id/contacts")
  findContacts(@Param("id") id: string, @Req() req: any) {
    return this.partyService.findContacts(id, req.user.userId);
  }

  @Post("party/:id/contacts")
  addContact(@Param("id") id: string, @Body() body: Partial<PartyContact>, @Req() req: any) {
    return this.partyService.addContact(id, body, req.user.userId);
  }

  @Delete("party-contacts/:contactId")
  removeContact(@Param("contactId") contactId: string, @Req() req: any) {
    return this.partyService.removeContact(contactId, req.user.userId);
  }

  // ============================================================ Aktivite

  @Get("party/:id/activities")
  findActivities(@Param("id") id: string, @Req() req: any) {
    return this.partyService.findActivities(id, req.user.userId);
  }

  @Post("party/:id/activities")
  addActivity(@Param("id") id: string, @Body() body: Partial<PartyActivity>, @Req() req: any) {
    return this.partyService.addActivity(id, body, req.user.userId);
  }
}
