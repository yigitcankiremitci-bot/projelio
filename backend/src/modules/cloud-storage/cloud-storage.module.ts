import { Module } from "@nestjs/common";
import { GoogleCoreModule } from "../google/google-core.module";
import { MicrosoftCoreModule } from "../microsoft/microsoft-core.module";
import { CloudStorageService } from "./cloud-storage.service";

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
  imports: [GoogleCoreModule, MicrosoftCoreModule],
  providers: [CloudStorageService],
  exports: [CloudStorageService],
})
export class CloudStorageModule {}
