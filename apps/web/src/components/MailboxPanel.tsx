import { useEffect, useMemo, useState } from "react";
import type { MailAccount, MailFolder, MailMessage, MailMessageDetail } from "@projelio/shared";
import { mailboxApi, type MailScope } from "../api/mailbox";
import { useThemeColors } from "../theme/useThemeColors";
import MailMessageModal from "./MailMessageModal";
import { IconTrash } from "./icons";

interface Props {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  canWrite?: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

/**
 * E-posta modülünün gelen kutusu.
 *
 * ÜÇ SÜTUN: klasörler · ileti listesi · okuma ve yanıt. Bu, e-postanın otuz
 * yıldır değişmeyen yerleşimi; kullanıcı buraya öğrenmeye değil iş yapmaya
 * geliyor, yeni bir düzen icat etmenin kazancı yok.
 *
 * İLETİLER SAKLANMAZ: her istek Microsoft Graph'a gider (bkz.
 * 064_mail_accounts.sql). Bu yüzden yükleme durumları gizlenmiyor — ekranda
 * "bir şey oluyor" görünmezse kullanıcı ikinci kez tıklıyor.
 *
 * GÖVDE SANDBOX'LI IFRAME'DE: gelen e-posta güvenilmeyen HTML'dir. Doğrudan
 * innerHTML'e koymak, gönderenin sayfamızda script çalıştırmasına izin verirdi.
 * `sandbox` özniteliği script ve form gönderimini kapatır, bağlantılar yeni
 * sekmede açılır.
 */
export default function MailboxPanel({ organizationId, departmentId, jobId, canWrite = true }: Props) {
  const c = useThemeColors();
  const scope: MailScope = useMemo(
    () => (jobId ? { jobId } : { organizationId: organizationId as string, departmentId }),
    [jobId, organizationId, departmentId]
  );

  const [configured, setConfigured] = useState(false);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [folderId, setFolderId] = useState<string>("inbox");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<MailMessageDetail | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  // Hangi iletinin açılmakta olduğu. Modal ancak gövde geldikten sonra açılıyor;
  // arada geri bildirim olmazsa kullanıcı ikinci kez tıklıyor.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [sharedAddress, setSharedAddress] = useState("");
  const [showShared, setShowShared] = useState(false);

  const account = accounts.find((a) => a.id === accountId);

  // ============================================================ Yükleme
  const loadAccounts = () => {
    setLoadingAccounts(true);
    mailboxApi
      .listAccounts(scope)
      .then((rows) => {
        setAccounts(rows);
        setAccountId((current) => current || rows.find((r) => r.active)?.id || "");
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Kutular yüklenemedi"))
      .finally(() => setLoadingAccounts(false));
  };

  useEffect(loadAccounts, [scope]);

  useEffect(() => {
    mailboxApi
      .status()
      .then(({ configured: ok }) => setConfigured(ok))
      .catch(() => setConfigured(false));
  }, []);

  /** Microsoft'tan dönüş: sonuç şeridi ve adres çubuğunun temizlenmesi. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("mail");
    if (!value) return;

    const [kind, ...rest] = value.split(":");
    const detail = rest.join(":");
    setBanner(
      kind === "connected"
        ? { kind: "ok", text: `${detail} kutusu modüle bağlandı.` }
        : { kind: "error", text: detail || "Posta bağlantısı tamamlanamadı." }
    );
    if (kind === "connected") loadAccounts();

    params.delete("mail");
    const q = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    mailboxApi
      .folders(accountId)
      .then(setFolders)
      .catch(() => setFolders([]));
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    setLoadingList(true);
    setSelected(null);
    mailboxApi
      .messages(accountId, { folderId: search ? undefined : folderId, search: search || undefined })
      .then((page) => {
        setMessages(page.messages);
        setHasMore(page.hasMore);
        setError("");
      })
      .catch((err) => {
        setMessages([]);
        setError(err instanceof Error ? err.message : "İletiler yüklenemedi");
      })
      .finally(() => setLoadingList(false));
  }, [accountId, folderId, search]);

  // ============================================================ Eylemler
  const openMessage = async (message: MailMessage) => {
    if (!accountId) return;
    setOpeningId(message.id);
    try {
      const detail = await mailboxApi.message(accountId, message.id);
      setSelected(detail);
      // Okundu işareti sunucuya gidiyor ama listeyi beklemeden güncelliyoruz:
      // e-postada "açtım" geri bildirimi anında olmalı.
      if (!message.isRead) {
        setMessages((ms) => ms.map((m) => (m.id === message.id ? { ...m, isRead: true } : m)));
        mailboxApi.markRead(accountId, message.id, true).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "İleti açılamadı");
    } finally {
      setOpeningId(null);
    }
  };

  const connect = async () => {
    setConnecting(true);
    setBanner(null);
    try {
      const { configured: ok, url } = await mailboxApi.connectUrl(
        scope,
        `${window.location.pathname}${window.location.search}`,
        sharedAddress.trim() || undefined
      );
      if (!ok || !url) {
        setBanner({ kind: "error", text: "Posta entegrasyonu bu kurulumda yapılandırılmamış." });
        return;
      }
      window.location.href = url;
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : "Bağlantı başlatılamadı" });
    } finally {
      setConnecting(false);
    }
  };

  const unlink = async (target: MailAccount) => {
    if (!window.confirm(`${target.address} kutusu modülden kaldırılsın mı? Microsoft bağlantınız durur.`)) return;
    try {
      await mailboxApi.unlink(target.id);
      setAccountId("");
      loadAccounts();
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : "Kutu kaldırılamadı" });
    }
  };

  // ============================================================ Boş durumlar
  if (loadingAccounts) {
    return <span style={{ fontSize: 13, color: c.textSecondary }}>Yükleniyor…</span>;
  }

  if (accounts.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
        {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 14, color: c.textPrimary }}>Bir Outlook kutusu bağlayın</span>
          <span style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
            Bağladığınız kutuyu <strong>bu modüle atanmış herkes</strong> okuyabilir ve o kutudan yanıt
            yazabilir. Kişisel postanızı değil, ekibin ortak kutusunu (info@, satis@ gibi) bağlamanız önerilir.
          </span>
          {!configured && (
            <span style={{ fontSize: 12, color: c.danger }}>
              Posta entegrasyonu bu kurulumda yapılandırılmamış (MICROSOFT_CLIENT_ID / MAIL_REDIRECT_URI).
            </span>
          )}

          {showShared && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>
                Paylaşılan kutunun adresi (kendi kutunuzu bağlayacaksanız boş bırakın)
              </label>
              <input
                value={sharedAddress}
                onChange={(e) => setSharedAddress(e.target.value)}
                placeholder="info@sirketiniz.com"
                style={{ fontSize: 13, padding: "6px 8px" }}
              />
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                Bu kutuda Exchange tarafında "tam erişim" yetkiniz olmalı.
              </span>
            </div>
          )}

          {canWrite && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={connect}
                disabled={connecting || !configured}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  background: c.primary,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: connecting || !configured ? "default" : "pointer",
                  opacity: connecting || !configured ? 0.6 : 1,
                }}
              >
                {connecting ? "Yönlendiriliyor…" : "Outlook kutusunu bağla"}
              </button>
              <button
                onClick={() => setShowShared((s) => !s)}
                style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
              >
                {showShared ? "Kendi kutumu bağlayacağım" : "Paylaşılan bir kutu bağlayacağım"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================ Üç sütun
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          style={{ fontSize: 13, padding: "4px 8px" }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.address}
              {a.sharedMailbox ? " (paylaşılan)" : ""}
            </option>
          ))}
        </select>

        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput.trim())}
          placeholder="Kutuda ara ve Enter…"
          style={{ fontSize: 13, padding: "4px 8px", flex: "1 1 200px", minWidth: 160 }}
        />
        {search && (
          <button
            onClick={() => {
              setSearch("");
              setSearchInput("");
            }}
            style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            Aramayı temizle
          </button>
        )}

        {account && (
          <span style={{ fontSize: 11, color: c.textSecondary, marginLeft: "auto" }}>
            {account.connectedByName ? `${account.connectedByName} bağladı` : "Modüle bağlı kutu"} · ekip erişebilir
          </span>
        )}
        {canWrite && account && (
          <button
            onClick={() => unlink(account)}
            aria-label="Kutuyu kaldır"
            title="Kutuyu modülden kaldır"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
          >
            <IconTrash size={14} color={c.textSecondary} />
          </button>
        )}
      </div>

      {account?.connectionError && (
        <span style={{ fontSize: 12, color: c.danger }}>{account.connectionError}</span>
      )}
      {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* --------------------------------------------------- Klasörler */}
        <div style={{ flex: "0 0 150px", display: "flex", flexDirection: "column", gap: 2 }}>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFolderId(f.id);
                setSearch("");
              }}
              style={{
                textAlign: "left",
                fontSize: 12,
                padding: "5px 8px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: folderId === f.id && !search ? `${c.primary}14` : "transparent",
                color: folderId === f.id && !search ? c.primary : c.textPrimary,
                display: "flex",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              {f.unreadCount > 0 && <span style={{ color: c.textSecondary }}>{f.unreadCount}</span>}
            </button>
          ))}
        </div>

        {/* --------------------------------------------------- Liste */}
        <div
          style={{
            flex: "1 1 280px",
            minWidth: 240,
            maxHeight: 560,
            overflowY: "auto",
            border: `1px solid ${c.border}`,
            borderRadius: 8,
          }}
        >
          {loadingList && (
            <div style={{ padding: 10, fontSize: 12, color: c.textSecondary }}>İletiler yükleniyor…</div>
          )}
          {!loadingList && messages.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: c.textSecondary }}>
              {search ? "Aramaya uyan ileti yok." : "Bu klasörde ileti yok."}
            </div>
          )}
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => openMessage(m)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                border: "none",
                borderBottom: `1px solid ${c.border}`,
                cursor: "pointer",
                background: selected?.id === m.id ? `${c.primary}10` : "transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: m.isRead ? 400 : 600,
                    color: c.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.from?.name || m.from?.address || "(gönderen yok)"}
                </span>
                <span style={{ fontSize: 11, color: c.textSecondary, flexShrink: 0 }}>
                  {openingId === m.id ? "açılıyor…" : formatDate(m.receivedAt)}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: m.isRead ? 400 : 600,
                  color: c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.subject}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: c.textSecondary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.hasAttachments ? "📎 " : ""}
                {m.preview}
              </span>
            </button>
          ))}
          {hasMore && (
            <div style={{ padding: 8, fontSize: 11, color: c.textSecondary, textAlign: "center" }}>
              Daha fazlası var — aramayı daraltın
            </div>
          )}
        </div>

        {/* Üçüncü sütun yok: okuma ve yanıt modalde (bkz. MailMessageModal).
            Modül sayfasının içinde bir kenar sütunu hem gövde hem yazma için
            dardı; e-posta yazmak odaklanılan bir iş, kenar işi değil. */}
      </div>

      {selected && accountId && (
        <MailMessageModal
          accountId={accountId}
          message={selected}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onSent={(text) => setBanner({ kind: "ok", text })}
        />
      )}
    </div>
  );
}

function Banner({
  banner,
  onClose,
}: {
  banner: { kind: "ok" | "error"; text: string };
  onClose: () => void;
}) {
  const c = useThemeColors();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        background: banner.kind === "ok" ? `${c.success}14` : `${c.danger}14`,
        color: banner.kind === "ok" ? c.success : c.danger,
        border: `1px solid ${banner.kind === "ok" ? c.success : c.danger}33`,
      }}
    >
      <span style={{ flex: 1 }}>{banner.text}</span>
      <button
        onClick={onClose}
        aria-label="Kapat"
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
      >
        ×
      </button>
    </div>
  );
}
