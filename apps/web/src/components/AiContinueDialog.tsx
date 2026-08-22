import { useState } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import type { AiContinuation, AiModelTier, AiModelTierInfo } from "../api/aiChat";

interface Props {
  continuation: AiContinuation;
  /** Sunucudan gelen kademe listesi; boşsa model seçimi gösterilmez. */
  tiers: AiModelTierInfo[];
  /** `approveAll` işaretliyse bu istek boyunca bir daha onay sorulmaz. */
  onContinue: (tier: AiModelTier, approveAll: boolean) => Promise<void> | void;
  onStop: () => void;
}

/**
 * "Devam edeyim mi?" penceresi.
 *
 * Lio bir isteği kredi eşiğine ya da adım sınırına takıldığında yarıda dondurur
 * (bkz. backend `runLoop`/`pause`). Bu pencere kullanıcıya üç bilgiyi birden
 * verir — şimdiye kadar NE YAPILDI, ne kadar KREDİ gitti, devam ederse adım
 * başına ne kadar daha gider — çünkü kullanıcının "devam et" kararını verirken
 * ihtiyacı olan tam olarak bunlar.
 *
 * Model seçici burada duruyor: küçük modelin tıkandığı yer, üst kademeye
 * geçmenin gerçekten işe yarayacağı andır. Kademe yükseltmek kalan adımları
 * pahalılaştırır ama genelde adım sayısını azaltır.
 */
export default function AiContinueDialog({ continuation, tiers, onContinue, onStop }: Props) {
  const c = useThemeColors();
  const [tier, setTier] = useState<AiModelTier>(continuation.tier);
  const [busy, setBusy] = useState(false);
  /**
   * Varsayılan olarak AÇIK.
   *
   * Uzun bir toplu işte kullanıcı arka arkaya üç pencereyle karşılaşıyordu
   * (tahmin, bütçe, adım sınırı) — onay vermek işi kolaylaştırmak yerine
   * kesintiye dönüşüyordu. Bakiye koruması bu seçenekten bağımsız çalışmaya
   * devam ettiği için "bir daha sorma" güvenli bir varsayılan.
   */
  const [approveAll, setApproveAll] = useState(true);

  // Ön uyarıda henüz hiçbir şey yapılmadı: "harcanan" ve "yapılan" satırları
  // yanıltıcı olur, onların yerine tek bir tahmin gösterilir.
  const upfront = continuation.reason === "estimate";
  const current = tiers.find((t) => t.tier === continuation.tier);
  const chosen = tiers.find((t) => t.tier === tier);
  const upgraded = !!current && !!chosen && chosen.costMultiplier > current.costMultiplier;

  const handleContinue = async () => {
    setBusy(true);
    try {
      await onContinue(tier, approveAll);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={upfront ? "Bu istek pahalı görünüyor" : "Devam edeyim mi?"} onClose={onStop} maxWidth={420}>
      <p style={{ fontSize: 15, color: c.textPrimary, margin: "0 0 14px", lineHeight: 1.5 }}>
        {upfront
          ? "Bu isteği yapmaya başlamadan önce onayını almak istedim; tahmini bedeli yüksek."
          : continuation.reason === "budget"
            ? "Bu istek beklediğimden uzun sürdü ve kredi eşiğine geldi."
            : "Bu istek adım sınırına geldi ama henüz bitmedi."}
      </p>

      <div
        style={{
          border: `1px solid ${c.border}`,
          borderRadius: 10,
          padding: 12,
          background: c.background,
          marginBottom: 14,
        }}
      >
        {upfront ? (
          <>
            <Row label="Şimdiye kadar harcanan" value="0 kredi" c={c} />
            <Row
              label="Tahmini bedel"
              value={`~${Math.round(continuation.estimatedNextCredits).toLocaleString("tr-TR")} kredi`}
              c={c}
              last
            />
          </>
        ) : (
          <>
            <Row label="Şimdiye kadar yapılan" value={continuation.doneSummary} c={c} />
            <Row
              label="Harcanan kredi"
              value={`${Math.round(continuation.spentCredits).toLocaleString("tr-TR")}`}
              c={c}
            />
            <Row
              label="Devam edersem (adım başına)"
              value={`~${Math.round(continuation.estimatedNextCredits).toLocaleString("tr-TR")} kredi`}
              c={c}
              last
            />
          </>
        )}
      </div>

      {tiers.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 6 }}>
            Kalan adımlar hangi modelle işlensin?
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tiers.map((t) => (
              <button
                key={t.tier}
                type="button"
                onClick={() => setTier(t.tier)}
                title={t.description}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  border: `1px solid ${t.tier === tier ? c.accent : c.border}`,
                  background: t.tier === tier ? c.accent : "transparent",
                  color: t.tier === tier ? "#fff" : c.textPrimary,
                }}
              >
                {t.label}
                {t.costMultiplier > 1 && (
                  <span style={{ opacity: 0.75, marginLeft: 5 }}>×{t.costMultiplier}</span>
                )}
              </button>
            ))}
          </div>
          {upgraded && (
            <p style={{ fontSize: 12, color: c.warning, margin: "8px 0 0", lineHeight: 1.4 }}>
              Daha güçlü model genelde işi daha az adımda bitirir, ama adım başına kredi bedeli
              yaklaşık {chosen!.costMultiplier / (current?.costMultiplier || 1)} katına çıkar.
            </p>
          )}
        </div>
      )}

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 14,
          fontSize: 13,
          color: c.textSecondary,
          cursor: "pointer",
          lineHeight: 1.4,
        }}
      >
        <input
          type="checkbox"
          checked={approveAll}
          onChange={(e) => setApproveAll(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          Bu istek boyunca tekrar sorma
          <span style={{ display: "block", fontSize: 11.5, opacity: 0.8 }}>
            Kredi biterse yine durulur; bu seçenek yalnızca onay pencerelerini kapatır.
          </span>
        </span>
      </label>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 15,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {upfront ? "Vazgeç" : "Dur, yeter"}
        </button>
        <button
          type="button"
          data-primary
          onClick={handleContinue}
          disabled={busy}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: c.accent,
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Çalışıyor…" : upfront ? "Onaylıyorum, yap" : "Devam et"}
        </button>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  c,
  last,
}: {
  label: string;
  value: string;
  c: ReturnType<typeof useThemeColors>;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: last ? "6px 0 0" : "6px 0",
        borderBottom: last ? "none" : `1px solid ${c.border}`,
        fontSize: 13,
      }}
    >
      <span style={{ color: c.textSecondary, flexShrink: 0 }}>{label}</span>
      <span style={{ color: c.textPrimary, textAlign: "right" }}>{value}</span>
    </div>
  );
}
