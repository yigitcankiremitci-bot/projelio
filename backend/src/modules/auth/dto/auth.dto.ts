import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Başında "@" olsun ya da olmasın kabul edilir, servis katmanında normalize edilir.
  @IsString()
  @Matches(/^@?[a-zA-Z0-9_.]{3,30}$/, {
    message: "Kullanıcı adı 3-30 karakter olmalı; sadece harf, rakam, nokta ve alt çizgi içerebilir.",
  })
  username!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}
