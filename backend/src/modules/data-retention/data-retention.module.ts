import { Module } from "@nestjs/common";
import { DataRetentionProcessor } from "./data-retention.processor";

/**
 * Saklama süresi dolmuş kayıtların temizliği (gizlilik politikası §12).
 *
 * Controller yok: dışarıya açılan hiçbir ucu olmamalı. Süresi dolmamış veriyi
 * silen bir HTTP ucu, en iyi ihtimalle gereksiz bir saldırı yüzeyi.
 * SupabaseService global DatabaseModule'den geliyor.
 */
@Module({
  providers: [DataRetentionProcessor],
})
export class DataRetentionModule {}
