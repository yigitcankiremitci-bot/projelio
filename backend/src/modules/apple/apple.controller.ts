import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { locales, type Locale } from "@projelio/shared";
import { AuthRateLimitGuard } from "../../common/guards/auth-rate-limit.guard";
import { AppleAuthService } from "./apple-auth.service";

/**
 * Alanlar class-validator süslemesi TAŞIMAK ZORUNDA: ValidationPipe
 * `whitelist: true` ile süslemesiz alanları sessizce siler (main.ts).
 */
export class AppleGirisDto {
  @IsString()
  @MinLength(20)
  @MaxLength(8000)
  identityToken!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(200)
  nonce!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  adSoyad?: string;

  @IsOptional()
  @IsIn(locales as readonly string[])
  locale?: Locale;
}

/**
 * "Apple ile giriş" — şimdilik yalnızca iPhone uygulamasından.
 *
 * Akış Google'dakinden kısa: yönlendirme / dönüş adresi yok. iPhone'un yerel
 * penceresi jetonu doğrudan uygulamaya verir, uygulama buraya yollar, sunucu
 * Apple'ın imzasını doğrulayıp oturum açar (bkz. AppleAuthService).
 */
@Controller("auth/apple")
export class AppleController {
  constructor(private appleAuth: AppleAuthService) {}

  @Post()
  @UseGuards(AuthRateLimitGuard)
  giris(@Body() dto: AppleGirisDto) {
    return this.appleAuth.girisYap(dto.identityToken, dto.nonce, dto.adSoyad, dto.locale);
  }
}
