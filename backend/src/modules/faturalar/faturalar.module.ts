import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { getJwtSecret } from "../../common/config/env";
import { BudgetModule } from "../budget/budget.module";
import { EmailModule } from "../auth/email.module";
import { FileLinksModule } from "../file-links/file-links.module";
import { FilesModule } from "../files/files.module";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { ModuleRecordsModule } from "../module-records/module-records.module";
import { FaturalarController } from "./faturalar.controller";
import { FaturalarService } from "./faturalar.service";
import { LioYardimiService } from "./lio-yardimi.service";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";

/**
 * Faturaların BELGE tarafı (bkz. migration 112).
 *
 * Ayrı modül, çünkü işin kendisi dört ayrı modülün kesişiminde duruyor: kayıt
 * (module-records), dosya (files + file-links), para (budget) ve e-posta.
 * Dördünden birinin içine koymak, diğer üçünü oraya bağımlı yapardı.
 *
 * Bağımlılık yönü TEK YÖNLÜ: bu modül hepsini içeri alır, hiçbiri bunu almaz.
 */
@Module({
  imports: [
    FilesModule,
    FileLinksModule,
    ModuleRecordsModule,
    ModuleMembersModule,
    BudgetModule,
    EmailModule,
    // Kredi defteri ve sağlayıcı yönlendirici: belge okuma ikisini de kullanıyor.
    AiAssistantModule,
    // Arşiv bağlantısının jetonu; dosya erişim jetonlarıyla aynı secret.
    JwtModule.register({ secret: getJwtSecret() }),
  ],
  controllers: [FaturalarController],
  providers: [FaturalarService, LioYardimiService],
})
export class FaturalarModule {}
