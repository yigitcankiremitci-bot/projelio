import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import type { NotificationPayload } from "@projelio/shared";

@WebSocketGateway({ cors: { origin: "*" } })
export class NotificationsGateway {
  @WebSocketServer()
  server!: Server;

  private userSockets = new Map<string, Set<string>>();

  @SubscribeMessage("register")
  handleRegister(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
    this.userSockets.get(userId)!.add(client.id);
    client.join(`user:${userId}`);
  }

  sendToUser(userId: string, notification: NotificationPayload) {
    this.server.to(`user:${userId}`).emit("notification", notification);
  }
}
