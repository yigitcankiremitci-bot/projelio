import { Controller, Get } from "@nestjs/common";

/**
 * Barındırma platformunun (Render vb.) servisin ayakta olup olmadığını anlamak için
 * çağırdığı uç. Kimlik doğrulaması gerektirmez ve hiçbir hassas bilgi döndürmez.
 */
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  @Get("health")
  health() {
    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
