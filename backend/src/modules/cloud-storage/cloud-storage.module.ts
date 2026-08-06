import { Module } from "@nestjs/common";
import { GoogleCoreModule } from "../google/google-core.module";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { CloudStorageService } from "./cloud-storage.service";

/**
 * FilesModule'ün önünde tuttuğu tek kapı: Google Drive'ın ve OneDrive'ın "boru
 * tesisatını" (GoogleCoreModule, MicrosoftModule) tek bir CloudStorageService
 * arkasında birleştirir.
 *
 * Bilerek GoogleModule değil GoogleCoreModule: GoogleModule UsersModule'ü
 * çeker ve Jobs > Files > Google > Users > Organizations > Jobs döngüsü doğar
 * (bkz. google-core.module.ts'teki açıklama). MicrosoftModule'de bu risk yok
 * (Users'a bağımlılığı yok) ama tutarlılık için aynı desende tutuluyor.
 */
@Module({
  imports: [GoogleCoreModule, MicrosoftModule],
  providers: [CloudStorageService],
  exports: [CloudStorageService],
})
export class CloudStorageModule {}
