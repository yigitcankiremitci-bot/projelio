import { useState } from "react";
import type { PlanRitualPrompt } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { planning } from "../../api/planning";
import { askLio } from "../../lib/askLio";

interface Props {
  ritual: PlanRitualPrompt;
  onDone: () => void;
}

const KIND_LABEL: Record<string, string> = {
  daily: "Günlük plan",
  weekly: "Haftalık planlama",
  monthly: "Aylık planlama",
};

const KIND_INTRO: Record<string, string> = {
  daily: "Bugünü kuralım. Tek bir işi bitirmiş olarak günü kapatmak, yarısı yapılmış beş işten iyidir.",
  weekly: "Haftaya başlamadan önce nereye ağırlık vereceğine karar ver; takvim gerisini halleder.",
  monthly: "Ay ölçeğinde saat değil sonuç konuşulur: ay sonunda neyin bitmiş olacağını yaz.",
};

/**
 * Ritüel karşılama kartı — Lio'nun kullanıcıyı dönem başında karşıladığı yer.
 *
 * Üç çıkış yolu var ve üçü de bilinçli:
 *   "Lio ile planla"  sohbeti hazır bir soruyla açar (asıl yol)
 *   "Kendim yaparım"  hedef ekranını açar, yapay zeka devreye girmez
 *   "Şimdi değil"     oturumu atlanmış sayar, aynı dönemde tekrar sorulmaz
 *
 * Üçüncüsü olmadan kart her açılışta tekrar belirir ve bir süre sonra
 * kullanıcının görmezden geldiği bir gürültüye dönüşür. Planlama alışkanlığı
 * ancak reddedilebilir olduğunda kurulur.
 */
export default function RitualCard({ ritual, onDone }: Props) {
  const c = useThemeColors();
  const [busy, setBusy] = useState(false);

  const skip = async () => {
    setBusy(true);
    try {
      await planning.completeRitual({ kind: ritual.kind, status: "skipped", periodId: ritual.periodId });
    } finally {
      setBusy(false);
      onDone();
    }
  };

  const startWithLio = () => {
    // Lio'ya doğrudan hangi dönemi planlayacağını söylüyoruz. Serbest bir
    // "planlayalım" mesajı, modelin önce hangi dönemden bahsedildiğini sormasına
    // yol açıyor — bir tur fazla, bir tur fazla kredi.
    const label = KIND_LABEL[ritual.kind];
    askLio(
      `${label} yapalım. Dönem ${ritual.periodStart} tarihinden başlıyor. ` +
        `Önce get_plan_overview ile mevcut planıma bak, sonra bana sırayla sor.`
    );
    onDone();
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        background: "linear-gradient(180deg, rgba(192,129,63,0.09) 0%, rgba(192,129,63,0.03) 100%)",
        border: `1px solid rgba(192,129,63,0.30)`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <img src="/lio-base.png" alt="" aria-hidden="true" style={{ width: 46, height: 46, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary }}>
          {KIND_LABEL[ritual.kind]} zamanı
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
          {KIND_INTRO[ritual.kind]}
        </p>

        {ritual.previousSummary && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 12,
              color: c.textSecondary,
              borderLeft: `2px solid ${c.border}`,
              paddingLeft: 9,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: c.textPrimary, fontWeight: 500 }}>Geçen sefer:</strong> {ritual.previousSummary}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
          <button
            onClick={startWithLio}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              borderRadius: 8,
              border: "none",
              background: c.accent,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Lio ile planla
          </button>
          <button
            onClick={onDone}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.textPrimary,
              cursor: "pointer",
            }}
          >
            Kendim yaparım
          </button>
          <button
            onClick={skip}
            disabled={busy}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: c.textSecondary,
              cursor: "pointer",
            }}
          >
            Şimdi değil
          </button>
        </div>
      </div>
    </div>
  );
}
