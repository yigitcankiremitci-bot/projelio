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
import { BaglantiListeleriService, listeModulu } from "./baglanti-listeleri.service";
import { PartyService } from "./party.service";
import { musteriSablonuOlustur, musteriSayfasiniSec, sablonDosyaAdi, tabloyuOku } from "./musteri-sablonu";
import { BAGLANTI_MODUL_KEY, isLocale, isPartyModulKey, MUSTERI_MODUL_KEY, TEDARIK_MODUL_KEY, type PartyModulKey } from "@projelio/shared";
import { istemciDili, tarayiciDili } from "../../common/i18n/index";
import type { PartyScope } from "./party.service";
import { SiparisService, type SiparisGirdisi, type TahsilatGirdisi } from "./siparis.service";
import { SatisKanallariService, type SatisKanaliGirdisi } from "./satis-kanallari.service";
import { SiparisAktarimService } from "./siparis-aktarim.service";
import { ModulAcilisService } from "./modul-acilis.service";

/** Şablon dosyası: 1000 satırlık dolu bir xlsx bile 1 MB'ı bulmuyor, 5 MB bol. */
const SABLON_YUKLEME = FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
/** Sipariş listesi: bir yılın kargo dökümü binlerce satır; 300 KB CSV tipik, xlsx daha büyük. */
const SIPARIS_YUKLEME = FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
/** Kartvizit: telefon fotoğrafı birkaç MB; doğrudan yükleme tavanı (8 MB) zaten bunu taşır. */
const KARTVIZIT_YUKLEME = FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
import { AccessService } from "../../common/access/access.service";

/** Kartın açıldığı defter; gelmezse ya da tanınmazsa Müşteriler (eski istemciler). */
/** Genel liste ucunun (diğer modüllerin seçicileri) defterleri. Bağlantılar bilerek YOK: rakip seçicide görünmesin. */
const SECICI_DEFTERLERI: readonly PartyModulKey[] = [MUSTERI_MODUL_KEY, TEDARIK_MODUL_KEY];

function defter(modul: unknown): PartyModulKey {
  return isPartyModulKey(modul) ? modul : MUSTERI_MODUL_KEY;
}

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PartyController {
  constructor(
    private partyService: PartyService,
    private access: AccessService,
    private siparisService: SiparisService,
    private kanallar: SatisKanallariService,
    private siparisAktarim: SiparisAktarimService,
    private modulAcilis: ModulAcilisService,
    private listeler: BaglantiListeleriService
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
    @Query("listeId") listeId: string | undefined,
    @Query("yeniListe") yeniListe: string | undefined,
    @Query("potansiyel") potansiyel: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.iceAktar({ organizationId, departmentId }, onizleme, req.user.userId, defter(modul), file, {
      listeId,
      yeniListe,
      potansiyel: potansiyel === "1",
    });
  }

  @Post("jobs/:jobId/party/import")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(SABLON_YUKLEME)
  async importJob(
    @Param("jobId") jobId: string,
    @Query("onizleme") onizleme: string | undefined,
    @Query("modul") modul: string | undefined,
    @Query("listeId") listeId: string | undefined,
    @Query("yeniListe") yeniListe: string | undefined,
    @Query("potansiyel") potansiyel: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.iceAktar({ jobId }, onizleme, req.user.userId, defter(modul), file, {
      listeId,
      yeniListe,
      potansiyel: potansiyel === "1",
    });
  }

  private async iceAktar(
    scope: PartyScope,
    onizleme: string | undefined,
    userId: string,
    modul: PartyModulKey,
    file?: Express.Multer.File,
    hedefListe: { listeId?: string; yeniListe?: string; potansiyel?: boolean } = {}
  ) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    // multer dosya adını latin1 okuyor; "Müşteriler.xlsx" bozuk gelmesin.
    const ad = Buffer.from(file.originalname, "latin1").toString("utf8");
    const sayfa = musteriSayfasiniSec(await tabloyuOku(file.buffer, ad));
    const uygula = onizleme === "0";
    // Bağlantı listesi yalnızca Bağlantılar defterinde ve uygulama adımında:
    // önizleme hiçbir şey yazmaz, liste de açmaz.
    const listeIstegi = modul === BAGLANTI_MODUL_KEY && (hedefListe.listeId || hedefListe.yeniListe?.trim());
    const liste =
      uygula && listeIstegi
        ? hedefListe.listeId
          ? await this.listeler.kapsamdakiListe(scope, hedefListe.listeId, userId)
          : await this.listeler.adlaBulVeyaAc(scope, hedefListe.yeniListe, userId)
        : undefined;
    const sonuc = await this.partyService.sablondanIceAktar(scope, sayfa, userId, {
      onizleme: !uygula,
      modul,
      potansiyel: hedefListe.potansiyel,
    });
    if (!liste) return sonuc;
    // Yeni açılanlar + dosyada olup sistemde zaten kayıtlı olanlar: ikisi de
    // bu listenin parçası (kopya kart açılmadan listeye girer).
    const idler = [...(sonuc.acilanIdler ?? []), ...sonuc.zatenKayitli.map((z) => z.mevcutId).filter((x): x is string => !!x)];
    const eklenen = await this.listeler.uyeEkleKapsamda(liste.id, scope, idler, userId);
    return { ...sonuc, liste: { id: liste.id, ad: liste.ad, eklenen } };
  }

  // ============================================================ Organizasyon

  // Müşteri/tedarikçi kayıtları ticari veridir: organizasyonu görebilenlere
  // açık, taşerona kapalı.
  @Get("organizations/:organizationId/party")
  async findByOrganization(
    @Param("organizationId") organizationId: string,
    @Req() req: any,
    @Query("role") role?: PartyRole,
    @Query("departmentId") departmentId?: string,
    @Query("ozet") ozet?: string
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    // Seçicilerin listesi: müşteriler + tedarikçiler (ürün, fatura, tedarik talebi).
    const kartlar = await this.partyService.findAll({ organizationId, departmentId }, { role, moduller: SECICI_DEFTERLERI });
    // Tedarik > Tedarikçiler satır simgeleri için; seçiciler istemez.
    if (ozet === "1") await this.partyService.listeOzetleriniEkle(kartlar);
    return kartlar;
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
    const yanit = await this.partyService.musterilerim({ organizationId, departmentId }, req.user.userId);
    return { ...yanit, ...(await this.listeler.kartlaraEkle(yanit.musteriler, { organizationId }, MUSTERI_MODUL_KEY)) };
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
    const yanit = await this.partyService.baglantilarim({ organizationId, departmentId }, req.user.userId);
    return this.listeler.yanitaEkle(yanit, { organizationId });
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
  async findByJob(
    @Param("jobId") jobId: string,
    @Req() req: any,
    @Query("role") role?: PartyRole,
    @Query("ozet") ozet?: string
  ) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    const kartlar = await this.partyService.findAll({ jobId }, { role, moduller: SECICI_DEFTERLERI });
    if (ozet === "1") await this.partyService.listeOzetleriniEkle(kartlar);
    return kartlar;
  }

  @Get("jobs/:jobId/party/musterilerim")
  async musterilerimJob(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    const yanit = await this.partyService.musterilerim({ jobId }, req.user.userId);
    return { ...yanit, ...(await this.listeler.kartlaraEkle(yanit.musteriler, { jobId }, MUSTERI_MODUL_KEY)) };
  }

  @Get("jobs/:jobId/baglantilar")
  async baglantilarJob(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    const yanit = await this.partyService.baglantilarim({ jobId }, req.user.userId);
    return this.listeler.yanitaEkle(yanit, { jobId });
  }

  // ============================================================ Bağlantı / müşteri listeleri (migration 163, 170)
  // `modul` verilmezse Bağlantılar (eski istemciler); crm_musteri müşteri listeleri.

  @Get("organizations/:organizationId/baglanti-listeleri")
  async listelerOrg(@Param("organizationId") organizationId: string, @Query("modul") modul: string | undefined, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.listeler.listele({ organizationId }, req.user.userId, listeModulu(modul));
  }

  @Post("organizations/:organizationId/baglanti-listeleri")
  async listeAcOrg(
    @Param("organizationId") organizationId: string,
    @Body() body: { ad?: string; partyIdler?: string[]; modul?: string },
    @Req() req: any
  ) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.listeler.olustur({ organizationId }, body.ad, req.user.userId, body.partyIdler, listeModulu(body.modul));
  }

  @Get("jobs/:jobId/baglanti-listeleri")
  async listelerJob(@Param("jobId") jobId: string, @Query("modul") modul: string | undefined, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.listeler.listele({ jobId }, req.user.userId, listeModulu(modul));
  }

  @Post("jobs/:jobId/baglanti-listeleri")
  async listeAcJob(
    @Param("jobId") jobId: string,
    @Body() body: { ad?: string; partyIdler?: string[]; modul?: string },
    @Req() req: any
  ) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.listeler.olustur({ jobId }, body.ad, req.user.userId, body.partyIdler, listeModulu(body.modul));
  }

  /** Sürükle-bırakla verilen özel sıra (migration 170): ekibin ortak görünümü. */
  @Patch("organizations/:organizationId/party-siralari")
  async siraKaydetOrg(
    @Param("organizationId") organizationId: string,
    @Body() body: { modul?: string; anahtar?: string; sira?: string[] },
    @Req() req: any
  ) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    await this.listeler.siraKaydet({ organizationId }, listeModulu(body.modul), body.anahtar, body.sira, req.user.userId);
    return { ok: true };
  }

  @Patch("jobs/:jobId/party-siralari")
  async siraKaydetJob(@Param("jobId") jobId: string, @Body() body: { modul?: string; anahtar?: string; sira?: string[] }, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    await this.listeler.siraKaydet({ jobId }, listeModulu(body.modul), body.anahtar, body.sira, req.user.userId);
    return { ok: true };
  }

  @Patch("baglanti-listeleri/:listeId")
  async listeAdlandir(@Param("listeId") listeId: string, @Body() body: { ad?: string }, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    await this.listeler.yenidenAdlandir(listeId, body.ad, req.user.userId);
    return { ok: true };
  }

  /** Listeyi siler; kartlar Bağlantılar'da kalır. */
  @Delete("baglanti-listeleri/:listeId")
  async listeSil(@Param("listeId") listeId: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    await this.listeler.sil(listeId, req.user.userId);
    return { ok: true };
  }

  @Post("baglanti-listeleri/:listeId/uyeler")
  async listeyeEkle(@Param("listeId") listeId: string, @Body() body: { partyIdler?: string[] }, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.listeler.uyeEkle(listeId, body.partyIdler, req.user.userId);
  }

  @Post("baglanti-listeleri/:listeId/uyeler/cikar")
  async listedenCikar(@Param("listeId") listeId: string, @Body() body: { partyIdler?: string[] }, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    await this.listeler.uyeCikar(listeId, body.partyIdler, req.user.userId);
    return { ok: true };
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
  /** `?modul=` verilirse kart başka defterde de duruyorsa yalnızca oradan çıkar (bkz. PartyService.archive). */
  @Delete("party/:id")
  archive(@Param("id") id: string, @Req() req: any, @Query("modul") modul?: string) {
    return this.partyService.archive(id, req.user.userId, isPartyModulKey(modul) ? modul : undefined);
  }

  @Patch("party/:id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.partyService.restore(id, req.user.userId);
  }

  @Patch("party/:id/roles")
  addRole(@Param("id") id: string, @Body("role") role: PartyRole, @Req() req: any) {
    return this.partyService.addRoleTo(id, role, req.user.userId);
  }

  /** Potansiyel müşteri → müşteri (anlaşma yapıldı). */
  @Post("party/:id/musteriye-donustur")
  musteriyeDonustur(@Param("id") id: string, @Req() req: any) {
    return this.partyService.musteriyeDonustur(id, req.user.userId);
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

  /** "Projelio'dan seç": karta bağlanacak dosyayı şirketin/işin klasörlerinde gezmek. */
  @Get("party/:id/dosya-gez")
  async dosyaGez(
    @Param("id") id: string,
    @Query("kaynak") kaynak: string | undefined,
    @Query("folderId") folderId: string | undefined,
    @Req() req: any
  ) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.dosyaGez(id, req.user.userId, kaynak || undefined, folderId || undefined);
  }

  /** Projelio'daki dosyaları karta ek dosya olarak bağlar (dosya yerinde kalır). */
  @Post("party/:id/dosyalar/bagla")
  async dosyalariBagla(@Param("id") id: string, @Body() body: { fileIds?: string[] }, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.dosyalariBagla(id, body.fileIds, req.user.userId);
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

  /** Rol aktarımı seçenekleri ("Aktar" menüsü) ve aktarım. */
  @Get("party/:id/aktarim")
  async aktarimSecenekleri(@Param("id") id: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.aktarimSecenekleri(id, req.user.userId);
  }

  @Post("party/:id/aktar")
  async aktar(@Param("id") id: string, @Body("hedef") hedef: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.aktar(id, hedef, req.user.userId);
  }

  /** Defter aktarımını (müşteri, potansiyel, tedarikçi) geri alır; kart Bağlantılar'da kalır. */
  @Post("party/:id/aktar/geri-al")
  async aktarimiGeriAl(@Param("id") id: string, @Body("hedef") hedef: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.aktarimiGeriAl(id, hedef, req.user.userId);
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
  addActivity(
    @Param("id") id: string,
    @Body() body: Partial<PartyActivity> & { sonrakiArama?: string | null },
    @Req() req: any
  ) {
    return this.partyService.addActivity(id, body, req.user.userId);
  }

  /** Görüşme notunu düzeltme — yalnızca yazanı (bkz. PartyService.kendiNotu). */
  @Patch("party-activities/:activityId")
  updateActivity(
    @Param("activityId") activityId: string,
    @Body() body: { summary?: string; type?: PartyActivity["type"] },
    @Req() req: any
  ) {
    return this.partyService.updateActivity(activityId, body, req.user.userId);
  }

  @Delete("party-activities/:activityId")
  deleteActivity(@Param("activityId") activityId: string, @Req() req: any) {
    return this.partyService.deleteActivity(activityId, req.user.userId);
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

  // Ürün kartının "Satışlar" sekmesi. Yetki ürünün değil müşteri defterinin
  // (bkz. SiparisService.urununkiler).
  @Get("products/:productId/siparisler")
  async urunSiparisleri(@Param("productId") productId: string, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.urununkiler(productId, req.user.userId);
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

  /** Muhasebenin toplu "tahsil edildi"si: seçilen siparişlerin kalanı. */
  @Post("siparisler/toplu-tahsilat")
  async topluTahsilat(
    @Body() body: { ids?: string[]; tarih?: string; odemeYontemi?: any; notlar?: string },
    @Req() req: any
  ) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.topluTahsilEt(body?.ids, body ?? {}, req.user.userId);
  }

  /**
   * Tahsilat ekranından sipariş: müşteri seçildiyse ona, seçilmediyse
   * kanala (tek seferlik alıcı, migration 168).
   */
  @Post("organizations/:organizationId/siparisler")
  async kapsamdaSiparis(
    @Param("organizationId") organizationId: string,
    @Body() body: SiparisGirdisi & { partyId?: string },
    @Req() req: any
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.kapsamdaOlustur({ organizationId }, body ?? {}, req.user.userId);
  }

  @Post("jobs/:jobId/siparisler")
  async kapsamdaSiparisJob(@Param("jobId") jobId: string, @Body() body: SiparisGirdisi & { partyId?: string }, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.siparisService.kapsamdaOlustur({ jobId }, body ?? {}, req.user.userId);
  }

  // ============================================================ Satış kanalları (migration 168)

  @Get("organizations/:organizationId/satis-kanallari")
  async kanallarOrg(@Param("organizationId") organizationId: string, @Req() req: any) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.kanallar.liste({ organizationId }, req.user.userId);
  }

  @Get("jobs/:jobId/satis-kanallari")
  async kanallarJob(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.kanallar.liste({ jobId }, req.user.userId);
  }

  @Post("organizations/:organizationId/satis-kanallari")
  async kanalEkleOrg(@Param("organizationId") organizationId: string, @Body() body: SatisKanaliGirdisi, @Req() req: any) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.kanallar.olustur({ organizationId }, body ?? {}, req.user.userId);
  }

  @Post("jobs/:jobId/satis-kanallari")
  async kanalEkleJob(@Param("jobId") jobId: string, @Body() body: SatisKanaliGirdisi, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.kanallar.olustur({ jobId }, body ?? {}, req.user.userId);
  }

  @Patch("satis-kanallari/:id")
  async kanalGuncelle(@Param("id") id: string, @Body() body: SatisKanaliGirdisi, @Req() req: any) {
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.kanallar.guncelle(id, body ?? {}, req.user.userId);
  }

  // ============================================================ Açılış sekmesi (migration 169)
  //
  // Kişisel görünüm tercihi: modülü okuyabilen herkes kendi açılış sekmesini seçer.

  @Get("organizations/:organizationId/modul-acilis/:modul")
  async acilisOrg(@Param("organizationId") organizationId: string, @Param("modul") modul: string, @Req() req: any) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.modulAcilis.oku({ organizationId }, modul, req.user.userId);
  }

  @Patch("organizations/:organizationId/modul-acilis/:modul")
  async acilisOrgKaydet(
    @Param("organizationId") organizationId: string,
    @Param("modul") modul: string,
    @Body() body: { sekme?: string },
    @Req() req: any
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.modulAcilis.kaydet({ organizationId }, modul, body?.sekme, req.user.userId);
  }

  @Get("jobs/:jobId/modul-acilis/:modul")
  async acilisJob(@Param("jobId") jobId: string, @Param("modul") modul: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.modulAcilis.oku({ jobId }, modul, req.user.userId);
  }

  @Patch("jobs/:jobId/modul-acilis/:modul")
  async acilisJobKaydet(@Param("jobId") jobId: string, @Param("modul") modul: string, @Body() body: { sekme?: string }, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.modulAcilis.kaydet({ jobId }, modul, body?.sekme, req.user.userId);
  }

  // ============================================================ Sipariş içe aktarma
  //
  // Müşteri içe aktarmayla aynı durumsuz iki adım: önce önizleme
  // (onizleme=1, hiçbir şey yazılmaz), sonra aynı dosya + önizlemede yapılan
  // düzeltmeler (`duzeltmeler` alanı, JSON) ile onizleme=0.

  @Post("organizations/:organizationId/siparisler/import")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(SIPARIS_YUKLEME)
  async siparisImport(
    @Param("organizationId") organizationId: string,
    @Query("onizleme") onizleme: string | undefined,
    @Body("duzeltmeler") duzeltmeler: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    if (!file) throw new BadRequestException("Dosya yüklenmedi");
    let d: unknown = {};
    if (duzeltmeler) {
      try {
        d = JSON.parse(duzeltmeler);
      } catch {
        throw new BadRequestException("Düzeltmeler okunamadı");
      }
    }
    return this.siparisAktarim.iceAktar(
      { organizationId },
      // multer dosya adını latin1 okuyor (bkz. iceAktar).
      { ad: Buffer.from(file.originalname, "latin1").toString("utf8"), tampon: file.buffer },
      d as any,
      onizleme !== "0",
      req.user.userId
    );
  }
}
