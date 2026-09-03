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
import { getGatewayCorsOrigin } from "../../common/config/env";
import type { NotificationPayload, WhatsappStatusEvent } from "@projelio/shared";

// CORS kaynağı main.ts'teki HTTP ayarıyla AYNI listeden gelir (bkz.
// common/config/env.ts getGatewayCorsOrigin) — burada ayrıca ayrıştırılmıyor,
// yoksa oradaki normalleştirme bu tarafa hiç ulaşmazdı.
@WebSocketGateway({ cors: { origin: getGatewayCorsOrigin() } })
export class NotificationsGateway {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private jwtService: JwtService) {}

  // Client artık ham bir userId göndermiyor — bunu doğrulamadan kabul etmek,
  // kimliği doğrulanmamış bir bağlantının başka bir kullanıcının bildirim odasına
  // (dolayısıyla görev/bütçe/davet bildirimlerine) katılmasına izin verirdi.
  // Bunun yerine giriş token'ı (JWT) gönderilir, userId ondan çözülür.
  @SubscribeMessage("register")
  handleRegister(@MessageBody() token: string, @ConnectedSocket() client: Socket) {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      // Üyelik kaydı Socket.IO'nun kendi oda defterinde tutulur; ayrıca bir Map
      // tutulmuyor. Tutuluyordu ve HİÇ OKUNMUYORDU (yayınlar zaten `user:<id>`
      // odası üzerinden gidiyor), üstelik bağlantı koptuğunda temizlenmediği
      // için süreç boyunca büyüyen bir bellek sızıntısıydı. Socket.IO odadan
      // çıkarmayı kopuşta kendisi yapar.
      client.join(`user:${payload.sub}`);
    } catch {
      this.logger.warn("Geçersiz/eksik token ile soket 'register' denemesi reddedildi.");
      client.disconnect();
    }
  }

  sendToUser(userId: string, notification: NotificationPayload) {
    this.server.to(`user:${userId}`).emit("notification", notification);
  }

  // WhatsApp bağlantı durumu değişti (QR okutuldu, koptu, numara eşlendi):
  // Ayarlar sayfasındaki kart kendini tazelesin. Aynı kullanıcı odası.
  sendWhatsappStatus(userId: string, event: WhatsappStatusEvent) {
    this.server.to(`user:${userId}`).emit("whatsapp-status", event);
  }

  /**
   * "Üzerinde çalışıyorum" durumu değişti — iş ekibi panelini açık tutanlara bildirir.
   *
   * ODAYA yayınlanır, sunucunun tamamına DEĞİL. Önceden `server.emit` kullanılıyordu:
   * o hâlde sinyal o an bağlı HERKESE gidiyordu — başka bir şirketin kullanıcısı da
   * kimin hangi görevde çalıştığını görebiliyordu. Bu, organizasyonlar arası bilgi
   * sızıntısıydı; ayrıca 500 bağlı kullanıcıda tek bir tıklama 500 mesaj üretiyordu.
   *
   * Oda adı realtime tarafıyla aynı sözleşmeyi kullanır (bkz. realtime/room-key.ts):
   * paneli açık olan istemci zaten o odada bulunur. Kapsam bilinmiyorsa (görev bir
   * projeye bağlı değilse) sinyal gönderilmez — yanlış kişiye göndermektense hiç
   * göndermemek doğrudur; panel bir sonraki açılışta taze veriyi zaten çekiyor.
   */
  broadcastActiveWorker(userId: string, activeTaskId: string | null, room?: string | null) {
    if (!room) return;
    this.server.to(room).emit("active-worker-changed", { userId, activeTaskId });
  }
}
