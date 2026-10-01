import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { UsersModule } from "../users/users.module";
import { EkipHesaplariModule } from "../ekip-hesaplari/ekip-hesaplari.module";
import { IseAlimController } from "./ise-alim.controller";
import { IseAlimService } from "./ise-alim.service";

/**
 * İşe alım daveti: hesabı olan birini tek formla şirkete almak (migration 143).
 *
 * Ekip Hesapları'ndan yalnızca form seçenekleri (= yetki kapısı) kullanılıyor;
 * "kim hangi departmana kişi alabilir" kuralı orada tek kopya kalsın.
 */
@Module({
  imports: [NotificationsModule, UsersModule, EkipHesaplariModule],
  controllers: [IseAlimController],
  providers: [IseAlimService],
})
export class IseAlimModule {}
