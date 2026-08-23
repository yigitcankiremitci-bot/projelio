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
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UsersService } from "./users.service";
import { AccountDeletionService } from "./account-deletion.service";
import { AccountExportService } from "./account-export.service";
import type { Response } from "express";
import type { AccountType } from "./users.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { GroupsService } from "../groups/groups.service";

@Controller("users")
@UseGuards(AuthGuard("jwt"))
export class UsersController {
  constructor(
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private groupsService: GroupsService,
    private accountDeletion: AccountDeletionService,
    private accountExport: AccountExportService
  ) {}

  // Tüm kullanıcı dizini. Arayüzde kullanılmıyor (kişi eklerken /users/search
  // çağrılır) ve herkese açık bir kullanıcı listesi vermek için sebep yok:
  // admin paneli kendi uçunu kullanır (bkz. AdminController.getUsers).
  @Get()
  @UseGuards(RolesGuard)
  @Roles("admin")
  findAll(@Query("limit") limit?: string) {
    return this.usersService.findAll(limit ? Number(limit) : undefined);
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

  // Ayarlar > Hesap. Şifresini UNUTANLAR buradan geçmez — o akış giriş ekranındaki
  // /auth/forgot-password (bkz. password-reset.service.ts).
  @Patch("me/password")
  changePassword(@Req() req: any, @Body() body: { currentPassword?: string; newPassword: string }) {
    return this.usersService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
  }

  /**
   * Hesap silinmeden önce ne olacağını gösterir: engel var mı, hangi işler
   * silinecek. Onay ekranı bunu gösteriyor — kullanıcı neyi kaybedeceğini
   * görmeden silme kararı vermemeli.
   */
  @Get("me/deletion-preview")
  deletionPreview(@Req() req: any) {
    return this.accountDeletion.previewDeletion(req.user.userId);
  }

  /**
   * Hesap silme TALEBİ. Hemen silmez: 30 günlük bekleme başlatır ve girişi
   * kapatır (bkz. AccountDeletionService). Şifre doğrulaması ister — oturumu
   * ele geçiren biri hesabı silemesin; Google ile açılmış hesaplarda atlanır.
   */
  /**
   * Kullanıcının kendi verisinin Excel çıktısı (KVKK m.11 / GDPR Art. 20).
   * Hesap silme ekranından da sunuluyor: kişi elinde bir dökümanla ayrılsın.
   */
  @Get("me/export")
  async exportMe(@Req() req: any, @Res() res: Response) {
    const { buffer, fileName } = await this.accountExport.buildWorkbook(req.user.userId);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    // Kişisel veri: ara sunucular önbelleğe almamalı.
    res.setHeader("Cache-Control", "private, no-store");
    res.end(buffer);
  }

  @Delete("me")
  deleteMe(@Req() req: any, @Body() body: { password?: string }) {
    return this.accountDeletion.requestDeletion(req.user.userId, body?.password);
  }

  @Post("me/avatar")
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadAvatar(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Dosya bulunamadı");
    return this.usersService.uploadAvatar(req.user.userId, file);
  }

  // İlk giriş onboarding sihirbazı: kullanıcı hesap tipini seçer, "organization_owner"
  // ya da "group_owner" seçtiyse aynı anda kendi Organizasyonu/Grubu da oluşturulur.
  // "employee"/"subcontractor" seçenlerinde herhangi bir yapı kurulmaz — bu kişiler
  // bir departmanın kadrosuna (department_members) davetle bağlanır.
  @Patch("me/onboarding")
  async completeOnboarding(
    @Req() req: any,
    @Body()
    body: {
      accountType: AccountType;
      organizationName?: string;
      // "sirket" (büyük ölçek) ya da "isletme" (küçük ölçek) — verilmezse "sirket" varsayılır.
      orgType?: "sirket" | "isletme";
      groupName?: string;
    }
  ) {
    const userId = req.user.userId;
    let organizationId: string | undefined;
    let groupId: string | undefined;

    if (body.accountType === "organization_owner") {
      if (!body.organizationName?.trim()) throw new BadRequestException("Organizasyon adı gerekli");
      const org = await this.organizationsService.create(userId, {
        name: body.organizationName.trim(),
        orgType: body.orgType === "isletme" ? "isletme" : "sirket",
      });
      organizationId = org.id;
    } else if (body.accountType === "group_owner") {
      if (!body.groupName?.trim()) throw new BadRequestException("Grup adı gerekli");
      const group = await this.groupsService.create(userId, { name: body.groupName.trim() });
      groupId = group.id;
    }
    const user = await this.usersService.completeOnboarding(userId, body.accountType);
    // Frontend, sihirbaz kapanınca kullanıcıyı doğrudan oluşturulan organizasyona/gruba
    // yönlendirebilsin diye kimlikleri de döneriz (departman seçimine hemen başlasın diye).
    return { ...user, organizationId, groupId };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findByIdPublic(id);
  }
}
