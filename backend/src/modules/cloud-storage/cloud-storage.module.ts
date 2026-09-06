import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { GoogleCoreModule } from "../google/google-core.module";
import { MicrosoftCoreModule } from "../microsoft/microsoft-core.module";
import { CloudStorageService } from "./cloud-storage.service";
import { OrganizationStorageService } from "./organization-storage.service";
import { CloudStorageController } from "./cloud-storage.controller";

/**
 * FilesModule'ün önünde tuttuğu tek kapı: Google Drive'ın ve OneDrive'ın "boru
 * tesisatını" (GoogleCoreModule, MicrosoftCoreModule) tek bir CloudStorageService
 * arkasında birleştirir.
 *
 * Bilerek GoogleModule değil GoogleCoreModule: GoogleModule UsersModule'ü
 * çeker ve Jobs > Files > Google > Users > Organizations > Jobs döngüsü doğar
 * (bkz. google-core.module.ts'teki açıklama). MicrosoftModule de "Microsoft ile
 * giriş" akışı eklendiğinden beri UsersModule'ü çekiyor; aynı gerekçeyle onun
 * da çekirdek hâli kullanılıyor.
 */
@Module({
  imports: [GoogleCoreModule, MicrosoftCoreModule, PassportModule],
  controllers: [CloudStorageController],
  providers: [CloudStorageService, OrganizationStorageService],
  exports: [CloudStorageService, OrganizationStorageService],
})
export class CloudStorageModule {}
