import { useEffect, useState } from "react";
import type { Party, PartyDosyaRolu, ProjectFile } from "@projelio/shared";
import { partyApi } from "../../api/party";
import { useFileThumbnails } from "../../lib/fileThumbnails";
import { useT } from "../../lib/i18n";
import { useThemeColors } from "../../theme/useThemeColors";
import FileThumb from "../FileThumb";
import FilePreviewModal from "../FilePreviewModal";

/** Özette en çok bu kadar küçük resim; fazlası "+N" ile Dosyalar sekmesine götürür. */
const OZET_TAVANI = 6;

/**
 * Açılan kartın özetinde dosya önizlemeleri: kartvizit ve ekler küçük
 * resimleriyle, tıklayınca önizleme açılır (kullanıcı isteği, 2026-10-27).
 * Dosyalar bağlı Drive/OneDrive'da; küçük resim de oradan gelir
 * (useFileThumbnails). Kartta dosya yoksa (listedeki sayıya göre) istek
 * atılmaz ve hiçbir şey çizilmez.
 */
export default function KartDosyaOnizleme({
  party,
  onTumu,
}: {
  party: Party;
  /** "+N" ya da başlık: kartın Dosyalar sekmesine geçer. */
  onTumu?: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const sayi = (party.ekSayisi ?? 0) + (party.kartvizitSayisi ?? 0);
  const [dosyalar, setDosyalar] = useState<{ rol: PartyDosyaRolu; dosya: ProjectFile }[]>([]);
  const [acik, setAcik] = useState<ProjectFile | null>(null);
  const gorunen = dosyalar.slice(0, OZET_TAVANI).map((d) => d.dosya);
  const thumbs = useFileThumbnails(gorunen);

  useEffect(() => {
    if (!sayi) return setDosyalar([]);
    let iptal = false;
    partyApi
      .dosyalar(party.id)
      .then((d) => !iptal && setDosyalar(d))
      .catch(() => !iptal && setDosyalar([]));
    return () => {
      iptal = true;
    };
  }, [party.id, sayi]);

  if (!dosyalar.length) return null;
  const kalan = dosyalar.length - gorunen.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        onClick={onTumu}
        style={{ alignSelf: "flex-start", fontSize: 11, color: c.textSecondary, background: "transparent", border: "none", padding: 0, cursor: onTumu ? "pointer" : "default" }}
      >
        {t("Dosyalar ({n})", { n: dosyalar.length })}
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {gorunen.map((f) => (
          <button
            key={f.id}
            onClick={() => setAcik(f)}
            title={f.name}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 82, padding: 0, background: "transparent", border: "none", cursor: "pointer" }}
          >
            <span
              style={{
                width: 74,
                height: 74,
                borderRadius: 8,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: c.surface,
                border: `1px solid ${c.border}`,
              }}
            >
              <FileThumb file={f} thumbs={thumbs} variant="tile" />
            </span>
            <span style={{ fontSize: 11, color: c.textPrimary, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
              {f.name}
            </span>
          </button>
        ))}
        {kalan > 0 && (
          <button
            onClick={onTumu}
            style={{ width: 74, height: 74, borderRadius: 8, border: `1px dashed ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 13, cursor: "pointer" }}
          >
            +{kalan}
          </button>
        )}
      </div>
      {acik && <FilePreviewModal file={acik} onClose={() => setAcik(null)} />}
    </div>
  );
}
