import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { getJwtExpiresIn, getJwtSecret } from "../../common/config/env";
import { BudgetModule } from "../budget/budget.module";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { PasskeysModule } from "../passkeys/passkeys.module";
import { HesapKilitService } from "./hesap-kilit.service";
import { HesapKimlikController } from "./hesap-kimlik.controller";
import { HesapKimlikService } from "./hesap-kimlik.service";
import { HesaplarController } from "./hesaplar.controller";
import { HesaplarService } from "./hesaplar.service";

/**
 * Hesaplar modülü.
 *
 * ÜÇ BAĞIMLILIK, üç ayrı sebep:
 *   - ModuleMembers: "kim okur, kim yazar, kim yönetir" kararı modül
 *     sisteminin kendi kuralı; ikinci bir kopya çıkarmıyoruz.
 *   - Budget: ücretli abonelik defterdeki düzenli gider satırına bağlanıyor ve
 *     o deftere yazma yetkisi bütçenin kendi kuralından geçiyor.
 *   - Passkeys: kilidi açmanın ikinci yolu; WebAuthn doğrulaması orada.
 *
 * JwtModule kilit jetonunu imzalamak için (OAuth `state` imzasında olduğu gibi).
 */
@Module({
  imports: [
    ModuleMembersModule,
    BudgetModule,
    PasskeysModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [HesaplarController, HesapKimlikController],
  providers: [HesaplarService, HesapKimlikService, HesapKilitService],
  // YALNIZCA HesaplarService dışa aktarılıyor. Lio hesap LİSTESİNİ okuyor
  // (bkz. ai-assistant.tools.ts > list_service_accounts); sırrı okuyan servis
  // (HesapKimlikService) bilerek dışarı verilmiyor — dil modeline giden bir
  // bağlamda şifrenin işi yok ve "yanlışlıkla çağırmak" bir satır uzaklıkta
  // olmamalı.
  exports: [HesaplarService],
})
export class HesaplarModule {}
