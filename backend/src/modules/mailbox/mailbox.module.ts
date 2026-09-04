import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";
import { MicrosoftCoreModule } from "../microsoft/microsoft-core.module";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { UsersModule } from "../users/users.module";
import { GraphMailService } from "./graph-mail.service";
import { MailboxController } from "./mailbox.controller";
import { MailboxService } from "./mailbox.service";

/**
 * E-posta modülünün gelen kutusu.
 *
 * MicrosoftCoreModule'ü içeri alır (jeton yönetimi + OAuth yardımcıları) ama
 * Microsoft tarafı bunu içeri ALMAZ: posta akışının kendi geri dönüş adresi ve
 * kendi controller'ı var. Tek yönlü bağımlılık, döngüyü baştan engelliyor.
 * Çekirdek hâli kullanılıyor çünkü MicrosoftModule "Microsoft ile giriş" için
 * UsersModule'ü çekiyor (bkz. microsoft-core.module.ts).
 */
@Module({
  imports: [
    MicrosoftCoreModule,
    // Kutuya kim girebilir kararı ModuleMembersService'te tek yerde.
    ModuleMembersModule,
    // Lio yanıt taslağı yazar (göndermez); kredi muhasebesi orada kalsın diye
    // ikinci bir Anthropic istemcisi kurulmuyor.
    AiAssistantModule,
    // Bağlantı çakışmasında hangi Projelio hesabının sahip olduğunu söylemek için.
    UsersModule,
    PassportModule,
  ],
  controllers: [MailboxController],
  providers: [MailboxService, GraphMailService],
  exports: [MailboxService],
})
export class MailboxModule {}
