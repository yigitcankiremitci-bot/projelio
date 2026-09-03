import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WhatsappService } from "./whatsapp.service";

/**
 * Numara havuzunun yönetimi — yalnız platform yöneticisi (role=admin).
 *
 * Neden organizasyon sahibi değil: numaralar Projelio'nun, kullanıcılara
 * arka planda atanıyor; QR'ı okutan kişi numaranın tüm sohbetlerini görür.
 * Admin modülüyle aynı koruma (AuthGuard + RolesGuard + @Roles("admin")).
 */
@Controller("admin/whatsapp")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class WhatsappAdminController {
  constructor(private whatsapp: WhatsappService) {}

  @Get("numbers")
  list() {
    return this.whatsapp.listNumbers();
  }

  /** Numarasını hesabına bağlamış kullanıcılar (doğrulanmış telefonlar, maskeli). */
  @Get("linked-users")
  linkedUsers() {
    return this.whatsapp.listLinkedUsers();
  }

  /** Havuza numara ekler ve QR bekleyen oturumu açar. Gövde: { label } */
  @Post("numbers")
  add(@Body() body: { label: string }, @Req() req: any) {
    return this.whatsapp.addNumber(body.label ?? "", req.user.userId);
  }

  @Post("numbers/:id/start")
  start(@Param("id") id: string, @Req() req: any) {
    return this.whatsapp.restartNumber(id, req.user.userId);
  }

  /** QR, data-URL olarak JSON içinde (img etiketi yetki başlığı taşıyamaz). */
  @Get("numbers/:id/qr")
  qr(@Param("id") id: string) {
    return this.whatsapp.getQr(id);
  }

  @Post("numbers/:id/pairing-code")
  pairingCode(@Param("id") id: string, @Body() body: { phone: string }) {
    return this.whatsapp.requestPairingCode(id, body.phone ?? "");
  }

  /** Numarayı WhatsApp'tan ayırır; satır ve atamalar kalır. */
  @Post("numbers/:id/logout")
  logout(@Param("id") id: string) {
    return this.whatsapp.logoutNumber(id);
  }

  /** Havuzdan çıkarır; atanmış kullanıcılar başka numaraya taşınır. */
  @Delete("numbers/:id")
  remove(@Param("id") id: string) {
    return this.whatsapp.removeNumber(id);
  }
}
