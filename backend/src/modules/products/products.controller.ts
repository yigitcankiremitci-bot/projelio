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
import { AuthGuard } from "@nestjs/passport";
import { UploadRateLimitGuard } from "../../common/guards/upload-rate-limit.guard";
import { memoryStorage } from "multer";
import { ProductsService } from "./products.service";
import type { ProductWriteInput } from "./products.service";
import { AccessService } from "../../common/access/access.service";
import type { Response } from "express";
import { isLocale } from "@projelio/shared";
import { istemciDili, tarayiciDili } from "../../common/i18n/index";
import { tabloyuOku } from "../party/musteri-sablonu";
import { urunSablonDosyaAdi, urunSablonuOlustur, urunSayfasiniSec } from "./urun-sablonu";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ProductsController {
  constructor(
    private productsService: ProductsService,
    private access: AccessService
  ) {}

  // Ürün/hizmet kataloğu şirketin ticari verisidir: organizasyonu görebilenlere
  // açık, taşerona kapalı.
  @Get("organizations/:organizationId/products")
  async findByOrganization(@Param("organizationId") organizationId: string, @Req() req: any) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "products");
    return this.productsService.findByOrganization(organizationId);
  }

  @Post("organizations/:organizationId/products")
  create(@Param("organizationId") organizationId: string, @Body() body: ProductWriteInput, @Req() req: any) {
    return this.productsService.create(organizationId, body, req.user.userId);
  }

  /**
   * Boş ürün şablonu. Veri içermez; yalnızca oturum ister. Yol "products/..."
   * altında DEĞİL: "products/:id" onu kimlik sanıp yakalardı.
   */
  @Get("product-template")
  async sablon(@Query("dil") dilParam: string | undefined, @Req() req: any, @Res() res: Response) {
    const dil = isLocale(dilParam) ? dilParam : (istemciDili(req) ?? tarayiciDili(req) ?? "tr");
    const icerik = await urunSablonuOlustur(dil);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Length", String(icerik.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(urunSablonDosyaAdi(dil))}`);
    res.end(icerik);
  }

  /**
   * Doldurulmuş şablonu yükler. `onizleme=0` gelmedikçe HİÇBİR ŞEY YAZILMAZ;
   * arayüz önce önizler, onaylanınca aynı dosyayı yeniden gönderir (dosya
   * sunucuda saklanmıyor — bkz. PartyController.importOrg, aynı gerekçe).
   * Yetki: tek tek eklemeyle aynı (şirket sahibi ya da departman yöneticisi).
   */
  @Post("organizations/:organizationId/products/import")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async importExcel(
    @Param("organizationId") organizationId: string,
    @Query("onizleme") onizleme: string | undefined,
    @Query("departmentId") departmentId: string | undefined,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    await this.access.assertNotSubcontractor(req.user.userId, "products");
    // multer dosya adını latin1 okuyor; "Ürünler.xlsx" bozuk gelmesin.
    const ad = Buffer.from(file.originalname, "latin1").toString("utf8");
    const sayfa = urunSayfasiniSec(await tabloyuOku(file.buffer, ad));
    return this.productsService.sablondanIceAktar(organizationId, sayfa, req.user.userId, {
      onizleme: onizleme !== "0",
      departmentId,
    });
  }

  @Get("products/:id")
  async findOne(@Param("id") id: string, @Req() req: any) {
    // by-id okuma da liste ucuyla AYNI yetkiye tabi olmalı: eskiden hiçbir
    // kontrol yoktu, giriş yapan herkes UUID ile başka organizasyonun ürününü
    // (ve fiyatını) okuyabiliyordu.
    const product = await this.productsService.findOne(id);
    await this.access.assertCanViewOrganization(product.organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "products");
    return product;
  }

  // Ürün kartı: ürün + tedarikçi + strateji + ürünün geçtiği modül kayıtları.
  // Yetki liste ucuyla aynı; modül kayıtları ayrıca modül yetkisinden geçer
  // (bkz. ProductsService.overview).
  @Get("products/:id/overview")
  async overview(@Param("id") id: string, @Req() req: any) {
    const product = await this.productsService.findOne(id);
    await this.access.assertCanViewOrganization(product.organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "products");
    return this.productsService.overview(id, req.user.userId);
  }

  @Patch("products/:id")
  update(@Param("id") id: string, @Body() body: ProductWriteInput, @Req() req: any) {
    return this.productsService.update(id, body, req.user.userId);
  }

  // Galeriye bir fotoğraf ekler. İlk fotoğraf aynı zamanda vitrin görseli olur
  // (bkz. ProductsService.syncCoverFromImages).
  @Post("products/:id/images")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  addImage(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.productsService.addImage(id, file, req.user.userId);
  }

  // Ürünün tek kapağı olduğu dönemden kalan uç. Açık duran eski bir sekme hâlâ
  // buraya yükleyebilir; davranışı artık "galeriye ekle" ile aynı.
  @Post("products/:id/cover")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.productsService.addImage(id, file, req.user.userId);
  }

  @Delete("products/:id/images/:imageId")
  removeImage(@Param("id") id: string, @Param("imageId") imageId: string, @Req() req: any) {
    return this.productsService.removeImage(id, imageId, req.user.userId);
  }

  // Sıralama: listenin ilk elemanı vitrin görseli olur.
  @Patch("products/:id/images/order")
  reorderImages(@Param("id") id: string, @Body() body: { imageIds?: string[] }, @Req() req: any) {
    if (!Array.isArray(body?.imageIds)) throw new BadRequestException("imageIds listesi gerekli");
    return this.productsService.reorderImages(id, body.imageIds, req.user.userId);
  }

  @Delete("products/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.productsService.remove(id, req.user.userId);
  }

  @Patch("products/:id/archive")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.productsService.archive(id, req.user.userId);
  }

  @Patch("products/:id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.productsService.restore(id, req.user.userId);
  }
}
