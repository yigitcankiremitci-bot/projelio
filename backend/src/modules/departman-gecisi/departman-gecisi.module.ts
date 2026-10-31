import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { DepartmanGecisiController } from "./departman-gecisi.controller";
import { DepartmanGecisiService } from "./departman-gecisi.service";

/** Mevcut şirketlerin departman kuralına bir kerelik geçişi (bkz. migration 173). */
@Module({
  imports: [FilesModule],
  controllers: [DepartmanGecisiController],
  providers: [DepartmanGecisiService],
})
export class DepartmanGecisiModule {}
