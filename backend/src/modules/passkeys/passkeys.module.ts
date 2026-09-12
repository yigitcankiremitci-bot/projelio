import { Module } from "@nestjs/common";
import { PasskeysController } from "./passkeys.controller";
import { PasskeysService } from "./passkeys.service";

/**
 * Geçiş anahtarları.
 *
 * Servis DIŞA AKTARILIYOR: Hesaplar modülü kilidi açarken imzayı buradan
 * doğrulatıyor. Doğrulama mantığının ikinci bir kopyası çıkmasın — kilit
 * açmanın iki yolu (şifre / geçiş anahtarı) var ama geçiş anahtarı kuralı tek
 * yerde kalmalı.
 */
@Module({
  controllers: [PasskeysController],
  providers: [PasskeysService],
  exports: [PasskeysService],
})
export class PasskeysModule {}
