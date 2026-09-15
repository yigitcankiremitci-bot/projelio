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
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { UploadRateLimitGuard } from "../../common/guards/upload-rate-limit.guard";
import { INLINE_UPLOAD_LIMIT } from "../files/files.service";
import { FATURA_MODULU, FaturalarService, type FaturaKapsami } from "./faturalar.service";
import { LioYardimiService } from "./lio-yardimi.service";

/**
 * Kapsam istemciden iki parça olarak geliyor; tanınmayan her şey ŞİRKET sayılır.
 *
 * İş kapsamı (serbest çalışan) bilerek açıkça istenmek zorunda: kimliği yanlış
 * yorumlayıp bir şirket kimliğini iş gibi aramak, hatayı "bulunamadı" olarak
 * gösterir ve sebebi görünmez kılardı.
 */
function kapsamCoz(scope: string | undefined, scopeId: string | undefined): FaturaKapsami {
  if (!scopeId) throw new BadRequestException("Kapsam kimliği gerekli");
  return { kind: scope === "job" ? "job" : "organization", id: scopeId };
}

/**
 * Faturaların belgeleri: kayda ek, kasa bağı, ay sonu arşivi.
 *
 * Fatura KAYDININ kendisi (tutar, numara, karşı taraf) burada değil:
 * o, module_records'ta yaşayan sıradan bir modül kaydı ve kendi uçları var.
 * Burada yalnızca kaydın BELGESİYLE ilgili işler var.
 */
@Controller()
export class FaturalarController {
  constructor(
    private faturalar: FaturalarService,
    private lioYardimi: LioYardimiService
  ) {}

  /** Kayda belge ekler; dosya ay klasörüne iner (bkz. migration 112). */
  @Post("module-records/:id/attachments")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: INLINE_UPLOAD_LIMIT } })
  )
  ekYukle(@Param("id") id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.faturalar.ekYukle(id, file, req.user.userId);
  }

  // --------------------------------------------------------- Lio yardımı
  //
  // Anahtar MODÜLE ait (ekibin kararı), okuma ise KULLANICININ kredisinden
  // harcıyor — bu yüzden durum ucu ikisini birlikte döndürüyor.

  @Get("modules/:moduleKey/ai-assist")
  @UseGuards(AuthGuard("jwt"))
  lioDurumu(
    @Param("moduleKey") moduleKey: string,
    @Query("scope") scope: string,
    @Query("scopeId") scopeId: string,
    @Req() req: any
  ) {
    return this.lioYardimi.durum(kapsamCoz(scope, scopeId), moduleKey, req.user.userId);
  }

  @Patch("modules/:moduleKey/ai-assist")
  @UseGuards(AuthGuard("jwt"))
  lioAyarla(
    @Param("moduleKey") moduleKey: string,
    @Body() body: { scope?: string; scopeId?: string; enabled?: boolean },
    @Req() req: any
  ) {
    return this.lioYardimi.ayarla(
      kapsamCoz(body?.scope, body?.scopeId),
      moduleKey,
      body?.enabled === true,
      req.user.userId
    );
  }

  /**
   * Lio yardımı açıkken bırakılan belge: okunur, kaydı ve kasa satırı açılır.
   *
   * Ayrı uç, `attachments` ucundan ayrı: bu uç KREDİ HARCIYOR ve deftere kayıt
   * yazıyor. Aynı uca "aiAssist=true" gibi bir bayrakla girilseydi, anahtarın
   * kapalı olduğu bir ekrandan gelen istek de para harcatabilirdi.
   */
  @Post("invoices/ai-intake")
  @UseGuards(AuthGuard("jwt"), UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: INLINE_UPLOAD_LIMIT } })
  )
  lioIleGir(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { scope?: string; scopeId?: string; departmentId?: string },
    @Req() req: any
  ) {
    return this.faturalar.lioIleGir(
      kapsamCoz(body?.scope, body?.scopeId),
      file,
      body?.departmentId || undefined,
      req.user.userId
    );
  }

  // ------------------------------------------------------------ kasa bağı

  @Post("budget/transactions/:id/invoice")
  @UseGuards(AuthGuard("jwt"))
  kasaFaturasi(
    @Param("id") id: string,
    @Body() body: { recordId?: string; departmentId?: string },
    @Req() req: any
  ) {
    return this.faturalar.kasaFaturasi(id, body ?? {}, req.user.userId);
  }

  @Delete("budget/transactions/:id/invoice")
  @UseGuards(AuthGuard("jwt"))
  kasaFaturasiniKaldir(@Param("id") id: string, @Req() req: any) {
    return this.faturalar.kasaFaturasiniKaldir(id, req.user.userId);
  }

  // -------------------------------------------------------------- ay sonu

  /** Ayın özeti: kaç fatura, kaçının belgesi var. Gönderim penceresi bunu gösterir. */
  @Get("invoices/month-summary")
  @UseGuards(AuthGuard("jwt"))
  async ayOzeti(
    @Query("scope") scope: string,
    @Query("scopeId") scopeId: string,
    @Query("month") month: string,
    @Req() req: any
  ) {
    const kapsam = kapsamCoz(scope, scopeId);
    const kayitlar = await this.faturalar.ayinKayitlari(kapsam, month, req.user.userId);
    return {
      kayitSayisi: kayitlar.length,
      muhasebeciEposta: await this.faturalar.muhasebeciAdresi(kapsam),
    };
  }

  @Get("invoices/archive")
  @UseGuards(AuthGuard("jwt"))
  async arsiv(
    @Query("scope") scope: string,
    @Query("scopeId") scopeId: string,
    @Query("month") month: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    const arsiv = await this.faturalar.arsiv(kapsamCoz(scope, scopeId), month, req.user.userId);
    this.zipYolla(res, arsiv.dosyaAdi, arsiv.icerik);
  }

  /**
   * E-postadaki bağlantı. Oturum YOK: muhasebecinin Projelio hesabı da yok.
   *
   * Yetki jetonun içinde: arşiv, bağlantıyı üreten kullanıcının yetkisiyle
   * yeniden kuruluyor (bkz. arsivJetonunuCoz).
   */
  @Get("invoices/archive/download")
  async arsivBaglantiyla(@Query("t") jeton: string, @Res() res: Response) {
    const { kapsam, ay, userId } = this.faturalar.arsivJetonunuCoz(jeton || "");
    const arsiv = await this.faturalar.arsiv(kapsam, ay, userId);
    this.zipYolla(res, arsiv.dosyaAdi, arsiv.icerik);
  }

  @Post("invoices/send")
  @UseGuards(AuthGuard("jwt"))
  gonder(
    @Body() body: { scope?: string; scopeId?: string; month?: string; to?: string },
    @Req() req: any
  ) {
    return this.faturalar.muhasebeciyeGonder(
      kapsamCoz(body?.scope, body?.scopeId),
      body?.month ?? "",
      body?.to ?? "",
      req.user.userId,
      req.user.email
    );
  }

  private zipYolla(res: Response, dosyaAdi: string, icerik: Buffer) {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(icerik.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    // RFC 5987: ad Türkçe karakter içeriyor ("2026-09 Eylül").
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(dosyaAdi)}`);
    res.end(icerik);
  }
}
