import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import type { NotificationPayload } from "@projelio/shared";

// CORS_ORIGINS tanımlıysa yalnızca o alan adlarına izin verilir (main.ts'teki HTTP
// CORS ayarıyla aynı desen); tanımlı değilse (yerel geliştirme) her yere açık kalır.
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

@WebSocketGateway({ cors: { origin: corsOrigins.length ? corsOrigins : "*" } })
export class NotificationsGateway {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  private userSockets = new Map<string, Set<string>>();

  constructor(private jwtService: JwtService) {}

  // Client artık ham bir userId göndermiyor — bunu doğrulamadan kabul etmek,
  // kimliği doğrulanmamış bir bağlantının başka bir kullanıcının bildirim odasına
  // (dolayısıyla görev/bütçe/davet bildirimlerine) katılmasına izin verirdi.
  // Bunun yerine giriş token'ı (JWT) gönderilir, userId ondan çözülür.
  @SubscribeMessage("register")
  handleRegister(@MessageBody() token: string, @ConnectedSocket() client: Socket) {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const userId = payload.sub;
      if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
      this.userSockets.get(userId)!.add(client.id);
      client.join(`user:${userId}`);
    } catch {
      this.logger.warn("Geçersiz/eksik token ile soket 'register' denemesi reddedildi.");
      client.disconnect();
    }
  }

  sendToUser(userId: string, notification: NotificationPayload) {
    this.server.to(`user:${userId}`).emit("notification", notification);
  }

  // Bir kullanıcı "üzerinde çalışıyorum" durumunu değiştirdiğinde, iş ekibi
  // sekmesini açık tutan diğer tüm bağlı istemcilere anlık bildirir.
  broadcastActiveWorker(userId: string, activeTaskId: string | null) {
    this.server.emit("active-worker-changed", { userId, activeTaskId });
  }
}
