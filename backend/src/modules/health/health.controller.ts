import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";

/**
 * Barındırma platformunun (Render vb.) servisin ayakta olup olmadığını anlamak için
 * çağırdığı uç. Kimlik doğrulaması gerektirmez ve hiçbir hassas bilgi döndürmez.
 */
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private supabase: SupabaseService) {}

  /**
   * CANLILIK (liveness): "süreç ayakta mı?"
   *
   * Bilerek hiçbir bağımlılığa bakmıyor. Docker healthcheck'i bunu çağırıyor
   * (bkz. docker-compose.prod.yml) ve buraya veritabanı kontrolü eklemek zararlı
   * olurdu: veritabanı bir an yanıt vermediğinde konteyner "sağlıksız" sayılıp
   * yeniden başlatılır, bu da toparlanmayı hızlandırmak yerine geciktirir.
   */
  @Get("health")
  health() {
    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * HAZIR OLMA (readiness): "istek karşılayabilir mi?"
   *
   * NEDEN AYRI BİR UÇ: /health yalnızca sürecin yaşadığını söylüyordu; veritabanı
   * tamamen ölmüşken bile 200 dönüyordu. Yani dışarıdan bakan bir izleyici
   * (UptimeRobot, Healthchecks.io) "her şey yolunda" diyordu, oysa uygulama tek
   * bir isteği bile karşılayamıyordu.
   *
   * Buraya bakan izleyici gerçek kullanılabilirliği görür. Sorgu kasıtlı olarak
   * en ucuzundan: tek satır bile okumuyor, yalnızca bağlantının ve PostgREST'in
   * yanıt verdiğini doğruluyor.
   */
  @Get("health/ready")
  async ready() {
    const basladi = Date.now();
    try {
      const { error } = await this.supabase.client.from("users").select("id", { head: true, count: "exact" }).limit(1);
      if (error) throw new Error(error.message);
    } catch (e) {
      // 503: izleyiciler ve yük dengeleyiciler bunu "hazır değil" olarak anlar.
      throw new ServiceUnavailableException({
        status: "degraded",
        database: "unreachable",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
    return {
      status: "ok",
      database: "ok",
      databaseLatencyMs: Date.now() - basladi,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
