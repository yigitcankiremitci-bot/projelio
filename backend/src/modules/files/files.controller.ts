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
import { AuthGuard } from "@nestjs/passport";
import { JwtService } from "@nestjs/jwt";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { FilesService, INLINE_UPLOAD_LIMIT } from "./files.service";

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
@Controller()
export class FilesController {
  constructor(
    private filesService: FilesService,
    private jwtService: JwtService
  ) {}

  // -------------------------------------------------------------- listeleme

  @Get("jobs/:jobId/files")
  @UseGuards(AuthGuard("jwt"))
  listByJob(
    @Param("jobId") jobId: string,
    @Req() req: any,
    @Query("scope") scope?: "all" | "general" | "project",
    @Query("projectId") projectId?: string,
    @Query("taskId") taskId?: string,
    @Query("outputId") outputId?: string
  ) {
    return this.filesService.listByJob(jobId, req.user.userId, { scope, projectId, taskId, outputId });
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
  listByOrganization(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.filesService.listByOrganization(organizationId, req.user.userId);
  }

  @Get("groups/:groupId/files")
  @UseGuards(AuthGuard("jwt"))
  listByGroup(@Param("groupId") groupId: string, @Req() req: any) {
    return this.filesService.listByGroup(groupId, req.user.userId);
  }

  // --------------------------------------------------------------- yükleme

  @Post("jobs/:jobId/files")
  @UseGuards(AuthGuard("jwt"))
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: INLINE_UPLOAD_LIMIT } })
  )
  upload(
    @Param("jobId") jobId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { projectId?: string; taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.uploadInline(jobId, req.user.userId, file, {
      projectId: body?.projectId || undefined,
      taskId: body?.taskId || undefined,
      outputId: body?.outputId || undefined,
    });
  }

  /** Büyük dosyalar: tarayıcı doğrudan Drive'a yükleyebilsin diye adres üretir. */
  @Post("jobs/:jobId/files/upload-session")
  @UseGuards(AuthGuard("jwt"))
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
  @UseGuards(AuthGuard("jwt"))
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
  @UseGuards(AuthGuard("jwt"))
  createProjectUploadSession(
    @Param("projectId") projectId: string,
    @Body() body: { name: string; mimeType: string; sizeBytes?: number; taskId?: string; outputId?: string },
    @Req() req: any
  ) {
    return this.filesService.createUploadSessionForProject(projectId, req.user.userId, body);
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

  // ------------------------------------------------------- içerik erişimi
  // <img src> ve <iframe src> özel başlık gönderemez, dolayısıyla Bearer token
  // kullanılamaz. Bunun yerine 5 dakika ömürlü, tek bir dosyaya bağlı imzalı bir
  // jeton üretilir; içerik uç noktası yalnızca onu kabul eder.

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

  @Get("files/:id/content")
  async content(
    @Param("id") id: string,
    @Query("t") accessToken: string,
    @Query("download") download: string,
    @Res() res: Response
  ) {
    const claims = this.verifyAccessToken(accessToken, id);
    const { response, fileName, mimeType } = await this.filesService.openDownload(id, claims.sub);

    res.setHeader("Content-Type", mimeType);
    const length = response.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);

    // İndirme mi, gömülü önizleme mi? RFC 5987 ile Türkçe karakterli adlar da doğru gider.
    const disposition = download === "1" ? "attachment" : "inline";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`
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
