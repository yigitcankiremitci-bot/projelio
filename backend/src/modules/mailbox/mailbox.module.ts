import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { UsersModule } from "../users/users.module";
import { GraphMailService } from "./graph-mail.service";
import { MailboxController } from "./mailbox.controller";
import { MailboxService } from "./mailbox.service";

/**
 * E-posta modülünün gelen kutusu.
 *
 * MicrosoftModule'ü içeri alır (jeton yönetimi + OAuth yardımcıları) ama
 * MicrosoftModule bunu içeri ALMAZ: posta akışının kendi geri dönüş adresi ve
 * kendi controller'ı var. Tek yönlü bağımlılık, döngüyü baştan engelliyor.
 */
@Module({
  imports: [
    MicrosoftModule,
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
