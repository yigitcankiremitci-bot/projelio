import { useEffect, useState } from "react";
import type { ProjeSablonu, SablonKapsami } from "@projelio/shared";
import { icerikOzeti } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import Modal from "../Modal";

/**
 * "Yeni proje" penceresindeki şablon listesi: kişinin kendi şablonları, şirketin
 * ortak şablonları ve Projelio'nun hazır örnekleri (kod sabiti, silinemez).
 * Silme yalnızca sunucunun `silebilir` dediği satırda görünür — kural sunucuda.
 */
export default function SablonSecici({ onClose, onSec }: { onClose: () => void; onSec: (s: ProjeSablonu) => void }) {
  const c = useThemeColors();
  const t = useT();
  const [liste, setListe] = useState<ProjeSablonu[] | null>(null);
  const [hata, setHata] = useState("");

  useEffect(() => {
    api
      .get<ProjeSablonu[]>("/proje-sablonlari")
      .then(setListe)
      .catch(() => {
        setListe([]);
        setHata(t("Şablonlar yüklenemedi."));
      });
  }, []);

  const sil = async (s: ProjeSablonu) => {
    if (!window.confirm(t("Bu şablon silinsin mi? Ondan açılmış projeler etkilenmez."))) return;
    try {
      await api.delete(`/proje-sablonlari/${encodeURIComponent(s.id)}`);
      setListe((onceki) => (onceki ?? []).filter((x) => x.id !== s.id));
    } catch (err: any) {
      setHata(err?.message || t("Şablon silinemedi."));
    }
  };

  const gruplar: { kapsam: SablonKapsami; baslik: string }[] = [
    { kapsam: "kisisel", baslik: t("Şablonlarım") },
    { kapsam: "sirket", baslik: t("Şirket şablonları") },
    { kapsam: "hazir", baslik: t("Hazır şablonlar") },
  ];

  return (
    <Modal title={t("Şablondan başla")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {liste === null && <p style={{ color: c.textSecondary, fontSize: 15, margin: 0 }}>{t("Yükleniyor…")}</p>}
        {hata && <p style={{ color: c.danger, fontSize: 15, margin: 0 }}>{hata}</p>}
        {gruplar.map(({ kapsam, baslik }) => {
          const satirlar = (liste ?? []).filter((s) => s.kapsam === kapsam);
          if (satirlar.length === 0) return null;
          return (
            <div key={kapsam} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.textSecondary }}>{baslik}</div>
              {satirlar.map((s) => {
                const o = icerikOzeti(s.icerik);
                return (
                  <div
                    key={s.id}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}
                  >
                    <button
                      type="button"
                      onClick={() => onSec(s)}
                      style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", gap: 3 }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary }}>{s.ad}</span>
                      {s.aciklama && <span style={{ fontSize: 13, color: c.textSecondary }}>{s.aciklama}</span>}
                      <span style={{ fontSize: 13, color: c.textSecondary }}>
                        {t("{n} gün", { n: o.sureGun })} · {t("{n} görev", { n: o.gorev })}
                        {o.altGorev > 0 && ` · ${t("{n} alt görev", { n: o.altGorev })}`}
                        {o.cikti > 0 && ` · ${t("{n} çıktı", { n: o.cikti })}`}
                        {o.etkinlik > 0 && ` · ${t("{n} etkinlik", { n: o.etkinlik })}`}
                      </span>
                      {s.kapsam === "sirket" && s.organizationName && (
                        <span style={{ fontSize: 12, color: c.textSecondary }}>
                          {s.organizationName}
                          {s.olusturanAdi && ` · ${s.olusturanAdi}`}
                        </span>
                      )}
                    </button>
                    {s.silebilir && (
                      <button
                        type="button"
                        onClick={() => void sil(s)}
                        style={{ background: "none", border: "none", color: c.danger, fontSize: 13, cursor: "pointer", flexShrink: 0 }}
                      >
                        {t("Sil")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {liste !== null && liste.length > 0 && !liste.some((s) => s.kapsam !== "hazir") && (
          <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
            {t("Kendi şablonunu kaydetmek için bir proje kartına sağ tıklayıp \"Şablon olarak kaydet\"i seç.")}
          </p>
        )}
      </div>
    </Modal>
  );
}
