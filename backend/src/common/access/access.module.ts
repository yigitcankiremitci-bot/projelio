import { Global, Module } from "@nestjs/common";
import { AccessService } from "./access.service";

// Global: görünürlük kontrolü neredeyse her modülde gerekiyor; her modülün
// imports listesine tek tek eklemek yerine DatabaseModule ile aynı deseni
// kullanıyoruz. Böylece yeni bir uç yazan kişi "nereden import edecektim"
// diye düşünmeden AccessService'i enjekte edebiliyor.
@Global()
@Module({
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
