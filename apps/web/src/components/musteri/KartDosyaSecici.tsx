import { useEffect, useState } from "react";
import type { ProjectFile } from "@projelio/shared";
import { partyApi } from "../../api/party";
import { fileKindLabel, formatFileSize } from "../../lib/driveLinks";
import { useFileThumbnails } from "../../lib/fileThumbnails";
import { useT } from "../../lib/i18n";
import { useThemeColors } from "../../theme/useThemeColors";
import FileThumb from "../FileThumb";
import Modal from "../Modal";
import { IconBuilding, IconCheck, IconChevronLeft, IconFolder } from "../icons";

type Gezinti = Awaited<ReturnType<typeof partyApi.dosyaGez>>;
const BOS: Gezinti = { kaynaklar: [], folders: [], files: [], breadcrumb: [] };

/**
 * Müşteri / potansiyel / bağlantı kartına "Projelio'dan seç": dosya
 * bilgisayardan yeniden yüklenmez, Projelio'da durduğu yerden karta bağlanır
 * (kullanıcı isteği, 2026-10-26). PickLinkedFilesModal'ın kart hâli; fark,
 * şirket kartında önce kaynak (şirketin dosyaları ya da bir departman)
 * seçilmesi — kart tek bir klasöre ait değil.
 *
 * Kaynağın karta ait olduğu SUNUCUDA doğrulanır (PartyService.dosyaGez).
 */
export default function KartDosyaSecici({
  partyId,
  onClose,
  onBaglandi,
}: {
  partyId: string;
  onClose: () => void;
  onBaglandi: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [kaynak, setKaynak] = useState<{ anahtar: string; ad: string } | undefined>();
  const [folderId, setFolderId] = useState<string | undefined>();
  const [veri, setVeri] = useState<Gezinti>(BOS);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [secili, setSecili] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");
  const thumbs = useFileThumbnails(veri.files);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setHata("");
    partyApi
      .dosyaGez(partyId, kaynak?.anahtar, folderId)
      .then((v) => !iptal && setVeri(v))
      .catch((e: Error) => !iptal && setHata(e.message))
      .finally(() => !iptal && setYukleniyor(false));
    return () => {
      iptal = true;
    };
  }, [partyId, kaynak?.anahtar, folderId]);

  const bagla = async () => {
    if (!secili.length) return;
    setBusy(true);
    setHata("");
    try {
      await partyApi.dosyalariBagla(partyId, secili);
      onBaglandi();
      onClose();
    } catch (e) {
      setHata(e instanceof Error ? e.message : t("Bağlanamadı"));
    } finally {
      setBusy(false);
    }
  };

  const degistir = (id: string) => setSecili((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  // Kökteyken (kaynak listesi) geri yok; klasördeyken bir üst klasör, kaynağın kökündeyken kaynak listesi.
  const ustKlasor = veri.breadcrumb.length > 1 ? veri.breadcrumb[veri.breadcrumb.length - 2].id : undefined;
  const geriVar = !!folderId || (!!kaynak && veri.kaynaklar.length === 0);
  const geri = () => {
    if (folderId) setFolderId(ustKlasor);
    else setKaynak(undefined);
  };
  const satir = (vurgu: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 9,
    border: `1px solid ${vurgu ? c.accent : c.border}`,
    background: vurgu ? `${c.accent}14` : "transparent",
    cursor: "pointer",
  });
  const baglanti = { background: "transparent", border: "none", color: c.accent, cursor: "pointer", padding: 0, fontSize: 14 } as const;
  const kaynakListesi = !kaynak && veri.kaynaklar.length > 0;

  return (
    <Modal title={t("Projelio'dan dosya seç")} onClose={onClose} maxWidth={540}>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px" }}>{t("Dosya yerinde kalır; karta da bağlanır.")}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10, fontSize: 14 }}>
        {geriVar && (
          <button
            type="button"
            onClick={geri}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8, color: c.textPrimary, cursor: "pointer", padding: "3px 9px 3px 6px", fontSize: 13 }}
          >
            <IconChevronLeft size={13} color={c.textSecondary} />
            {t("Geri")}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setKaynak(undefined);
            setFolderId(undefined);
          }}
          style={baglanti}
        >
          {t("Dosyalar")}
        </button>
        {kaynak && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: c.textSecondary }}>/</span>
            <button type="button" onClick={() => setFolderId(undefined)} style={baglanti}>
              {kaynak.ad}
            </button>
          </span>
        )}
        {veri.breadcrumb.map((k) => (
          <span key={k.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: c.textSecondary }}>/</span>
            <button type="button" onClick={() => setFolderId(k.id)} style={baglanti}>
              {k.name}
            </button>
          </span>
        ))}
      </div>

      {hata && <div style={{ color: c.danger, fontSize: 14, marginBottom: 10 }}>{hata}</div>}

      <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {yukleniyor ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
        ) : kaynakListesi ? (
          veri.kaynaklar.map((k) => (
            <button key={k.anahtar} type="button" onClick={() => setKaynak(k)} style={satir(false)}>
              {k.anahtar.startsWith("organization:") ? <IconBuilding size={18} color={c.accent} /> : <IconFolder size={18} color={c.accent} />}
              <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, textAlign: "left" }}>{k.ad}</span>
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {k.anahtar.startsWith("organization:") ? t("Şirket dosyaları") : t("Departman")}
              </span>
            </button>
          ))
        ) : !veri.folders.length && !veri.files.length ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Bu klasör boş.")}</div>
        ) : (
          <>
            {veri.folders.map((k) => (
              <button key={k.id} type="button" onClick={() => setFolderId(k.id)} style={satir(false)}>
                <IconFolder size={18} color={c.accent} />
                <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, textAlign: "left" }}>{k.name}</span>
                <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Klasör")}</span>
              </button>
            ))}
            {veri.files.map((f: ProjectFile) => {
              const isaretli = secili.includes(f.id);
              return (
                <button key={f.id} type="button" onClick={() => degistir(f.id)} style={satir(isaretli)}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      flexShrink: 0,
                      border: isaretli ? "none" : `1.5px solid ${c.border}`,
                      background: isaretli ? c.accent : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isaretli && <IconCheck size={10} color={c.onPrimary} />}
                  </span>
                  <FileThumb file={f} thumbs={thumbs} variant="row" size={28} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={{ display: "block", fontSize: 15, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>
                      {[fileKindLabel(f), f.sizeBytes ? formatFileSize(f.sizeBytes) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          data-primary
          onClick={bagla}
          disabled={busy || !secili.length}
          style={{
            flex: 1,
            padding: "9px 0",
            borderRadius: 9,
            border: "none",
            background: secili.length ? c.primary : c.border,
            color: secili.length ? c.onPrimary : c.textSecondary,
            fontSize: 15,
            cursor: secili.length ? "pointer" : "not-allowed",
          }}
        >
          {secili.length > 1 ? t("{sayi} dosyayı bağla", { sayi: secili.length }) : t("Bağla")}
        </button>
        <button onClick={onClose} disabled={busy} style={{ padding: "9px 16px", fontSize: 15 }}>
          {t("Vazgeç")}
        </button>
      </div>
    </Modal>
  );
}
