import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type {
  LioActivityPayload,
  PresenceUser,
  RoomChangedPayload,
  RoomPresencePayload,
} from "@projelio/shared";
import { API_URL } from "../api/client";
import { setSocketId } from "./socketId";

/**
 * Canlı işbirliği: aynı sayfadaki kişileri göstermek ve başkasının yaptığı
 * değişikliği anında ekrana yansıtmak.
 *
 * TEK SOKET: uygulama boyunca bir bağlantı açılır. Eskiden her bileşen kendi
 * `io()` çağrısını yapıyordu (bildirim çanı, ekip listesi, iş ekibi) — üç ayrı
 * bağlantı, üçünde ayrı yeniden bağlanma davranışı. Sunucunun "bu istek hangi
 * sayfadan geldi" sorusunu cevaplayabilmesi için de tek ve bilinen bir soket
 * gerekiyor (bkz. socketId.ts).
 *
 * ODA = SAYFA. Sayfa `useLiveRoom("project:<id>")` der; hook odaya katılır,
 * sunucudan gelen "değişti" sinyalinde uygulamanın tazeleme sayacını artırır
 * (bkz. lib/undo.tsx — useRefreshOnUndo kullanan tüm listeler kendini yeniler)
 * ve odadaki kişileri paylaşır (bkz. PresenceAvatars).
 */

let socket: Socket | null = null;
let joinedRoom: string | null = null;

/** Geliştirme modunda konsola yazar; üretimde sessiz. */
function debug(...args: unknown[]): void {
  if (import.meta.env.DEV) console.info("[canlı]", ...args);
}

/** Odadaki kişiler; başlıktaki avatar yığını buradan besleniyor. */
let presence: PresenceUser[] = [];
const presenceListeners = new Set<() => void>();

/** "Sayfadaki veri değişti" dinleyicileri (bkz. UndoProvider). */
const changeListeners = new Set<(payload: RoomChangedPayload) => void>();

/**
 * "Lio bir şey yaptı" dinleyicileri.
 *
 * Oda sinyalinden ayrı bir kanal: o SAYFAYA gidip "tazele" der, bu ise KİŞİYE
 * gidip "şuraya bak" der. Kullanıcı Lio'nun yaptığı işi anlatıldığı için değil,
 * ekranda olduğu için görsün (bkz. AiLiveActivity).
 */
const lioActivityListeners = new Set<(payload: LioActivityPayload) => void>();

function token(): string | null {
  return localStorage.getItem("projelio_token");
}

/**
 * Teşhis kancası: tarayıcı konsolunda `__projelioLive()` yazınca canlı
 * bağlantının durumu görünür — bağlı mı, hangi odada, sayfada kimler var.
 *
 * Kalıcı olarak duruyor çünkü bu özelliğin sessizce çalışmama biçimleri var
 * (soket kurulmamış, odaya katılma yetkisi reddedilmiş, oda adı beklenenden
 * farklı) ve dışarıdan hepsi aynı görünüyor: "ekranda bir şey yok".
 */
if (typeof window !== "undefined") {
  (window as { __projelioLive?: () => unknown }).__projelioLive = () => ({
    bagli: socket?.connected ?? false,
    soketKimligi: socket?.id,
    oda: joinedRoom,
    sayfadakiler: presence,
    tokenVar: !!token(),
  });
}

/** Bağlantıyı ilk ihtiyaçta açar; sonraki çağrılar aynı soketi döndürür. */
export function getSocket(): Socket | null {
  const auth = token();
  if (!auth) return null;
  if (socket) return socket;

  socket = io(API_URL, { transports: ["websocket"] });
  socket.on("connect", () => {
    debug("bağlandı", socket?.id);
    setSocketId(socket?.id);
    // Bildirim odası da bu soket üzerinden (bkz. notifications.gateway.ts).
    socket?.emit("register", auth);
    // Yeniden bağlanmada oda üyeliği sunucuda kayboldu; geri katıl.
    if (joinedRoom) socket?.emit("join-room", { token: auth, room: joinedRoom });
  });
  socket.on("disconnect", () => setSocketId(undefined));
  socket.on("presence", (payload: RoomPresencePayload) => {
    if (payload.room !== joinedRoom) {
      debug("presence başka odadan geldi, yok sayıldı", payload.room, "beklenen:", joinedRoom);
      return;
    }
    debug("sayfadakiler", payload.users.map((u) => u.fullName ?? u.userId));
    presence = payload.users;
    presenceListeners.forEach((fn) => fn());
  });
  socket.on("room-changed", (payload: RoomChangedPayload) => {
    changeListeners.forEach((fn) => fn(payload));
  });
  socket.on("lio-activity", (payload: LioActivityPayload) => {
    debug("lio", payload?.tool, payload?.path);
    lioActivityListeners.forEach((fn) => fn(payload));
  });
  return socket;
}

/** Lio'nun yaptığı işleri dinler. Dönen fonksiyon aboneliği bırakır. */
export function onLioActivity(fn: (payload: LioActivityPayload) => void): () => void {
  // Soket henüz açılmamış olabilir (kullanıcı hiçbir canlı sayfaya girmediyse);
  // dinleyici eklerken bağlantıyı da kurarız, aksi halde sinyal hiç gelmez.
  getSocket();
  lioActivityListeners.add(fn);
  return () => {
    lioActivityListeners.delete(fn);
  };
}

export function onRoomChanged(fn: (payload: RoomChangedPayload) => void): () => void {
  changeListeners.add(fn);
  return () => {
    changeListeners.delete(fn);
  };
}

/**
 * Sayfayı bir odaya bağlar. Sayfa değişince eski odadan çıkılır — aksi halde
 * kullanıcı gezindikçe odalarda "hayalet" olarak görünmeye devam ederdi.
 */
export function useLiveRoom(room: string | null | undefined): void {
  useEffect(() => {
    if (!room) return;
    const auth = token();
    const s = getSocket();
    if (!s || !auth) return;

    joinedRoom = room;
    presence = [];
    presenceListeners.forEach((fn) => fn());
    const join = () => {
      debug("odaya katılınıyor:", room);
      s.emit("join-room", { token: auth, room });
    };
    if (s.connected) join();
    else debug("soket henüz bağlı değil, bağlanınca katılacak:", room);

    return () => {
      s.emit("leave-room", { room });
      if (joinedRoom === room) {
        joinedRoom = null;
        presence = [];
        presenceListeners.forEach((fn) => fn());
      }
    };
  }, [room]);
}

/** Şu an bulunulan sayfadaki kişiler (kendisi dahil). */
export function usePresence(): PresenceUser[] {
  const [users, setUsers] = useState(presence);
  useEffect(() => {
    const onChange = () => setUsers(presence);
    presenceListeners.add(onChange);
    onChange();
    return () => {
      presenceListeners.delete(onChange);
    };
  }, []);
  return users;
}
