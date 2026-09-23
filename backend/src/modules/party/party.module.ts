import { Module } from "@nestjs/common";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { PartyController } from "./party.controller";
import { PartyService } from "./party.service";
import { SiparisService } from "./siparis.service";

@Module({
  // Müşteri kaydının yetkisi crm_musteri modülünün yetkisidir; kural
  // kopyalanmasın diye ModuleMembersService paylaşılıyor.
  imports: [ModuleMembersModule],
  controllers: [PartyController],
  providers: [PartyService, SiparisService],
  // Diğer modüller (fatura, destek talebi) party_activity'ye yazacak.
  // SiparisService: Shopify webhook'ları siparişi ve tahsilatı aynı kapıdan yazar.
  exports: [PartyService, SiparisService],
})
export class PartyModule {}
