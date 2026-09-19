import { Module } from "@nestjs/common";
import { EmailModule } from "../auth/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";
import { EpostaAdminController } from "./eposta-admin.controller";
import { EpostaKullaniciController } from "./eposta-kullanici.controller";
import { EpostaAyarlariService } from "./eposta-ayarlari.service";
import { IpucuDeposuService } from "./ipucu-deposu.service";
import { LioEpostaYazariService } from "./lio-eposta-yazari.service";
import { KampanyaService } from "./kampanya.service";
import { EpostaMaliyetService } from "./eposta-maliyet.service";
import { IpucuEpostaProcessor } from "./ipucu-eposta.processor";

/**
 * Yöneticinin e-posta sistemi: ipuçları, toplu/tekil gönderim, Lio ile
 * kişiselleştirme ve maliyet defteri (bkz. migration 119).
 *
 * Bildirim modülünden AYRI: bildirimler olaylara tepki veriyor, burası
 * yöneticinin kararıyla gönderiliyor. Bu modül onlara bağımlı (tercih satırı,
 * abonelik imzası), tersi değil — döngü yok.
 */
@Module({
  imports: [EmailModule, NotificationsModule, AiAssistantModule],
  controllers: [EpostaAdminController, EpostaKullaniciController],
  providers: [
    EpostaAyarlariService,
    IpucuDeposuService,
    LioEpostaYazariService,
    KampanyaService,
    EpostaMaliyetService,
    IpucuEpostaProcessor,
  ],
})
export class EpostaYonetimiModule {}
