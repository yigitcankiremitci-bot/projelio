import { useEffect, useMemo, useState } from "react";
import type { DepartmentMember, JobMember, SocialAccount, SocialPost, SocialPostStatus } from "@projelio/shared";
import { safeExternalUrl } from "@projelio/shared";
import { api } from "../api/client";
import { socialMediaApi, type SocialScope } from "../api/socialMedia";
import { filesApi } from "../api/files";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
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
import { parseServerDate } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import SocialAccountModal from "./SocialAccountModal";
import SocialCredentialsModal from "./SocialCredentialsModal";
import SocialPostComposer from "./SocialPostComposer";
import { IconChevronLeft, IconChevronRight, IconEdit, IconExternalLink, IconTrash } from "./icons";
import { useDragScroll } from "../lib/useDragScroll";

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
  const c = useThemeColors();
  const t = useT();
  const havuzScrollRef = useDragScroll<HTMLDivElement>();
  const panoScrollRef = useDragScroll<HTMLDivElement>();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("calendar");
  const [cursor, setCursor] = useState(() => new Date());
  const [composer, setComposer] = useState<{ post?: SocialPost | null; date?: string } | null>(null);
  const [accountModal, setAccountModal] = useState<{ account?: SocialAccount | null } | null>(null);
  // Giriş bilgileri ayrı bir modalde: şifre hesap formunun bir alanı DEĞİL.
  // Hesabı düzenleyen herkes şifreyi görmüyor (bkz. SocialCredentialsModal).
  const [credentialsFor, setCredentialsFor] = useState<SocialAccount | null>(null);
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

  // İki ekleme eylemi de sayfanın "+" düğmesinde toplanıyor: başlıkta iki ayrı
  // düğme dururken kullanıcı hangisinin "asıl" ekleme olduğunu ayırt edemiyordu.
  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    canWrite && fabAvailable
      ? {
          label: t("Ekle"),
          options: [
            { label: t("İçerik ekle"), onClick: () => setComposer({}) },
            { label: t("Hesap ekle"), onClick: () => setAccountModal({}) },
          ],
        }
      : null,
    [canWrite, fabAvailable, scope],
    FAB_PRIORITY.panel
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
      .catch((err) => setError(err instanceof Error ? err.message : t("Veriler yüklenemedi")))
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
        ? {
            kind: "ok",
            text: t("@{hesap} hesabı bağlandı. Artık bu hesaba doğrudan yayımlayabilirsiniz.", { hesap: detail }),
          }
        : { kind: "error", text: detail || t("Instagram bağlantısı tamamlanamadı.") }
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
            .map((x: any) => ({
              id: x.userId as string,
              label: x.fullName ?? x.username ?? x.email ?? t("İsimsiz"),
            }))
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
        const platforms = p.targets.map((hedef) => accountById.get(hedef.accountId)?.platform);
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
      const d = parseServerDate(p.scheduledAt);
      return d.getMonth() === month && d.getFullYear() === year;
    });
    const published = inMonth.filter((p) => p.status === "published").length;
    const waiting = posts.filter((p) => p.status === "ready").length;
    const unscheduled = posts.filter((p) => !p.scheduledAt && p.status !== "published").length;
    return [
      { label: t("{ay} planı", { ay: t(MONTH_LABELS[month]) }), value: String(inMonth.length) },
      // "Planlanandan kaçı çıktı" sorusu ancak ikisi yan yana durunca okunur.
      { label: t("Yayımlandı"), value: `${published}/${inMonth.length}` },
      { label: t("Onay bekliyor"), value: String(waiting) },
      { label: t("Tarihsiz fikir"), value: String(unscheduled) },
      { label: t("Hesap"), value: String(accounts.filter((a) => a.active).length) },
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
    if (
      !window.confirm(
        t('"{ad}" kaldırılsın mı? Kayıt arşivlenir, gerekirse geri alınabilir.', { ad: post.title })
      )
    )
      return;
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
        setBanner({ kind: "error", text: t("Instagram entegrasyonu bu kurulumda yapılandırılmamış.") });
        return;
      }
      window.location.href = url;
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : t("Bağlantı başlatılamadı") });
    } finally {
      setConnecting(false);
    }
  };

  const disconnectInstagram = async (account: SocialAccount) => {
    if (
      !window.confirm(
        t("@{hesap} bağlantısı kesilsin mi? Hesap kaydı ve geçmiş gönderiler kalır.", { hesap: account.handle })
      )
    )
      return;
    try {
      await socialMediaApi.disconnectInstagram(account.id);
      load();
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : t("Bağlantı kesilemedi") });
    }
  };

  /**
   * "Şimdi paylaş".
   *
   * Sonuç kanal kanal dönüyor: üç hesaptan biri düştüyse kullanıcı hangisinin
   * çıktığını bilmeli. Bu yüzden mesaj "yayımlandı" değil, sayılarla.
   */
  const publishNow = async (post: SocialPost) => {
    const connected = post.targets.filter((hedef) => {
      const a = accountById.get(hedef.accountId);
      return a && canAutoPublish(a);
    });
    if (connected.length === 0) {
      setBanner({ kind: "error", text: t("Bu içeriğin kanallarından hiçbiri Instagram'a bağlı değil.") });
      return;
    }
    if (
      !window.confirm(
        t('"{ad}" şimdi {n} kanalda yayımlansın mı?', { ad: post.title, n: connected.length })
      )
    )
      return;

    setPublishing(post.id);
    setBanner(null);
    try {
      const { published, failed } = await socialMediaApi.publishPost(post.id);
      setBanner(
        failed === 0
          ? { kind: "ok", text: t("{n} kanalda yayımlandı.", { n: published }) }
          : {
              kind: "error",
              text: t("{n} kanalda yayımlandı, {hata} kanalda hata var — içeriği açıp sebebini görebilirsiniz.", {
                n: published,
                hata: failed,
              }),
            }
      );
      load();
    } catch (err) {
      setBanner({ kind: "error", text: err instanceof Error ? err.message : t("Yayımlanamadı") });
    } finally {
      setPublishing(null);
    }
  };

  const archiveAccount = async (account: SocialAccount) => {
    if (
      !window.confirm(
        t("{hesap} hesabı arşivlensin mi? Geçmiş gönderiler korunur.", { hesap: accountLabel(account) })
      )
    )
      return;
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
    // Sunucudan gelen damga dilimsiz geliyor: düz new Date saati 3 saat geriye
    // kaydırır ve kart başka güne sürüklenince o yanlış saat kaydedilirdi
    // (bkz. lib/socialMedia.ts'teki tarih notu).
    const previous = post.scheduledAt ? parseServerDate(post.scheduledAt) : null;
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
        {t(meta.label)}
      </span>
    );
  };

  const channelDots = (post: SocialPost) => (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {post.targets.map((hedef) => {
        const a = accountById.get(hedef.accountId);
        if (!a) return null;
        return (
          <span
            key={hedef.id}
            title={`${accountLabel(a)} · ${t(SOCIAL_PLATFORMS[a.platform].label)}`}
            style={{ width: 7, height: 7, borderRadius: 999, background: accountColor(a) }}
          />
        );
      })}
    </span>
  );

  /**
   * Kart üzerindeki küçük medya önizlemesi.
   *
   * NEDEN: içerikte görsel/video olup olmadığı yalnızca pencere açılınca
   * görünüyordu; "bu içerik hazır mı" sorusunu cevaplamak için her kartı tek tek
   * açmak gerekiyordu. Kapak görseli kartta durursa cevap bakışta veriliyor.
   *
   * YALNIZCA KAPAK (ilk medya) çekiliyor. Her görselin imzalı adresi ayrı bir
   * istek demek (bkz. filesApi.contentUrl); bir aylık takvimde 40 içerik varsa
   * hepsinin tüm görsellerini istemek onlarca gereksiz çağrı olurdu. Kapak,
   * "içinde ne var" sorusuna zaten yetiyor.
   */
  const kapakMedya = (post: SocialPost) => (post.media ?? [])[0];

  const [kapakAdresleri, setKapakAdresleri] = useState<Record<string, string>>({});

  useEffect(() => {
    let iptal = false;
    const gorseller = posts
      .map(kapakMedya)
      .filter((m): m is NonNullable<typeof m> => !!m && (m.mimeType ?? "").startsWith("image/"))
      // Zaten çekilmiş adresi tekrar isteme: panel her tazelendiğinde (oda
      // sinyali, sürükleme) bu efekt yeniden koşuyor.
      .filter((m) => !kapakAdresleri[m.fileId]);
    if (gorseller.length === 0) return;

    Promise.all(
      gorseller.map(async (m) => {
        try {
          return [m.fileId, await filesApi.contentUrl(m.fileId)] as const;
        } catch {
          // Dosya Drive'dan silinmiş ya da erişim yok: kart yazısız kutuyla
          // devam etsin, panel hata vermesin.
          return null;
        }
      })
    ).then((ciftler) => {
      if (iptal) return;
      const yeni = Object.fromEntries(ciftler.filter(Boolean) as (readonly [string, string])[]);
      if (Object.keys(yeni).length) setKapakAdresleri((o) => ({ ...o, ...yeni }));
    });

    return () => {
      iptal = true;
    };
  }, [posts]);

  /** Kartın solundaki kare önizleme. Medyası olmayan içerikte hiç çizilmez. */
  const kapakKutusu = (post: SocialPost, compact: boolean) => {
    const medya = kapakMedya(post);
    if (!medya) return null;
    const boy = compact ? 18 : 30;
    const adres = kapakAdresleri[medya.fileId];
    const video = (medya.mimeType ?? "").startsWith("video/");
    const adet = (post.media ?? []).length;
    return (
      <span
        title={adet > 1 ? t("{n} medya", { n: adet }) : (medya.name ?? t("medya"))}
        style={{
          position: "relative",
          flexShrink: 0,
          width: boy,
          height: boy,
          borderRadius: 4,
          overflow: "hidden",
          background: "#0000000F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? 9 : 11,
          color: c.textSecondary,
        }}
      >
        {adres ? (
          <img src={adres} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          // Video'nun karesi yok, görselin adresi de henüz gelmemiş olabilir.
          // İkisinde de kutu YİNE çizilir: "medya var" bilgisi tek başına değerli.
          <span>{video ? "▶" : "🖼"}</span>
        )}
        {/* Birden fazla medya varsa sayısı köşede: kapak tek başına yanıltmasın. */}
        {adet > 1 && (
          <span
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              padding: "0 3px",
              borderTopLeftRadius: 4,
              background: "rgba(26,31,41,0.72)",
              color: "#fff",
              fontSize: compact ? 8 : 9,
              lineHeight: 1.4,
            }}
          >
            {adet}
          </span>
        )}
      </span>
    );
  };

  const postCard = (post: SocialPost, compact: boolean) => (
    <div
      key={post.id}
      draggable={canWrite}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", post.id)}
      onClick={() => setComposer({ post })}
      title={post.caption ?? post.title}
      style={{
        display: "flex",
        alignItems: compact ? "center" : "flex-start",
        gap: 6,
        padding: compact ? "3px 6px" : "6px 8px",
        borderRadius: 6,
        cursor: "pointer",
        background: `${postColor(post, accounts)}14`,
        borderLeft: `3px solid ${postColor(post, accounts)}`,
        fontSize: compact ? 11 : 12,
        color: c.textPrimary,
      }}
    >
      {kapakKutusu(post, compact)}
      {/* minWidth: 0 — yazı sütununun taşmak yerine kısalması için (flex
          çocuğu varsayılan olarak içeriğinden küçülmüyor). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
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
    </div>
  );

  /**
   * Fikir havuzunun sütunları — takvime girmeden önceki hazırlık yolu.
   *
   * Etiketler uydurulmadı, modülün KENDİ durum sözlüğünden geliyor
   * (bkz. lib/socialMedia.ts SOCIAL_STATUS): aynı içerik listede ve takvimde de
   * durumuyla etiketleniyor, havuzda başka bir ad taşısaydı tek bir durum için
   * iki sözcük dolaşırdı.
   *
   * "Diğer" sütunu yalnızca DOLUYSA çizilir. Onaylanmış ama tarihi olmayan bir
   * içerik üç sütuna da girmiyor; sütun olmasaydı kart ekrandan kaybolurdu —
   * kullanıcı onu sildiğimizi sanardı.
   */
  const HAVUZ_STATUSLERI: SocialPostStatus[] = ["idea", "draft", "ready"];

  const havuzSutunlari: {
    anahtar: string;
    baslik: string;
    renk: string;
    status: SocialPostStatus | null;
    tutar: (s: SocialPostStatus) => boolean;
  }[] = [
    ...HAVUZ_STATUSLERI.map((status) => ({
      anahtar: status,
      baslik: t(SOCIAL_STATUS[status].label),
      renk: SOCIAL_STATUS[status].color,
      status,
      tutar: (s: SocialPostStatus) => s === status,
    })),
    ...(visiblePosts.some((p) => !p.scheduledAt && !HAVUZ_STATUSLERI.includes(p.status))
      ? [
          {
            anahtar: "diger",
            baslik: t("Diğer"),
            renk: c.textSecondary,
            // Bırakılamaz: "Diğer" bir aşama değil, artakalanların yeri.
            status: null,
            tutar: (s: SocialPostStatus) => !HAVUZ_STATUSLERI.includes(s),
          },
        ]
      : []),
  ];

  /**
   * Kartı havuzun bir sütununa bırakmak: durumu değiştirir VE tarihi kaldırır.
   *
   * İkisi tek istekte gidiyor; takvimden sürüklenen bir kart için "önce tarihi
   * sil, sonra durumu değiştir" iki ayrı yazma demekti ve ilki başarılıp
   * ikincisi düşerse içerik yarım bir durumda kalırdı.
   */
  const havuzaTasi = async (postId: string, status: SocialPostStatus | null) => {
    if (!status) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.status === status && !post.scheduledAt) return;
    setPosts((ps) => ps.map((p) => (p.id === postId ? { ...p, status, scheduledAt: undefined } : p)));
    try {
      upsertPost(await socialMediaApi.updatePost(postId, { status, scheduledAt: null }));
    } catch {
      load();
    }
  };

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
            aria-label={t("Önceki ay")}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <IconChevronLeft size={16} color={c.textSecondary} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, minWidth: 130, textAlign: "center" }}>
            {t(MONTH_LABELS[month])} {year}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label={t("Sonraki ay")}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <IconChevronRight size={16} color={c.textSecondary} />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {t("Bugün")}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1 }}>
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} style={{ fontSize: 11, color: c.textSecondary, padding: "2px 4px" }}>
              {t(w)}
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

        {/* Fikir havuzu: tarihi olmayan içerikler.
            Eskiden tek bir yığındı ve "burada bekliyor" demekten başka bir şey
            söylemiyordu; hangi içeriğin yazılmayı beklediği, hangisinin
            gönderilmeye hazır olduğu ancak kartlar tek tek açılarak
            anlaşılıyordu. Artık hazırlık aşamasına göre üç sütun — takvime
            girmeden önceki yol. */}
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 8,
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            {t(
              "Fikir havuzu ({n}) — takvimden buraya sürükleyerek tarihi kaldırır, sütunlar arasında sürükleyerek durumunu değiştirirsin",
              { n: unscheduled.length }
            )}
          </span>
          <div ref={havuzScrollRef} style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {havuzSutunlari.map((sutun) => {
              const items = unscheduled.filter((p) => sutun.tutar(p.status));
              return (
                <div
                  key={sutun.anahtar}
                  onDragOver={(e) => canWrite && e.preventDefault()}
                  onDrop={(e) => {
                    if (!canWrite) return;
                    e.stopPropagation();
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) havuzaTasi(id, sutun.status);
                  }}
                  style={{
                    minWidth: 190,
                    flex: "1 1 190px",
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
                    <span style={{ fontSize: 12, fontWeight: 500, color: sutun.renk }}>{sutun.baslik}</span>
                    <span style={{ fontSize: 11, color: c.textSecondary }}>{items.length}</span>
                  </div>
                  {items.length === 0 && (
                    <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Buraya sürükle")}</span>
                  )}
                  {items.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>{postCard(p, false)}</div>
                      {canWrite && (
                        <button
                          onClick={() => archivePost(p)}
                          aria-label={t("Kaldır")}
                          title={t("Kaldır")}
                          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
                        >
                          <IconTrash size={12} color={c.textSecondary} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
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
    const auto = post.targets.filter((hedef) => {
      const a = accountById.get(hedef.accountId);
      return a && canAutoPublish(a);
    });
    const failed = post.targets.filter((hedef) => hedef.status === "failed");
    const published = post.targets.filter((hedef) => hedef.status === "published");
    if (auto.length === 0 && failed.length === 0 && published.length === 0) return null;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingLeft: 6 }}>
        {published.map((hedef) => {
          const a = accountById.get(hedef.accountId);
          const etiket = t("{kanal} yayında", { kanal: a ? `@${a.handle}` : t("Kanal") });
          return hedef.externalUrl ? (
            <a
              key={hedef.id}
              href={safeExternalUrl(hedef.externalUrl) ?? undefined}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 10, color: TARGET_STATUS.published.color, display: "flex", alignItems: "center", gap: 3 }}
            >
              {etiket}
              <IconExternalLink size={10} color={TARGET_STATUS.published.color} />
            </a>
          ) : (
            <span key={hedef.id} style={{ fontSize: 10, color: TARGET_STATUS.published.color }}>
              {etiket}
            </span>
          );
        })}

        {failed.map((hedef) => (
          <span
            key={hedef.id}
            title={hedef.errorMessage}
            style={{ fontSize: 10, color: TARGET_STATUS.failed.color }}
          >
            {accountById.get(hedef.accountId)?.handle ?? t("kanal")}:{" "}
            {hedef.errorMessage ?? t("yayımlanamadı")}
          </span>
        ))}

        {canWrite && auto.some((hedef) => hedef.status !== "published") && (
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
            {publishing === post.id ? t("Yayımlanıyor…") : t("Şimdi paylaş")}
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
      <div ref={panoScrollRef} style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
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
                  {t(SOCIAL_STATUS[status].label)}
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
                        aria-label={t("Arşivle")}
                        title={t("Arşivle")}
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
          {t("Henüz hesap eklenmedi. İçerik planlamadan önce en az bir kanal ekleyin.")}
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
            {t("Instagram hesabınızı bağlayın — planladığınız içerikler saati gelince kendiliğinden yayımlansın.")}
            <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>
              {t("Instagram'ın profesyonel (işletme/içerik üretici) hesabı gerekiyor.")}
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
            {connecting ? t("Yönlendiriliyor…") : t("Instagram'ı bağla")}
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
            {t(SOCIAL_PLATFORMS[a.platform].label).slice(0, 2)}
          </span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: c.textPrimary }}>{accountLabel(a)}</span>
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                @{a.handle} · {t(SOCIAL_PLATFORMS[a.platform].label)}
              </span>
              {!a.active && (
                <span style={{ fontSize: 11, color: c.textSecondary }}>· {t("pasif")}</span>
              )}
              {a.profileUrl && (
                <a href={safeExternalUrl(a.profileUrl) ?? undefined} target="_blank" rel="noreferrer" style={{ display: "flex" }}>
                  <IconExternalLink size={12} color={c.textSecondary} />
                </a>
              )}
            </div>
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {[
                a.followerCount !== undefined
                  ? t("{n} takipçi", { n: a.followerCount.toLocaleString("tr-TR") })
                  : null,
                a.postingFrequency,
                a.ownerName ? t("Sorumlu: {kisi}", { kisi: a.ownerName }) : null,
                t("{n} içerik", {
                  n: posts.filter((p) => p.targets.some((hedef) => hedef.accountId === a.id)).length,
                }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {(a.audienceNote || a.toneNote) && (
              <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>
                {a.audienceNote && <>{t("Kitle: {not}.", { not: a.audienceNote })} </>}
                {a.toneNote && <>{t("Ton: {not}", { not: a.toneNote })}</>}
              </span>
            )}

            {/* Bağlantı durumu. "Elle yönetiliyor" bir arıza değil, geçerli bir
                çalışma biçimi — bu yüzden nötr renkte. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <span
                title={t(CONNECTION_STATUS[a.connectionStatus].hint)}
                style={{
                  fontSize: 10,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: `${CONNECTION_STATUS[a.connectionStatus].color}1A`,
                  color: CONNECTION_STATUS[a.connectionStatus].color,
                }}
              >
                {t(CONNECTION_STATUS[a.connectionStatus].label)}
              </span>

              {a.connectionError && (
                <span style={{ fontSize: 11, color: c.danger }}>{a.connectionError}</span>
              )}

              {/* Şifreler herkese görünür bir düğme ama içerik yetkiye bağlı:
                  modülü okuyabilen "kayıt var mı" görür, şifreyi yalnızca
                  yönetici, giren kişi ve izinliler açabilir. */}
              <button
                onClick={() => setCredentialsFor(a)}
                style={{
                  fontSize: 11,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: c.textSecondary,
                }}
              >
                {t("Giriş bilgileri")}
              </button>

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
                  {a.connectionStatus === "connected" ? t("Bağlantıyı kes") : t("Instagram'a bağla")}
                </button>
              )}
            </div>
          </div>
          {canWrite && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => setAccountModal({ account: a })}
                aria-label={t("Hesabı düzenle")}
                title={t("Düzenle")}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
              >
                <IconEdit size={14} color={c.textSecondary} />
              </button>
              <button
                onClick={() => archiveAccount(a)}
                aria-label={t("Hesabı arşivle")}
                title={t("Arşivle")}
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
        <h5 style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Sosyal Medya")}</h5>
        {!canWrite ? (
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Salt görüntüleme")}</span>
        ) : (
          // Satır içi düğmeler yalnızca "+"ın ulaşılamadığı yerde (modal içi).
          !fabAvailable && (
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setAccountModal({})}
                style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
              >
                + {t("Hesap ekle")}
              </button>
              <button
                onClick={() => setComposer({})}
                style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
              >
                + {t("İçerik ekle")}
              </button>
            </div>
          )
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
        {tab("calendar", t("Takvim"))}
        {tab("list", t("Akış"))}
        {tab("accounts", `${t("Hesaplar")} · ${accounts.length}`)}

        {view !== "accounts" && (
          <>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              style={{ fontSize: 12, padding: "4px 6px", marginLeft: "auto" }}
            >
              <option value="">{t("Tüm kanallar")}</option>
              {Array.from(new Set(accounts.map((a) => a.platform))).map((p) => (
                <option key={p} value={p}>
                  {t(SOCIAL_PLATFORMS[p].label)}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: 12, padding: "4px 6px" }}
            >
              <option value="">{t("Tüm durumlar")}</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {t(SOCIAL_STATUS[s].label)}
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
            aria-label={t("Kapat")}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
          >
            ×
          </button>
        </div>
      )}

      {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}

      {loading ? (
        <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>
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
          <span style={{ fontSize: 14, color: c.textPrimary }}>{t("Kanallarınızı ekleyerek başlayın")}</span>
          <span style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
            {t(
              "Her hesabın kitlesi, tonu ve yayın ritmi kayıtlı olur; içerik yazarken karakter sınırı ve kanal listesi buradan gelir. Sonra takvime içerik ekleyip görsellerini yükleyebilirsiniz."
            )}
          </span>
          {canWrite &&
            (fabAvailable ? (
              <span style={{ fontSize: 13, color: c.textSecondary }}>
                {t('Hesap eklemek için sayfadaki "+" düğmesini kullan.')}
              </span>
            ) : (
              <button
                onClick={() => setAccountModal({})}
                style={{
                  alignSelf: "flex-start",
                  fontSize: 13,
                  padding: "6px 14px",
                  background: c.primary,
                  color: c.onPrimary,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {t("Hesap ekle")}
              </button>
            ))}
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
          onDeleted={(postId) => setPosts((ps) => ps.filter((p) => p.id !== postId))}
        />
      )}

      {credentialsFor && (
        <SocialCredentialsModal
          scope={scope}
          account={credentialsFor}
          onClose={() => setCredentialsFor(null)}
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
