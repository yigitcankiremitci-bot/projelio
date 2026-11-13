import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { getJwtExpiresIn, getJwtSecret } from "../../common/config/env";
import { UsersModule } from "../users/users.module";
import { AppleAuthService } from "./apple-auth.service";
import { AppleController } from "./apple.controller";

/**
 * "Apple ile giriş" (App Store kuralı 4.8). Kimlik tablosu `apple_hesaplari`
 * (migration 195). Oturum jetonu diğer girişlerle aynı anahtarla imzalanır.
 */
@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [AppleController],
  providers: [AppleAuthService],
})
export class AppleModule {}
