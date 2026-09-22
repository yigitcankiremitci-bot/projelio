import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthRateLimitGuard } from "../../common/guards/auth-rate-limit.guard";
import { AuthService } from "./auth.service";
import {
  LoginDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "./dto/auth.dto";
import { PasswordResetService } from "./password-reset.service";
import { EmailVerificationService } from "./email-verification.service";
import { absoluteSessionExpired } from "./session-payload";
import { cevirmen, istekDili, tarayiciDili } from "../../common/i18n";

type BaslikliIstek = { headers: Record<string, string | string[] | undefined> };

/**
 * Başarı yanıtlarının dili. Hata mesajları HTTP sınırındaki filtrede
 * çevriliyor (all-exceptions.filter.ts) ama başarılı yanıtlar oradan geçmiyor;
 * sözlükte karşılıkları olduğu hâlde bu metinler hep Türkçe dönüyordu ve
 * doğrulama sayfası İngilizce arayüzün ortasında Türkçe bir cümle gösteriyordu.
 */
function yanitCevirmeni(req: BaslikliIstek) {
  const baslik = (ad: string) => {
    const deger = req.headers[ad];
    return typeof deger === "string" ? deger : undefined;
  };
  return cevirmen(istekDili(baslik("x-projelio-locale"), baslik("accept-language")));
}

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private passwordResetService: PasswordResetService,
    private emailVerificationService: EmailVerificationService
  ) {}

  @Post("register")
  @UseGuards(AuthRateLimitGuard)
  register(@Body() dto: RegisterDto, @Req() req: BaslikliIstek) {
    // Eski istemci dili göndermiyor; o hâlde tarayıcının Accept-Language
    // başlığı tek ipucu. Hesabın dili boş kalırsa sonradan üretilen her şey
    // (doğrulama e-postası, örnek iş, ipuçları) Türkçeye düşüyor.
    const locale = dto.locale ?? tarayiciDili(req);
    return this.authService.register(dto.fullName, dto.email, dto.password, dto.username, locale);
  }

  @Post("login")
  @UseGuards(AuthRateLimitGuard)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  me(@Req() req: any) {
    return this.authService.me(req.user.userId);
  }

  /**
   * Oturumu uzatır: geçerli bir token'ı, ömrü baştan başlayan yenisiyle değiştirir.
   *
   * Ön yüz bunu uygulama her açıldığında çağırır (bkz. apps/web/src/lib/session.ts).
   * Böylece token "kayan" hale gelir — uygulamayı JWT_EXPIRES_IN aralığında bir kez
   * bile açan kullanıcı bir daha giriş ekranına düşmez; yalnızca o süre boyunca hiç
   * açmayan birinin oturumu kapanır.
   *
   * Guard'lı olduğu için süresi DOLMUŞ token'la çağrılırsa 401 döner; ön yüz de
   * normal oturum sonlanma akışına girer (bkz. client.ts handleExpiredSession).
   */
  @Post("refresh")
  @UseGuards(AuthGuard("jwt"))
  refresh(@Req() req: any) {
    // Kayan oturumun üst sınırı: ilk girişin üzerinden çok geçtiyse yenileme
    // reddedilir ve kullanıcı yeniden giriş yapar. Bu olmadan, jetonu çalan biri
    // bu ucu düzenli çağırarak oturumu sonsuza kadar uzatabiliyordu
    // (gerekçenin tamamı session-payload.ts'te).
    // Dış uygulamaya verilmiş devir jetonu uzatılamaz — kısa ömrü aksi halde
    // anlamını kaybederdi (bkz. session-payload.ts, `agent`).
    if (req.user.agent) {
      throw new UnauthorizedException("Bu oturum uzatılamaz, yeniden bağlanman gerekiyor.");
    }
    if (absoluteSessionExpired(req.user.loginAt)) {
      throw new UnauthorizedException("Oturum süresi doldu, lütfen yeniden giriş yapın.");
    }
    // loginAt AYNEN aktarılır — yenileme saati sıfırlamaz, yoksa sınır hiç dolmazdı.
    return this.authService.signToken(req.user.userId, req.user.email, req.user.role, req.user.loginAt ?? 0);
  }

  // Yanıt her zaman aynı genel mesajdır — hesabın var olup olmadığını sızdırmamak
  // için (bkz. PasswordResetService.requestReset).
  @Post("forgot-password")
  @UseGuards(AuthRateLimitGuard)
  async forgotPassword(@Body() dto: RequestPasswordResetDto, @Req() req: BaslikliIstek) {
    await this.passwordResetService.requestReset(dto.email);
    return { message: yanitCevirmeni(req)("Bu e-posta adresi kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.") };
  }

  @Post("reset-password")
  @UseGuards(AuthRateLimitGuard)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: BaslikliIstek) {
    await this.passwordResetService.resetPassword(dto.token, dto.password);
    return { message: yanitCevirmeni(req)("Şifreniz güncellendi. Şimdi giriş yapabilirsiniz.") };
  }

  @Post("verify-email")
  @UseGuards(AuthRateLimitGuard)
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: BaslikliIstek) {
    const { alreadyVerified } = await this.emailVerificationService.verify(dto.token);
    const t = yanitCevirmeni(req);
    return {
      message: alreadyVerified
        ? t("Bu hesap zaten doğrulanmış. Giriş yapabilirsiniz.")
        : t("E-posta adresiniz doğrulandı. Şimdi giriş yapabilirsiniz."),
    };
  }

  // Şifre sıfırlamadaki gibi: hesabın var olup olmadığını sızdırmamak için
  // yanıt her zaman aynı (bkz. EmailVerificationService.resend).
  @Post("resend-verification")
  @UseGuards(AuthRateLimitGuard)
  async resendVerification(@Body() dto: ResendVerificationDto, @Req() req: BaslikliIstek) {
    await this.emailVerificationService.resend(dto.email);
    return { message: yanitCevirmeni(req)("Bu adres kayıtlı ve henüz doğrulanmamışsa, yeni bir doğrulama bağlantısı gönderildi.") };
  }
}
