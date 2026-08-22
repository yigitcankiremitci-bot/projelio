import { ForbiddenException, Logger, OnModuleDestroy } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import type { PresenceUser, RoomChangedPayload, RoomPresencePayload } from "@projelio/shared";
import { AccessService } from "../../common/access/access.service";
import { SupabaseService } from "../../database/supabase.service";
import { parseRoomKey } from "./room-key";

// CORS_ORIGINS tanımlıysa yalnızca o alan adlarına izin verilir (main.ts'teki HTTP
// CORS ayarıyla aynı desen); tanımlı değilse (yerel geliştirme) her yere açık kalır.
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Aynı sayfada çalışan kullanıcıların birbirini görmesi ve birinin değişikliğinin
 * diğerinin ekranına anında yansıması.
 *
 * MİMARİ — "aktörün odasına yayın":
 * Her sayfa bir ODA'dır ("project:<id>", "department:<id>/module/crm_musteri"…).
 * İstemci sayfaya girerken odaya katılır; katılma anında erişim yetkisi
 * doğrulanır (bkz. assertCanJoin) — yoksa oda adını bilen herkes hem başkasının
 * projesinde kimlerin çalıştığını görür hem de değişiklik sinyallerini dinlerdi.
 *
 * Değişikliğin hangi odayı ilgilendirdiğini SUNUCUNUN bilmesi gerekmiyor:
 * değişikliği yapan kullanıcı zaten o sayfadadır. İstek başlığındaki soket
 * kimliğinden (X-Socket-Id) aktörün soketi bulunur ve BULUNDUĞU ODALARA sinyal
 * gönderilir (bkz. RealtimeChangeInterceptor). Böylece görev, dosya, bütçe,
 * modül kaydı… her tür değişiklik tek bir yerden, kaynak türü bilinmeden
 * yayılıyor; yeni bir uç eklendiğinde burada hiçbir şey yapmak gerekmiyor.
 *
 * SINIRI: değişiklik BAŞKA bir sayfayı ilgilendiriyorsa (görevi başka projeye
 * taşımak, arka plandaki zamanlanmış iş) o sayfa sinyal almaz. Kullanıcı odaya
 * girerken zaten taze veri çekiyor; bu durumlar için ileride ilgili servis
 * `notifyRoom` ile açıkça haber verebilir.
 *
 * ÖLÇEK: sunucu tek örnek çalışıyor (render.yaml, starter plan), bu yüzden oda
 * üyeliği bellekte tutuluyor. Birden fazla örneğe çıkılırsa Socket.IO'nun Redis
 * adaptörü gerekir — yoksa farklı örneklere düşen iki kullanıcı birbirini
 * görmez.
 */
@WebSocketGateway({ cors: { origin: corsOrigins.length ? corsOrigins : "*" } })
export class RealtimeGateway implements OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  /** oda -> (soket kimliği -> kullanıcı). Aynı kullanıcının iki sekmesi iki kayıttır. */
  private rooms = new Map<string, Map<string, PresenceUser>>();

  /**
   * Hayalet temizliği.
   *
   * Sayfadan ayrılma iki yoldan haber verilir: istemcinin "leave-room"u ve
   * soketin kopması. İkisi de kaçabilir — sekme uyuyan bir dizüstünde kalır,
   * ara sunucu bağlantıyı sessizce düşürür, tarayıcı kapanırken olayı
   * gönderemez. O zaman ekranda "hâlâ bu sayfada" yazan biri kalıyor ve
   * kendiliğinden düzelmiyor.
   *
   * Bu yüzden doğru kaynak kendi listemiz değil, Socket.IO'nun BAĞLI SOKETLER
   * kaydı: listede olup artık bağlı olmayan herkes düşürülür. Periyodik
   * süpürme (ve her yayında yapılan aynı kontrol) hangi yol kaçarsa kaçsın
   * durumu en geç bir dakikada düzeltir.
   */
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly SWEEP_MS = 30_000;

  constructor(
    private jwtService: JwtService,
    private access: AccessService,
    private supabase: SupabaseService
  ) {}

  // --------------------------------------------------------------- Katılma

  @SubscribeMessage("join-room")
  async handleJoin(
    @MessageBody() body: { token?: string; room?: string },
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    const room = (body?.room ?? "").trim();
    if (!room) return;
    let user: PresenceUser;
    try {
      user = await this.identify(body?.token, client);
      await this.assertCanJoin(room, user.userId);
    } catch (error) {
      // İstemciye hata dönmüyoruz: yetkisiz oda denemesi kullanıcı için hata
      // değil, sayfanın canlı özelliği açılmaz o kadar. Soket bildirimler için
      // de kullanılıyor, koparılmamalı. Sebep log'a yazılır — aksi halde
      // "canlı çalışmıyor" şikayetinde token mı, yetki mi, oda adı mı olduğunu
      // anlamanın yolu yok.
      this.logger.warn(`Odaya katılma reddedildi (${room}): ${(error as Error)?.message ?? "bilinmeyen sebep"}`);
      return;
    }

    await client.join(room);
    // İlk odayla birlikte başlar; boşta duran sunucuda zamanlayıcı çalışmasın.
    if (!this.sweepTimer) this.sweepTimer = setInterval(() => this.sweep(), RealtimeGateway.SWEEP_MS);
    const members = this.rooms.get(room) ?? new Map<string, PresenceUser>();
    members.set(client.id, user);
    this.rooms.set(room, members);
    this.emitPresence(room);
  }

  @SubscribeMessage("leave-room")
  async handleLeave(@MessageBody() body: { room?: string }, @ConnectedSocket() client: Socket): Promise<void> {
    const room = (body?.room ?? "").trim();
    if (!room) return;
    await client.leave(room);
    this.forget(room, client.id);
  }

  handleDisconnect(client: Socket): void {
    for (const room of [...this.rooms.keys()]) this.forget(room, client.id);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /** Bağlantısı kopmuş üyeleri düşürür; değişen odalara yeni liste yayılır. */
  private sweep(): void {
    for (const [room, members] of this.rooms) {
      let changed = false;
      for (const socketId of [...members.keys()]) {
        if (this.isConnected(socketId)) continue;
        members.delete(socketId);
        changed = true;
      }
      if (!changed) continue;
      if (members.size === 0) this.rooms.delete(room);
      this.emitPresence(room);
    }
  }

  private isConnected(socketId: string): boolean {
    return this.server?.sockets?.sockets?.has(socketId) ?? false;
  }

  // ---------------------------------------------------------------- Yayın

  /**
   * Bir HTTP mutasyonundan sonra, isteği yapan soketin bulunduğu odalara
   * "bu sayfada bir şey değişti" sinyali gönderir. Aktörün kendi sekmesi hariç
   * tutulur — o ekranı zaten kendisi güncelledi.
   */
  broadcastChange(socketId: string, userId: string, meta: { method: string; path: string }): void {
    const socket = this.server?.sockets?.sockets?.get(socketId);
    if (!socket) return;
    // Başkasının soketi adına yayın yapılamasın: X-Socket-Id başlığı istemciden
    // geliyor, uydurulabilir. Soketin sahibi ile isteği yapan aynı kişi olmalı.
    if (socket.data?.user?.userId !== userId) return;

    for (const room of socket.rooms) {
      // Yalnızca sayfa odaları: soket bildirim odasında (`user:<id>`) ve kendi
      // kimliğine eşit odada da bulunuyor.
      if (!this.rooms.has(room)) continue;
      const payload: RoomChangedPayload = { room, actorId: userId, method: meta.method, path: meta.path };
      socket.broadcast.to(room).emit("room-changed", payload);
    }
  }

  /**
   * Tek bir KULLANICIYA (tüm sekmelerine) olay gönderir.
   *
   * Oda yayınından farkı hedefin sayfa değil kişi olması: Lio'nun yaptığı işi
   * kullanıcının ekranına taşımak için kullanılıyor (bkz. LioActivityPayload).
   * Kullanıcı odasına katılma bildirim ağ geçidinde yapılıyor
   * (notifications.gateway.ts, `user:<id>`); ikisi de aynı Socket.IO sunucusunu
   * paylaştığı için burada ayrıca katılım gerekmiyor.
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!userId || !this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /** Belirli bir odaya doğrudan haber vermek isteyen servisler için. */
  notifyRoom(room: string, meta: { method: string; path: string; actorId?: string }): void {
    if (!this.rooms.has(room)) return;
    const payload: RoomChangedPayload = {
      room,
      actorId: meta.actorId ?? "",
      method: meta.method,
      path: meta.path,
    };
    this.server.to(room).emit("room-changed", payload);
  }

  // ---------------------------------------------------------------- İçeriler

  private forget(room: string, socketId: string): void {
    const members = this.rooms.get(room);
    if (!members?.delete(socketId)) return;
    if (members.size === 0) this.rooms.delete(room);
    this.emitPresence(room);
  }

  private emitPresence(room: string): void {
    const members = this.rooms.get(room);
    // Aynı kullanıcının iki sekmesi tek kişi olarak görünür. Bağlantısı kopmuş
    // kayıtlar liste kurulurken elenir: bir sonraki katılma/ayrılma anında
    // hayalet kalmasın (süpürmeyi beklemeden).
    const byUser = new Map<string, PresenceUser>();
    for (const [socketId, user] of members ?? []) {
      if (!this.isConnected(socketId)) {
        members?.delete(socketId);
        continue;
      }
      byUser.set(user.userId, user);
    }
    const payload: RoomPresencePayload = { room, users: [...byUser.values()] };
    this.server.to(room).emit("presence", payload);
  }

  /** Token'ı doğrular ve kişinin görünen adını/avatarını bir kez okur. */
  private async identify(token: string | undefined, client: Socket): Promise<PresenceUser> {
    const cached = client.data?.user as PresenceUser | undefined;
    if (cached) return cached;

    const payload = this.jwtService.verify<{ sub: string }>(token ?? "");
    const { data } = await this.supabase.client
      .from("users")
      .select("full_name, avatar_url")
      .eq("id", payload.sub)
      .maybeSingle();
    const user: PresenceUser = {
      userId: payload.sub,
      fullName: data?.full_name ?? undefined,
      avatarUrl: data?.avatar_url ?? undefined,
    };
    client.data.user = user;
    return user;
  }

  /** Oda adının çözümlenmesi ve yetki kontrolü (bkz. room-key.ts). */
  private async assertCanJoin(room: string, userId: string): Promise<void> {
    const scope = parseRoomKey(room);
    if (!scope) throw new ForbiddenException("Geçersiz oda");
    const { type, id } = scope;

    switch (type) {
      case "project":
        return this.access.assertCanViewProject(id, userId);
      case "department":
        return this.access.assertCanViewDepartment(id, userId);
      case "job":
        return this.access.assertCanViewJob(id, userId);
      case "operation":
        return this.access.assertCanViewOperation(id, userId);
      case "organization":
        return this.access.assertCanViewOrganization(id, userId);
      case "group":
        return this.access.assertCanViewGroup(id, userId);
      default:
        throw new ForbiddenException("Bilinmeyen oda türü");
    }
  }
}
