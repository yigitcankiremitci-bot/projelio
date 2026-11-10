import { Module, forwardRef } from "@nestjs/common";
import { ProjeSablonlariController } from "./proje-sablonlari.controller";
import { ProjeSablonlariService } from "./proje-sablonlari.service";
import { CreationRequestsModule } from "../creation-requests/creation-requests.module";
import { MembersModule } from "../members/members.module";
import { ProjectsModule } from "../projects/projects.module";

@Module({
  // forwardRef: CreationRequestsModule proje/iş modüllerine geri bağlanıyor (bkz. ProjectsModule).
  imports: [forwardRef(() => CreationRequestsModule), MembersModule, ProjectsModule],
  controllers: [ProjeSablonlariController],
  providers: [ProjeSablonlariService],
})
export class ProjeSablonlariModule {}
