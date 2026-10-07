import { useState } from "react";
import type { PlanLabel } from "@projelio/shared";
import Modal from "../Modal";
import { useThemeColors } from "../../theme/useThemeColors";
import { planning } from "../../api/planning";
import { useT } from "../../lib/i18n";
import { inputStyle } from "./PlanTargetsModal";
import { RenkPaleti, YeniEtiketFormu } from "./PlanEtiketSecici";

/**
 * Etiketleri yönetme: ad ve renk değiştirme, silme, yeni etiket.
 *
 * Her değişiklik anında kaydedilir (ayrı bir "Kaydet" yok): satır satır
 * düzenlenen bir listede toplu kaydetme, bir satırın hatası yüzünden
 * diğerlerinin de kaybolması demekti.
 */
export default function PlanEtiketYonetimi({
  labels,
  onClose,
  onChanged,
}: {
  labels: PlanLabel[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [liste, setListe] = useState<PlanLabel[]>(labels);
  const [renkAcik, setRenkAcik] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const guncelle = async (label: PlanLabel, body: { name?: string; color?: string }) => {
    setHata(null);
    try {
      const yeni = await planning.updateLabel(label.id, body);
      setListe((l) => l.map((x) => (x.id === yeni.id ? yeni : x)));
      onChanged();
    } catch (err: any) {
      setHata(String(err?.message ?? t("Etiket kaydedilemedi.")));
    }
  };

  const sil = async (label: PlanLabel) => {
    if (!window.confirm(t("\"{name}\" etiketi silinsin mi? Bloklardan da kaldırılır, bloklar silinmez.", { name: label.name }))) return;
    setHata(null);
    try {
      await planning.deleteLabel(label.id);
      setListe((l) => l.filter((x) => x.id !== label.id));
      onChanged();
    } catch (err: any) {
      setHata(String(err?.message ?? t("Etiket silinemedi.")));
    }
  };

  return (
    <Modal title={t("Etiketler")} onClose={onClose} maxWidth={440}>
      <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
        {t("Etiketler bloklarını renkle işaretler; bir bloğa birden çok etiket takabilirsin. Takvimin üstündeki şeritten etikete göre süzebilirsin.")}
      </p>

      {liste.length === 0 && (
        <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 12 }}>{t("Henüz etiketin yok.")}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {liste.map((label) => (
          <div key={label.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => setRenkAcik(renkAcik === label.id ? null : label.id)}
                aria-label={t("Rengi değiştir")}
                title={t("Rengi değiştir")}
                style={{ width: 22, height: 22, borderRadius: 11, background: label.color, border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
              />
              <input
                defaultValue={label.name}
                maxLength={40}
                // Ad, alandan çıkınca kaydedilir; her tuşta istek atmak hem
                // gereksiz hem de yarım yazılmış adla benzersizlik hatası verirdi.
                onBlur={(e) => {
                  const ad = e.target.value.trim();
                  if (!ad) {
                    e.target.value = label.name;
                    return;
                  }
                  if (ad !== label.name) guncelle(label, { name: ad });
                }}
                style={{ ...inputStyle(c), marginBottom: 0, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => sil(label)}
                style={{ padding: "6px 10px", fontSize: 13, borderRadius: 7, border: `1px solid ${c.border}`, background: c.surface, color: c.danger, cursor: "pointer" }}
              >
                {t("Sil")}
              </button>
            </div>
            {renkAcik === label.id && (
              <div style={{ paddingLeft: 30 }}>
                <RenkPaleti
                  value={label.color}
                  onChange={(renk) => {
                    setRenkAcik(null);
                    if (renk.toUpperCase() !== label.color.toUpperCase()) guncelle(label, { color: renk });
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: "0 0 10px" }}>{hata}</p>}

      <YeniEtiketFormu
        onCreated={(label) => {
          setListe((l) => [...l, label]);
          onChanged();
        }}
      />
    </Modal>
  );
}
