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
import { musteriSablonuOlustur, musteriSayfasiniSec, sablonDosyaAdi, tabloyuOku } from "./musteri-sablonu";
import { BAGLANTI_MODUL_KEY, isLocale, isPartyModulKey, MUSTERI_MODUL_KEY, type PartyModulKey } from "@projelio/shared";
import { istemciDili, tarayiciDili } from "../../common/i18n/index";
import type { PartyScope } from "./party.service";
import { SiparisService, type SiparisGirdisi, type TahsilatGirdisi } from "./siparis.service";

/** Şablon dosyası: 1000 satırlık dolu bir xlsx bile 1 MB'ı bulmuyor, 5 MB bol. */
const SABLON_YUKLEME = FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
/** Kartvizit: telefon fotoğrafı birkaç MB; doğrudan yükleme tavanı (8 MB) zaten bunu taşır. */
const KARTVIZIT_YUKLEME = FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
import { AccessService } from "../../common/access/access.service";

/** Kartın açıldığı defter; gelmezse ya da tanınmazsa Müşteriler (eski istemciler). */
function defter(modul: unknown): PartyModulKey {
  return isPartyModulKey(modul) ? modul : MUSTERI_MODUL_KEY;
}

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PartyController {
  constructor(
    private partyService: PartyService,
    private access: AccessService,
    private siparisService: SiparisService
  ) {}

  // ============================================================ Excel şablonu

  /**
   * Boş müşteri şablonu. Veri içermez, o yüzden kapsam ve yetki istemiyor —
   * yalnızca oturum. Yol "party/..." altında DEĞİL: aşağıdaki "party/:id"
   * yolu onu kimlik sanıp yakalardı.
   */
  @Get("party-template")
  async sablon(
    @Query("dil") dilParam: string | undefined,
    @Query("modul") modul: string | undefined,
    @Req() req: any,
    @Res() res: Response
  ) {
    // Şablon arayüzün dilinde. İndirme `fetch` + blob ile yapıldığı için
    // istemci dili açıkça ?dil= ile gönderiyor; gelmezse başlıklara bakılır.
    const dil = isLocale(dilParam) ? dilParam : (istemciDili(req) ?? tarayiciDili(req) ?? "tr");
    // ?modul=baglantilar: Bağlantı ve İlişkiler şablonu (önem, tanışma yeri…).
    const tur = defter(modul) === BAGLANTI_MODUL_KEY ? "baglanti" : "musteri";
    const icerik = await musteriSablonuOlustur(dil, tur);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Length", String(icerik.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(sablonDosyaAdi(dil, tur))}`);
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
    @Query("modul") modul: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.iceAktar({ organizationId, departmentId }, onizleme, req.user.userId, defter(modul), file);
  }

  @Post("jobs/:jobId/party/import")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(SABLON_YUKLEME)
  async importJob(
    @Param("jobId") jobId: string,
    @Query("onizleme") onizleme: string | undefined,
    @Query("modul") modul: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.iceAktar({ jobId }, onizleme, req.user.userId, defter(modul), file);
  }

  private async iceAktar(
    scope: PartyScope,
    onizleme: string | undefined,
    userId: string,
    modul: PartyModulKey,
    file?: Express.Multer.File
  ) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    // multer dosya adını latin1 okuyor; "Müşteriler.xlsx" bozuk gelmesin.
    const ad = Buffer.from(file.originalname, "latin1").toString("utf8");
    const sayfa = musteriSayfasiniSec(await tabloyuOku(file.buffer, ad));
    return this.partyService.sablondanIceAktar(scope, sayfa, userId, { onizleme: onizleme !== "0", modul });
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

  /**
   * Müşteriler ekranının listesi: yönetici hepsini, çalışan kendisine
   * atananları görür. Yukarıdaki genel liste diğer modüllerin seçicileri için
   * süzülmeden kalıyor (bkz. PartyService.musterilerim).
   */
  @Get("organizations/:organizationId/party/musterilerim")
  async musterilerimOrg(
    @Param("organizationId") organizationId: string,
    @Req() req: any,
    @Query("departmentId") departmentId?: string
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.musterilerim({ organizationId, departmentId }, req.user.userId);
  }

  /** Bağlantı ve İlişkiler ekranının listesi (bağlantı alanlarıyla). */
  @Get("organizations/:organizationId/baglantilar")
  async baglantilarOrg(
    @Param("organizationId") organizationId: string,
    @Req() req: any,
    @Query("departmentId") departmentId?: string
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.baglantilarim({ organizationId, departmentId }, req.user.userId);
  }

  /** Tahsilat görünümü ve yönetici raporu: kapsamdaki siparişler. */
  @Get("organizations/:organizationId/siparisler")
  async siparislerOrg(
    @Param("organizationId") organizationId: string,
    @Req() req: any,
    @Query("departmentId") departmentId?: string
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.kapsamdakiler({ organizationId, departmentId }, req.user.userId);
  }

  @Post("organizations/:organizationId/party")
  create(
    @Param("organizationId") organizationId: string,
    @Body() body: Partial<Party> & { departmentId?: string; modul?: string },
    @Req() req: any
  ) {
    const { departmentId, modul, modules: _yokSayilir, ...payload } = body;
    return this.partyService.create({ organizationId, departmentId }, payload, req.user.userId, defter(modul));
  }

  /** Kaydetmeden önce "bu kaydı daha önce girmiş olabilirsiniz" kontrolü. */
  @Post("organizations/:organizationId/party/check-duplicates")
  checkOrgDuplicates(
    @Param("organizationId") organizationId: string,
    @Body() body: { displayName?: string; taxNumber?: string; email?: string; excludeId?: string; departmentId?: string },
    @Req() req: any
  ) {
    // Kullanıcı kimliği şart: yalnızca okuyabildiği defterlerle karşılaştırılır.
    // Eskiden bu uç kimlik almıyordu; oturumu olan herkes başka bir şirketin
    // kart adlarını yoklayabiliyordu.
    const { departmentId, ...girdi } = body;
    return this.partyService.checkDuplicates({ organizationId, departmentId }, girdi, req.user.userId);
  }

  // ============================================================ Serbest çalışan

  @Get("jobs/:jobId/party")
  async findByJob(@Param("jobId") jobId: string, @Req() req: any, @Query("role") role?: PartyRole) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.findAll({ jobId }, { role });
  }

  @Get("jobs/:jobId/party/musterilerim")
  async musterilerimJob(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.musterilerim({ jobId }, req.user.userId);
  }

  @Get("jobs/:jobId/baglantilar")
  async baglantilarJob(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.baglantilarim({ jobId }, req.user.userId);
  }

  @Get("jobs/:jobId/siparisler")
  async siparislerJob(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.kapsamdakiler({ jobId }, req.user.userId);
  }

  @Post("jobs/:jobId/party")
  createForJob(@Param("jobId") jobId: string, @Body() body: Partial<Party> & { modul?: string }, @Req() req: any) {
    const { modul, modules: _yokSayilir, ...payload } = body;
    return this.partyService.create({ jobId }, payload, req.user.userId, defter(modul));
  }

  @Post("jobs/:jobId/party/check-duplicates")
  checkJobDuplicates(
    @Param("jobId") jobId: string,
    @Body() body: { displayName?: string; taxNumber?: string; email?: string; excludeId?: string },
    @Req() req: any
  ) {
    return this.partyService.checkDuplicates({ jobId }, body, req.user.userId);
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

  /** "Müşteri yap" / "Bağlantılara ekle": kart bir deftere daha girer. */
  @Post("party/:id/defter")
  async deftereEkle(@Param("id") id: string, @Body("modul") modul: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    if (!isPartyModulKey(modul)) throw new BadRequestException("Geçersiz modül");
    return this.partyService.deftereEkle(id, modul, req.user.userId);
  }

  /**
   * Karta dosya: kartvizit (fotoğraf ya da PDF, "Kartvizitler" klasörü) ya da
   * ?rol=ek ile ek dosya ("Kişi dosyaları/<Ad>/"). İkisi de departmanın
   * klasörüne iner, karta bağlanır.
   */
  @Post("party/:id/dosyalar")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(KARTVIZIT_YUKLEME)
  async dosyaEkle(
    @Param("id") id: string,
    @Query("departmentId") departmentId: string | undefined,
    @Query("rol") rol: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    // multer dosya adını latin1 okuyor (bkz. iceAktar).
    file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
    if (rol !== undefined && rol !== "kartvizit" && rol !== "ek") throw new BadRequestException("Geçersiz dosya rolü");
    return this.partyService.dosyaEkle(id, file, req.user.userId, { departmentId, rol: rol === "ek" ? "ek" : "kartvizit" });
  }

  @Get("party/:id/dosyalar")
  async dosyalar(@Param("id") id: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.dosyalar(id, req.user.userId);
  }

  @Delete("party/:id/dosyalar/:fileId")
  async dosyaKaldir(@Param("id") id: string, @Param("fileId") fileId: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    await this.partyService.dosyaKaldir(id, fileId, req.user.userId);
    return { success: true };
  }

  /** Karttan açılmış takip görevleri (kullanıcının görebildikleri). */
  @Get("party/:id/gorevler")
  async gorevler(@Param("id") id: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.kartGorevleri(id, req.user.userId);
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

  @Patch("party-contacts/:contactId")
  updateContact(@Param("contactId") contactId: string, @Body() body: Partial<PartyContact>, @Req() req: any) {
    return this.partyService.updateContact(contactId, body, req.user.userId);
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

  // ============================================================ Sipariş ve tahsilat
  //
  // Yetki müşteri kartından: yönetici hepsini, çalışan kendisine atanan
  // müşterininkini (bkz. siparis-erisim.ts). Taşeron kontrolü servisin
  // kullandığı modül yetkisinde değil, burada — liste uçlarıyla aynı kapı.

  @Get("party/:id/siparisler")
  async siparisler(@Param("id") id: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.musterininkiler(id, req.user.userId);
  }

  @Post("party/:id/siparisler")
  async siparisEkle(@Param("id") id: string, @Body() body: SiparisGirdisi, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.olustur(id, body ?? {}, req.user.userId);
  }

  @Patch("siparisler/:id")
  async siparisGuncelle(@Param("id") id: string, @Body() body: SiparisGirdisi, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.guncelle(id, body ?? {}, req.user.userId);
  }

  @Delete("siparisler/:id")
  async siparisSil(@Param("id") id: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.sil(id, req.user.userId);
  }

  @Post("siparisler/:id/tahsilatlar")
  async tahsilEt(@Param("id") id: string, @Body() body: TahsilatGirdisi, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.tahsilEt(id, body ?? {}, req.user.userId);
  }

  @Delete("tahsilatlar/:id")
  async tahsilatiGeriAl(@Param("id") id: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.tahsilatiGeriAl(id, req.user.userId);
  }
}
