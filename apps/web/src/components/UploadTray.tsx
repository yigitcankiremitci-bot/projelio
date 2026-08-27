import { formatFileSize } from "../lib/driveLinks";
import { cancelUpload, dismissUpload, useUploads } from "../lib/uploadQueue";
import { Z } from "../lib/layout";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useThemeColors } from "../theme/useThemeColors";
import { IconX } from "./icons";

/**
 * Süren yüklemelerin köşedeki göstergesi.
 *
 * NEDEN VAR: yükleme ilerlemesi yalnızca dosya listesinin içinde görünüyordu.
 * Kullanıcı "yükle" deyip başka bir sayfaya geçtiğinde ekranda hiçbir iz
 * kalmıyordu — yükleme aslında sürüyor olsa bile bu, iptal olmuş gibi
 * görünüyor. Kuyruk artık bileşenlerin dışında (bkz. lib/uploadQueue), bu
 * pencere de onu nerede olursak olalım gösteriyor.
 *
 * Sol altta, kişi şeridinin üstünde durur. Kişi şeridi yalnızca bilgi taşıyor
 * ve tıklanamıyor; bu kutunun içinde "vazgeç" düğmesi var, o yüzden üstte olan
 * bu olmalı (bkz. App.tsx — şeridi yukarı iten `lift` değeri oradan geliyor).
 */

/** App.tsx kişi şeridini bu kadar yukarı itiyor; iki yer aynı sayıyı kullanmalı. */
export const UPLOAD_TRAY_HEIGHT = 92;

export default function UploadTray({ left }: { left: number }) {
  const c = useThemeColors();
  const isDesktop = useIsDesktop();
  const uploads = useUploads();

  if (uploads.length === 0) return null;

  const active = uploads.filter((u) => u.status === "uploading").length;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: left + 16,
        // Telefonda alt menü (68 px) + çentik boşluğunun üstünde kalmalı —
        // kişi şeridiyle aynı hesap.
        bottom: isDesktop ? 16 : "calc(84px + env(safe-area-inset-bottom))",
        zIndex: Z.uploadTray,
        width: "min(340px, calc(100vw - 32px))",
        maxHeight: 260,
        overflowY: "auto",
        padding: 10,
        borderRadius: 12,
        background: c.surface,
        border: `1px solid ${c.border}`,
        boxShadow: "0 6px 20px rgba(26,31,41,0.16)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: c.textSecondary }}>
        {active > 0 ? `${active} dosya yükleniyor` : "Yükleme tamamlandı"}
      </div>

      {uploads.map((u) => {
        const pct = u.sizeBytes > 0 ? Math.min(100, Math.round((u.uploadedBytes / u.sizeBytes) * 100)) : 0;
        return (
          <div key={u.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                title={u.name}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12.5,
                  color: c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {u.name}
              </span>
              <button
                type="button"
                onClick={() => (u.status === "uploading" ? cancelUpload(u.id) : dismissUpload(u.id))}
                aria-label={u.status === "uploading" ? "Yüklemeyi durdur" : "Kaldır"}
                title={u.status === "uploading" ? "Yüklemeyi durdur" : "Kaldır"}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  background: "none",
                  border: "none",
                  padding: 2,
                  cursor: "pointer",
                }}
              >
                <IconX size={12} color={c.textSecondary} />
              </button>
            </div>

            {u.status === "error" ? (
              <span style={{ fontSize: 11.5, color: c.danger }}>{u.error}</span>
            ) : (
              <>
                {/* Boyut hem yüklenen hem toplam olarak yazılıyor: yalnızca yüzde
                    göstermek büyük bir dosyada "takıldı mı?" sorusunu
                    cevaplamıyordu. */}
                <span style={{ fontSize: 11.5, color: c.textSecondary }}>
                  {u.status === "done"
                    ? `Yüklendi · ${formatFileSize(u.sizeBytes)}`
                    : `${formatFileSize(u.uploadedBytes)} / ${formatFileSize(u.sizeBytes)} · %${pct}`}
                </span>
                <div style={{ height: 3, borderRadius: 999, background: c.border, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${u.status === "done" ? 100 : pct}%`,
                      height: "100%",
                      background: c.accent,
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
