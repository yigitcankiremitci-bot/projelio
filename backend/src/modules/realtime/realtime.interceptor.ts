import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { RealtimeGateway } from "./realtime.gateway";

/**
 * Her başarılı değiştirme isteğinden sonra, isteği yapan kullanıcının bulunduğu
 * sayfaya (odaya) "burada bir şey değişti" sinyali gönderir.
 *
 * NEDEN GLOBAL BİR INTERCEPTOR: alternatif, görev/dosya/bütçe/modül… her
 * serviste tek tek yayın çağrısı eklemekti. Onlarca dokunuş, ve yarın eklenen
 * bir uç unutulduğunda hata sessiz: değişiklik olur, karşı taraf görmez. Burada
 * kaynak türü hiç bilinmiyor — sinyal "şu sayfa değişti"den ibaret, sayfa da
 * kendi verisini kendi tazeliyor (bkz. apps/web/src/lib/liveRoom.ts).
 *
 * Sinyalin nereye gideceğini istemcinin gönderdiği soket kimliği belirler; o
 * soketin hangi odalarda olduğunu ve kime ait olduğunu sunucu biliyor
 * (bkz. RealtimeGateway.broadcastChange).
 */
@Injectable()
export class RealtimeChangeInterceptor implements NestInterceptor {
  constructor(private gateway: RealtimeGateway) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest();
    const method = req?.method as string | undefined;
    // Okuma istekleri hiçbir şeyi değiştirmez.
    if (!method || method === "GET" || method === "HEAD" || method === "OPTIONS") return next.handle();

    return next.handle().pipe(
      tap(() => {
        const socketId = req.headers?.["x-socket-id"];
        const userId = req.user?.userId;
        if (!socketId || !userId) return;
        this.gateway.broadcastChange(String(socketId), String(userId), {
          method,
          path: String(req.originalUrl ?? req.url ?? ""),
        });
      })
    );
  }
}
