import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
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
    return this.authService.register(dto.fullName, dto.email, dto.password, dto.username);
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
