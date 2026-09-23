import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../auth/email.module";
import { UsersModule } from "../users/users.module";
import { EkipHesaplariController } from "./ekip-hesaplari.controller";
import { EkipHesaplariService } from "./ekip-hesaplari.service";

/**
 * Ekip Hesapları: yöneticinin ekibi için doğrudan hesap açması.
 *
 * AuthModule'den yalnızca giriş bağlantısı servisi kullanılıyor — bağlantının
 * nasıl üretilip nasıl kullanıldığı kimlik akışının parçası, burada ikinci bir
 * kopyası olmamalı.
 */
@Module({
  imports: [AuthModule, EmailModule, UsersModule],
  controllers: [EkipHesaplariController],
  providers: [EkipHesaplariService],
  // Lio hesap açabiliyor (create_team_account); kural ve doğrulama burada kalır.
  exports: [EkipHesaplariService],
})
export class EkipHesaplariModule {}
