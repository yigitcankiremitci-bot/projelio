import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ModuleMembersController } from "./module-members.controller";
import { ModuleMembersService } from "./module-members.service";

@Module({
  imports: [NotificationsModule],
  controllers: [ModuleMembersController],
  providers: [ModuleMembersService],
  // ModuleRecordsModule yetki çözümlemesi için bu servisi kullanır — modül
  // yetkisi tek yerde tanımlı kalsın diye kopyalanmıyor, paylaşılıyor.
  exports: [ModuleMembersService],
})
export class ModuleMembersModule {}
