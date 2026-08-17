import { useRef } from "react";
import { colors } from "../theme/colors";
import { COVER_PRESETS, coverBackground, coverPresetValue, findCoverPreset } from "../lib/covers";
import { IconCheck, IconX } from "./icons";

interface Props {
  /** Kayıtlı kapak değeri: bir URL, "preset:<key>" ya da boş. */
  value?: string;
  /** Henüz yüklenmemiş, kullanıcının az önce seçtiği dosya (önizleme için). */
  filePreview?: string | null;
  onSelectPreset: (value: string | undefined) => void;
  onFile: (file: File | null) => void;
}

/**
 * Kapak seçici: yükle, hazır kapaklardan seç ya da kaldır.
 *
 * Hazır kapaklar dosya değil CSS gradyanı olduğu için depolama, yükleme
 * beklemesi ve boyut sıkıştırma yok — seçim anında görünür. Fotoğraf yüklemek
 * istemeyen kullanıcı da sayfasını boş bırakmak zorunda kalmıyor.
 */
export default function CoverPicker({ value, filePreview, onSelectPreset, onFile }: Props) {
  const c = colors.light;
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedPreset = findCoverPreset(value);
  const previewBackground = filePreview ? `center/cover no-repeat url(${filePreview})` : coverBackground(value);
  const hasSomething = Boolean(filePreview || value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 15, color: c.textSecondary }}>Kapak</label>

      <div
        style={{
          height: 90,
          borderRadius: 8,
          border: `1px solid ${c.border}`,
          background: previewBackground,
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 15,
          }}
        >
          Fotoğraf yükle
        </button>
        {hasSomething && (
          <button
            type="button"
            onClick={() => {
              onFile(null);
              onSelectPreset(undefined);
              if (fileRef.current) fileRef.current.value = "";
            }}
            aria-label="Kapağı kaldır"
            style={{
              width: 40,
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconX size={14} color={c.textSecondary} />
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          // Dosya seçildiği anda varsa hazır kapak seçimi düşer — ikisi bir arada olmaz.
          if (file) onSelectPreset(undefined);
          onFile(file);
        }}
        style={{ display: "none" }}
      />

      <span style={{ fontSize: 13, color: c.textSecondary }}>ya da hazır bir kapak seç</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 6 }}>
        {COVER_PRESETS.map((preset) => {
          const active = !filePreview && selectedPreset?.key === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                onFile(null);
                onSelectPreset(coverPresetValue(preset.key));
              }}
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={active}
              style={{
                position: "relative",
                height: 44,
                borderRadius: 7,
                border: active ? `2px solid ${c.accentDark}` : `1px solid ${c.border}`,
                background: preset.background,
                padding: 0,
                cursor: "pointer",
              }}
            >
              {active && (
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    right: 3,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: c.surface,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconCheck size={9} color={c.accentDark} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
