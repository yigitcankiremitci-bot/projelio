import { useState } from "react";
import type { TaskAttachment, Translate } from "@projelio/shared";
import { safeExternalUrl } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { IconExternalLink, IconFile } from "./icons";
import Modal from "./Modal";
import { useTaskAttachmentSnapshot, type AttachedFile } from "../lib/taskAttachmentEvents";
import { useT } from "../lib/i18n";

/**
 * Bağlantı ekleri kullanıcı tarafından yazılıyor. `javascript:` ile başlayan bir
 * adres window.open ile açıldığında bu sayfanın kökeninde kod çalıştırır — yani
 * bağlantıyı ekleyen kişi, ona tıklayan ekip arkadaşının oturumunu ele geçirebilir.
 *
 * Sunucu artık yeni kayıtlarda bunu engelliyor (bkz. tasks.service addLinkAttachment),
 * ama bu kural eklenmeden ÖNCE kaydedilmiş adresler veritabanında olabilir; burası
 * onlara karşı ikinci katman.
 */
function openLink(url: string, t: Translate): void {
  const safe = safeExternalUrl(url);
  if (!safe) {
    alert(t("Bu bağlantı açılamıyor: adres geçerli bir web adresi değil."));
    return;
  }
  window.open(safe, "_blank", "noreferrer");
}

/**
 * Görev/tekrar kartındaki "link var" ve "dosya var" rozetleri.
 *
 * NEDEN İKİ AYRI LİSTE: ekler iki tabloda yaşıyor. Link `task_attachments`
 * satırı (bkz. 060), dosya ise `files` satırı (Drive/OneDrive'da duruyor,
 * `files.task_id` ile göreve bağlı). Kullanıcı için ikisi de "ek", ama
 * kaynakları ve açılış adresleri farklı.
 *
 * TIKLAMA KURALI: tek ek varsa doğrudan açılır — kullanıcının aradığı şey zaten
 * o. Birden fazlaysa KENDİ seçim modalı açılır; eskiden görev düzenleme modalı
 * açılıyordu ama o ekran görevin tamamını (başlık, tarih, atama, yorumlar)
 * getiriyordu, oysa kullanıcının tek isteği hangi bağlantıya gideceğini
 * seçmekti. Aynı kural rutin tekrar satırlarında da geçerli; bu bileşen oradan
 * çıkarıldı ki iki yerde iki farklı davranış oluşmasın.
 */
export default function TaskAttachmentBadges({
  taskId,
  links,
  files,
  onOpenDetail,
  size = 15,
}: {
  /** Ek defterini dinlemek için (bkz. lib/taskAttachmentEvents.ts). */
  taskId: string;
  links?: TaskAttachment[];
  files?: AttachedFile[];
  /** Tek dosyanın açılabilir adresi yoksa açılacak görev detayı. */
  onOpenDetail?: () => void;
  size?: number;
}) {
  const c = useThemeColors();
  const t = useT();
  const [picker, setPicker] = useState<"links" | "files" | null>(null);
  // Pano listesi sunucudan geldiği gibi duruyor; bu oturumda ek eklendiyse
  // defterdeki taze liste onun yerine geçer. Böylece rozet, modalı hangi
  // sayfanın açtığından bağımsız olarak güncelleniyor.
  const fresh = useTaskAttachmentSnapshot(taskId);
  const linkList = fresh?.attachments ?? links ?? [];
  const fileList = fresh?.files ?? files ?? [];
  if (linkList.length === 0 && fileList.length === 0) return null;

  // Kart tıklaması alt görevleri açıyor, çift tıklaması başka sayfaya gidiyor;
  // rozet ikisini de tetiklememeli.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  const badgeStyle = {
    background: "transparent",
    border: "none",
    padding: 2,
    display: "flex",
    cursor: "pointer",
    flexShrink: 0,
  } as const;

  return (
    <>
      {linkList.length > 0 && (
        <button
          onClick={(e) => {
            stop(e);
            if (linkList.length === 1) openLink(linkList[0].url, t);
            else setPicker("links");
          }}
          onDoubleClick={stop}
          aria-label={linkList.length === 1 ? t("Bağlantıyı aç") : t("{n} bağlantı", { n: linkList.length })}
          title={
            linkList.length === 1
              ? linkList[0].label || linkList[0].url
              : t("{n} bağlantı — açmak için tıkla", { n: linkList.length })
          }
          style={badgeStyle}
        >
          <IconExternalLink size={size} color={c.primary} />
        </button>
      )}

      {fileList.length > 0 && (
        <button
          onClick={(e) => {
            stop(e);
            const only = fileList.length === 1 ? fileList[0] : undefined;
            if (only?.webViewLink) window.open(only.webViewLink, "_blank", "noreferrer");
            // Tek dosyanın açılabilir adresi yoksa (izni düşmüş ya da henüz
            // işleniyor) seçim listesi anlamsız; görev detayına düşülür.
            else if (only) onOpenDetail?.();
            else setPicker("files");
          }}
          onDoubleClick={stop}
          aria-label={fileList.length === 1 ? t("Dosyayı aç") : t("{n} dosya", { n: fileList.length })}
          title={fileList.length === 1 ? fileList[0].name : t("{n} dosya — açmak için tıkla", { n: fileList.length })}
          style={badgeStyle}
        >
          <IconFile size={size} color={c.primary} />
        </button>
      )}

      {picker && (
        // Portal ile body'ye taşınsa da olaylar REACT ağacında yükseliyor:
        // sarmalayıcı olmadan modalin içindeki her tıklama kartın kendi
        // onClick/onDoubleClick'ini de tetikler (alt görevleri açar, sayfa
        // değiştirir).
        <div onClick={stop} onDoubleClick={stop}>
          <Modal
            title={picker === "links" ? t("Bağlantılar") : t("Dosyalar")}
            onClose={() => setPicker(null)}
            maxWidth={420}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {picker === "links"
                ? linkList.map((a) => (
                    <AttachmentRow
                      key={a.id}
                      icon={<IconExternalLink size={15} color={c.primary} />}
                      title={a.label || a.url}
                      subtitle={a.label ? a.url : undefined}
                      onOpen={() => {
                        openLink(a.url, t);
                        setPicker(null);
                      }}
                    />
                  ))
                : fileList.map((f) => (
                    <AttachmentRow
                      key={f.id}
                      icon={<IconFile size={15} color={c.primary} />}
                      title={f.name}
                      subtitle={f.webViewLink ? undefined : t("Bu dosya açılamıyor (erişim yok)")}
                      disabled={!f.webViewLink}
                      onOpen={() => {
                        if (!f.webViewLink) return;
                        window.open(f.webViewLink, "_blank", "noreferrer");
                        setPicker(null);
                      }}
                    />
                  ))}
            </div>
          </Modal>
        </div>
      )}
    </>
  );
}

function AttachmentRow({
  icon,
  title,
  subtitle,
  disabled = false,
  onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const c = useThemeColors();
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 9,
        border: `1px solid ${c.border}`,
        background: c.surface,
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = c.background)}
      onMouseLeave={(e) => (e.currentTarget.style.background = c.surface)}
    >
      <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: 15,
            color: c.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: 12,
              color: c.textSecondary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}
