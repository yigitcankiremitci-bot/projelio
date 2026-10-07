import { useState } from "react";
import type { PlanLabel } from "@projelio/shared";
import Modal from "../Modal";
import { useThemeColors } from "../../theme/useThemeColors";
import { planning } from "../../api/planning";
import { useT } from "../../lib/i18n";
import { inputStyle } from "./PlanTargetsModal";
import { RenkPaleti, siradakiEtiketRengi, YeniEtiketFormu } from "./PlanEtiketSecici";

/**
 * Etiket listesini düzenleme: sıra, ad, renk, silme, yeni etiket.
 *
 * İki yerde kullanılıyor — takvimdeki "Etiketleri düzenle" penceresi ve blok
 * penceresinin içi. Ayrı yazılsalardı biri sıralamayı, öbürü silmeyi
 * unuturdu; blok penceresinden düzenlemenin yolu kapalı olduğu için
 * kullanıcı "etiket silinemiyor" sanıyordu.
 *
 * Her değişiklik anında kaydedilir (ayrı bir "Kaydet" yok): satır satır
 * düzenlenen bir listede toplu kaydetme, bir satırın hatası yüzünden
 * diğerlerinin de kaybolması demekti.
 */
export function EtiketDuzenleyici({
  labels,
  onChanged,
}: {
  labels: PlanLabel[];
  /** Listenin yeni hâli — sıra, ad, renk ya da silme sonrası. */
  onChanged: (labels: PlanLabel[]) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [renkAcik, setRenkAcik] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const guncelle = async (label: PlanLabel, body: { name?: string; color?: string }) => {
    setHata(null);
    try {
      const yeni = await planning.updateLabel(label.id, body);
      onChanged(labels.map((x) => (x.id === yeni.id ? yeni : x)));
    } catch (err: any) {
      setHata(String(err?.message ?? t("Etiket kaydedilemedi.")));
    }
  };

  const sil = async (label: PlanLabel) => {
    if (!window.confirm(t("\"{name}\" etiketi silinsin mi? Bloklardan da kaldırılır, bloklar silinmez.", { name: label.name }))) return;
    setHata(null);
    try {
      await planning.deleteLabel(label.id);
      onChanged(labels.filter((x) => x.id !== label.id));
    } catch (err: any) {
      setHata(String(err?.message ?? t("Etiket silinemedi.")));
    }
  };

  // Sürükle-bırak yerine oklar: telefonda (WebView) HTML5 sürüklemesi
  // çalışmıyor, oklar her yerde aynı.
  const tasi = async (index: number, yon: -1 | 1) => {
    const hedef = index + yon;
    if (hedef < 0 || hedef >= labels.length || mesgul) return;
    const yeniSira = [...labels];
    [yeniSira[index], yeniSira[hedef]] = [yeniSira[hedef], yeniSira[index]];
    const onceki = labels;
    // İyimser: liste hemen yer değiştirir, sunucu reddederse geri alınır.
    onChanged(yeniSira);
    setMesgul(true);
    setHata(null);
    try {
      onChanged(await planning.reorderLabels(yeniSira.map((l) => l.id)));
    } catch (err: any) {
      onChanged(onceki);
      setHata(String(err?.message ?? t("Sıra kaydedilemedi.")));
    } finally {
      setMesgul(false);
    }
  };

  const okStili = (pasif: boolean): React.CSSProperties => ({
    width: 26,
    height: 26,
    padding: 0,
    fontSize: 13,
    lineHeight: "24px",
    borderRadius: 6,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textSecondary,
    cursor: pasif ? "default" : "pointer",
    opacity: pasif ? 0.35 : 1,
    flexShrink: 0,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {labels.length === 0 ? (
        <div style={{ fontSize: 13, color: c.textSecondary }}>{t("Henüz etiketin yok.")}</div>
      ) : (
        <div style={{ fontSize: 12, color: c.textSecondary }}>
          {t("Birden çok etiketli blok, bu listede en üstte olan etiketinin rengini alır.")}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {labels.map((label, i) => (
          <div key={label.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => tasi(i, -1)}
                disabled={i === 0 || mesgul}
                aria-label={t("Yukarı taşı")}
                title={t("Yukarı taşı")}
                style={okStili(i === 0 || mesgul)}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => tasi(i, 1)}
                disabled={i === labels.length - 1 || mesgul}
                aria-label={t("Aşağı taşı")}
                title={t("Aşağı taşı")}
                style={okStili(i === labels.length - 1 || mesgul)}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setRenkAcik(renkAcik === label.id ? null : label.id)}
                aria-label={t("Rengi değiştir")}
                title={t("Rengi değiştir")}
                style={{ width: 22, height: 22, borderRadius: 11, background: label.color, border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
              />
              <input
                // key'de ad var: sunucudan dönen ad (ör. boşlukları
                // temizlenmiş) alana yansısın; defaultValue tek başına güncellenmez.
                key={`${label.id}:${label.name}`}
                defaultValue={label.name}
                maxLength={40}
                aria-label={t("Etiket adı")}
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
                // Enter alanı bırakır (kaydeder); pencerenin "Kaydet"ine düşmez.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                style={{ ...inputStyle(c), marginBottom: 0, flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => sil(label)}
                style={{ padding: "5px 9px", fontSize: 13, borderRadius: 7, border: `1px solid ${c.border}`, background: c.surface, color: c.danger, cursor: "pointer", flexShrink: 0 }}
              >
                {t("Sil")}
              </button>
            </div>
            {renkAcik === label.id && (
              <div style={{ paddingLeft: 60 }}>
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

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}

      <YeniEtiketFormu
        // key: liste değişince form yeni varsayılan renkle baştan kurulsun.
        key={labels.length}
        odaklan={labels.length === 0}
        varsayilanRenk={siradakiEtiketRengi(labels)}
        onCreated={(label) => onChanged([...labels, label])}
      />
    </div>
  );
}

/** Takvimin üstündeki "Etiketleri düzenle" penceresi. */
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

  return (
    <Modal title={t("Etiketler")} onClose={onClose} maxWidth={460}>
      <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
        {t("Etiketler bloklarını renkle işaretler; bir bloğa birden çok etiket takabilirsin. Takvimin üstündeki şeritten etikete göre süzebilirsin.")}
      </p>
      <EtiketDuzenleyici
        labels={liste}
        onChanged={(yeni) => {
          setListe(yeni);
          onChanged();
        }}
      />
    </Modal>
  );
}
