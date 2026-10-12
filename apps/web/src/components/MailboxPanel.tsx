import { useEffect, useMemo, useState } from "react";
import type { MailAccount, MailFolder, MailMessage, MailMessageDetail } from "@projelio/shared";
import { mailboxApi, type MailScope, type MailStatus } from "../api/mailbox";
import { useThemeColors } from "../theme/useThemeColors";
import MailMessageModal from "./MailMessageModal";
import ProjelioYeniEpostaModal from "./ProjelioYeniEpostaModal";
import { IconTrash } from "./icons";
import { useT } from "../lib/i18n";
import { bicimDili } from "../lib/i18n/depo";

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
    ? d.toLocaleTimeString(bicimDili(), { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(bicimDili(), { day: "2-digit", month: "short" });
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
  const t = useT();
  const scope: MailScope = useMemo(
    () => (jobId ? { jobId } : { organizationId: organizationId as string, departmentId }),
    [jobId, organizationId, departmentId]
  );

  const [configured, setConfigured] = useState(false);
  // @projelio.app kutuları: gönderim açık mı, bu kişi adres açabilir mi (yalnızca yönetici).
  const [projelioDurum, setProjelioDurum] = useState<MailStatus["projelio"]>();
  const [adresFormu, setAdresFormu] = useState(false);
  const [yeniEposta, setYeniEposta] = useState(false);
  // Klasör ve listeyi yeniden yükletmek için (gönderim, taşıma, elle yenileme).
  const [yenile, setYenile] = useState(0);
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
  const projelioKutusu = account?.provider === "projelio";

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
      .catch((err) => setError(err instanceof Error ? err.message : t("Kutular yüklenemedi")))
      .finally(() => setLoadingAccounts(false));
  };

  useEffect(loadAccounts, [scope]);

  useEffect(() => {
    mailboxApi
      .status()
      .then(({ configured: ok, projelio }) => {
        setConfigured(ok);
        setProjelioDurum(projelio);
      })
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
        ? { kind: "ok", text: t("{detail} kutusu modüle bağlandı.", { detail }) }
        : { kind: "error", text: detail || t("Posta bağlantısı tamamlanamadı.") }
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
  }, [accountId, yenile]);

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
        setError(err instanceof Error ? err.message : t("İletiler yüklenemedi"));
      })
      .finally(() => setLoadingList(false));
  }, [accountId, folderId, search, yenile]);

  /**
   * @projelio.app kutusunda yeni posta webhook'la bize düşüyor, istemciye
   * itilmiyor; dakikada bir sessizce yokluyoruz. İleti açıkken ya da yazarken
   * yoklanmaz — liste değişince açık pencere kapanırdı.
   */
  useEffect(() => {
    if (!projelioKutusu || selected || yeniEposta || search) return;
    const zamanlayici = setInterval(() => {
      mailboxApi
        .messages(accountId, { folderId })
        .then((page) => {
          setMessages(page.messages);
          setHasMore(page.hasMore);
        })
        .catch(() => undefined);
      mailboxApi.folders(accountId).then(setFolders).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(zamanlayici);
  }, [projelioKutusu, accountId, folderId, selected, yeniEposta, search]);

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
      setError(err instanceof Error ? err.message : t("İleti açılamadı"));
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
        setBanner({ kind: "error", text: t("Posta entegrasyonu bu kurulumda yapılandırılmamış.") });
        return;
      }
      window.location.href = url;
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : t("Bağlantı başlatılamadı") });
    } finally {
      setConnecting(false);
    }
  };

  const unlink = async (target: MailAccount) => {
    const soru =
      target.provider === "projelio"
        ? t("{address} kutusu kapatılsın mı? Bu adrese gelen posta artık hiçbir kutuya düşmez.", { address: target.address })
        : t("{address} kutusu modülden kaldırılsın mı? Microsoft bağlantınız durur.", { address: target.address });
    if (!window.confirm(soru)) return;
    try {
      await mailboxApi.unlink(target.id);
      setAccountId("");
      loadAccounts();
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : t("Kutu kaldırılamadı") });
    }
  };

  // ============================================================ Boş durumlar
  if (loadingAccounts) {
    return <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>;
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
          <span style={{ fontSize: 14, color: c.textPrimary }}>{t("Bir Outlook kutusu bağlayın")}</span>
          <span style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
            {t("Bağladığınız kutuyu")} <strong>{t("bu modüle atanmış herkes")}</strong> {t("okuyabilir ve o kutudan yanıt yazabilir. Kişisel postanızı değil, ekibin ortak kutusunu (info@, satis@ gibi) bağlamanız önerilir.")}
          </span>
          {!configured && (
            <span style={{ fontSize: 12, color: c.danger }}>
              {t("Posta entegrasyonu bu kurulumda yapılandırılmamış (MICROSOFT_CLIENT_ID / MAIL_REDIRECT_URI).")}
            </span>
          )}

          {showShared && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>
                {t("Paylaşılan kutunun adresi (kendi kutunuzu bağlayacaksanız boş bırakın)")}
              </label>
              <input
                value={sharedAddress}
                onChange={(e) => setSharedAddress(e.target.value)}
                placeholder="info@sirketiniz.com"
                style={{ fontSize: 13, padding: "6px 8px" }}
              />
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                {t("Bu kutuda Exchange tarafında \"tam erişim\" yetkiniz olmalı.")}
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
                  color: c.onPrimary,
                  border: "none",
                  borderRadius: 8,
                  cursor: connecting || !configured ? "default" : "pointer",
                  opacity: connecting || !configured ? 0.6 : 1,
                }}
              >
                {connecting ? t("Yönlendiriliyor…") : t("Outlook kutusunu bağla")}
              </button>
              <button
                onClick={() => setShowShared((s) => !s)}
                style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
              >
                {showShared ? t("Kendi kutumu bağlayacağım") : t("Paylaşılan bir kutu bağlayacağım")}
              </button>
            </div>
          )}
        </div>
        {projelioDurum?.canCreate && (
          <ProjelioAdresFormu
            scope={scope}
            durum={projelioDurum}
            onCreated={(a) => {
              setBanner({ kind: "ok", text: t("{adres} adresi oluşturuldu.", { adres: a.address }) });
              setAccountId(a.id);
              loadAccounts();
            }}
          />
        )}
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
          onChange={(e) => {
            setAccountId(e.target.value);
            setFolderId("inbox");
          }}
          style={{ fontSize: 13, padding: "4px 8px" }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.address}
              {a.sharedMailbox ? t(" (paylaşılan)") : ""}
            </option>
          ))}
        </select>

        {projelioKutusu && canWrite && (
          <button
            onClick={() => setYeniEposta(true)}
            style={{
              fontSize: 13,
              padding: "4px 12px",
              background: c.primary,
              color: c.onPrimary,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {t("Yeni e-posta")}
          </button>
        )}
        {projelioKutusu && (
          <button
            onClick={() => setYenile((n) => n + 1)}
            title={t("Kutuyu yenile")}
            style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {t("Yenile")}
          </button>
        )}

        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput.trim())}
          placeholder={t("Kutuda ara ve Enter…")}
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
            {t("Aramayı temizle")}
          </button>
        )}

        {account && (
          <span style={{ fontSize: 11, color: c.textSecondary, marginLeft: "auto" }}>
            {projelioKutusu
              ? t("Projelio adresi")
              : account.connectedByName
                ? t("{kisi} bağladı", { kisi: account.connectedByName })
                : t("Modüle bağlı kutu")}{" "}
            · {t("ekip erişebilir")}
          </span>
        )}
        {projelioDurum?.canCreate && (
          <button
            onClick={() => setAdresFormu((a) => !a)}
            style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {adresFormu ? t("Vazgeç") : t("+ @{alan} adresi", { alan: projelioDurum.domain })}
          </button>
        )}
        {/* @projelio.app kutusunu yalnızca yönetici kapatır (sunucu da denetler). */}
        {canWrite && account && (!projelioKutusu || projelioDurum?.canCreate) && (
          <button
            onClick={() => unlink(account)}
            aria-label={t("Kutuyu kaldır")}
            title={t("Kutuyu modülden kaldır")}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
          >
            <IconTrash size={14} color={c.textSecondary} />
          </button>
        )}
      </div>

      {adresFormu && projelioDurum?.canCreate && (
        <ProjelioAdresFormu
          scope={scope}
          durum={projelioDurum}
          onCreated={(a) => {
            setAdresFormu(false);
            setBanner({ kind: "ok", text: t("{adres} adresi oluşturuldu.", { adres: a.address }) });
            setAccountId(a.id);
            loadAccounts();
          }}
        />
      )}

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
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {/* @projelio.app klasör adları bizim (Türkçe anahtar); Outlook'unkiler kullanıcının dilinde gelir. */}
                {projelioKutusu ? t(f.name) : f.name}
              </span>
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
            <div style={{ padding: 10, fontSize: 12, color: c.textSecondary }}>{t("İletiler yükleniyor…")}</div>
          )}
          {!loadingList && messages.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: c.textSecondary }}>
              {search ? t("Aramaya uyan ileti yok.") : t("Bu klasörde ileti yok.")}
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
                  {m.from?.name || m.from?.address || t("(gönderen yok)")}
                </span>
                <span style={{ fontSize: 11, color: c.textSecondary, flexShrink: 0 }}>
                  {openingId === m.id ? t("açılıyor…") : formatDate(m.receivedAt)}
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
                {m.sendError && <span style={{ color: c.danger }}>{t("Gönderilemedi")} · </span>}
                {m.hasAttachments ? "📎 " : ""}
                {m.preview}
              </span>
            </button>
          ))}
          {hasMore && (
            <div style={{ padding: 8, fontSize: 11, color: c.textSecondary, textAlign: "center" }}>
              {t("Daha fazlası var — aramayı daraltın")}
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
          provider={account?.provider}
          onChanged={() => setYenile((n) => n + 1)}
        />
      )}

      {yeniEposta && account && (
        <ProjelioYeniEpostaModal
          account={account}
          onClose={() => setYeniEposta(false)}
          onSent={(text) => {
            setBanner({ kind: "ok", text });
            setYenile((n) => n + 1);
          }}
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
  const t = useT();
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
        aria-label={t("Kapat")}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * @projelio.app adresi açma formu — yalnızca Projelio yöneticisine görünür.
 *
 * Adres kalıcıdır ve dışarıya (kartvizit, imza) basılır; bu yüzden yazarken
 * tam adres önizlenir. Kurallar sunucuda (projelio-posta.ts adresiDogrula),
 * burada yalnızca yazım kolaylığı var.
 */
function ProjelioAdresFormu({
  scope,
  durum,
  onCreated,
}: {
  scope: MailScope;
  durum: NonNullable<MailStatus["projelio"]>;
  onCreated: (account: MailAccount) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [yerelAd, setYerelAd] = useState("");
  const [gorunenAd, setGorunenAd] = useState("");
  const [imza, setImza] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");

  const olustur = async () => {
    setKaydediliyor(true);
    setHata("");
    try {
      const account = await mailboxApi.createProjelio(scope, {
        localPart: yerelAd,
        displayName: gorunenAd.trim() || undefined,
        signature: imza.trim() || undefined,
      });
      onCreated(account);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Adres oluşturulamadı"));
    } finally {
      setKaydediliyor(false);
    }
  };

  const girdi = { fontSize: 13, padding: "6px 8px" } as const;

  return (
    <div
      style={{
        border: `1px dashed ${c.accent}`,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 560,
      }}
    >
      <span style={{ fontSize: 14, color: c.textPrimary }}>{t("@{alan} adresi oluştur", { alan: durum.domain })}</span>
      <span style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
        {t("Adrese gelen posta bu modüle düşer; modüle atanmış herkes okuyup bu adresten yanıt yazabilir. Bu düğmeyi yalnızca Projelio yöneticileri görür.")}
      </span>
      {!durum.configured && (
        <span style={{ fontSize: 12, color: c.danger }}>
          {t("E-posta gönderimi bu kurulumda yapılandırılmamış (RESEND_API_KEY).")}
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          value={yerelAd}
          onChange={(e) => setYerelAd(e.target.value.toLowerCase().replace(/\s+/g, ""))}
          placeholder="satis"
          style={{ ...girdi, flex: 1 }}
          autoFocus
        />
        <span style={{ fontSize: 13, color: c.textSecondary }}>@{durum.domain}</span>
      </div>
      <input
        value={gorunenAd}
        onChange={(e) => setGorunenAd(e.target.value)}
        placeholder={t("Görünen ad (ör. Projelio Satış)")}
        style={girdi}
      />
      <textarea
        value={imza}
        onChange={(e) => setImza(e.target.value)}
        placeholder={t("İmza (isteğe bağlı) — her e-postanın sonuna eklenir")}
        rows={3}
        style={{ ...girdi, height: "auto", fontFamily: "inherit", resize: "vertical" }}
      />
      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
      <div>
        <button
          onClick={olustur}
          disabled={kaydediliyor || !yerelAd.trim() || !durum.configured}
          style={{
            fontSize: 13,
            padding: "6px 14px",
            background: c.primary,
            color: c.onPrimary,
            border: "none",
            borderRadius: 8,
            cursor: kaydediliyor || !yerelAd.trim() ? "default" : "pointer",
            opacity: kaydediliyor || !yerelAd.trim() || !durum.configured ? 0.6 : 1,
          }}
        >
          {kaydediliyor ? t("Oluşturuluyor…") : t("Adresi oluştur")}
        </button>
      </div>
    </div>
  );
}
