import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { PasswordResetService } from "./password-reset.service";
import { EmailVerificationService } from "./email-verification.service";
import { DogrulamaHatirlatmaProcessor } from "./dogrulama-hatirlatma.processor";
import { LoginAttemptService } from "./login-attempt.service";
import { EmailModule } from "./email.module";
import { UsersModule } from "../users/users.module";
import { DemoModule } from "../demo/demo.module";
import { getJwtSecret, getJwtExpiresIn } from "../../common/config/env";

@Module({
  imports: [
    UsersModule,
    DemoModule,
    EmailModule,
    PassportModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [AuthController],
  // DogrulamaHatirlatmaProcessor: doğrulanmamış hesaplara günlük "hesabını
  // onayla" e-postası (bkz. migration 119).
  providers: [
    AuthService,
    JwtStrategy,
    PasswordResetService,
    EmailVerificationService,
    LoginAttemptService,
    DogrulamaHatirlatmaProcessor,
  ],
  exports: [AuthService],
})
export class AuthModule {}
