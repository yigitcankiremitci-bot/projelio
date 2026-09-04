import { randomUUID } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";

/**
 * Tek kullanımlık devir kodları (Google / Microsoft giriş akışlarının ortağı).
 *
 * Sağlayıcının geri dönüşünden sonra kullanıcıyı ön yüze yönlendirmemiz gerekiyor
 * ama JWT'yi URL'e koymak istemiyoruz: adres çubuğunda, tarayıcı geçmişinde ve
 * Referer başlığında kalır. Bunun yerine 2 dakika ömürlü, tek kullanımlık bir kod
 * veriyoruz; ön yüz onu POST ile gerçek token'la takas ediyor.
 *
 * Bellekte tutuluyor: kod yalnızca saniyeler yaşıyor ve tek istekte harcanıyor.
 * (Backend birden fazla örnekte çalıştırılırsa buranın paylaşımlı bir depoya
 * taşınması gerekir. `ioredis` package.json'da bağımlılık olarak duruyor ama kodda
 * hiçbir yerde kullanılmıyor ve render.yaml'da Redis servisi tanımlı değil — yani
 * "zaten var" değil, önce sağlanması gerekiyor.)
 *
 * İki sağlayıcı ayrı birer örnek tutar; kod uzayları karışmasın diye ortak tek bir
 * havuz KULLANILMIYOR — bir sağlayıcının kodu diğerinin takas ucunda geçmemeli.
 */
export class OAuthHandoffStore {
  private readonly handoffs = new Map<string, { token: string; expiresAt: number }>();
  private readonly ttlMs: number;

  // Kısayol olan "constructor(private ttlMs)" biçimi bilerek kullanılmadı:
  // testler Node'un yerleşik koşucusuyla (tür bilgisini yalnızca söküp atan
  // mod) çalışıyor ve o biçimi çözemiyor.
  constructor(ttlMs: number = 2 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  create(token: string): string {
    this.purgeExpired();
    const code = randomUUID();
    this.handoffs.set(code, { token, expiresAt: Date.now() + this.ttlMs });
    return code;
  }

  consume(code: string): string {
    const entry = this.handoffs.get(code);
    this.handoffs.delete(code); // tek kullanımlık: bulunsa da bulunmasa da düşer
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException("Giriş kodu geçersiz veya süresi dolmuş. Tekrar deneyin.");
    }
    return entry.token;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [code, entry] of this.handoffs) {
      if (entry.expiresAt < now) this.handoffs.delete(code);
    }
  }
}
