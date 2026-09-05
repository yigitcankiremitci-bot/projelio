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

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private passwordResetService: PasswordResetService,
    private emailVerificationService: EmailVerificationService
  ) {}

  @Post("register")
  @UseGuards(AuthRateLimitGuard)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.fullName, dto.email, dto.password, dto.username, dto.locale);
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
    return this.authService.signToken(req.user.userId, req.user.email, req.user.role, req.user.loginAt);
  }

  // Yanıt her zaman aynı genel mesajdır — hesabın var olup olmadığını sızdırmamak
  // için (bkz. PasswordResetService.requestReset).
  @Post("forgot-password")
  @UseGuards(AuthRateLimitGuard)
  async forgotPassword(@Body() dto: RequestPasswordResetDto) {
    await this.passwordResetService.requestReset(dto.email);
    return { message: "Bu e-posta adresi kayıtlıysa, şifre sıfırlama bağlantısı gönderildi." };
  }

  @Post("reset-password")
  @UseGuards(AuthRateLimitGuard)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordResetService.resetPassword(dto.token, dto.password);
    return { message: "Şifreniz güncellendi. Şimdi giriş yapabilirsiniz." };
  }

  @Post("verify-email")
  @UseGuards(AuthRateLimitGuard)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const { alreadyVerified } = await this.emailVerificationService.verify(dto.token);
    return {
      message: alreadyVerified
        ? "Bu hesap zaten doğrulanmış. Giriş yapabilirsiniz."
        : "E-posta adresiniz doğrulandı. Şimdi giriş yapabilirsiniz.",
    };
  }

  // Şifre sıfırlamadaki gibi: hesabın var olup olmadığını sızdırmamak için
  // yanıt her zaman aynı (bkz. EmailVerificationService.resend).
  @Post("resend-verification")
  @UseGuards(AuthRateLimitGuard)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.emailVerificationService.resend(dto.email);
    return { message: "Bu adres kayıtlı ve henüz doğrulanmamışsa, yeni bir doğrulama bağlantısı gönderildi." };
  }
}
