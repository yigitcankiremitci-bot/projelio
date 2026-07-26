import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import type { NotificationPayload } from "@projelio/shared";
import { api, API_URL } from "../api/client";
import { colors } from "../theme/colors";
import { IconBell } from "./icons";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} sa önce`;
  const day = Math.floor(hour / 24);
  return `${day} gün önce`;
}

export default function NotificationBell() {
  const c = colors.light;
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("projelio_token")) return;

    api
      .get<{ notifications: NotificationPayload[]; unreadCount: number }>("/notifications")
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      })
      .catch(() => {});

    api
      .get<{ id: string } | null>("/auth/me")
      .then((me) => {
        if (!me) return;
        const socket = io(API_URL, { transports: ["websocket"] });
        socketRef.current = socket;
        socket.emit("register", me.id);
        socket.on("notification", (notification: NotificationPayload) => {
          setNotifications((prev) => [notification, ...prev].slice(0, 50));
          setUnreadCount((n) => n + 1);
        });
      })
      .catch(() => {});

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!localStorage.getItem("projelio_token")) return null;

  const handleSelect = async (n: NotificationPayload) => {
    setOpen(false);
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadCount((count) => Math.max(0, count - 1));
      api.patch(`/notifications/${n.id}/read`, {}).catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    api.patch("/notifications/read-all", {}).catch(() => {});
  };

  return (
    <div ref={ref} style={{ position: "fixed", top: 14, right: 14, zIndex: 40 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Bildirimler"
        style={{
          position: "relative",
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: `1px solid ${c.border}`,
          background: c.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(26,31,41,0.08)",
        }}
      >
        <IconBell size={24} color={c.textPrimary} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              background: c.danger,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 60,
            right: 0,
            width: 320,
            maxHeight: 420,
            overflowY: "auto",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(26,31,41,0.16)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${c.border}`,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary }}>Bildirimler</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none" }}
              >
                Tümünü okundu işaretle
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p style={{ fontSize: 15, color: c.textSecondary, padding: 16, textAlign: "center", margin: 0 }}>
              Henüz bildirim yok.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleSelect(n)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    textAlign: "left",
                    padding: "10px 14px",
                    background: n.read ? "transparent" : `${c.accent}0f`,
                    border: "none",
                    borderBottom: `1px solid ${c.border}`,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: n.read ? 400 : 600, color: c.textPrimary }}>{n.title}</span>
                  <span style={{ fontSize: 15, color: c.textSecondary }}>{n.body}</span>
                  <span style={{ fontSize: 12, color: c.textSecondary }}>{timeAgo(n.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
