import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { UploadRateLimitGuard } from "../../common/guards/upload-rate-limit.guard";
import { memoryStorage } from "multer";
import { ProductsService } from "./products.service";
import { AccessService } from "../../common/access/access.service";

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
  create(
    @Param("organizationId") organizationId: string,
    @Body() body: { departmentId?: string; name: string; description?: string; price?: number; currency?: string },
    @Req() req: any
  ) {
    return this.productsService.create(organizationId, body, req.user.userId);
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

  @Patch("products/:id")
  update(
    @Param("id") id: string,
    @Body() body: { name?: string; description?: string; price?: number; currency?: string },
    @Req() req: any
  ) {
    return this.productsService.update(id, body, req.user.userId);
  }

  @Post("products/:id/cover")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadCover(@Param("id") id: string, @Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.productsService.uploadCover(id, file, req.user.userId);
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
