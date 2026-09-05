import { useState } from "react";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import type { AiContinuation, AiModelTier, AiModelTierInfo } from "../api/aiChat";

interface Props {
  continuation: AiContinuation;
  /** Sunucudan gelen kademe listesi; boşsa model seçimi gösterilmez. */
  /** `approveAll` işaretliyse bu istek boyunca bir daha onay sorulmaz. */
  onContinue: (approveAll: boolean) => Promise<void> | void;
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
export default function AiContinueDialog({ continuation, onContinue, onStop }: Props) {
  const c = useThemeColors();
  const t = useT();
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

  const handleContinue = async () => {
    setBusy(true);
    try {
      await onContinue(approveAll);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={upfront ? t("Bu istek pahalı görünüyor") : t("Devam edeyim mi?")} onClose={onStop} maxWidth={420}>
      <p style={{ fontSize: 15, color: c.textPrimary, margin: "0 0 14px", lineHeight: 1.5 }}>
        {upfront
          ? t("Bu isteği yapmaya başlamadan önce onayını almak istedim; tahmini bedeli yüksek.")
          : continuation.reason === "budget"
            ? t("Bu istek beklediğimden uzun sürdü ve kredi eşiğine geldi.")
            : t("Bu istek adım sınırına geldi ama henüz bitmedi.")}
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
            <Row label={t("Şimdiye kadar harcanan")} value={t("{n} kredi", { n: 0 })} c={c} />
            <Row
              label={t("Tahmini bedel")}
              value={t("~{n} kredi", {
                n: Math.round(continuation.estimatedNextCredits).toLocaleString("tr-TR"),
              })}
              c={c}
              last
            />
          </>
        ) : (
          <>
            <Row label={t("Şimdiye kadar yapılan")} value={continuation.doneSummary} c={c} />
            <Row
              label={t("Harcanan kredi")}
              value={`${Math.round(continuation.spentCredits).toLocaleString("tr-TR")}`}
              c={c}
            />
            <Row
              label={t("Devam edersem (adım başına)")}
              value={t("~{n} kredi", {
                n: Math.round(continuation.estimatedNextCredits).toLocaleString("tr-TR"),
              })}
              c={c}
              last
            />
          </>
        )}
      </div>

      {/* Kademe seçici KALDIRILDI: hangi modelin çalışacağına yönetici karar
          verir (Admin paneli > AI sağlayıcıları). Kullanıcıya kalan tek karar
          işi sürdürmek ya da durdurmak. */}

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
          {t("Bu istek boyunca tekrar sorma")}
          <span style={{ display: "block", fontSize: 11.5, opacity: 0.8 }}>
            {t("Kredi biterse yine durulur; bu seçenek yalnızca onay pencerelerini kapatır.")}
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
          {upfront ? t("Vazgeç") : t("Dur, yeter")}
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
          {busy ? t("Çalışıyor…") : upfront ? t("Onaylıyorum, yap") : t("Devam et")}
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
