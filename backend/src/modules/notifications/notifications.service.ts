import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import type { NotificationPayload } from "@projelio/shared";
import { NotificationsGateway } from "./notifications.gateway";

// TODO: firebase-admin ile FCM push gönderimi, PostgreSQL'de bildirim geçmişi
@Injectable()
export class NotificationsService {
  constructor(private gateway: NotificationsGateway) {}

  notifyUser(
    userId: string,
    type: NotificationPayload["type"],
    title: string,
    body: string
  ): NotificationPayload {
    const notification: NotificationPayload = {
      id: randomUUID(),
      userId,
      type,
      title,
      body,
      createdAt: new Date().toISOString(),
      read: false,
    };
    // 1) Socket.io ile uygulama içi anlık iletim
    this.gateway.sendToUser(userId, notification);
    // 2) FCM ile mobil push (TODO: firebase-admin.messaging().send(...))
    return notification;
  }
}
