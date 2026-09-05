import { useEffect, useRef, useState } from "react";
import { TOP_CHROME, Z } from "../lib/layout";
import { useNavigate } from "react-router-dom";
import type { Socket } from "socket.io-client";
import type { CreationRequest, JobMember, NotificationPayload } from "@projelio/shared";
import { api } from "../api/client";
import { getSocket } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import { timeAgo } from "../lib/dates";
import { tourAnchor } from "../lib/tour/types";
import { fetchPendingJobInvites, onJobInvitesChanged, respondToJobInvite } from "../lib/jobInvites";
import {
  fetchPendingApprovals,
  onCreationRequestsChanged,
  respondToCreationRequest,
} from "../lib/creationRequests";
import { IconBell } from "./icons";
import Modal from "./Modal";
import { useT } from "../lib/i18n";

export default function NotificationBell() {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  // Destek yanıtı: sayfaya yönlendirmek yerine yanıtı burada, modalda gösteririz
  // (bkz. handleSelect). Yanıt metni bildirimin gövdesinde geldiği için ayrıca
  // sunucuya sorulmuyor.
  const [supportReply, setSupportReply] = useState<NotificationPayload | null>(null);
  // Bekleyen iş davetleri bildirimlerden ayrı tutulur: bildirim okununca kaybolur,
  // davet ise yanıtlanana kadar durmalı. Rozet ikisinin toplamını gösterir.
  const [invites, setInvites] = useState<JobMember[]>([]);
  // Karar vermem beklenen açma talepleri. Davetlerle aynı mantık: bildirim
  // okununca kaybolur, talep ise yanıtlanana kadar durmalı.
  const [approvals, setApprovals] = useState<CreationRequest[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const loadInvites = () => {
    fetchPendingJobInvites().then(setInvites);
  };

  const loadApprovals = () => {
    fetchPendingApprovals().then(setApprovals);
  };

  // Onay/ret burada, listeden ayrılmadan verilir. Onaylandığı anda iş/proje
  // doğar; olay yayını açık listeleri tazeler (bkz. lib/creationRequests.ts).
  const answerApproval = async (request: CreationRequest, approve: boolean) => {
    if (answering) return;
    setAnswering(request.id);
    try {
      const note = approve
        ? undefined
        : window.prompt("Ret gerekçesi (isteğe bağlı) — talep sahibi görecek:") ?? undefined;
      await respondToCreationRequest(request.id, approve, note);
      setApprovals((prev) => prev.filter((r) => r.id !== request.id));
    } finally {
      setAnswering(null);
    }
  };

  // Kabul/ret burada, listeden ayrılmadan verilir. Kabul edilen iş anında
  // anasayfadaki "Katıldıklarım" listesine düşsün diye respondToJobInvite
  // olayı yayınlar (bkz. lib/jobInvites.ts).
  const answerInvite = async (invite: JobMember, approve: boolean) => {
    if (answering) return;
    setAnswering(invite.id);
    try {
      await respondToJobInvite(invite.id, approve);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (approve) {
        setOpen(false);
        navigate(`/jobs/${invite.jobId}`);
      }
    } finally {
      setAnswering(null);
    }
  };

  useEffect(() => {
    if (!localStorage.getItem("projelio_token")) return;

    // "cancelled" bayrağı olmadan: React StrictMode (geliştirmede) bu effect'i
    // mount->cleanup->mount diye iki kez çalıştırıyor. Soket, /auth/me isteği
    // döndükten SONRA (asenkron) oluşturulduğu için ilk çalıştırmanın cleanup'ı
    // henüz oluşmamış soketi temizleyemiyor, sonra ikinci çalıştırma da kendi
    // soketini açıyor — aynı kullanıcı için iki canlı soket kalıyor ve her
    // bildirim iki kez işleniyordu ("aynı bildirim 2 tane gidiyor" hatası).
    // cancelled=true olduğunda geç gelen .then() soket açmayı vazgeçiyor.
    let cancelled = false;

    api
      .get<{ notifications: NotificationPayload[]; unreadCount: number }>("/notifications")
      .then(({ notifications, unreadCount }) => {
        if (cancelled) return;
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      })
      .catch(() => {});

    api
      .get<{ id: string } | null>("/auth/me")
      .then((me) => {
        if (cancelled || !me) return;
        const token = localStorage.getItem("projelio_token");
        if (!token) return;
        // Uygulamanın TEK soketi (bkz. lib/liveRoom.ts). Eskiden burası kendi
        // bağlantısını açıyordu; canlı sayfa odaları geldiğinde aynı sekmede
        // ikinci bir bağlantı olurdu ve sunucu "bu istek hangi sayfadan geldi"
        // sorusunu yanlış sokete sorardı. Kimlik doğrulaması (register) tek
        // yerde, bağlantı kurulurken yapılıyor.
        const socket = getSocket();
        if (!socket) return;
        socketRef.current = socket;
        socket.on("notification", (notification: NotificationPayload) => {
          setNotifications((prev) => [notification, ...prev].slice(0, 50));
          setUnreadCount((n) => n + 1);
          // Yeni bir iş daveti geldiyse kabul/ret satırı da anında belirsin.
          if (notification.type === "job_invite") loadInvites();
          if (notification.type === "creation_request") loadApprovals();
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      // Soket paylaşımlı: kapatılmaz, yalnızca bu bileşenin dinleyicisi kalkar.
      socketRef.current?.off("notification");
      socketRef.current = null;
    };
  }, []);

  // Bekleyen iş davetleri: açılışta bir kez, sonra davet başka bir yerden
  // (iş sayfasındaki şeritten) yanıtlandığında tazelenir.
  useEffect(() => {
    if (!localStorage.getItem("projelio_token")) return;
    loadInvites();
    return onJobInvitesChanged(loadInvites);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("projelio_token")) return;
    loadApprovals();
    return onCreationRequestsChanged(loadApprovals);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Çana tıklayıp paneli açmak bildirimleri okundu sayar: rozet hemen sıfırlanır,
  // sunucuya read-all gönderilir; okunmamışların görsel vurgusu ise panel
  // kapanana kadar korunur ki kullanıcı hangilerinin yeni olduğunu görebilsin.
  useEffect(() => {
    if (open) {
      if (unreadCount > 0) {
        setUnreadCount(0);
        api.patch("/notifications/read-all", {}).catch(() => {});
      }
    } else {
      setNotifications((prev) => (prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!localStorage.getItem("projelio_token")) return null;

  // Yanıt bekleyen davet, okunmamış bildirimden farklı: paneli açmak onu
  // "gördüm" saymaz, o yüzden rozet okundu işaretlendikten sonra da davet
  // sayısını göstermeye devam eder.
  const badgeCount = unreadCount + invites.length + approvals.length;

  const handleSelect = async (n: NotificationPayload) => {
    setOpen(false);
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadCount((count) => Math.max(0, count - 1));
      api.patch(`/notifications/${n.id}/read`, {}).catch(() => {});
    }
    if (n.type === "support_reply") {
      setSupportReply(n);
      return;
    }
    if (n.link) navigate(n.link);
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    api.patch("/notifications/read-all", {}).catch(() => {});
  };

  return (
    <div ref={ref} {...tourAnchor("notification-bell")} style={{ position: "fixed", top: TOP_CHROME.top, right: TOP_CHROME.gutter, zIndex: Z.topChrome }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Bildirimler"
        style={{
          position: "relative",
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "none",
          // Bu buton her sayfada (kapak fotoğraflı olsun olmasın) aynı görünmeli;
          // yarı saydam koyu bir daire hem fotoğrafların hem düz header'ın
          // üzerinde okunur kalır (bkz. DepartmentDetail'deki kapak düzenleme
          // ikonlarıyla aynı desen).
          background: "rgba(26,31,41,0.5)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(26,31,41,0.18)",
        }}
      >
        <IconBell size={20} color="#fff" />
        {badgeCount > 0 && (
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
            {badgeCount > 9 ? "9+" : badgeCount}
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
            <span style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary }}>{t("Bildirimler")}</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none" }}
              >
                {t("Tümünü okundu işaretle")}
              </button>
            )}
          </div>

          {/* Yanıt bekleyen iş davetleri en üstte, kabul/ret düğmeleriyle:
              kullanıcı işe eklenmeden önce kimin hangi işe eklediğini görüp
              karar verir (bkz. lib/jobInvites.ts). */}
          {invites.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: c.textSecondary,
                  background: `${c.accent}0f`,
                }}
              >
                {t("Yanıt bekleyen davetler")}
              </div>
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "10px 14px",
                    borderBottom: `1px solid ${c.border}`,
                    background: `${c.accent}0a`,
                  }}
                >
                  <span style={{ fontSize: 15, color: c.textPrimary }}>
                    <strong>{invite.invitedByName ?? "Bir kullanıcı"}</strong> seni{" "}
                    <strong>“{invite.jobTitle ?? "bir iş"}”</strong> işine ekledi
                    {invite.title ? ` (${invite.title})` : ""}. Kabul ediyor musun?
                  </span>
                  <span style={{ fontSize: 12, color: c.textSecondary }}>{timeAgo(invite.joinedAt)}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => answerInvite(invite, true)}
                      disabled={answering === invite.id}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: c.primary,
                        color: c.onPrimary,
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      {t("Kabul et")}
                    </button>
                    <button
                      onClick={() => answerInvite(invite, false)}
                      disabled={answering === invite.id}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: `1px solid ${c.border}`,
                        background: c.surface,
                        color: c.textSecondary,
                        fontSize: 14,
                      }}
                    >
                      {t("Reddet")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Onay bekleyen iş/proje açma talepleri: taşeron kayıt açamaz, yetkili
              burada karar verir ve onaylandığı anda kayıt doğar
              (bkz. lib/creationRequests.ts). */}
          {approvals.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: c.textSecondary,
                  background: `${c.primary}12`,
                }}
              >
                {t("Onay bekleyen talepler")}
              </div>
              {approvals.map((request) => (
                <div
                  key={request.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "10px 14px",
                    borderBottom: `1px solid ${c.border}`,
                    background: `${c.primary}08`,
                  }}
                >
                  <span style={{ fontSize: 15, color: c.textPrimary }}>
                    <strong>{request.requesterName ?? "Bir taşeron"}</strong>,{" "}
                    <strong>“{String(request.payload?.title ?? "başlıksız")}”</strong> adlı{" "}
                    {request.kind === "job" ? "işi" : "projeyi"} açmak için izin istiyor
                    {request.kind === "project" && request.jobTitle ? ` (${request.jobTitle})` : ""}
                    {request.kind === "job" && request.organizationName ? ` (${request.organizationName})` : ""}.
                  </span>
                  <span style={{ fontSize: 12, color: c.textSecondary }}>{timeAgo(request.createdAt)}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => answerApproval(request, true)}
                      disabled={answering === request.id}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: c.primary,
                        color: c.onPrimary,
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      {t("Onayla")}
                    </button>
                    <button
                      onClick={() => answerApproval(request, false)}
                      disabled={answering === request.id}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: `1px solid ${c.border}`,
                        background: c.surface,
                        color: c.textSecondary,
                        fontSize: 14,
                      }}
                    >
                      {t("Reddet")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {notifications.length === 0 ? (
            invites.length === 0 && approvals.length === 0 && (
              <p style={{ fontSize: 15, color: c.textSecondary, padding: 16, textAlign: "center", margin: 0 }}>
                {t("Henüz bildirim yok.")}
              </p>
            )
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

      {supportReply && (
        <Modal title={t("Destek talebin yanıtlandı")} onClose={() => setSupportReply(null)} maxWidth={520}>
          <p style={{ fontSize: 15, color: c.textPrimary, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {supportReply.body}
          </p>
          <p style={{ fontSize: 12, color: c.textSecondary, margin: "12px 0 0" }}>
            {timeAgo(supportReply.createdAt)}
          </p>
          <button
            type="button"
            onClick={() => {
              setSupportReply(null);
              navigate("/settings?sekme=destek");
            }}
            style={{
              marginTop: 14,
              background: "transparent",
              color: c.textPrimary,
              padding: "8px 15px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              fontSize: 14,
            }}
          >
            {t("Tüm taleplerim")}
          </button>
        </Modal>
      )}
    </div>
  );
}
