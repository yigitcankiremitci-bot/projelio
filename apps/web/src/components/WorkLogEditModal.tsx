import { useState } from "react";
import type { WorkLogEntry } from "@projelio/shared";
import { dakikayiMetneCevir, sureyiDakikayaCevir } from "@projelio/shared";
import { worklog } from "../api/worklog";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import Modal from "./Modal";

/**
 * Yaptım kaydını düzenleme.
 *
 * NEDEN ÖZELLİKLE TARİH: kayıt her zaman "şimdi"ye yazılıyordu ve gece
 * yarısından sonra oturup günü geçiren biri, dünkü işlerini bugüne yazmak
 * zorunda kalıyordu. Gün defterinin tek işi "hangi gün ne yapıldı" sorusuna
 * cevap vermek; yanlış güne düşen kayıt onu bozuyor.
 *
 * Saat aralığı ile süre AYNI ANDA düzenlenmiyor: aralık verildiyse süre ondan
 * hesaplanıyor (sunucuda da aynı kural), yoksa süre elle yazılıyor. İkisini
 * birden düzenletmek "09:00–10:00 arası 3 saat" gibi bir kayda izin verirdi.
 */

interface Props {
  entry: WorkLogEntry;
  onClose: () => void;
  onSaved: (entry: WorkLogEntry) => void;
}

export default function WorkLogEditModal({ entry, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const t = useT();

  const [baslik, setBaslik] = useState(entry.title);
  const [not, setNot] = useState(entry.note ?? "");
  const [gun, setGun] = useState(entry.doneAt.slice(0, 10));
  const [aralikModu, setAralikModu] = useState(Boolean(entry.startedAt && entry.endedAt));
  const [baslangic, setBaslangic] = useState(entry.startedAt?.slice(11, 16) ?? entry.doneAt.slice(11, 16));
  const [bitis, setBitis] = useState(entry.endedAt?.slice(11, 16) ?? "");
  const [sure, setSure] = useState(entry.durationMinutes ? dakikayiMetneCevir(entry.durationMinutes) : "");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");

  const kaydet = async () => {
    const ad = baslik.trim();
    if (!ad) {
      setHata(t("Ne yaptığını yazman gerekiyor"));
      return;
    }
    if (!aralikModu && sure.trim() && sureyiDakikayaCevir(sure) == null) {
      setHata(t('Süreyi anlayamadım. Örnek: "45", "1s 30dk", "2 saat".'));
      return;
    }
    if (aralikModu && (!baslangic || !bitis)) {
      setHata(t("Başlangıç ve bitiş saatinin ikisi de gerekli"));
      return;
    }

    setKaydediliyor(true);
    setHata("");
    try {
      const guncel = await worklog.update(entry.id, {
        title: ad,
        note: not.trim() || null,
        // Aralık modunda tarih başlangıç saatiyle birlikte gidiyor; sunucu
        // kaydı işin BAŞLADIĞI ana yazıyor.
        doneAt: aralikModu ? undefined : `${gun}T${baslangic || "12:00"}:00`,
        startedAt: aralikModu ? `${gun}T${baslangic}:00` : null,
        endedAt: aralikModu ? `${gun}T${bitis}:00` : null,
        duration: aralikModu ? undefined : sure.trim() || null,
      });
      onSaved(guncel);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kayıt güncellenemedi");
      setKaydediliyor(false);
    }
  };

  return (
    <Modal title={t("Kaydı düzenle")} onClose={onClose} maxWidth={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Alan etiket={t("Ne yaptın?")}>
          <input value={baslik} onChange={(e) => setBaslik(e.target.value)} style={{ width: "100%" }} />
        </Alan>

        <Alan etiket={t("Tarih")}>
          <input type="date" value={gun} onChange={(e) => setGun(e.target.value)} style={{ width: "100%" }} />
        </Alan>

        {aralikModu ? (
          <Alan etiket={t("Saat aralığı")}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="time"
                value={baslangic}
                onChange={(e) => setBaslangic(e.target.value)}
                aria-label={t("Başlangıç saati")}
                style={{ flex: 1 }}
              />
              <span style={{ color: c.textSecondary }}>–</span>
              <input
                type="time"
                value={bitis}
                onChange={(e) => setBitis(e.target.value)}
                aria-label={t("Bitiş saati")}
                style={{ flex: 1 }}
              />
            </div>
          </Alan>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Alan etiket={t("Saat")}>
                <input
                  type="time"
                  value={baslangic}
                  onChange={(e) => setBaslangic(e.target.value)}
                  style={{ width: "100%" }}
                />
              </Alan>
            </div>
            <div style={{ flex: 1 }}>
              <Alan etiket={t("Süre")}>
                <input
                  value={sure}
                  onChange={(e) => setSure(e.target.value)}
                  placeholder={t("Süre")}
                  title={t('Örnek: "45", "1s 30dk", "2 saat", "1:30"')}
                  style={{ width: "100%" }}
                />
              </Alan>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAralikModu((v) => !v)}
          style={{
            alignSelf: "flex-start",
            border: "none",
            background: "transparent",
            color: c.textSecondary,
            fontSize: 13,
            padding: 0,
          }}
        >
          {aralikModu ? t("Süre gir") : t("Saat aralığı gir")}
        </button>

        <Alan etiket={t("Not (opsiyonel)")}>
          <textarea value={not} onChange={(e) => setNot(e.target.value)} rows={2} style={{ width: "100%" }} />
        </Alan>

        {entry.targetLabel && (
          <p style={{ margin: 0, fontSize: 12.5, color: c.textSecondary, lineHeight: 1.45 }}>
            {t("Bağlı olduğu yer:")} {entry.targetLabel} —{" "}
            {t("bağlantıyı değiştirmek için satırdaki zincir düğmesini kullan.")}
          </p>
        )}

        {hata && (
          <p style={{ margin: 0, color: c.danger, fontSize: 13 }} role="alert">
            {hata}
          </p>
        )}

        <button
          data-primary
          type="button"
          onClick={() => void kaydet()}
          disabled={kaydediliyor}
          style={{
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: c.onPrimary,
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          {kaydediliyor ? t("Kaydediliyor…") : t("Kaydet")}
        </button>
      </div>
    </Modal>
  );
}

function Alan({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 14, color: c.textSecondary }}>{etiket}</label>
      {children}
    </div>
  );
}
