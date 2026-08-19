import { useEffect, useMemo, useState } from "react";
import type { DepartmentMember, JobMember, SocialAccount, SocialPost } from "@projelio/shared";
import { api } from "../api/client";
import { socialMediaApi, type SocialScope } from "../api/socialMedia";
import {
  ACTIVE_STATUSES,
  CONNECTION_STATUS,
  MONTH_LABELS,
  SOCIAL_PLATFORMS,
  SOCIAL_STATUS,
  STATUS_ORDER,
  TARGET_STATUS,
  WEEKDAY_LABELS,
  accountColor,
  accountLabel,
  canAutoPublish,
  localDay,
  monthGrid,
  postColor,
  postDay,
  postTime,
} from "../lib/socialMedia";
import { colors } from "../theme/colors";
import SocialAccountModal from "./SocialAccountModal";
import SocialPostComposer from "./SocialPostComposer";
import { IconChevronLeft, IconChevronRight, IconEdit, IconExternalLink, IconTrash } from "./icons";

interface Props {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  canWrite?: boolean;
}

type View = "calendar" | "list" | "accounts";

/**
 * Sosyal Medya modülünün çalışma alanı.
 *
 * Kayıt listesi motorundan (ModuleRecordsPanel) ayrılmasının sebebi bu ekranda
 * görünüyor: sosyal medya yöneticisi işini bir tabloda değil, bir TAKVİMDE
 * yapıyor — "bu hafta ne çıkıyor, hangi kanal boş kalmış" sorusu satır satır
 * okunarak cevaplanmıyor. Üç görünüm var ve üçü de aynı veriyi gösteriyor:
 *
 *   Takvim    ay ızgarası; kart sürüklenerek başka güne taşınır
 *   Liste     durum sütunlu pano; toplu gözden geçirme ve onay için
 *   Hesaplar  kanal kimlikleri: kitle, ton, ritim, sorumlu
 *
 * Veri kendi tablolarında (bkz. 054_social_media.sql), tek istekte gelir.
 */
export default function SocialMediaPanel({ organizationId, departmentId, jobId, canWrite = true }: Props) {
  const c = colors.light;
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("calendar");
  const [cursor, setCursor] = useState(() => new Date());
  const [composer, setComposer] = useState<{ post?: SocialPost | null; date?: string } | null>(null);
  const [accountModal, setAccountModal] = useState<{ account?: SocialAccount | null } | null>(null);
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  // Instagram entegrasyonu bu kurulumda yapılandırılmış mı (ortam değişkenleri).
  // Yapılandırılmamışken bağlama düğmesi hiç gösterilmiyor.
  const [igConfigured, setIgConfigured] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Meta'dan dönüşte gösterilen sonuç şeridi.
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  const scope: SocialScope = useMemo(
    () => (jobId ? { jobId } : { organizationId: organizationId as string, departmentId }),
    [jobId, organizationId, departmentId]
  );

  const load = () => {
    setLoading(true);
    socialMediaApi
      .overview(scope)
      .then((data) => {
        setAccounts(data.accounts);
        setPosts(data.posts);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Veriler yüklenemedi"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [scope]);

  useEffect(() => {
    socialMediaApi
      .instagramStatus()
      .then(({ configured }) => setIgConfigured(configured))
      .catch(() => setIgConfigured(false));
  }, []);

  /**
   * Meta'dan dönüş.
   *
   * Backend kullanıcıyı bu ekrana `?instagram=connected:kullanici` ya da
   * `?instagram=error:mesaj` ile geri gönderiyor. Parametre okunduktan sonra
   * adres çubuğundan siliniyor: sayfa yenilendiğinde eski bir sonuç şeridi
   * tekrar belirmesin.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("instagram");
    if (!value) return;

    const [kind, ...rest] = value.split(":");
    const detail = rest.join(":");
    setBanner(
      kind === "connected"
        ? { kind: "ok", text: `@${detail} hesabı bağlandı. Artık bu hesaba doğrudan yayımlayabilirsiniz.` }
        : { kind: "error", text: detail || "Instagram bağlantısı tamamlanamadı." }
    );
    if (kind === "connected") load();

    params.delete("instagram");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  // Sorumlu seçicisinin listesi. Modül referans alanlarıyla aynı kaynak, ama
  // burada müşteri listesine ihtiyaç yok — yalnızca ekip çekiliyor.
  useEffect(() => {
    const path = jobId ? `/jobs/${jobId}/members` : departmentId ? `/departments/${departmentId}/members` : null;
    if (!path) return;
    let cancelled = false;
    api
      .get<(DepartmentMember | JobMember)[]>(path)
      .then((rows) => {
        if (cancelled) return;
        setMembers(
          rows
            .filter((x: any) => x.userId && (x.status ?? "approved") === "approved")
            .map((x: any) => ({ id: x.userId as string, label: x.fullName ?? x.username ?? x.email ?? "İsimsiz" }))
        );
      })
      .catch(() => setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [jobId, departmentId]);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  /** Filtreler üç görünümde de geçerli — görünüm değiştirince seçim kaybolmasın. */
  const visiblePosts = useMemo(() => {
    return posts.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (platformFilter) {
        const platforms = p.targets.map((t) => accountById.get(t.accountId)?.platform);
        if (!platforms.includes(platformFilter as SocialAccount["platform"])) return false;
      }
      return true;
    });
  }, [posts, statusFilter, platformFilter, accountById]);

  // ============================================================ Göstergeler
  const stats = useMemo(() => {
    const month = cursor.getMonth();
    const year = cursor.getFullYear();
    const inMonth = posts.filter((p) => {
      if (!p.scheduledAt) return false;
      const d = new Date(p.scheduledAt);
      return d.getMonth() === month && d.getFullYear() === year;
    });
    const published = inMonth.filter((p) => p.status === "published").length;
    const waiting = posts.filter((p) => p.status === "ready").length;
    const unscheduled = posts.filter((p) => !p.scheduledAt && p.status !== "published").length;
    return [
      { label: `${MONTH_LABELS[month]} planı`, value: String(inMonth.length) },
      // "Planlanandan kaçı çıktı" sorusu ancak ikisi yan yana durunca okunur.
      { label: "Yayımlandı", value: `${published}/${inMonth.length}` },
      { label: "Onay bekliyor", value: String(waiting) },
      { label: "Tarihsiz fikir", value: String(unscheduled) },
      { label: "Hesap", value: String(accounts.filter((a) => a.active).length) },
    ];
  }, [posts, accounts, cursor]);

  // ============================================================ Eylemler
  const upsertPost = (post: SocialPost) => {
    setPosts((ps) => {
      const exists = ps.some((p) => p.id === post.id);
      return exists ? ps.map((p) => (p.id === post.id ? post : p)) : [...ps, post];
    });
  };

  const archivePost = async (post: SocialPost) => {
    if (!window.confirm(`"${post.title}" arşivlensin mi?`)) return;
    setPosts((ps) => ps.filter((p) => p.id !== post.id));
    await socialMediaApi.archivePost(post.id).catch(() => load());
  };

  /**
   * Instagram bağlama akışını başlatır.
   *
   * Aynı sekmede yönlendiriyoruz (pencere açmak yerine): Meta'nın onay ekranı
   * pop-up engelleyicilere takılıyordu ve mobilde ikinci pencere kayboluyordu.
   * Dönüş adresi olarak bulunduğumuz sayfa taşınıyor.
   */
  const connectInstagram = async () => {
    setConnecting(true);
    setBanner(null);
    try {
      const { configured, url } = await socialMediaApi.instagramConnectUrl(
        scope,
        `${window.location.pathname}${window.location.search}`
      );
      if (!configured || !url) {
        setBanner({ kind: "error", text: "Instagram entegrasyonu bu kurulumda yapılandırılmamış." });
        return;
      }
      window.location.href = url;
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : "Bağlantı başlatılamadı" });
    } finally {
      setConnecting(false);
    }
  };

  const disconnectInstagram = async (account: SocialAccount) => {
    if (!window.confirm(`@${account.handle} bağlantısı kesilsin mi? Hesap kaydı ve geçmiş gönderiler kalır.`)) return;
    try {
      await socialMediaApi.disconnectInstagram(account.id);
      load();
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : "Bağlantı kesilemedi" });
    }
  };

  /**
   * "Şimdi paylaş".
   *
   * Sonuç kanal kanal dönüyor: üç hesaptan biri düştüyse kullanıcı hangisinin
   * çıktığını bilmeli. Bu yüzden mesaj "yayımlandı" değil, sayılarla.
   */
  const publishNow = async (post: SocialPost) => {
    const connected = post.targets.filter((t) => {
      const a = accountById.get(t.accountId);
      return a && canAutoPublish(a);
    });
    if (connected.length === 0) {
      setBanner({ kind: "error", text: "Bu içeriğin kanallarından hiçbiri Instagram'a bağlı değil." });
      return;
    }
    if (!window.confirm(`"${post.title}" şimdi ${connected.length} kanalda yayımlansın mı?`)) return;

    setPublishing(post.id);
    setBanner(null);
    try {
      const { published, failed } = await socialMediaApi.publishPost(post.id);
      setBanner(
        failed === 0
          ? { kind: "ok", text: `${published} kanalda yayımlandı.` }
          : { kind: "error", text: `${published} kanalda yayımlandı, ${failed} kanalda hata var — içeriği açıp sebebini görebilirsiniz.` }
      );
      load();
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : "Yayımlanamadı" });
    } finally {
      setPublishing(null);
    }
  };

  const archiveAccount = async (account: SocialAccount) => {
    if (!window.confirm(`${accountLabel(account)} hesabı arşivlensin mi? Geçmiş gönderiler korunur.`)) return;
    setAccounts((as) => as.filter((a) => a.id !== account.id));
    await socialMediaApi.archiveAccount(account.id).catch(() => load());
  };

  /**
   * Takvimde kartı başka güne bırakma.
   *
   * Saat korunur: içerik 19:00'a planlandıysa gün değişince saat de sıfırlanmamalı.
   * Önce yerel durum güncellenir — kart bırakıldığı yerde kalmalı, isteğin
   * dönmesini bekleyip geri zıplamamalı.
   */
  const moveTo = async (postId: string, day: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const previous = post.scheduledAt ? new Date(post.scheduledAt) : null;
    const next = new Date(`${day}T${previous ? String(previous.getHours()).padStart(2, "0") : "10"}:${previous ? String(previous.getMinutes()).padStart(2, "0") : "00"}`);
    const iso = next.toISOString();
    if (post.scheduledAt === iso) return;
    setPosts((ps) => ps.map((p) => (p.id === postId ? { ...p, scheduledAt: iso } : p)));
    await socialMediaApi.reschedule(postId, iso).catch(() => load());
  };

  // ============================================================ Parçalar
  const statusBadge = (post: SocialPost) => {
    const meta = SOCIAL_STATUS[post.status];
    return (
      <span
        style={{
          fontSize: 10,
          padding: "1px 6px",
          borderRadius: 999,
          background: `${meta.color}1A`,
          color: meta.color,
          whiteSpace: "nowrap",
        }}
      >
        {meta.label}
      </span>
    );
  };

  const channelDots = (post: SocialPost) => (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {post.targets.map((t) => {
        const a = accountById.get(t.accountId);
        if (!a) return null;
        return (
          <span
            key={t.id}
            title={`${accountLabel(a)} · ${SOCIAL_PLATFORMS[a.platform].label}`}
            style={{ width: 7, height: 7, borderRadius: 999, background: accountColor(a) }}
          />
        );
      })}
    </span>
  );

  const postCard = (post: SocialPost, compact: boolean) => (
    <div
      key={post.id}
      draggable={canWrite}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", post.id)}
      onClick={() => setComposer({ post })}
      title={post.caption ?? post.title}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: compact ? "3px 6px" : "6px 8px",
        borderRadius: 6,
        cursor: "pointer",
        background: `${postColor(post, accounts)}14`,
        borderLeft: `3px solid ${postColor(post, accounts)}`,
        fontSize: compact ? 11 : 12,
        color: c.textPrimary,
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 500,
          textDecoration: post.status === "cancelled" ? "line-through" : undefined,
        }}
      >
        {postTime(post) ? `${postTime(post)} · ` : ""}
        {post.title}
      </span>
      {!compact && (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {channelDots(post)}
          {statusBadge(post)}
        </span>
      )}
    </div>
  );

  // ============================================================ Takvim
  const calendar = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const days = monthGrid(year, month);
    const today = localDay(new Date());
    const byDay = new Map<string, SocialPost[]>();
    for (const p of visiblePosts) {
      const day = postDay(p);
      if (!day) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), p]);
    }
    const unscheduled = visiblePosts.filter((p) => !p.scheduledAt);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Önceki ay"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <IconChevronLeft size={16} color={c.textSecondary} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, minWidth: 130, textAlign: "center" }}>
            {MONTH_LABELS[month]} {year}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Sonraki ay"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <IconChevronRight size={16} color={c.textSecondary} />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            Bugün
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1 }}>
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} style={{ fontSize: 11, color: c.textSecondary, padding: "2px 4px" }}>
              {w}
            </div>
          ))}
          {days.map((d) => {
            const day = localDay(d);
            const inMonth = d.getMonth() === month;
            const items = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                onDragOver={(e) => canWrite && e.preventDefault()}
                onDrop={(e) => {
                  if (!canWrite) return;
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) moveTo(id, day);
                }}
                onDoubleClick={() => canWrite && setComposer({ date: day })}
                style={{
                  minHeight: 92,
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  background: inMonth ? c.surface : c.background,
                  border: `1px solid ${day === today ? c.primary : c.border}`,
                  borderRadius: 6,
                  opacity: inMonth ? 1 : 0.55,
                }}
              >
                <span style={{ fontSize: 11, color: day === today ? c.primary : c.textSecondary }}>
                  {d.getDate()}
                </span>
                {items.map((p) => postCard(p, true))}
              </div>
            );
          })}
        </div>

        {/* Tarihsiz içerikler: fikir havuzu. Takvimden ayrı durur ama görünür
            kalır — "sonra planlarım" dediği içerik kaybolmasın. */}
        <div
          onDragOver={(e) => canWrite && e.preventDefault()}
          onDrop={(e) => {
            if (!canWrite) return;
            const id = e.dataTransfer.getData("text/plain");
            if (id) socialMediaApi.reschedule(id, null).then(load).catch(() => load());
          }}
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 8,
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            Tarihsiz fikirler ({unscheduled.length}) — buraya sürükleyerek takvimden çıkarabilirsiniz
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {unscheduled.map((p) => (
              <div key={p.id} style={{ minWidth: 160 }}>
                {postCard(p, false)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Kartın altındaki yayın satırı.
   *
   * Yalnızca söyleyecek bir şey varsa görünür: bağlı bir kanal, bir yayın
   * sonucu ya da bir hata. Her karta sabit bir düğme koymak, elle yönetilen
   * hesaplarda ekranı anlamsız yere doldururdu.
   */
  const publishRow = (post: SocialPost) => {
    const auto = post.targets.filter((t) => {
      const a = accountById.get(t.accountId);
      return a && canAutoPublish(a);
    });
    const failed = post.targets.filter((t) => t.status === "failed");
    const published = post.targets.filter((t) => t.status === "published");
    if (auto.length === 0 && failed.length === 0 && published.length === 0) return null;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingLeft: 6 }}>
        {published.map((t) => {
          const a = accountById.get(t.accountId);
          return t.externalUrl ? (
            <a
              key={t.id}
              href={t.externalUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 10, color: TARGET_STATUS.published.color, display: "flex", alignItems: "center", gap: 3 }}
            >
              {a ? `@${a.handle}` : "Kanal"} yayında
              <IconExternalLink size={10} color={TARGET_STATUS.published.color} />
            </a>
          ) : (
            <span key={t.id} style={{ fontSize: 10, color: TARGET_STATUS.published.color }}>
              {a ? `@${a.handle}` : "Kanal"} yayında
            </span>
          );
        })}

        {failed.map((t) => (
          <span key={t.id} title={t.errorMessage} style={{ fontSize: 10, color: TARGET_STATUS.failed.color }}>
            {accountById.get(t.accountId)?.handle ?? "kanal"}: {t.errorMessage ?? "yayımlanamadı"}
          </span>
        ))}

        {canWrite && auto.some((t) => t.status !== "published") && (
          <button
            onClick={() => publishNow(post)}
            disabled={publishing === post.id}
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              cursor: publishing === post.id ? "default" : "pointer",
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.primary,
            }}
          >
            {publishing === post.id ? "Yayımlanıyor…" : "Şimdi paylaş"}
          </button>
        )}
      </div>
    );
  };

  // ============================================================ Liste (durum panosu)
  const list = () => {
    const columns = STATUS_ORDER.filter(
      (s) => ACTIVE_STATUSES.includes(s) || visiblePosts.some((p) => p.status === s)
    );
    return (
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {columns.map((status) => {
          const items = visiblePosts.filter((p) => p.status === status);
          return (
            <div
              key={status}
              style={{
                minWidth: 200,
                flex: "1 1 200px",
                background: c.background,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: SOCIAL_STATUS[status].color }}>
                  {SOCIAL_STATUS[status].label}
                </span>
                <span style={{ fontSize: 11, color: c.textSecondary }}>{items.length}</span>
              </div>
              {items.map((p) => (
                <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>{postCard(p, false)}</div>
                    {canWrite && (
                      <button
                        onClick={() => archivePost(p)}
                        aria-label="Arşivle"
                        title="Arşivle"
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
                      >
                        <IconTrash size={12} color={c.textSecondary} />
                      </button>
                    )}
                  </div>
                  {publishRow(p)}
                </div>
              ))}
              {items.length === 0 && <span style={{ fontSize: 11, color: c.textSecondary }}>—</span>}
            </div>
          );
        })}
      </div>
    );
  };

  // ============================================================ Hesaplar
  const accountList = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
      {accounts.length === 0 && (
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          Henüz hesap eklenmedi. İçerik planlamadan önce en az bir kanal ekleyin.
        </span>
      )}

      {/* Bağlama daveti yalnızca entegrasyon yapılandırılmışsa ve henüz bağlı
          bir Instagram hesabı yokken görünür. */}
      {igConfigured && canWrite && !accounts.some((a) => a.connectionStatus === "connected") && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "10px 12px",
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            background: c.background,
          }}
        >
          <span style={{ fontSize: 13, color: c.textPrimary, flex: "1 1 260px", lineHeight: 1.5 }}>
            Instagram hesabınızı bağlayın — planladığınız içerikler saati gelince kendiliğinden yayımlansın.
            <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>
              Instagram'ın profesyonel (işletme/içerik üretici) hesabı gerekiyor.
            </span>
          </span>
          <button
            onClick={connectInstagram}
            disabled={connecting}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              background: SOCIAL_PLATFORMS.instagram.color,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: connecting ? "default" : "pointer",
              opacity: connecting ? 0.6 : 1,
            }}
          >
            {connecting ? "Yönlendiriliyor…" : "Instagram'ı bağla"}
          </button>
        </div>
      )}
      {accounts.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 12px",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            opacity: a.active ? 1 : 0.6,
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: `${accountColor(a)}22`,
              color: accountColor(a),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {SOCIAL_PLATFORMS[a.platform].label.slice(0, 2)}
          </span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: c.textPrimary }}>{accountLabel(a)}</span>
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                @{a.handle} · {SOCIAL_PLATFORMS[a.platform].label}
              </span>
              {!a.active && <span style={{ fontSize: 11, color: c.textSecondary }}>· pasif</span>}
              {a.profileUrl && (
                <a href={a.profileUrl} target="_blank" rel="noreferrer" style={{ display: "flex" }}>
                  <IconExternalLink size={12} color={c.textSecondary} />
                </a>
              )}
            </div>
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {[
                a.followerCount !== undefined ? `${a.followerCount.toLocaleString("tr-TR")} takipçi` : null,
                a.postingFrequency,
                a.ownerName ? `Sorumlu: ${a.ownerName}` : null,
                `${posts.filter((p) => p.targets.some((t) => t.accountId === a.id)).length} içerik`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {(a.audienceNote || a.toneNote) && (
              <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>
                {a.audienceNote && <>Kitle: {a.audienceNote}. </>}
                {a.toneNote && <>Ton: {a.toneNote}</>}
              </span>
            )}

            {/* Bağlantı durumu. "Elle yönetiliyor" bir arıza değil, geçerli bir
                çalışma biçimi — bu yüzden nötr renkte. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <span
                title={CONNECTION_STATUS[a.connectionStatus].hint}
                style={{
                  fontSize: 10,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: `${CONNECTION_STATUS[a.connectionStatus].color}1A`,
                  color: CONNECTION_STATUS[a.connectionStatus].color,
                }}
              >
                {CONNECTION_STATUS[a.connectionStatus].label}
              </span>

              {a.connectionError && (
                <span style={{ fontSize: 11, color: c.danger }}>{a.connectionError}</span>
              )}

              {canWrite && igConfigured && a.platform === "instagram" && (
                <button
                  onClick={() => (a.connectionStatus === "connected" ? disconnectInstagram(a) : connectInstagram())}
                  style={{
                    fontSize: 11,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: a.connectionStatus === "connected" ? c.textSecondary : c.primary,
                  }}
                >
                  {a.connectionStatus === "connected" ? "Bağlantıyı kes" : "Instagram'a bağla"}
                </button>
              )}
            </div>
          </div>
          {canWrite && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => setAccountModal({ account: a })}
                aria-label="Hesabı düzenle"
                title="Düzenle"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
              >
                <IconEdit size={14} color={c.textSecondary} />
              </button>
              <button
                onClick={() => archiveAccount(a)}
                aria-label="Hesabı arşivle"
                title="Arşivle"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
              >
                <IconTrash size={14} color={c.textSecondary} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // ============================================================ Yerleşim
  const tab = (value: View, text: string) => (
    <button
      key={value}
      onClick={() => setView(value)}
      style={{
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 6,
        cursor: "pointer",
        border: `1px solid ${view === value ? c.primary : c.border}`,
        background: view === value ? `${c.primary}18` : "transparent",
        color: view === value ? c.primary : c.textSecondary,
      }}
    >
      {text}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h5 style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Sosyal Medya</h5>
        {canWrite ? (
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setAccountModal({})}
              style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              + Hesap ekle
            </button>
            <button
              onClick={() => setComposer({})}
              style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              + İçerik ekle
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: c.textSecondary }}>Salt görüntüleme</span>
        )}
      </div>

      {!loading && (posts.length > 0 || accounts.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "6px 12px",
                borderRadius: 8,
                background: c.background,
                border: `1px solid ${c.border}`,
                minWidth: 92,
              }}
            >
              <span style={{ fontSize: 11, color: c.textSecondary }}>{s.label}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {tab("calendar", "Takvim")}
        {tab("list", "Akış")}
        {tab("accounts", `Hesaplar · ${accounts.length}`)}

        {view !== "accounts" && (
          <>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              style={{ fontSize: 12, padding: "4px 6px", marginLeft: "auto" }}
            >
              <option value="">Tüm kanallar</option>
              {Array.from(new Set(accounts.map((a) => a.platform))).map((p) => (
                <option key={p} value={p}>
                  {SOCIAL_PLATFORMS[p].label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: 12, padding: "4px 6px" }}
            >
              <option value="">Tüm durumlar</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SOCIAL_STATUS[s].label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {banner && (
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
            onClick={() => setBanner(null)}
            aria-label="Kapat"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
          >
            ×
          </button>
        </div>
      )}

      {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}

      {loading ? (
        <span style={{ fontSize: 13, color: c.textSecondary }}>Yükleniyor…</span>
      ) : accounts.length === 0 && posts.length === 0 ? (
        // Boş kutu yerine ilk adımı söylüyoruz: kanal olmadan içerik planlamak
        // anlamsız, kullanıcı ekrana bakıp nereden başlayacağını aramasın.
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 520,
          }}
        >
          <span style={{ fontSize: 14, color: c.textPrimary }}>Kanallarınızı ekleyerek başlayın</span>
          <span style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
            Her hesabın kitlesi, tonu ve yayın ritmi kayıtlı olur; içerik yazarken karakter sınırı ve kanal
            listesi buradan gelir. Sonra takvime içerik ekleyip görsellerini yükleyebilirsiniz.
          </span>
          {canWrite && (
            <button
              onClick={() => setAccountModal({})}
              style={{
                alignSelf: "flex-start",
                fontSize: 13,
                padding: "6px 14px",
                background: c.primary,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Hesap ekle
            </button>
          )}
        </div>
      ) : view === "calendar" ? (
        calendar()
      ) : view === "list" ? (
        list()
      ) : (
        accountList()
      )}

      {composer && (
        <SocialPostComposer
          scope={scope}
          accounts={accounts}
          post={composer.post}
          defaultDate={composer.date}
          members={members}
          onClose={() => setComposer(null)}
          onSaved={upsertPost}
        />
      )}

      {accountModal && (
        <SocialAccountModal
          scope={scope}
          account={accountModal.account}
          members={members}
          onClose={() => setAccountModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
