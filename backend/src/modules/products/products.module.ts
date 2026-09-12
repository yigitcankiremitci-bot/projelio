import { Module } from "@nestjs/common";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { ModuleRecordsModule } from "../module-records/module-records.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  // Ürün kartı stratejiyi ve ürünün geçtiği modül kayıtlarını gösteriyor; modül
  // yetkisi o servislerde tek yerde çözüldüğü için kopyalanmıyor, içe alınıyor.
  imports: [ModuleMembersModule, ModuleRecordsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
