import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { memoryStorage } from "multer";
import { UsersService } from "./users.service";
import type { AccountType } from "./users.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { GroupsService } from "../groups/groups.service";

@Controller("users")
@UseGuards(AuthGuard("jwt"))
export class UsersController {
  constructor(
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private groupsService: GroupsService
  ) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // NOT: bu route ":id" ile çakışmaması için ondan önce tanımlanmalı.
  @Get("search")
  search(@Query("q") q: string) {
    return this.usersService.search(q ?? "");
  }

  @Patch("me/username")
  updateUsername(@Req() req: any, @Body("username") username: string) {
    return this.usersService.updateUsername(req.user.userId, username);
  }

  // Anasayfadaki kişi kartı düzenleme modalı: ad soyad, görev/unvan, kısa açıklama.
  @Patch("me/profile")
  updateProfile(@Req() req: any, @Body() body: { fullName?: string; title?: string; bio?: string }) {
    return this.usersService.updateProfile(req.user.userId, body);
  }

  @Post("me/avatar")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadAvatar(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.usersService.uploadAvatar(req.user.userId, file);
  }

  // İlk giriş onboarding sihirbazı: kullanıcı hesap tipini seçer, "organization_owner"
  // ya da "group_owner" seçtiyse aynı anda kendi Organizasyonu/Grubu da oluşturulur.
  @Patch("me/onboarding")
  async completeOnboarding(
    @Req() req: any,
    @Body() body: { accountType: AccountType; organizationName?: string; groupName?: string }
  ) {
    const userId = req.user.userId;
    if (body.accountType === "organization_owner") {
      if (!body.organizationName?.trim()) throw new BadRequestException("Organizasyon adı gerekli");
      await this.organizationsService.create(userId, { name: body.organizationName.trim() });
    } else if (body.accountType === "group_owner") {
      if (!body.groupName?.trim()) throw new BadRequestException("Grup adı gerekli");
      await this.groupsService.create(userId, { name: body.groupName.trim() });
    }
    return this.usersService.completeOnboarding(userId, body.accountType);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findByIdPublic(id);
  }
}
