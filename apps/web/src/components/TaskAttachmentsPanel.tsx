import { useEffect, useState } from "react";
import type { TaskAttachment } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { publishTaskAttachments } from "../lib/taskAttachmentEvents";
import { IconPlus, IconTrash } from "./icons";

interface Props {
  taskId: string;
  /**
   * Liste her değiştiğinde çağrılır. Görev kartındaki ek rozeti (bkz.
   * TaskAttachmentBadges) pano listesinden besleniyor; panel kendi state'ini
   * tuttuğu için haber vermezse rozet ancak bir sonraki tazelemede belirirdi —
   * kullanıcı linki ekliyor, modalı kapatıyor, kartta hiçbir şey görmüyordu.
   */
  onChanged?: (attachments: TaskAttachment[]) => void;
}

/**
 * Bir görevin BAĞLANTI ekleri (bkz. migration 060).
 *
 * Dosyanın kendisi buraya yüklenmez: dosyalar kullanıcının Google Drive /
 * OneDrive hesabında yaşar ve files modülü üzerinden bağlanır (bkz. FilesPanel).
 * Kendi depomuza kopyalamak aynı belgenin iki yerde ayrı ayrı yaşamasına ve
 * hangisinin güncel olduğunun belirsizleşmesine yol açıyordu.
 *
 * Rutin tekrarları da birer görev olduğu için aynı panel orada da kullanılır:
 * "17 Ağustos haftalık rapor"un çıktısı (yayınlanan gönderinin linki, teslim
 * edilen dosya) buraya düşer ve geçmişe bakıldığında ne yapıldığı görünür.
 *
 * Liste kendi isteğini atar ve kendi state'ini tutar: ek eklemek görevi
 * kaydetmeyi beklemez — kullanıcı modalı kapatmadan dosyasını bırakıp gider.
 */
export default function TaskAttachmentsPanel({ taskId, onChanged }: Props) {
  const c = useThemeColors();
  const [items, setItems] = useState<TaskAttachment[]>([]);
  const [addingLink, setAddingLink] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api
      .get<TaskAttachment[]>(`/tasks/${taskId}/attachments`)
      .then((data) => {
        setItems(data ?? []);
        onChanged?.(data ?? []);
        // Karttaki rozet buradan besleniyor (bkz. lib/taskAttachmentEvents.ts).
        publishTaskAttachments(taskId, { attachments: data ?? [] });
      })
      .catch(() => setItems([]));
  };

  useEffect(load, [taskId]);

  const addLink = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      // Şema serbest bırakıldıysa https varsayılır: "example.com" yazan kullanıcı
      // tarayıcıda uygulamanın kendi adresine yönlenmesin.
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      await api.post(`/tasks/${taskId}/attachments/link`, { url: normalized, label: label.trim() || undefined });
      setUrl("");
      setLabel("");
      setAddingLink(false);
      load();
    } catch {
      setError("Bağlantı eklenemedi. Tekrar dene.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setItems((prev) => {
      const next = prev.filter((a) => a.id !== id);
      onChanged?.(next);
      publishTaskAttachments(taskId, { attachments: next });
      return next;
    });
    await api.delete(`/task-attachments/${id}`).catch(load);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <label style={{ fontSize: 15, color: c.textSecondary }}>Bağlantılar</label>
        <button
          type="button"
          onClick={() => setAddingLink((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            fontSize: 13,
            borderRadius: 7,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.textSecondary,
            cursor: "pointer",
          }}
        >
          <IconPlus size={13} color={c.textSecondary} />
          Bağlantı ekle
        </button>
      </div>

      {addingLink && (
        // Kendi formu: Enter bağlantıyı EKLESİN, görevi kaydetmesin. Panel,
        // görev modalinin kaydet formunun dışında duruyor (bkz. TaskEditModal);
        // formsuz bırakılırsa Enter modalin genel onayına düşerdi.
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addLink();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            autoFocus
            style={{ width: "100%" }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Görünen ad (opsiyonel)"
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="submit"
              disabled={busy || !url.trim()}
              style={{
                padding: "7px 14px",
                fontSize: 14,
                borderRadius: 7,
                border: "none",
                background: c.primary,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Ekle
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingLink(false);
                setUrl("");
                setLabel("");
              }}
              style={{
                padding: "7px 14px",
                fontSize: 14,
                borderRadius: 7,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.textSecondary,
                cursor: "pointer",
              }}
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}

      {error && <p style={{ fontSize: 13, color: c.danger, margin: 0 }}>{error}</p>}

      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          Henüz bağlantı yok. Çıktının adresini buraya bırak — dosyalar aşağıdaki
          Dosyalar bölümünden Drive/OneDrive'a eklenir.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14,
                  color: c.primary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {a.label || a.fileName || a.url}
              </a>
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label="Eki kaldır"
                style={{ background: "transparent", border: "none", padding: 4, display: "flex", cursor: "pointer" }}
              >
                <IconTrash size={13} color={c.textSecondary} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
