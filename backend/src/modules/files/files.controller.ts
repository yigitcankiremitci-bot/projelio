import { Readable } from "node:stream";
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
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { AuthGuard } from "@nestjs/passport";
import { UploadRateLimitGuard } from "../../common/guards/upload-rate-limit.guard";
import { JwtService } from "@nestjs/jwt";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { getCorsOrigins } from "../../common/config/env";
import { FilesService, INLINE_UPLOAD_LIMIT, type NativeFileKind } from "./files.service";

interface FileAccessClaims {
  typ: "file_access";
  fileId: string;
  sub: string;
}

/**
 * Dosyalar İŞE (job) aittir. Proje/görev/çıktı yalnızca iliştirme bağlamıdır.
 * Proje ekranından gelen istekler için de kısayol uç noktaları var; bunlar işi
 * projeden türetip aynı servise düşer.
 */
function normalizeOwnerKind(value: string): "job" | "department" | "organization" {
  // İstemciden gelen değer; tanınmayan her şey en dar kapsama düşer.
  return value === "job" || value === "organization" ? value : "department";
}

@Controller()
export class FilesController {
  constructor(
    private filesService: FilesService,
    private jwtService: JwtService
  ) {}

  // -------------------------------------------------------------- departman

  // ------------------------------------------------------- şirketin dosyaları
  // Departman uçlarının birebir aynısı, kapsam farkıyla. Servis tarafında
  // gövdeler de ortak (bkz. FilesService, FlatScope): şirket ve departman
  // dosyaları aynı modeli kullanıyor — tek düz klasör + kadroya verilen izinler.

  @Post("organizations/:organizationId/files")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: INLINE_UPLOAD_LIMIT } })
  )
  uploadToOrganization(
    @Param("organizationId") organizationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { folderId?: string; relativePath?: string },
    @Req() req: any
  ) {
    return this.filesService.uploadInlineForFlat(
      { kind: "organization", id: organizationId },
      req.user.userId,
      file,
      { folderId: body?.folderId || undefined, relativePath: body?.relativePath || undefined }
    );
  }

  @Post("organizations/:organizationId/files/upload-session")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  createOrganizationUploadSession(
    @Param("organizationId") organizationId: string,
    @Body() body: { name: string; mimeType: string; sizeBytes?: number },
    @Req() req: any
  ) {
    return this.filesService.createUploadSessionForFlat(
      { kind: "organization", id: organizationId },
      req.user.userId,
      body
    );
  }

  @Post("organizations/:organizationId/files/sync-shares")
  @UseGuards(AuthGuard("jwt"))
  async syncOrganizationShares(@Param("organizationId") organizationId: string, @Req() req: any) {
    const scope = { kind: "organization" as const, id: organizationId };
    await this.filesService.assertFlatAccess(scope, req.user.userId);
    return this.filesService.syncFlatShares(scope);
  }

  @Get("organizations/:organizationId/files/browse")
  @UseGuards(AuthGuard("jwt"))
  browseOrganization(
    @Param("organizationId") organizationId: string,
    @Query("folderId") folderId: string | undefined,
    @Req() req: any
  ) {
    return this.filesService.browseForFlat({ kind: "organization", id: organizationId }, req.user.userId, folderId);
  }

  @Post("organizations/:organizationId/files/import")
  @UseGuards(AuthGuard("jwt"))
  importToOrganization(
    @Param("organizationId") organizationId: string,
    @Body() body: { sourceFileId: string; name?: string; folderId?: string },
    @Req() req: any
  ) {
    return this.filesService.importForFlat(
      { kind: "organization", id: organizationId },
      req.user.userId,
      body?.sourceFileId,
      body?.name,
      body?.folderId || undefined
    );
  }

  @Post("organizations/:organizationId/files/create-native")
  @UseGuards(AuthGuard("jwt"))
  createNativeInOrganization(
    @Param("organizationId") organizationId: string,
    @Body() body: { kind: NativeFileKind; name: string; folderId?: string },
    @Req() req: any
  ) {
    return this.filesService.createNativeForFlat(
      { kind: "organization", id: organizationId },
      req.user.userId,
      body?.kind,
      body?.name,
      body?.folderId || undefined
    );
  }

  @Get("departments/:departmentId/files")
  @UseGuards(AuthGuard("jwt"))
  listByDepartment(
    @Param("departmentId") departmentId: string,
    @Query("folderId") folderId: string | undefined,
    @Req() req: any
  ) {
    return this.filesService.listByDepartment(departmentId, req.user.userId, folderId || undefined);
  }

  @Post("departments/:departmentId/files")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: INLINE_UPLOAD_LIMIT } })
  )
  uploadToDepartment(
    @Param("departmentId") departmentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { folderId?: string; relativePath?: string },
    @Req() req: any
  ) {
    return this.filesService.uploadInlineForFlat({ kind: "department", id: departmentId }, req.user.userId, file, {
      folderId: body?.folderId || undefined,
      relativePath: body?.relativePath || undefined,
    });
  }

  @Post("departments/:departmentId/files/upload-session")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  createDepartmentUploadSession(
    @Param("departmentId") departmentId: string,
    @Body() body: { name: string; mimeType: string; sizeBytes?: number },
    @Req() req: any
  ) {
    return this.filesService.createUploadSessionForDepartment(departmentId, req.user.userId, body);
  }

  @Post("departments/:departmentId/files/sync-shares")
  @UseGuards(AuthGuard("jwt"))
  async syncDepartmentShares(@Param("departmentId") departmentId: string, @Req() req: any) {
    await this.filesService.assertDepartmentAccess(departmentId, req.user.userId);
    return this.filesService.syncDepartmentShares(departmentId);
  }

  // ------------------------------------------------- göz atma / içe aktarma / yeni dosya

  @Get("departments/:departmentId/files/browse")
  @UseGuards(AuthGuard("jwt"))
  browseDepartment(
    @Param("departmentId") departmentId: string,
    @Req() req: any,
    @Query("folderId") folderId?: string
  ) {
    return this.filesService.browseForDepartment(departmentId, req.user.userId, folderId);
  }

  @Post("departments/:departmentId/files/import")
  @UseGuards(AuthGuard("jwt"))
  importToDepartment(
    @Param("departmentId") departmentId: string,
    @Body() body: { sourceFileId: string; name?: string; folderId?: string },
    @Req() req: any
  ) {
    return this.filesService.importForFlat(
      { kind: "department", id: departmentId },
      req.user.userId,
      body?.sourceFileId,
      body?.name,
      body?.folderId || undefined
    );
  }

  @Post("departments/:departmentId/files/create-native")
  @UseGuards(AuthGuard("jwt"))
  createNativeInDepartment(
    @Param("departmentId") departmentId: string,
    @Body() body: { kind: NativeFileKind; name: string; folderId?: string },
    @Req() req: any
  ) {
    return this.filesService.createNativeForFlat(
      { kind: "department", id: departmentId },
      req.user.userId,
      body?.kind,
      body?.name,
      body?.folderId || undefined
    );
  }

  /**
   * Google Picker'ın kullanacağı erişim jetonu — HEDEFİN deposu üzerinden.
   *
   * NEDEN /google/picker-token YETMİYOR: o uç kullanıcının VARSAYILAN Drive
   * hesabını kullanıyor. Kullanıcı artık birden fazla hesap bağlayabildiği ve
   * şirketler ayrı hesap seçebildiği için (bkz. migration 088), seçim ekranı
   * yanlış hesabın Drive'ını açabiliyordu: seçilen dosyayı hedef hesabın jetonu
   * göremediği için "Dosya içe aktarılamadı" ile bitiyordu.
   */
  @Get("files/picker-token")
  @UseGuards(AuthGuard("jwt"))
  pickerToken(
    @Req() req: any,
    @Query("jobId") jobId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("organizationId") organizationId?: string
  ) {
    return this.filesService.pickerTokenForTarget(req.user.userId, { jobId, departmentId, organizationId });
  }

  // ---------------------------------------------------------------- klasörler
  // Üç kapsam da (iş, departman, şirket) aynı klasör ağacını kullanıyor
  // (bkz. migration 090), bu yüzden kapsam yol parçası değil sorgu parametresi:
  // üç ayrı uç üçlemesi yerine tek uç kümesi.

  @Get("file-folders")
  @UseGuards(AuthGuard("jwt"))
  listFolders(
    @Query("ownerKind") ownerKind: "job" | "department" | "organization",
    @Query("ownerId") ownerId: string,
    @Query("parentId") parentId: string | undefined,
    @Req() req: any
  ) {
    return this.filesService.listFolders(
      { kind: normalizeOwnerKind(ownerKind), id: ownerId },
      req.user.userId,
      parentId || undefined
    );
  }

  /** Ekmek kırıntısı: klasörün kökten kendisine kadar olan yolu. */
  @Get("file-folders/:id/path")
  @UseGuards(AuthGuard("jwt"))
  folderPath(@Param("id") id: string, @Req() req: any) {
    return this.filesService.folderPath(id, req.user.userId);
  }

  @Post("file-folders")
  @UseGuards(AuthGuard("jwt"))
  createFolder(
    @Body() body: { ownerKind: "job" | "department" | "organization"; ownerId: string; name: string; parentFolderId?: string },
    @Req() req: any
  ) {
    return this.filesService.createFolder(
      { kind: normalizeOwnerKind(body?.ownerKind), id: body?.ownerId },
      req.user.userId,
      body?.name,
      body?.parentFolderId || undefined
    );
  }

  @Patch("file-folders/:id")
  @UseGuards(AuthGuard("jwt"))
  renameFolder(@Param("id") id: string, @Body() body: { name: string }, @Req() req: any) {
    return this.filesService.renameFolder(id, req.user.userId, body?.name);
  }

  @Delete("file-folders/:id")
  @UseGuards(AuthGuard("jwt"))
  async removeFolder(@Param("id") id: string, @Req() req: any) {
    await this.filesService.removeFolder(id, req.user.userId);
    return { ok: true as const };
  }

  // -------------------------------------------------------------- listeleme

  @Get("jobs/:jobId/files")
  @UseGuards(AuthGuard("jwt"))
  listByJob(
    @Param("jobId") jobId: string,
    @Req() req: any,
    @Query("scope") scope?: "all" | "general" | "project",
    @Query("projectId") projectId?: string,
    @Query("taskId") taskId?: string,
    @Query("outputId") outputId?: string,
    @Query("folderId") folderId?: string,
    @Query("atRoot") atRoot?: string
  ) {
    return this.filesService.listByJob(jobId, req.user.userId, {
      scope,
      projectId,
      taskId,
      outputId,
      folderId: folderId || undefined,
      atRoot: atRoot === "1",
    });
  }

  @Get("projects/:projectId/files")
  @UseGuards(AuthGuard("jwt"))
  listByProject(
    @Param("projectId") projectId: string,
    @Req() req: any,
    @Query("taskId") taskId?: string,
    @Query("outputId") outputId?: string
  ) {
    return this.filesService.listByProject(projectId, req.user.userId, { taskId, outputId });
  }

  // Hiyerarşi: üst kademeler altındaki her şeyi tek listede görür.
  // Grup > Organizasyon > İş > Proje

  @Get("organizations/:organizationId/files")
  @UseGuards(AuthGuard("jwt"))
  listByOrganization(
    @Param("organizationId") organizationId: string,
    @Query("folderId") folderId: string | undefined,
    @Req() req: any
  ) {
    return this.filesService.listByOrganization(organizationId, req.user.userId, folderId || undefined);
  }

  @Get("groups/:groupId/files")
  @UseGuards(AuthGuard("jwt"))
  listByGroup(@Param("groupId") groupId: string, @Req() req: any) {
    return this.filesService.listByGroup(groupId, req.user.userId);
  }

  // --------------------------------------------------------------- yükleme

  @Post("jobs/:jobId/files")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: INLINE_UPLOAD_LIMIT } })
  )
  upload(
    @Param("jobId") jobId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      projectId?: string;
      taskId?: string;
      outputId?: string;
      folderId?: string;
      relativePath?: string;
    },
    @Req() req: any
  ) {
    return this.filesService.uploadInline(
      jobId,
      req.user.userId,
      file,
      {
        projectId: body?.projectId || undefined,
        taskId: body?.taskId || undefined,
        outputId: body?.outputId || undefined,
      },
      { folderId: body?.folderId || undefined, relativePath: body?.relativePath || undefined }
    );
  }

  /**
   * Büyük dosyalar: tarayıcı doğrudan Drive'a yükleyebilsin diye adres üretir.
   *
   * BURASI DA HIZ SINIRINA TABİ. Baytlar bizim üzerimizden geçmiyor ama oturum
   * açmak da bir kaynak: sınır yalnızca satır içi yükleme ucundayken 8 MB üstü
   * dosyalar sayaca hiç dokunmuyordu — kullanıcı 40 dosya yükleyip sınırın neden
   * devreye girmediğini soruyordu. İki yol da aynı kotayı harcamalı.
   */
  @Post("jobs/:jobId/files/upload-session")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  createUploadSession(
    @Param("jobId") jobId: string,
    @Body()
    body: { name: string; mimeType: string; sizeBytes?: number; projectId?: string; taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.createUploadSession(jobId, req.user.userId, body);
  }

  // Proje/görev ekranından yükleme kısayolları: ön yüzün işi ayrıca bilmesine
  // gerek kalmasın diye iş, projeden türetilir.

  @Post("projects/:projectId/files")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: INLINE_UPLOAD_LIMIT } })
  )
  uploadToProject(
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.uploadInlineForProject(projectId, req.user.userId, file, {
      taskId: body?.taskId || undefined,
      outputId: body?.outputId || undefined,
    });
  }

  @Post("projects/:projectId/files/upload-session")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  createProjectUploadSession(
    @Param("projectId") projectId: string,
    @Body() body: { name: string; mimeType: string; sizeBytes?: number; taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.createUploadSessionForProject(projectId, req.user.userId, body);
  }

  /**
   * Yarım kalan yüklemeyi kapatır: dosya sağlayıcıda oluştuysa Projelio'ya
   * kazandırır, oluşmadıysa oturumu iptal eder (bkz. reconcileUploadSession).
   * `cancel` kullanıcının vazgeçtiği durumda gelir — o zaman oluşmuş dosya da
   * çöpe atılır.
   */
  @Post("files/sessions/:sessionId/reconcile")
  @UseGuards(AuthGuard("jwt"))
  reconcileSession(
    @Param("sessionId") sessionId: string,
    @Req() req: any,
    @Body("cancel") cancel?: boolean
  ) {
    return this.filesService.reconcileUploadSession(sessionId, req.user.userId, { cancel: cancel === true });
  }

  @Post("files/sessions/:sessionId/complete")
  @UseGuards(AuthGuard("jwt"))
  completeUploadSession(
    @Param("sessionId") sessionId: string,
    @Body("driveFileId") driveFileId: string,
    @Req() req: any
  ) {
    if (!driveFileId) throw new BadRequestException("driveFileId gerekli");
    return this.filesService.completeUploadSession(sessionId, req.user.userId, driveFileId);
  }

  // --------------------------------------------------------------- paylaşım

  /** Ekip değiştiğinde Drive izinlerini yeniden hizalar. */
  @Post("jobs/:jobId/files/sync-shares")
  @UseGuards(AuthGuard("jwt"))
  async syncShares(@Param("jobId") jobId: string, @Req() req: any) {
    await this.filesService.assertJobAccess(jobId, req.user.userId);
    return this.filesService.syncJobShares(jobId);
  }

  // ------------------------------------------------- göz atma / içe aktarma / yeni dosya

  @Get("jobs/:jobId/files/browse")
  @UseGuards(AuthGuard("jwt"))
  browseJob(@Param("jobId") jobId: string, @Req() req: any, @Query("folderId") folderId?: string) {
    return this.filesService.browseForJob(jobId, req.user.userId, folderId);
  }

  @Post("jobs/:jobId/files/import")
  @UseGuards(AuthGuard("jwt"))
  importToJob(
    @Param("jobId") jobId: string,
    @Body() body: { sourceFileId: string; name?: string; projectId?: string; taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.importForJob(jobId, req.user.userId, body?.sourceFileId, {
      name: body?.name,
      projectId: body?.projectId || undefined,
      taskId: body?.taskId || undefined,
      outputId: body?.outputId || undefined,
    });
  }

  @Post("jobs/:jobId/files/create-native")
  @UseGuards(AuthGuard("jwt"))
  createNativeInJob(
    @Param("jobId") jobId: string,
    @Body() body: { kind: NativeFileKind; name: string; projectId?: string; taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.createNativeForJob(jobId, req.user.userId, body?.kind, body?.name, {
      projectId: body?.projectId || undefined,
      taskId: body?.taskId || undefined,
      outputId: body?.outputId || undefined,
    });
  }

  @Get("projects/:projectId/files/browse")
  @UseGuards(AuthGuard("jwt"))
  browseProject(@Param("projectId") projectId: string, @Req() req: any, @Query("folderId") folderId?: string) {
    return this.filesService.browseForProject(projectId, req.user.userId, folderId);
  }

  @Post("projects/:projectId/files/import")
  @UseGuards(AuthGuard("jwt"))
  importToProject(
    @Param("projectId") projectId: string,
    @Body() body: { sourceFileId: string; name?: string; taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.importForProject(projectId, req.user.userId, body?.sourceFileId, {
      name: body?.name,
      taskId: body?.taskId || undefined,
      outputId: body?.outputId || undefined,
    });
  }

  @Post("projects/:projectId/files/create-native")
  @UseGuards(AuthGuard("jwt"))
  createNativeInProject(
    @Param("projectId") projectId: string,
    @Body() body: { kind: NativeFileKind; name: string; taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.createNativeForProject(projectId, req.user.userId, body?.kind, body?.name, {
      taskId: body?.taskId || undefined,
      outputId: body?.outputId || undefined,
    });
  }

  // ------------------------------------------------------- içerik erişimi
  // <img src> ve <iframe src> özel başlık gönderemez, dolayısıyla Bearer token
  // kullanılamaz. Bunun yerine 5 dakika ömürlü, tek bir dosyaya bağlı imzalı bir
  // jeton üretilir; içerik uç noktası yalnızca onu kabul eder.

  /**
   * Birden çok dosya için tek seferde imzalı jeton.
   *
   * Simge görünümünde ekranda onlarca önizleme var; her biri için ayrı bir
   * jeton isteği atmak sunucuya gereksiz yük, kullanıcıya da gecikme demekti.
   * Güvenlik aynı: jetonlar yine DOSYA BAŞINA imzalanıyor ve her biri için
   * erişim ayrı ayrı doğrulanıyor — erişilemeyen dosya listede hiç dönmüyor.
   */
  @Post("files/access-tokens")
  @UseGuards(AuthGuard("jwt"))
  async accessTokens(@Body("ids") ids: string[], @Req() req: any) {
    const benzersiz = Array.from(new Set(Array.isArray(ids) ? ids : [])).slice(0, LISTE_TAVANI);

    const entries = await Promise.all(
      benzersiz.map(async (id) => {
        try {
          await this.filesService.findById(id, req.user.userId);
        } catch {
          // Erişimi olmayan dosya sessizce atlanır: burada hata döndürmek,
          // tek bir eskimiş kimlik yüzünden bütün ızgarayı önizlemesiz bırakırdı.
          return null;
        }
        const token = this.jwtService.sign(
          { typ: "file_access", fileId: id, sub: req.user.userId } satisfies FileAccessClaims,
          { expiresIn: "5m" }
        );
        return [id, token] as const;
      })
    );

    return {
      tokens: Object.fromEntries(entries.filter(Boolean) as (readonly [string, string])[]),
      expiresInSeconds: 300,
    };
  }

  @Post("files/:id/access-token")
  @UseGuards(AuthGuard("jwt"))
  async accessToken(@Param("id") id: string, @Req() req: any) {
    // Yetkiyi burada bir kez doğrula: jeton ancak erişimi olan kişiye verilir.
    await this.filesService.findById(id, req.user.userId);

    const token = this.jwtService.sign(
      { typ: "file_access", fileId: id, sub: req.user.userId } satisfies FileAccessClaims,
      { expiresIn: "5m" }
    );
    return { token, expiresInSeconds: 300 };
  }

  /**
   * Dosyanın önizlemesi.
   *
   * `content`ten ayrı bir uç: orada Content-Type kullanıcının yüklediği
   * değerden geliyor ve bu yüzden uzun bir güvenlik gerekçesi var. Burada
   * içerik HER ZAMAN sağlayıcının ürettiği bir görsel — türü biz sabitliyoruz,
   * kullanıcı etkileyemiyor.
   */
  @Get("files/:id/thumbnail")
  async thumbnail(@Param("id") id: string, @Query("t") accessToken: string, @Res() res: Response) {
    const claims = this.verifyAccessToken(accessToken, id);
    const upstream = await this.filesService.openThumbnail(id, claims.sub);

    // Önizleme yoksa 404: arayüz tür ikonuna düşer, hata göstermez.
    if (!upstream?.body) return res.status(404).end();

    const type = upstream.headers.get("content-type") ?? "";
    // Sağlayıcı beklenmedik bir tür döndürürse görsel diye servis etmeyiz.
    res.setHeader("Content-Type", type.startsWith("image/") ? type : "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    // Önizleme adresi imzalı ve kısa ömürlü; aracıların paylaşmaması için private.
    res.setHeader("Cache-Control", "private, max-age=300");

    Readable.fromWeb(upstream.body as any).pipe(res);
  }

  @Get("files/:id/content")
  async content(
    @Param("id") id: string,
    @Query("t") accessToken: string,
    @Query("download") download: string,
    @Res() res: Response
  ) {
    const claims = this.verifyAccessToken(accessToken, id);
    const { response, fileName, mimeType } = await this.filesService.openDownload(id, claims.sub);

    // GÜVENLİK — bu uç, KULLANICININ YÜKLEDİĞİ içeriği BİZİM alan adımızdan
    // servis ediyor ve Content-Type, yükleme sırasında istemcinin bildirdiği
    // değerden geliyor (bkz. FilesService.uploadInline: file.mimetype). Yani
    // içeriği HTML olan bir dosya "text/html" diye yüklenip, çıkan bağlantı
    // paylaşılarak API alan adımızın altında saldırganın sayfası çalıştırılabilirdi
    // — oltalama için hazır zemin. Ön yüz bu adresi önizleme için <iframe>'e de
    // koyuyor (FilePreviewModal), yani sayfa uygulamanın içinde görünürdü.
    res.setHeader("Content-Type", mimeType);
    const length = response.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);

    // Tarayıcı Content-Type'a uymayıp içeriği "koklayarak" HTML sanmasın.
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Asıl savunma başlık değil, DAVRANIŞ: yalnızca tarayıcıda güvenle
    // gösterilebilen türler satır içi (inline) açılır; geri kalan HER ŞEY
    // indirmeye zorlanır ve indirilen dosya çalışmaz. Böylece saldırganın
    // Content-Type'ı seçebiliyor olması bir işe yaramıyor.
    //
    // Ön yüzü bozmuyor: önizleme zaten yalnızca görsel ve PDF için açılıyor
    // (bkz. apps/web/src/lib/driveLinks.ts canRenderLocally), diğer türlerde
    // ya Drive önizleyicisi kullanılıyor ya da indirme.
    const inlineSafe = mimeType.startsWith("image/") || mimeType === "application/pdf";
    const disposition = download === "1" || !inlineSafe ? "attachment" : "inline";
    // RFC 5987 ile Türkçe karakterli adlar da doğru gider.
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    // Yine de bir HTML bir şekilde satır içi açılırsa script çalışmasın.
    // `sandbox` YERİNE `default-src 'none'` seçildi: sandbox yanıtı opak bir
    // origin'e alıyor ve Chrome'un yerleşik PDF görüntüleyicisini bozabiliyor,
    // oysa default-src 'none' script/alt kaynak yüklemesini engellerken PDF
    // görüntülemeye dokunmuyor.
    //
    // frame-ancestors gerekiyor çünkü helmet global olarak X-Frame-Options:
    // SAMEORIGIN koyuyor; ön yüz BAŞKA bir origin'de (Netlify) olduğu için o
    // başlık önizleme iframe'ini engellerdi. Onun yerine çerçevelemeye yalnızca
    // kendi alan adlarımıza izin veriyoruz.
    const allowedAncestors = getCorsOrigins();
    res.removeHeader("X-Frame-Options");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; frame-ancestors ${allowedAncestors.length ? allowedAncestors.join(" ") : "*"}`
    );
    // İçerik kullanıcıya özel; ara sunucular önbelleğe almamalı.
    res.setHeader("Cache-Control", "private, no-store");

    if (!response.body) {
      res.end();
      return;
    }
    // Web ReadableStream -> Node stream. Dosya bellekte tamponlanmadan akar.
    Readable.fromWeb(response.body as any).pipe(res);
  }

  private verifyAccessToken(token: string, fileId: string): FileAccessClaims {
    if (!token) throw new UnauthorizedException("Erişim jetonu eksik");
    let claims: FileAccessClaims;
    try {
      claims = this.jwtService.verify<FileAccessClaims>(token);
    } catch {
      throw new UnauthorizedException("Erişim jetonu geçersiz veya süresi dolmuş");
    }
    // Jeton yalnızca verildiği dosya için geçerli: başka bir dosyaya taşınamaz.
    if (claims?.typ !== "file_access" || claims.fileId !== fileId) {
      throw new UnauthorizedException("Erişim jetonu bu dosya için geçerli değil");
    }
    return claims;
  }

  /**
   * Tek bir dosyanın künyesi.
   *
   * Lio sohbetinde dosya adı bağlantı olarak veriliyor ve tıklanınca önizleme
   * penceresi açılıyor (bkz. AiAssistantPanel). Pencerenin ihtiyaç duyduğu
   * alanlar (sağlayıcı, drive kimliği, tür, düzenleme yetkisi) elde yok:
   * sohbette yalnızca dosya kimliği taşınıyor. Yetki findById'de çözülüyor.
   */
  @Get("files/:id")
  @UseGuards(AuthGuard("jwt"))
  async findOne(@Param("id") id: string, @Req() req: any) {
    const { file } = await this.filesService.findById(id, req.user.userId);
    return file;
  }

  // ------------------------------------------------------------ düzenle/sil

  @Patch("files/:id")
  @UseGuards(AuthGuard("jwt"))
  rename(@Param("id") id: string, @Body("name") name: string, @Req() req: any) {
    return this.filesService.rename(id, req.user.userId, name);
  }

  @Delete("files/:id")
  @UseGuards(AuthGuard("jwt"))
  async remove(@Param("id") id: string, @Query("trash") trash: string, @Req() req: any) {
    await this.filesService.remove(id, req.user.userId, trash === "1");
    return { ok: true };
  }
}
