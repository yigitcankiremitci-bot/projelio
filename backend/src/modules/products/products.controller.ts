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
import { memoryStorage } from "multer";
import { ProductsService } from "./products.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get("organizations/:organizationId/products")
  findByOrganization(@Param("organizationId") organizationId: string) {
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
  findOne(@Param("id") id: string) {
    return this.productsService.findOne(id);
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
