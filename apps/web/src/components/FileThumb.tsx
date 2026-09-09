import type { ProjectFile } from "@projelio/shared";
import type { FileThumbnails } from "../lib/fileThumbnails";
import { useThemeColors } from "../theme/useThemeColors";
import { IconFile } from "./icons";

interface Props {
  file: Pick<ProjectFile, "id" | "iconLink">;
  thumbs: FileThumbnails;
  /**
   * "row": listedeki küçük kare. "tile": simge görünümündeki geniş kutu —
   * önizleme kutuyu doldurur, sabit oran ızgarayı bozmasın diye.
   */
  variant: "row" | "tile";
  /** Satır biçiminde karenin kenarı; kutu biçiminde kutunun yüksekliği. */
  size?: number;
}

/**
 * Dosya önizlemesi; yoksa sağlayıcının tür ikonu, o da yoksa genel dosya ikonu.
 *
 * onError ŞART: önizleme adresi iyimser üretiliyor (bkz. lib/fileThumbnails.ts),
 * yani gerçekten küçük resmi olmayan bir dosyada istek 404 döner. İşlenmezse
 * kullanıcı listenin her satırında kırık resim ikonu görürdü.
 */
export default function FileThumb({ file, thumbs, variant, size }: Props) {
  const c = useThemeColors();
  const url = thumbs.urlFor(file.id);
  const kutu = size ?? (variant === "tile" ? 74 : 34);
  const ikonBoyu = variant === "tile" ? 28 : 18;

  if (url) {
    return (
      <img
        src={url}
        alt=""
        onError={() => thumbs.markFailed(file.id)}
        style={
          variant === "tile"
            ? { maxWidth: "100%", maxHeight: "100%", objectFit: "cover" }
            : { width: kutu, height: kutu, objectFit: "cover", borderRadius: 5, flexShrink: 0 }
        }
      />
    );
  }

  if (file.iconLink) return <img src={file.iconLink} alt="" width={ikonBoyu} height={ikonBoyu} />;
  return <IconFile size={ikonBoyu} color={c.textSecondary} />;
}
