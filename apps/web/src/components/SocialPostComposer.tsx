import { useEffect, useMemo, useRef, useState } from "react";
import type { SocialAccount, SocialContentType, SocialPost, SocialPostStatus } from "@projelio/shared";
import { filesApi, uploadFile } from "../api/files";
import { socialMediaApi, type SocialPostInput, type SocialScope } from "../api/socialMedia";
import {
  CONTENT_TYPES,
  CONTENT_TYPE_ORDER,
  SOCIAL_PLATFORMS,
  SOCIAL_STATUS,
  STATUS_ORDER,
  TARGET_STATUS,
  accountColor,
  accountLabel,
  canAutoPublish,
  captionLength,
  fromDateTimeLocal,
  hashtagCount,
  tightestLimit,
  toDateTimeLocal,
} from "../lib/socialMedia";
import { colors } from "../theme/colors";
import Modal from "./Modal";
import { IconExternalLink, IconTrash, IconUpload } from "./icons";

interface Props {
  scope: SocialScope;
  accounts: SocialAccount[];
  /** Boşsa yeni içerik. */
  post?: SocialPost | null;
  /** Takvimde boş güne tıklandıysa o gün ön dolu gelir. */
  defaultDate?: string;
  members: { id: string; label: string }[];
  onClose: () => void;
  onSaved: (post: SocialPost) => void;
}

interface FormState {
  title: string;
  caption: string;
  hashtags: string;
  firstComment: string;
  linkUrl: string;
  contentType: SocialContentType;
  campaign: string;
  status: SocialPostStatus;
  scheduledAt: string;
  assigneeId: string;
}

function initialForm(post: SocialPost | null | undefined, defaultDate?: string): FormState {
  return {
    title: post?.title ?? "",
    caption: post?.caption ?? "",
    hashtags: post?.hashtags ?? "",
    firstComment: post?.firstComment ?? "",
    linkUrl: post?.linkUrl ?? "",
    contentType: post?.contentType ?? "image",
    campaign: post?.campaign ?? "",
    status: post?.status ?? "draft",
    // Takvimden açıldıysa gün belli, saat için makul bir varsayılan: 10:00.
    scheduledAt: post ? toDateTimeLocal(post.scheduledAt) : defaultDate ? `${defaultDate}T10:00` : "",
    assigneeId: post?.assigneeId ?? "",
  };
}

/**
 * İçerik composer'ı.
 *
 * Sosyal medya yöneticisinin bir içeriği hazırlarken ihtiyaç duyduğu her şey
 * tek ekranda: hangi hesaplara gideceği, yayımlanacak metin, etiketler, ilk
 * yorum, bağlantı, görsel/video ve yayın anı.
 *
 * İki karar burada görünür hale geliyor:
 *
 *  1. **Kanala özel metin.** Aynı içerik LinkedIn'de uzun, X'te kısa olur.
 *     Ortak metin varsayılan, hesap başına ezme isteğe bağlı — çoğu içerik
 *     tek metinle gittiği için ezme alanları katlanmış duruyor.
 *  2. **Medya için önce kayıt.** Dosya bir gönderiye bağlanır; gönderi henüz
 *     yoksa yükleme anında taslak olarak açılır. Alternatifi (dosyayı geçici
 *     bir yere koyup kaydederken taşımak) yarım kalan yüklemelerde sahipsiz
 *     dosya bırakıyordu.
 */
export default function SocialPostComposer({
  scope,
  accounts,
  post,
  defaultDate,
  members,
  onClose,
  onSaved,
}: Props) {
  const c = colors.light;
  const [form, setForm] = useState<FormState>(() => initialForm(post, defaultDate));
  const [selected, setSelected] = useState<string[]>(() => (post?.targets ?? []).map((t) => t.accountId));
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries((post?.targets ?? []).filter((t) => t.captionOverride).map((t) => [t.accountId, t.captionOverride as string]))
  );
  const [openOverride, setOpenOverride] = useState<string | null>(null);
  // Kaydedilmiş gönderi: yeni içerikte medya yüklenince burada doğar.
  const [saved, setSaved] = useState<SocialPost | null>(post ?? null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const activeAccounts = useMemo(() => accounts.filter((a) => a.active || selected.includes(a.id)), [accounts, selected]);
  const selectedPlatforms = useMemo(
    () => accounts.filter((a) => selected.includes(a.id)).map((a) => a.platform),
    [accounts, selected]
  );
  const limit = tightestLimit(selectedPlatforms);
  const length = captionLength(form.caption, form.hashtags);
  const overLimit = limit !== undefined && length > limit;

  /**
   * Medya yüklemesinin hedefi.
   *
   * Dosyalar Projelio'nun mevcut dosya altyapısına gider: iş ya da departman
   * klasörüne. Organizasyon geneline etkinleştirilmiş (departmansız) bir
   * modülde yükleme hedefi yok — o durumda yükleme kapalı ve sebebi yazılı.
   */
  const uploadTarget = useMemo(() => {
    if ("jobId" in scope) return { jobId: scope.jobId };
    return scope.departmentId ? { departmentId: scope.departmentId } : null;
  }, [scope]);

  // Görsel önizlemeleri imzalı adres ister (<img> Authorization başlığı
  // gönderemez); her medya için bir kez alınır.
  useEffect(() => {
    let cancelled = false;
    const media = saved?.media ?? [];
    const images = media.filter((m) => (m.mimeType ?? "").startsWith("image/"));
    Promise.all(
      images.map(async (m) => {
        try {
          return [m.fileId, await filesApi.contentUrl(m.fileId)] as const;
        } catch {
          return null;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      setPreviews(Object.fromEntries(pairs.filter(Boolean) as (readonly [string, string])[]));
    });
    return () => {
      cancelled = true;
    };
  }, [saved]);

  const toggleAccount = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const body = (): SocialPostInput => ({
    title: form.title,
    caption: form.caption,
    hashtags: form.hashtags,
    firstComment: form.firstComment,
    linkUrl: form.linkUrl,
    contentType: form.contentType,
    campaign: form.campaign,
    status: form.status,
    scheduledAt: fromDateTimeLocal(form.scheduledAt),
    assigneeId: form.assigneeId || null,
    accountIds: selected,
    // Yalnızca seçili hesapların ezmeleri gider: hesap listeden çıkarıldığında
    // eski metni geride bırakmak, hesap geri eklendiğinde şaşırtıcı olurdu.
    captionOverrides: Object.fromEntries(Object.entries(overrides).filter(([id, v]) => selected.includes(id) && v.trim())),
  });

  /** Kayıt yoksa açar, varsa günceller. Medya yüklemesi de bunu kullanır. */
  const persist = async (): Promise<SocialPost> => {
    if (!form.title.trim()) throw new Error("Başlık gerekli");
    const next = saved
      ? await socialMediaApi.updatePost(saved.id, body())
      : await socialMediaApi.createPost(scope, body());
    setSaved(next);
    return next;
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !uploadTarget) return;
    setUploading(true);
    setError("");
    try {
      const target = saved ?? (await persist());
      let current = target;
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(uploadTarget, file, {}, (ratio) => setUploadPct(Math.round(ratio * 100)));
        current = await socialMediaApi.attachMedia(current.id, uploaded.id);
      }
      setSaved(current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dosya yüklenemedi");
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeMedia = async (mediaId: string) => {
    if (!saved) return;
    try {
      await socialMediaApi.detachMedia(mediaId);
      // Bağ koptu, dosya Drive'da duruyor: listeden düşürmek yeterli.
      setSaved({ ...saved, media: saved.media.filter((m) => m.id !== mediaId) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Medya kaldırılamadı");
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      onSaved(await persist());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İçerik kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  /**
   * "Şimdi paylaş".
   *
   * Önce kaydeder: kullanıcı metni düzeltip hemen paylaşmak istediğinde
   * ekrandaki hali ile yayımlanan hali aynı olmalı. Sonra sonuç kanal kanal
   * geri okunur — hata varsa hangi kanalda olduğu chip'lerde görünür.
   */
  const publishNow = async () => {
    setPublishing(true);
    setError("");
    setNotice("");
    try {
      const current = await persist();
      const { published, failed } = await socialMediaApi.publishPost(current.id);
      const refreshed = await socialMediaApi.getPost(current.id);
      setSaved(refreshed);
      onSaved(refreshed);
      setNotice(
        failed === 0
          ? `${published} kanalda yayımlandı.`
          : `${published} kanalda yayımlandı, ${failed} kanalda hata var.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yayımlanamadı");
    } finally {
      setPublishing(false);
    }
  };

  /** Hesap → yayın hedefi. Bağlı kanalların durumu chip'lerde gösteriliyor. */
  const targetByAccount = useMemo(
    () => new Map((saved?.targets ?? []).map((t) => [t.accountId, t])),
    [saved]
  );

  const publishableAccounts = accounts.filter(
    (a) => selected.includes(a.id) && canAutoPublish(a) && targetByAccount.get(a.id)?.status !== "published"
  );

  const label = (text: string) => <label style={{ fontSize: 12, color: c.textSecondary }}>{text}</label>;
  const field = { fontSize: 13, padding: "6px 8px", width: "100%" } as const;
  const media = saved?.media ?? [];

  return (
    <Modal
      title={post ? "İçeriği düzenle" : "Yeni içerik"}
      subtitle="Metin, görsel ve yayın planı. Kanal seçtikçe karakter sınırı ona göre uyarır."
      onClose={onClose}
      maxWidth={720}
      mobileFullScreen
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* ---------------------------------------------- Kanallar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {label("Kanallar")}
          {accounts.length === 0 ? (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              Henüz hesap yok. "Hesaplar" sekmesinden ekleyince burada seçilebilir.
            </span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {activeAccounts.map((a) => {
                const on = selected.includes(a.id);
                const target = targetByAccount.get(a.id);
                // Yayımlanmış kanal listeden çıkarılamaz: geçmişi silmek değil,
                // olan biteni göstermek istiyoruz.
                const locked = target?.status === "published";
                return (
                  <button
                    key={a.id}
                    onClick={() => !locked && toggleAccount(a.id)}
                    title={target?.errorMessage ?? undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 999,
                      cursor: locked ? "default" : "pointer",
                      border: `1px solid ${on ? accountColor(a) : c.border}`,
                      background: on ? `${accountColor(a)}1A` : "transparent",
                      color: on ? c.textPrimary : c.textSecondary,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: accountColor(a),
                        flexShrink: 0,
                      }}
                    />
                    {accountLabel(a)}
                    <span style={{ color: c.textSecondary }}>{SOCIAL_PLATFORMS[a.platform].label}</span>
                    {target && target.status !== "pending" && (
                      <span style={{ color: TARGET_STATUS[target.status].color }}>
                        · {TARGET_STATUS[target.status].label}
                      </span>
                    )}
                    {canAutoPublish(a) && !target && <span style={{ color: c.success }}>· bağlı</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------------------------------------------- Başlık + tür */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 240px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Başlık * (iç kullanım — takvimde görünür)")}
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Ağustos kampanyası — 2. gönderi"
              style={field}
            />
          </div>
          <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("İçerik türü")}
            <select
              value={form.contentType}
              onChange={(e) => set("contentType", e.target.value as SocialContentType)}
              style={field}
            >
              {CONTENT_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {CONTENT_TYPES[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ---------------------------------------------- Metin */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            {label("Açıklama metni")}
            <span style={{ fontSize: 11, color: overLimit ? c.danger : c.textSecondary }}>
              {length}
              {limit !== undefined ? ` / ${limit}` : ""} karakter
              {overLimit ? " — en dar kanalın sınırı aşıldı" : ""}
            </span>
          </div>
          <textarea
            value={form.caption}
            onChange={(e) => set("caption", e.target.value)}
            placeholder="Yayımlanacak metin…"
            rows={6}
            style={{ ...field, resize: "vertical", lineHeight: 1.5, borderColor: overLimit ? c.danger : undefined }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 240px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              {label("Etiketler")}
              <span style={{ fontSize: 11, color: c.textSecondary }}>{hashtagCount(form.hashtags)} etiket</span>
            </div>
            <input
              value={form.hashtags}
              onChange={(e) => set("hashtags", e.target.value)}
              placeholder="#projelio #kobi #uretkenlik"
              style={field}
            />
          </div>
          <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Bağlantı")}
            <input
              value={form.linkUrl}
              onChange={(e) => set("linkUrl", e.target.value)}
              placeholder="https://…"
              style={field}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Etiketleri gövdeden ayırıp ilk yoruma taşımak yaygın bir düzen;
              alanı ayrı tutmak yayımlarken kes-yapıştır hatasını önlüyor. */}
          {label("İlk yorum (isteğe bağlı)")}
          <textarea
            value={form.firstComment}
            onChange={(e) => set("firstComment", e.target.value)}
            placeholder="Etiketler ya da ek bilgi — gönderiden hemen sonra yorum olarak eklenir"
            rows={2}
            style={{ ...field, resize: "vertical" }}
          />
        </div>

        {/* ---------------------------------------------- Kanala özel metin */}
        {selected.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {label("Kanala özel metin (boşsa ortak metin kullanılır)")}
            {accounts
              .filter((a) => selected.includes(a.id))
              .map((a) => {
                const open = openOverride === a.id;
                const value = overrides[a.id] ?? "";
                const platformLimit = SOCIAL_PLATFORMS[a.platform].captionLimit;
                return (
                  <div key={a.id} style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: "6px 8px" }}>
                    <button
                      onClick={() => setOpenOverride(open ? null : a.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "100%",
                        fontSize: 12,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: c.textPrimary,
                        padding: 0,
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: accountColor(a) }} />
                      {accountLabel(a)}
                      <span style={{ marginLeft: "auto", color: value ? c.primary : c.textSecondary }}>
                        {value ? `özel metin · ${value.length}` : "ortak metin"}
                      </span>
                    </button>
                    {open && (
                      <textarea
                        value={value}
                        onChange={(e) => setOverrides((o) => ({ ...o, [a.id]: e.target.value }))}
                        placeholder={
                          platformLimit ? `${SOCIAL_PLATFORMS[a.platform].label} için (en fazla ${platformLimit})` : "Bu kanal için metin"
                        }
                        rows={4}
                        style={{ ...field, marginTop: 6, resize: "vertical" }}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* ---------------------------------------------- Medya */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {label("Görsel / video")}
          {media.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {media.map((m) => (
                <div
                  key={m.id}
                  style={{
                    width: 104,
                    border: `1px solid ${c.border}`,
                    borderRadius: 8,
                    overflow: "hidden",
                    background: c.background,
                  }}
                >
                  <div
                    style={{
                      height: 72,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#0000000A",
                    }}
                  >
                    {previews[m.fileId] ? (
                      <img
                        src={previews[m.fileId]}
                        alt={m.altText ?? m.name ?? ""}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: 11, color: c.textSecondary, padding: 6, textAlign: "center" }}>
                        {m.mimeType?.startsWith("video/") ? "Video" : "Dosya"}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px" }}>
                    <span
                      title={m.name}
                      style={{
                        fontSize: 10,
                        color: c.textSecondary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {m.name ?? "dosya"}
                    </span>
                    {m.webViewLink && (
                      <a href={m.webViewLink} target="_blank" rel="noreferrer" style={{ display: "flex" }}>
                        <IconExternalLink size={12} color={c.textSecondary} />
                      </a>
                    )}
                    <button
                      onClick={() => removeMedia(m.id)}
                      aria-label="Medyayı kaldır"
                      title="Gönderiden kaldır (dosya silinmez)"
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                    >
                      <IconTrash size={12} color={c.textSecondary} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {uploadTarget ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => handleUpload(e.target.files)}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${c.border}`,
                  background: "transparent",
                  cursor: uploading ? "default" : "pointer",
                  color: c.textPrimary,
                }}
              >
                <IconUpload size={14} color={c.textSecondary} />
                {uploading ? `Yükleniyor… %${uploadPct}` : "Dosya yükle"}
              </button>
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                Dosyalar {"jobId" in scope ? "işin" : "departmanın"} dosya alanına yüklenir, buraya bağlanır.
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              Dosya yüklemek için modülün bir departmanda etkin olması gerekiyor — dosyalar departmanın klasörüne gider.
            </span>
          )}
        </div>

        {/* ---------------------------------------------- Plan */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 190px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Yayın zamanı")}
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => set("scheduledAt", e.target.value)}
              style={field}
            />
          </div>
          <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Durum")}
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as SocialPostStatus)}
              style={field}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SOCIAL_STATUS[s].label}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: c.textSecondary }}>{SOCIAL_STATUS[form.status].hint}</span>
          </div>
          <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Sorumlu")}
            <select value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} style={field}>
              <option value="">Belirtilmedi</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Kampanya")}
            <input
              value={form.campaign}
              onChange={(e) => set("campaign", e.target.value)}
              placeholder="Ağustos indirimi"
              style={field}
            />
          </div>
        </div>

        {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}
        {notice && <span style={{ fontSize: 12, color: c.success }}>{notice}</span>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {/* Doğrudan yayın yalnızca bağlı kanal varken görünür; elle yönetilen
              hesaplarda düğme olsaydı basınca hiçbir şey olmayacaktı. */}
          {publishableAccounts.length > 0 && (
            <button
              onClick={publishNow}
              disabled={publishing || saving || uploading}
              style={{
                marginRight: "auto",
                fontSize: 13,
                padding: "6px 14px",
                background: SOCIAL_PLATFORMS.instagram.color,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: publishing ? "default" : "pointer",
                opacity: publishing || saving || uploading ? 0.6 : 1,
              }}
            >
              {publishing ? "Yayımlanıyor…" : `Şimdi paylaş (${publishableAccounts.length})`}
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              cursor: "pointer",
              color: c.textSecondary,
            }}
          >
            Vazgeç
          </button>
          <button
            onClick={save}
            disabled={saving || uploading}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              background: c.primary,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: saving ? "default" : "pointer",
              opacity: saving || uploading ? 0.6 : 1,
            }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
